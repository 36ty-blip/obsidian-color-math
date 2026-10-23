// scripts/keystroke_profiler.ts
// Multi-Threaded Keystroke Gateway Profiler & Frequency Telemetry CLI Harness
// Allocates up to 50% CPU (6 worker threads on 12-thread CPU) to model character-by-character live typing.

import os from "os";
import fs from "fs";
import path from "path";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { buildTypingCorpus, TypingScript } from "../tests/keystroke/typing_corpus";
import {
  KeystrokeGatewayTelemetry,
  TwoSidedGateMetrics,
  CascadeRaceResult,
} from "../tests/keystroke/gateway_telemetry";
import {
  extractTokensFromPrefixes,
  auditKeystrokeAutoSealingSLA,
  profileHysteresisTransitions,
  SlaResult,
} from "../tests/keystroke/keystroke_analyzer";

interface WorkerPayload {
  scripts: TypingScript[];
  iterations: number;
}

interface WorkerResult {
  tokenCount: number;
  isolatedMetrics: TwoSidedGateMetrics[];
  cascadeResult: CascadeRaceResult;
  slaResult: SlaResult;
}

if (!isMainThread) {
  const { scripts, iterations } = workerData as WorkerPayload;
  const telemetry = new KeystrokeGatewayTelemetry();

  // Extract all token prefixes
  const allPrefixes = scripts.flatMap((s) => s.keystrokeSequence);
  const tokens = extractTokensFromPrefixes(allPrefixes);

  // Phase 1: Isolated measurement
  const isolatedMetrics = telemetry.measureIsolatedGates(tokens, iterations);

  // Phase 2: Cascade tournament
  const cascadeResult = telemetry.runCascadeTournament(tokens);

  // SLA audit
  const slaResult = auditKeystrokeAutoSealingSLA(scripts);

  const result: WorkerResult = {
    tokenCount: tokens.length,
    isolatedMetrics,
    cascadeResult,
    slaResult,
  };

  parentPort?.postMessage(result);
  process.exit(0);
}

// -------------------------------------------------------------
// MAIN THREAD CONTROLLER
// -------------------------------------------------------------
async function runProfiler(): Promise<void> {
  console.log("\n=========================================================================");
  console.log("⚡ INTERACTIVE KEYSTROKE GATEWAY PROFILER & FREQUENCY TELEMETRY ENGINE");
  console.log("=========================================================================\n");

  const totalCores = os.cpus().length;
  // User Rule: 50% CPU allocation (6 threads on 12-thread CPU)
  const workerCount = Math.max(1, Math.min(6, Math.floor(totalCores * 0.5)));
  console.log(`[CPU Calibration] Host cores: ${totalCores} | Allocated worker threads: ${workerCount} (50% CPU budget)`);

  const scripts = buildTypingCorpus();
  const totalKeystrokes = scripts.reduce((sum, s) => sum + s.keystrokeSequence.length, 0);
  console.log(`[Corpus Setup] ${scripts.length} master mathematical scripts loaded.`);
  console.log(`[Prefix Stream] Generated ${totalKeystrokes} character-by-character typing states (0 -> N).`);

  // Distribute scripts across workers
  const chunkSize = Math.ceil(scripts.length / workerCount);
  const chunks: TypingScript[][] = [];
  for (let i = 0; i < scripts.length; i += chunkSize) {
    chunks.push(scripts.slice(i, i + chunkSize));
  }

  console.log(`[Dispatching] Running multi-worker Phase 1 & 2 simulations...\n`);
    const workerPromises: Promise<WorkerResult>[] = chunks.map((chunk, index) => {
    return new Promise<WorkerResult>((resolve, reject) => {
      let resolved = false;
      const worker = new Worker(__filename, {
        workerData: {
          scripts: chunk,
          iterations: 30,
        } as WorkerPayload,
        execArgv: process.execArgv,
      });

      worker.on("message", (res: WorkerResult) => {
        resolved = true;
        resolve(res);
      });
      worker.on("error", reject);
      worker.on("exit", (code) => {
        if (!resolved && code !== 0) {
          reject(new Error(`Worker ${index} exited with code ${code}`));
        }
      });
    });
  });

  const results = await Promise.all(workerPromises);

  // Aggregate results across workers
  let aggregatedTokens = 0;
  const gateMap: Map<string, TwoSidedGateMetrics> = new Map();
  const winners: Record<string, number> = {};
  let totalSlaKeystrokes = 0;
  let totalSlaTimeMs = 0;
  let maxUs = 0;
  let totalViolations = 0;
  let totalDangling = 0;

  for (const r of results) {
    aggregatedTokens += r.tokenCount;
    totalSlaKeystrokes += r.slaResult.totalKeystrokes;
    totalSlaTimeMs += r.slaResult.totalTimeMs;
    maxUs = Math.max(maxUs, r.slaResult.maxUs);
    totalViolations += r.slaResult.slaViolations;
    totalDangling += r.slaResult.unsealedDanglingDetected;

    for (const [w, count] of Object.entries(r.cascadeResult.winnerDistribution)) {
      winners[w] = (winners[w] || 0) + count;
    }

    for (const g of r.isolatedMetrics) {
      if (!gateMap.has(g.gateId)) {
        gateMap.set(g.gateId, { ...g });
      } else {
        const cur = gateMap.get(g.gateId)!;
        cur.evaluations += g.evaluations;
        cur.hitsYes += g.hitsYes;
        cur.hitsNo += g.hitsNo;
        cur.totalNsYes += g.totalNsYes;
        cur.totalNsNo += g.totalNsNo;
      }
    }
  }

  // Recalculate consolidated rates
  const masterGateList: TwoSidedGateMetrics[] = [];
  for (const [_, g] of gateMap) {
    const costYes = g.hitsYes > 0 ? Number(g.totalNsYes) / g.hitsYes : 0.001;
    const costNo = g.hitsNo > 0 ? Number(g.totalNsNo) / g.hitsNo : 0.001;
    const probYes = g.evaluations > 0 ? g.hitsYes / g.evaluations : 0;
    const expectedCost = probYes * costYes + (1 - probYes) * costNo;
    const ratio = expectedCost > 0 ? probYes / expectedCost : 0;

    masterGateList.push({
      ...g,
      costYesNs: Number(costYes.toFixed(3)),
      costNoNs: Number(costNo.toFixed(3)),
      expectedCostNs: Number(expectedCost.toFixed(3)),
      probabilityYes: Number(probYes.toFixed(4)),
      ratio: Number(ratio.toFixed(4)),
    });
  }

  // Compute optimal ranks based on ratio descending
  const sorted = [...masterGateList]
    .filter((g) => g.gateId !== "Gate3_Unified")
    .sort((a, b) => b.ratio - a.ratio);
  sorted.forEach((item, idx) => {
    const found = masterGateList.find((g) => g.gateId === item.gateId);
    if (found) found.optimalRank = idx + 1;
  });

  // -------------------------------------------------------------
  // REPORT 1: PHASE 1 ISOLATED TWO-SIDED METRICS LEADERBOARD
  // -------------------------------------------------------------
  console.log("┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐");
  console.log("│ 🏆 PHASE 1: ISOLATED TWO-SIDED GATEWAY TELEMETRY (100% UNBIASED WORKLOAD)                              │");
  console.log("├────────────────────────────────────────────────────────────────────────────────────────────────────────┤");
  console.log("│ Gate Name                      │ P(Yes)   │ C(Yes)     │ C(No)      │ E[Cost]    │ Ratio R_i  │ Rank     │");
  console.log("├────────────────────────────────┼──────────┼────────────┼────────────┼────────────┼────────────┼──────────┤");

  for (const g of masterGateList) {
    const nameCol = g.name.padEnd(30);
    const pCol = (g.probabilityYes * 100).toFixed(1).padStart(6) + "%";
    const cYesCol = (g.costYesNs.toFixed(2) + " ns").padStart(10);
    const cNoCol = (g.costNoNs.toFixed(2) + " ns").padStart(10);
    const eCostCol = (g.expectedCostNs.toFixed(2) + " ns").padStart(10);
    const ratioCol = g.ratio.toFixed(3).padStart(10);
    const rankCol = g.optimalRank ? `#${g.optimalRank} Opt`.padStart(8) : " Compare".padStart(8);

    console.log(`│ ${nameCol} │ ${pCol} │ ${cYesCol} │ ${cNoCol} │ ${eCostCol} │ ${ratioCol} │ ${rankCol} │`);
  }
  console.log("└────────────────────────────────────────────────────────────────────────────────────────────────────────┘");

  // -------------------------------------------------------------
  // REPORT 2: PHASE 2 CASCADE TOURNAMENT RACE WINNERS
  // -------------------------------------------------------------
  console.log("\n┌──────────────────────────────────────────────────────────────────────────────────┐");
  console.log("│ 🏁 PHASE 2: SEQUENTIAL CASCADE TOURNAMENT RACE (WHO CLAIMS THE TOKEN FIRST)     │");
  console.log("├──────────────────────────────────────────────────────────────────────────────────┤");
  console.log("│ Cascade Gate                   │ Firing Count    │ Percentage   │ Role           │");
  console.log("├────────────────────────────────┼─────────────────┼──────────────┼────────────────┤");

  let totalWinners = Object.values(winners).reduce((a, b) => a + b, 0);
  for (const [gate, count] of Object.entries(winners)) {
    const pct = totalWinners > 0 ? ((count / totalWinners) * 100).toFixed(1) : "0.0";
    const role =
      gate.includes("Backslash") || gate.includes("Mphf")
        ? "Positive Match  "
        : gate.includes("Fallthrough")
        ? "Default Variable"
        : "Fast-Fail Bail  ";
    console.log(`│ ${gate.padEnd(30)} │ ${count.toString().padStart(15)} │ ${(pct + "%").padStart(12)} │ ${role} │`);
  }
  console.log("└──────────────────────────────────────────────────────────────────────────────────┘");

  // -------------------------------------------------------------
  // REPORT 3: CONTINUOUS AUTO-SEALING SLA BUDGET (< 0.5 ms)
  // -------------------------------------------------------------
  console.log("\n┌──────────────────────────────────────────────────────────────────────────────────┐");
  console.log("│ 🛡️ CONTINUOUS PER-KEYSTROKE AUTO-SEALING SLA COMPLIANCE (< 0.5 ms)              │");
  console.log("├──────────────────────────────────────────────────────────────────────────────────┤");
  console.log(`│ Total Keystrokes Audited       : ${totalSlaKeystrokes.toString().padEnd(46)}│`);
  console.log(`│ Total Elapsed Simulation Time  : ${(totalSlaTimeMs.toFixed(2) + " ms").padEnd(46)}│`);
  console.log(`│ Worst-Case Keystroke Latency   : ${(maxUs.toFixed(2) + " µs").padEnd(46)}│`);
  console.log(`│ SLA Violations (> 500 µs)      : ${totalViolations.toString().padEnd(46)}│`);
  console.log(`│ Unsealed Dangling Carets/Op    : ${totalDangling.toString().padEnd(46)}│`);
  console.log(`│ Mathematical Crash Immunity    : ${(totalDangling === 0 ? "PASSED (100% immune)" : "FAILED").padEnd(46)}│`);
  console.log("└──────────────────────────────────────────────────────────────────────────────────┘");

  // -------------------------------------------------------------
  // REPORT 4: HYSTERESIS & STATE TRANSITION DEMO
  // -------------------------------------------------------------
  console.log("\n[Hysteresis Check] Tracing 'cos(x)' keystroke transition sequence:");
  const h = profileHysteresisTransitions("cos(x)");
  for (const s of h.steps) {
    console.log(`  k=${s.keystrokeIndex}: '${s.input.padEnd(8)}' -> sealed: '${s.sealedOutput.padEnd(10)}' [${s.classification}] (${s.durationUs} µs)`);
  }
  console.log(`  Result: ${h.smoothTransition ? "Clean transition, zero false promotion." : "Warning: false promotion detected."}`);

  // Write results to JSON
  const outDir = path.resolve(__dirname, "../tests/generated");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outFile = path.join(outDir, "keystroke_telemetry.json");
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        workerCount,
        totalKeystrokes: totalSlaKeystrokes,
        masterGateList,
        winners,
        sla: {
          totalViolations,
          maxUs,
          crashImmunityPassed: totalDangling === 0,
        },
      },
      (key, value) => (typeof value === "bigint" ? value.toString() : value),
      2
    )
  );
  console.log(`\n[Telemetry Saved] Exported empirical metrics to ${outFile}\n`);
}

runProfiler().catch((err) => {
  console.error("Profiler failed:", err);
  process.exit(1);
});
