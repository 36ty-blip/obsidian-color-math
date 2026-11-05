#!/usr/bin/env node
/**
 * Sequential & Multi-Threaded Test Orchestrator for Obsidian Color Math
 *
 * Usage:
 *   node scripts/run_tests.mjs [options] [test1 test2 ...]
 *
 * Options:
 *   --threads, -t <N>     Number of worker threads (default: auto-scaled up to 6 threads / 50% CPU when system load <= 36%)
 *   --batch, -b <N>       Number of test suites per sequential batch (default: 12 when running all tests, or 1 with --sequential)
 *   --sequential, -s      Run each specified test file strictly one-by-one in the exact order provided (batch size = 1)
 *   --bail                Stop execution immediately if any test stage fails
 *
 * Examples:
 *   node scripts/run_tests.mjs --threads 6
 *   node scripts/run_tests.mjs --threads 6 --sequential quaternion_navigation spatial_tensor tri_engine_navigation
 *   node scripts/run_tests.mjs -t 4 -b 10
 */

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Normalize Windows drive letter to uppercase (e.g., C:\...) to prevent Vitest 1.6 drive-letter casing bug
function normalizeWindowsRoot(p) {
  const resolved = path.resolve(p);
  if (/^[a-z]:/.test(resolved)) {
    return resolved[0].toUpperCase() + resolved.slice(1);
  }
  return resolved;
}

const PROJECT_ROOT = normalizeWindowsRoot(path.resolve(__dirname, ".."));
const PROJECT_ROOT_POSIX = PROJECT_ROOT.replace(/\\/g, "/");
const TESTS_DIR = path.join(PROJECT_ROOT, "tests");

/**
 * Measures 3-second average system CPU usage via libuv os.cpus().
 */
function measureCpuUsage3s() {
  function snap() {
    return os.cpus().reduce(
      (acc, c) => ({
        idle: acc.idle + c.times.idle,
        total: acc.total + Object.values(c.times).reduce((a, b) => a + b, 0),
      }),
      { idle: 0, total: 0 }
    );
  }
  const s1 = snap();
  return new Promise((resolve) => {
    setTimeout(() => {
      const s2 = snap();
      const idle = s2.idle - s1.idle;
      const total = s2.total - s1.total;
      const pct = total > 0 ? (1 - idle / total) * 100 : 0;
      resolve(Number(pct.toFixed(1)));
    }, 3000);
  });
}

// Default priority order when running the full test catalog
const PRIORITY_ORDER = [
  // Stage 1: 3D/4D Spatial Tensor & Bidirectional Provenance
  "quaternion_navigation.test.ts",
  "spatial_tensor.test.ts",
  "spatial_tensor_bijective.test.ts",
  "underover_tensor.test.ts",
  "mathjax_v4_tensor.test.ts",
  "tri_engine_navigation.test.ts",
  "tri_engine.test.ts",
  "dom_stamper.test.ts",
  "lazy_navigation.test.ts",
  "interceptor.test.ts",
  // Stage 2: CST Parser & Structural Grammar
  "cst_parser.test.ts",
  "sprint2_cst.test.ts",
  "sprint3_cst.test.ts",
  "sprint4_cst.test.ts",
  "sprint5_cst.test.ts",
  "properties_cst.test.ts",
  "delimiters.test.ts",
  "delimiters_combinations.test.ts",
  "lookahead_gating_and_autoseal.test.ts",
];

function resolveOrderedTestFiles(requestedPatterns) {
  const allFiles = fs
    .readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith(".test.ts"))
    .sort();

  if (requestedPatterns.length > 0) {
    const resolved = [];
    const seen = new Set();
    for (const pat of requestedPatterns) {
      const clean = pat.replace(/^tests[\\/]/, "").replace(/\.test\.ts$/, "");
      const matches = allFiles.filter(
        (f) =>
          f === pat ||
          f === `${clean}.test.ts` ||
          f.toLowerCase().includes(clean.toLowerCase())
      );
      if (matches.length === 0) {
        console.error(`[Test Runner] Warning: No test file matched "${pat}"`);
      }
      for (const m of matches) {
        if (!seen.has(m)) {
          seen.add(m);
          resolved.push(`tests/${m}`);
        }
      }
    }
    return resolved;
  }

  // Full catalog ordered by PRIORITY_ORDER first, then remaining alphabetically
  const ordered = [];
  const seen = new Set();
  for (const p of PRIORITY_ORDER) {
    if (allFiles.includes(p)) {
      seen.add(p);
      ordered.push(`tests/${p}`);
    }
  }
  for (const f of allFiles) {
    if (!seen.has(f)) {
      seen.add(f);
      ordered.push(`tests/${f}`);
    }
  }
  return ordered;
}

function parseArgs(argv) {
  let threads = null;
  let batchSize = null;
  let sequential = false;
  let bail = false;
  const patterns = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--threads" || arg === "-t") {
      threads = parseInt(argv[++i], 10);
    } else if (arg.startsWith("--threads=")) {
      threads = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--batch" || arg === "-b") {
      batchSize = parseInt(argv[++i], 10);
    } else if (arg.startsWith("--batch=")) {
      batchSize = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--sequential" || arg === "-s") {
      sequential = true;
    } else if (arg === "--bail") {
      bail = true;
    } else if (arg === "--tests") {
      const list = (argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
      patterns.push(...list);
    } else if (!arg.startsWith("-")) {
      patterns.push(...arg.split(",").map((s) => s.trim()).filter(Boolean));
    }
  }

  return { threads, batchSize, sequential, bail, patterns };
}

function runVitestBatch(testFiles, threads) {
  return new Promise((resolve) => {
    const vitestBin = path.join(PROJECT_ROOT, "node_modules", "vitest", "vitest.mjs");
    const args = [
      vitestBin,
      "run",
      "--root",
      PROJECT_ROOT_POSIX,
      `--poolOptions.threads.maxThreads=${threads}`,
      `--poolOptions.threads.minThreads=1`,
      ...testFiles,
    ];

    const startTime = performance.now();
    const child = spawn(process.execPath, args, {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      const durationMs = Math.round(performance.now() - startTime);
      resolve({ code: code ?? 1, stdout, stderr, durationMs });
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const totalCores = os.cpus().length;
  const halfCores = Math.max(1, Math.floor(totalCores * 0.5));

  let threads = opts.threads;
  let cpuAvg = null;
  if (!threads || Number.isNaN(threads) || threads < 1) {
    cpuAvg = await measureCpuUsage3s();
    if (cpuAvg <= 36.0) {
      threads = halfCores; // Up to 50% CPU (6 threads on 12-thread i5-13420H)
    } else {
      const remainingPct = Math.max(0.15, (100 - cpuAvg) / 100);
      threads = Math.max(1, Math.min(halfCores, Math.floor(totalCores * remainingPct * 0.5)));
    }
  } else {
    threads = Math.min(totalCores, Math.max(1, threads));
  }

  const orderedFiles = resolveOrderedTestFiles(opts.patterns);
  if (orderedFiles.length === 0) {
    console.error("[Test Runner] No test files found to execute.");
    process.exit(1);
  }

  const effectiveBatchSize = opts.sequential
    ? 1
    : opts.batchSize && opts.batchSize > 0
    ? opts.batchSize
    : opts.patterns.length > 0
    ? orderedFiles.length
    : 12;

  const batches = [];
  for (let i = 0; i < orderedFiles.length; i += effectiveBatchSize) {
    batches.push(orderedFiles.slice(i, i + effectiveBatchSize));
  }

  console.log("=================================================================");
  console.log("🚀 COLOR MATH SEQUENTIAL & MULTI-THREADED TEST ORCHESTRATOR");
  console.log("=================================================================");
  if (cpuAvg !== null) {
    console.log(`• 3s System CPU Average : ${cpuAvg}% (<= 36% threshold -> up to 50% CPU allowed)`);
  }
  console.log(`• Worker Threads        : ${threads} / ${totalCores} logical cores`);
  console.log(`• Total Test Suites     : ${orderedFiles.length} files across ${batches.length} ordered stage(s)`);
  console.log("=================================================================\n");

  const stageResults = [];
  let totalFailedStages = 0;
  const overallStart = performance.now();

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const label = `Stage ${b + 1}/${batches.length} (${batch.length} suite${batch.length > 1 ? "s" : ""}: ${batch.map((f) => path.basename(f, ".test.ts")).join(", ")})`;
    console.log(`▶ Running ${label}...`);

    const res = await runVitestBatch(batch, threads);
    const cleanOut = res.stdout.replace(/\x1b\[[0-9;]*m/g, "");
    const passedMatch = cleanOut.match(/Tests\s+(?:(\d+)\s+failed\s+\|\s+)?(\d+)\s+passed/);
    const failedTests = passedMatch && passedMatch[1] ? parseInt(passedMatch[1], 10) : 0;
    const passedTests = passedMatch && passedMatch[2] ? parseInt(passedMatch[2], 10) : 0;

    const status = res.code === 0 ? "PASS ✅" : "FAIL ❌";
    console.log(`  └─ ${status} in ${(res.durationMs / 1000).toFixed(2)}s (${passedTests} passed, ${failedTests} failed)\n`);

    if (res.code !== 0) {
      totalFailedStages++;
      console.error("--- Stage Failure Output ---");
      console.error(res.stdout);
      if (res.stderr) console.error(res.stderr);
      if (opts.bail) {
        console.error("[Test Runner] Stopping early due to --bail.");
        break;
      }
    }

    stageResults.push({
      stage: b + 1,
      suites: batch.length,
      passedTests,
      failedTests,
      durationMs: res.durationMs,
      ok: res.code === 0,
    });
  }

  const totalDurationSec = ((performance.now() - overallStart) / 1000).toFixed(2);
  const totalPassedTests = stageResults.reduce((acc, r) => acc + r.passedTests, 0);
  const totalFailedTests = stageResults.reduce((acc, r) => acc + r.failedTests, 0);

  console.log("=================================================================");
  console.log("📊 FINAL TEST ORCHESTRATION SUMMARY");
  console.log("=================================================================");
  console.log(`• Stages Completed : ${stageResults.length} / ${batches.length}`);
  console.log(`• Total Assertions : ${totalPassedTests} passed | ${totalFailedTests} failed`);
  console.log(`• Total Wall Time  : ${totalDurationSec}s (Threads: ${threads})`);
  console.log(`• Overall Status   : ${totalFailedStages === 0 ? "100% PASS ✅" : `${totalFailedStages} STAGE(S) FAILED ❌`}`);
  console.log("=================================================================");

  process.exit(totalFailedStages === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[Test Runner] Fatal error:", err);
  process.exit(1);
});
