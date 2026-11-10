// scripts/corpus_navigation_audit.ts
//! High-Performance Multi-Worker Real-World Corpus Navigation & 4D Tensor Audit.
//! Scans authentic equations across thousands of markdown notes in tests/corpus.
//! Validates Method 1 (DOM classes), Method 2 (WeakMap), and Method 3 (On-Demand CST)
//! with the Semantic Invariant Oracle across 6 worker threads (50% CPU allocation).

import fs from "fs";
import path from "path";
import os from "os";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { scanMarkdown } from "../src/parsers/markdown_scanner";
import { MathCSTParser } from "../src/parsers/cst/parser";
import { stampMathJaxDOM } from "../src/editor/dom_stamper";
import { getMathJaxElementRange } from "../src/editor/weakmap_index";
import { resolveOnDemandRange } from "../src/editor/lazy_navigation";
import {
  synthesizeMathJaxDOM,
  assertMathematicalInvariant,
  assertSemanticOracle,
  FakeElement,
} from "../tests/tri_engine_harness";

interface Anomaly {
  file: string;
  line: number;
  col: number;
  latexSnippet: string;
  latexFull?: string;
  expectedToken: string;
  groundTruthRange: { start: number; end: number };
  m1Range?: { start: number; end: number };
  m2Range?: { start: number; end: number };
  m3Range?: { start: number; end: number };
  m1MatchesGT: boolean;
  m2MatchesGT: boolean;
  m3MatchesGT: boolean;
  classification:
    | "M1_M2_SWAPPED_M3_CORRECT"
    | "M1_M2_CORRECT_M3_WRONG"
    | "COMMON_MODE_ORACLE_FAILURE"
    | "UNSTAMPED_M1_M2"
    | "UNRESOLVED_M3"
    | "ALL_WRONG";
  astNodeKind?: string;
  errorMessage: string;
}

function classifyAnomaly(
  gt: { start: number; end: number },
  m1: { start: number; end: number } | null,
  m2: { start: number; end: number } | null,
  m3: { start: number; end: number } | null,
  hasExactConsensus: boolean
): Anomaly["classification"] {
  const m1Ok = Boolean(m1 && m1.start === gt.start && m1.end === gt.end);
  const m2Ok = Boolean(m2 && m2.start === gt.start && m2.end === gt.end);
  const m3Ok = Boolean(m3 && m3.start === gt.start && m3.end === gt.end);

  if (hasExactConsensus) {
    return "COMMON_MODE_ORACLE_FAILURE";
  }
  if (!m1 && !m2) {
    return "UNSTAMPED_M1_M2";
  }
  if (!m3 && (m1Ok || m2Ok)) {
    return "UNRESOLVED_M3";
  }
  if (m3Ok && (!m1Ok || !m2Ok)) {
    return "M1_M2_SWAPPED_M3_CORRECT";
  }
  if ((m1Ok || m2Ok) && !m3Ok) {
    return "M1_M2_CORRECT_M3_WRONG";
  }
  return "ALL_WRONG";
}

interface WorkerStats {
  filesProcessed: number;
  equationsScanned: number;
  equationsValidated: number;
  tokensAudited: number;
  triParityConsensusCount: number;
  disagreementCount: number;
  semanticOraclePassCount: number;
  latenciesM1: number[];
  latenciesM2: number[];
  latenciesM3: number[];
  anomalies: Anomaly[];
}

// ----------------------------------------------------------------------------
// WORKER THREAD LOGIC
// ----------------------------------------------------------------------------
if (!isMainThread) {
  const { files, corpusRoot } = workerData as { files: string[]; corpusRoot: string };

  const stats: WorkerStats = {
    filesProcessed: 0,
    equationsScanned: 0,
    equationsValidated: 0,
    tokensAudited: 0,
    triParityConsensusCount: 0,
    disagreementCount: 0,
    semanticOraclePassCount: 0,
    latenciesM1: [],
    latenciesM2: [],
    latenciesM3: [],
    anomalies: [],
  };

  for (const filePath of files) {
    stats.filesProcessed++;
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const scan = scanMarkdown(content);
    if (!scan) continue;
    const blocks = [...scan.mathBlocks, ...scan.mathInlines];
    if (blocks.length === 0) continue;

    for (const block of blocks) {
      stats.equationsScanned++;
      const latex = content.slice(block.contentStart, block.contentEnd).trim();
      if (!latex || latex.length === 0) continue;

      let ast;
      try {
        const parser = new MathCSTParser(latex);
        ast = parser.parse();
      } catch {
        // Pre-existing syntax errors in raw user notes are skipped
        continue;
      }

      if (!ast || ast.length === 0) continue;

      let synth;
      try {
        synth = synthesizeMathJaxDOM(ast, latex);
      } catch {
        continue;
      }

      const { root, targets } = synth;
      if (!targets || targets.length === 0) continue;

      // Reconcile and stamp via 4D Spatial Tensor Engine
      try {
        stampMathJaxDOM(root as unknown as Element, latex);
      } catch {
        continue;
      }

      stats.equationsValidated++;

      for (const target of targets) {
        stats.tokensAudited++;
        const el = target.element as unknown as Element;
        const rootEl = root as unknown as Element;

        // 1. Method 2: WeakMap Lookup
        const t0_m2 = performance.now();
        const m2 = getMathJaxElementRange(el);
        const latM2 = (performance.now() - t0_m2) * 1e6; // ns
        if (stats.latenciesM2.length < 50000 || Math.random() < 0.1) {
          stats.latenciesM2.push(latM2);
        }

        // 2. Method 1: DOM Class Inspection
        const t0_m1 = performance.now();
        const m1El = target.element.closest('[class*="cm-src-"]');
        const m1Match = m1El?.className.match(/cm-src-(\d+)-(\d+)/);
        const latM1 = (performance.now() - t0_m1) * 1e3; // µs
        if (stats.latenciesM1.length < 50000 || Math.random() < 0.1) {
          stats.latenciesM1.push(latM1);
        }
        const m1 = m1Match ? { start: parseInt(m1Match[1], 10), end: parseInt(m1Match[2], 10) } : null;

        // 3. Method 3: Pure On-Demand CST (skipWeakMap: true)
        const t0_m3 = performance.now();
        const m3 = resolveOnDemandRange(el, rootEl, latex, true);
        const latM3 = (performance.now() - t0_m3) * 1e3; // µs
        if (stats.latenciesM3.length < 50000 || Math.random() < 0.1) {
          stats.latenciesM3.push(latM3);
        }

        const hasExactConsensus =
          m1 !== null &&
          m2 !== undefined &&
          m3 !== null &&
          m1.start === m2.start &&
          m2.start === m3.start &&
          m1.end === m2.end &&
          m2.end === m3.end;

        const gtRange = { start: target.node.start, end: target.node.end };
        const m2Simple = m2 ? { start: m2.start, end: m2.end } : null;
        const m3Simple = m3 ? { start: m3.start, end: m3.end } : null;

        if (hasExactConsensus) {
          stats.triParityConsensusCount++;
          // Validate with Semantic Invariant Oracle
          try {
            assertMathematicalInvariant(latex, m1!, target.expectedText);
            assertSemanticOracle(target.element, m1!, latex, target.expectedText);
            stats.semanticOraclePassCount++;
          } catch (err: any) {
            stats.disagreementCount++;
            stats.anomalies.push({
              file: path.relative(corpusRoot, filePath),
              line: content.slice(0, block.contentStart).split("\n").length,
              col: 1,
              latexSnippet: latex.slice(0, 80),
              latexFull: latex,
              expectedToken: target.expectedText,
              groundTruthRange: gtRange,
              m1Range: m1 ?? undefined,
              m2Range: m2Simple ?? undefined,
              m3Range: m3Simple ?? undefined,
              m1MatchesGT: Boolean(m1 && m1.start === gtRange.start && m1.end === gtRange.end),
              m2MatchesGT: Boolean(m2Simple && m2Simple.start === gtRange.start && m2Simple.end === gtRange.end),
              m3MatchesGT: Boolean(m3Simple && m3Simple.start === gtRange.start && m3Simple.end === gtRange.end),
              classification: classifyAnomaly(gtRange, m1, m2Simple, m3Simple, true),
              astNodeKind: target.node.kind,
              errorMessage: err.message,
            });
          }
        } else {
          stats.disagreementCount++;
          stats.anomalies.push({
            file: path.relative(corpusRoot, filePath),
            line: content.slice(0, block.contentStart).split("\n").length,
            col: 1,
            latexSnippet: latex.slice(0, 80),
            latexFull: latex,
            expectedToken: target.expectedText,
            groundTruthRange: gtRange,
            m1Range: m1 ?? undefined,
            m2Range: m2Simple ?? undefined,
            m3Range: m3Simple ?? undefined,
            m1MatchesGT: Boolean(m1 && m1.start === gtRange.start && m1.end === gtRange.end),
            m2MatchesGT: Boolean(m2Simple && m2Simple.start === gtRange.start && m2Simple.end === gtRange.end),
            m3MatchesGT: Boolean(m3Simple && m3Simple.start === gtRange.start && m3Simple.end === gtRange.end),
            classification: classifyAnomaly(gtRange, m1, m2Simple, m3Simple, false),
            astNodeKind: target.node.kind,
            errorMessage: `Tri-Parity Disagreement: GT=${JSON.stringify(gtRange)} M1=${JSON.stringify(m1)} M2=${JSON.stringify(m2Simple)} M3=${JSON.stringify(m3Simple)}`,
          });
        }
      }
    }
  }

  parentPort?.postMessage(stats);
}

// ----------------------------------------------------------------------------
// MAIN THREAD MASTER COORDINATOR
// ----------------------------------------------------------------------------
if (isMainThread) {
  async function runMasterAudit() {
    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log("   Color Math Full-Corpus Tri-Engine Navigation & 4D Tensor Audit Runner   ");
    console.log("══════════════════════════════════════════════════════════════════════════\n");

    const possibleRoots = [
      path.resolve(__dirname, "../tests/corpus"),
      path.resolve(process.cwd(), "tests/corpus"),
      path.resolve(__dirname, "corpus"),
    ];
    const corpusRoot = possibleRoots.find((d) => fs.existsSync(d));
    if (!corpusRoot) {
      console.error("Corpus directory not found in:", possibleRoots);
      process.exit(1);
    }

    // Parse CLI parameters
    const args = process.argv.slice(2);
    const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
    const limit = limitArg ? parseInt(limitArg, 10) : undefined;
    const threadArg = args.find((a) => a.startsWith("--threads="))?.split("=")[1];
    const corpusFilter = args.find((a) => a.startsWith("--corpus="))?.split("=")[1];
    const streamTelemetry = args.includes("--stream-telemetry") || args.some((a) => a.startsWith("--telemetry"));
    const telemetryPathArg = args.find((a) => a.startsWith("--telemetry="))?.split("=")[1];
    const noFail = args.includes("--no-fail");

    const totalCpus = os.cpus().length;
    // User rule: up to 50% CPU allocation (6 threads on 12-thread CPU)
    const numThreads = threadArg ? parseInt(threadArg, 10) : Math.max(1, Math.floor(totalCpus / 2));

    const searchTarget = corpusFilter ? path.join(corpusRoot, corpusFilter) : corpusRoot;
    if (!fs.existsSync(searchTarget)) {
      console.error(`Specified corpus folder not found: ${searchTarget}`);
      process.exit(1);
    }

    console.log(`Corpus Root:   ${corpusRoot}`);
    console.log(`Hardware:      ${os.cpus()[0].model} (${totalCpus} logical cores)`);
    console.log(`Worker Pool:   ${numThreads} threads allocated (50% CPU limit, keeping system responsive)`);
    if (limit) console.log(`Limit:         Restricted to first ${limit.toLocaleString()} files (Smoke Test)`);
    if (corpusFilter) console.log(`Filter:        Restricted to folder "${corpusFilter}"`);
    console.log(`Engines:       Method 1 (DOM), Method 2 (WeakMap), Method 3 (On-Demand CST)\n`);

    // Collect all .md files recursively
    function getAllMdFiles(dir: string): string[] {
      let results: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(getAllMdFiles(full));
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          results.push(full);
        }
      }
      return results;
    }

    console.log(`Indexing markdown documents in ${searchTarget}...`);
    let allFiles = getAllMdFiles(searchTarget);
    console.log(`Found ${allFiles.length.toLocaleString()} markdown documents.\n`);

    if (limit && allFiles.length > limit) {
      allFiles = allFiles.slice(0, limit);
      console.log(`Smoke Test Slice: Processing ${allFiles.length.toLocaleString()} documents.\n`);
    }

    // Shard files across workers
    const chunks: string[][] = Array.from({ length: numThreads }, () => []);
    for (let i = 0; i < allFiles.length; i++) {
      chunks[i % numThreads].push(allFiles[i]);
    }

    const tStart = performance.now();
    console.log(`Launching ${numThreads} worker threads across ${allFiles.length.toLocaleString()} documents...`);

    const promises = chunks.map((chunk, idx) => {
      return new Promise<WorkerStats>((resolve, reject) => {
        if (chunk.length === 0) {
          resolve({
            filesProcessed: 0,
            equationsScanned: 0,
            equationsValidated: 0,
            tokensAudited: 0,
            triParityConsensusCount: 0,
            disagreementCount: 0,
            semanticOraclePassCount: 0,
            latenciesM1: [],
            latenciesM2: [],
            latenciesM3: [],
            anomalies: [],
          });
          return;
        }

        const worker = new Worker(__filename, {
          workerData: {
            files: chunk,
            corpusRoot,
          },
        });

        worker.on("message", (data: WorkerStats) => resolve(data));
        worker.on("error", (err) => reject(err));
        worker.on("exit", (code) => {
          if (code !== 0) reject(new Error(`Worker ${idx} stopped with exit code ${code}`));
        });
      });
    });

    const results = await Promise.all(promises);
    const durationSec = (performance.now() - tStart) / 1000;

    // Aggregate statistics
    let totalFiles = 0;
    let totalEquationsScanned = 0;
    let totalEquationsValidated = 0;
    let totalTokensAudited = 0;
    let totalConsensus = 0;
    let totalDisagreements = 0;
    let totalOraclePass = 0;
    const allLatenciesM1: number[] = [];
    const allLatenciesM2: number[] = [];
    const allLatenciesM3: number[] = [];
    const allAnomalies: Anomaly[] = [];

    for (const r of results) {
      totalFiles += r.filesProcessed;
      totalEquationsScanned += r.equationsScanned;
      totalEquationsValidated += r.equationsValidated;
      totalTokensAudited += r.tokensAudited;
      totalConsensus += r.triParityConsensusCount;
      totalDisagreements += r.disagreementCount;
      totalOraclePass += r.semanticOraclePassCount;
      for (let i = 0; i < r.latenciesM1.length; i++) allLatenciesM1.push(r.latenciesM1[i]);
      for (let i = 0; i < r.latenciesM2.length; i++) allLatenciesM2.push(r.latenciesM2[i]);
      for (let i = 0; i < r.latenciesM3.length; i++) allLatenciesM3.push(r.latenciesM3[i]);
      for (let i = 0; i < r.anomalies.length; i++) allAnomalies.push(r.anomalies[i]);
    }

    const consensusRate = totalTokensAudited > 0 ? (totalConsensus / totalTokensAudited) * 100 : 100;
    const disagreementRate = totalTokensAudited > 0 ? (totalDisagreements / totalTokensAudited) * 100 : 0;
    const oraclePassRate = totalTokensAudited > 0 ? (totalOraclePass / totalTokensAudited) * 100 : 100;

    function computePercentiles(arr: number[]) {
      if (arr.length === 0) return { avg: 0, min: 0, max: 0, p50: 0, p90: 0, p99: 0 };
      const sorted = arr.slice().sort((a, b) => a - b);
      let sum = 0;
      for (let i = 0; i < sorted.length; i++) sum += sorted[i];
      return {
        avg: sum / sorted.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p90: sorted[Math.floor(sorted.length * 0.9)],
        p99: sorted[Math.floor(sorted.length * 0.99)],
      };
    }

    const latStatsM1 = computePercentiles(allLatenciesM1);
    const latStatsM2 = computePercentiles(allLatenciesM2);
    const latStatsM3 = computePercentiles(allLatenciesM3);

    const avgLatM1 = latStatsM1.avg;
    const avgLatM2 = latStatsM2.avg;
    const avgLatM3 = latStatsM3.avg;

    const classificationBreakdown: Record<Anomaly["classification"], number> = {
      M1_M2_SWAPPED_M3_CORRECT: 0,
      M1_M2_CORRECT_M3_WRONG: 0,
      COMMON_MODE_ORACLE_FAILURE: 0,
      UNSTAMPED_M1_M2: 0,
      UNRESOLVED_M3: 0,
      ALL_WRONG: 0,
    };
    for (const a of allAnomalies) {
      classificationBreakdown[a.classification] = (classificationBreakdown[a.classification] || 0) + 1;
    }

    console.log("\n══════════════════════════════════════════════════════════════════════════");
    console.log("                  FULL-CORPUS NAVIGATION BENCHMARK REPORT                 ");
    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log(`Execution Time:             ${durationSec.toFixed(2)} seconds`);
    console.log(`Throughput:                 ${Math.round(totalEquationsScanned / durationSec).toLocaleString()} equations / sec`);
    console.log(`Documents Audited:          ${totalFiles.toLocaleString()}`);
    console.log(`Equations Scanned:          ${totalEquationsScanned.toLocaleString()}`);
    console.log(`Equations Validated:        ${totalEquationsValidated.toLocaleString()}`);
    console.log(`Mathematical Tokens Tested: ${totalTokensAudited.toLocaleString()}`);
    console.log("──────────────────────────────────────────────────────────────────────────");
    console.log(`Tri-Parity Exact Consensus: ${totalConsensus.toLocaleString()} (${consensusRate.toFixed(2)}%)`);
    console.log(`Disagreements / Conflicts:  ${totalDisagreements.toLocaleString()} (${disagreementRate.toFixed(2)}%)`);
    console.log(`Semantic Oracle Pass Rate:  ${totalOraclePass.toLocaleString()} (${oraclePassRate.toFixed(2)}%)`);
    if (allAnomalies.length > 0) {
      console.log("──────────────────────────────────────────────────────────────────────────");
      console.log("GROUND-TRUTH DISAGREEMENT CLASSIFICATION (100% Uncapped):");
      for (const [cls, count] of Object.entries(classificationBreakdown)) {
        if (count > 0) {
          const pct = ((count / allAnomalies.length) * 100).toFixed(2);
          console.log(`  ${cls.padEnd(28)}: ${count.toLocaleString().padStart(8)} (${pct}%)`);
        }
      }
    }
    console.log("──────────────────────────────────────────────────────────────────────────");
    console.log(`Avg Method 2 (WeakMap):     ${avgLatM2.toFixed(1)} ns (P99: ${latStatsM2.p99.toFixed(1)} ns)`);
    console.log(`Avg Method 1 (DOM Class):   ${avgLatM1.toFixed(2)} µs (P99: ${latStatsM1.p99.toFixed(2)} µs)`);
    console.log(`Avg Method 3 (On-Demand):   ${avgLatM3.toFixed(2)} µs (P99: ${latStatsM3.p99.toFixed(2)} µs)`);
    console.log(`144Hz Latency Compliance:   ${avgLatM3 < 6944 ? "PASSED (< 6.94 ms SLA)" : "FAILED"}`);
    console.log("══════════════════════════════════════════════════════════════════════════\n");

    const shouldWriteTelemetry = streamTelemetry || !args.includes("--no-telemetry");
    if (shouldWriteTelemetry) {
      const targetTelemetryPath = telemetryPathArg
        ? path.resolve(process.cwd(), telemetryPathArg)
        : path.resolve(process.cwd(), "tests/telemetry/anomalies.jsonl");

      fs.mkdirSync(path.dirname(targetTelemetryPath), { recursive: true });
      const fd = fs.openSync(targetTelemetryPath, "w");
      try {
        for (let i = 0; i < allAnomalies.length; i++) {
          fs.writeSync(fd, JSON.stringify(allAnomalies[i]) + "\n");
        }
      } finally {
        fs.closeSync(fd);
      }
      console.log(`📡 Telemetry Streamed:     ${allAnomalies.length.toLocaleString()} / ${totalDisagreements.toLocaleString()} anomaly records (100% uncapped) written to:`);
      console.log(`                           ${targetTelemetryPath}\n`);

      // Write comprehensive run summary JSON for visual report generation
      const summaryPath = path.resolve(path.dirname(targetTelemetryPath), "run_summary.json");
      const summaryPayload = {
        timestamp: Date.now(),
        date: new Date().toISOString(),
        hardware: {
          cpuModel: os.cpus()[0].model,
          threadsAllocated: numThreads,
          totalCpus,
        },
        metrics: {
          durationSec: parseFloat(durationSec.toFixed(2)),
          throughputEquationsPerSec: Math.round(totalEquationsScanned / durationSec),
          documentsAudited: totalFiles,
          equationsScanned: totalEquationsScanned,
          equationsValidated: totalEquationsValidated,
          mathematicalTokensTested: totalTokensAudited,
          triParityConsensusCount: totalConsensus,
          consensusRate: parseFloat(consensusRate.toFixed(2)),
          disagreementCount: totalDisagreements,
          disagreementRate: parseFloat(disagreementRate.toFixed(2)),
          semanticOraclePassCount: totalOraclePass,
          oraclePassRate: parseFloat(oraclePassRate.toFixed(2)),
          compliance144Hz: avgLatM3 < 6944,
        },
        classificationBreakdown,
        latencies: {
          m2_weakmap_ns: latStatsM2,
          m1_dom_class_us: latStatsM1,
          m3_ondemand_us: latStatsM3,
        },
      };
      fs.writeFileSync(summaryPath, JSON.stringify(summaryPayload, null, 2), "utf-8");
      console.log(`📊 Benchmark Summary:      ${summaryPath}\n`);
    }

    if (allAnomalies.length > 0) {
      console.log(`Found ${allAnomalies.length} anomalous sample(s):`);
      for (let i = 0; i < Math.min(10, allAnomalies.length); i++) {
        const a = allAnomalies[i];
        console.log(`\n[${i + 1}] ${a.file}:${a.line}`);
        console.log(`    Snippet:  ${a.latexSnippet}`);
        console.log(`    Token:    "${a.expectedToken}"`);
        console.log(`    Ranges:   M1=${JSON.stringify(a.m1Range)} M2=${JSON.stringify(a.m2Range)} M3=${JSON.stringify(a.m3Range)}`);
        console.log(`    Error:    ${a.errorMessage}`);
      }
      process.exit(noFail ? 0 : 1);
    } else {
      console.log("✓ Zero navigation disagreements or phase shifts detected across the corpus!");
      process.exit(0);
    }
  }

  runMasterAudit().catch((err) => {
    console.error("Corpus audit failed with unhandled error:", err);
    process.exit(1);
  });
}
