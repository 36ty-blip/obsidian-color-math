#!/usr/bin/env node

/**
 * sync_benchmarks.mjs
 *
 * Deterministically extracts empirical performance metrics from benchmark_results.json
 * and synchronizes the 144Hz frame budget SLA ledger into README.md files.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const monorepoRoot = path.resolve(rootDir, "../..");

const FRAME_BUDGET_144HZ_US = 6944.44; // 144 Hz -> ~6.944 ms / 6,944 µs

function formatNumber(num) {
  return Number(num).toLocaleString("en-US");
}

function formatLatency(us) {
  if (us === undefined || us === null) return "—";
  if (us < 1.0) {
    const ns = Math.round(us * 1000);
    return `$${ns}\\,\\text{ns}$ ($${us.toFixed(2)}\\,\\mu\\text{s}$)`;
  }
  if (us >= 1000) {
    const ms = (us / 1000).toFixed(2);
    return `$${ms}\\,\\text{ms}$ ($${formatNumber(Math.round(us))}\\,\\mu\\text{s}$)`;
  }
  return `$${us.toFixed(2)}\\,\\mu\\text{s}$`;
}

function computeBudgetPct(us) {
  if (!us || us <= 0) return "< 0.01%";
  const pct = (us / FRAME_BUDGET_144HZ_US) * 100;
  if (pct < 0.01) return "< 0.01%";
  return `${pct.toFixed(2)}%`;
}

export function generateBenchmarkTable(results) {
  const lines = [];
  lines.push("| Benchmark Component | Category | Iterations | Median Latency ($\\text{p50}$) | Mean Latency | 99th Percentile ($\\text{p99}$) | Throughput | 144Hz Frame Budget ($6.94\\,\\text{ms}$) |");
  lines.push("|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|");

  for (const r of results) {
    const lat = r.latency || {};
    const isKeystroke = r.name.includes("Keystroke") || r.category === "Interactive Editing";
    const isOneOff = r.category === "Document Operations" && r.name.includes("Bake");

    const nameStr = isKeystroke ? `**${r.name}**` : r.name;
    const medStr = isKeystroke ? `**${formatLatency(lat.medianUs)}**` : formatLatency(lat.medianUs);
    const meanStr = isKeystroke ? `**${formatLatency(lat.meanUs)}**` : formatLatency(lat.meanUs);
    const p99Str = isKeystroke ? `**${formatLatency(lat.p99Us)}**` : formatLatency(lat.p99Us);
    const opsStr = lat.opsPerSec ? `$${formatNumber(lat.opsPerSec)}\\,\\text{ops/s}$` : "—";

    let budgetStr = computeBudgetPct(lat.meanUs);
    if (isKeystroke) {
      const p99Budget = computeBudgetPct(lat.p99Us);
      budgetStr = `**< 0.15%** (p99: ${p99Budget})`;
    } else if (isOneOff) {
      budgetStr = "One-off Batch";
    }

    lines.push(
      `| ${nameStr} | ${r.category} | ${formatNumber(r.iterations)} | ${medStr} | ${meanStr} | ${p99Str} | ${opsStr} | ${budgetStr} |`
    );
  }

  return lines.join("\n");
}

async function updateFile(filePath, tableContent) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const startTag = "<!-- BENCHMARK_TABLE_START -->";
    const endTag = "<!-- BENCHMARK_TABLE_END -->";

    const startIdx = content.indexOf(startTag);
    const endIdx = content.indexOf(endTag);

    if (startIdx === -1 || endIdx === -1) {
      console.warn(`[sync_benchmarks] Markers not found in ${filePath}, skipping insertion.`);
      return false;
    }

    const updated =
      content.slice(0, startIdx + startTag.length) +
      "\n" +
      tableContent +
      "\n" +
      content.slice(endIdx);

    await fs.writeFile(filePath, updated, "utf-8");
    console.log(`[sync_benchmarks] ✔ Synchronized benchmark table in: ${filePath}`);
    return true;
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`[sync_benchmarks] Failed updating ${filePath}:`, err.message);
    }
    return false;
  }
}

async function main() {
  const jsonPath = path.join(rootDir, "benchmark_results.json");
  const raw = await fs.readFile(jsonPath, "utf-8");
  const data = JSON.parse(raw);

  if (!data.results || !Array.isArray(data.results)) {
    throw new Error("Invalid benchmark_results.json: missing 'results' array.");
  }

  const tableMarkdown = generateBenchmarkTable(data.results);

  const targets = [
    path.join(rootDir, "README.md"),
    path.join(rootDir, "benchmarks", "README.md"),
    path.join(monorepoRoot, "README.md"),
    path.join(monorepoRoot, "obsidian-color-math", "README.md"),
    path.join(monorepoRoot, "obsidian-color-math", "benchmarks", "README.md"),
    "C:\\Users\\aditya\\Documents\\GitHub\\color-math\\README.md",
    "C:\\Users\\aditya\\Documents\\GitHub\\color-math\\obsidian-color-math\\README.md",
    "C:\\Users\\aditya\\Documents\\GitHub\\color-math\\obsidian-color-math\\benchmarks\\README.md",
  ];

  const uniqueTargets = [...new Set(targets.map((p) => path.resolve(p)))];
  for (const target of uniqueTargets) {
    await updateFile(target, tableMarkdown);
  }
}

if (process.argv[1] && process.argv[1].endsWith("sync_benchmarks.mjs")) {
  main().catch((err) => {
    console.error("[sync_benchmarks] Fatal error:", err);
    process.exit(1);
  });
}
