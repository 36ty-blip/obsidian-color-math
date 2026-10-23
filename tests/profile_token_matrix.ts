// tests/profile_token_matrix.ts
// Multi-Threaded Exhaustive Feature & Permutation Profiler
// Uses 50% CPU allocation (6 worker threads on 12-thread CPU) to scan all 6,392 corpus documents.

import fs from "fs";
import path from "path";
import os from "os";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { scanMarkdown } from "../src/parsers/markdown_scanner";
import { lookupCatalog } from "../src/parsers/catalog";

export interface FeatureCounters {
  total: number;
  hasBackslash: number;
  len1: number;
  len_le4: number;
  len_gt4: number;
  uppercase: number;
  openDelim: number;       // (, [, {
  caret: number;           // ^
  underscore: number;      // _
  closeDelim: number;      // ), ], }, ,, ;, $
  operator: number;        // +, -, =, <, >, *, /
  space: number;           // ' ', \t
  spaceValidArg: number;   // space followed by alphanumeric, \, or digit
  spaceOperator: number;   // space followed by +, -, =, ,, etc.
  precededByDigit: number; // e.g. 2x
}

export type CategoryKey = "function" | "parameter" | "constant" | "operator" | "variable";

export interface StrategyResult {
  functionsCaught: number;
  functionsMissed: number;
  variablesHashed: number;   // False Positives
  variablesBailed: number;   // True Negatives (Fast exits)
  macrosFastExit: number;
  totalTokens: number;
  estimatedTotalNs: number;
}

export interface WorkerReport {
  filesProcessed: number;
  equationsScanned: number;
  totalTokens: number;
  counts: Record<CategoryKey, { bare: FeatureCounters; macro: FeatureCounters }>;
  strategies: {
    baseline: StrategyResult;
    strictDelimiter: StrategyResult;
    delimiterPlusCaret: StrategyResult;
    twoStageSpace: StrategyResult;
    smartMultiDoor: StrategyResult;
  };
}

function createEmptyCounters(): FeatureCounters {
  return {
    total: 0,
    hasBackslash: 0,
    len1: 0,
    len_le4: 0,
    len_gt4: 0,
    uppercase: 0,
    openDelim: 0,
    caret: 0,
    underscore: 0,
    closeDelim: 0,
    operator: 0,
    space: 0,
    spaceValidArg: 0,
    spaceOperator: 0,
    precededByDigit: 0,
  };
}

function createEmptyStrategy(): StrategyResult {
  return {
    functionsCaught: 0,
    functionsMissed: 0,
    variablesHashed: 0,
    variablesBailed: 0,
    macrosFastExit: 0,
    totalTokens: 0,
    estimatedTotalNs: 0,
  };
}

if (!isMainThread) {
  const { files } = workerData as { files: string[] };

  const categories: CategoryKey[] = ["function", "parameter", "constant", "operator", "variable"];
  const counts: Record<CategoryKey, { bare: FeatureCounters; macro: FeatureCounters }> = {
    function: { bare: createEmptyCounters(), macro: createEmptyCounters() },
    parameter: { bare: createEmptyCounters(), macro: createEmptyCounters() },
    constant: { bare: createEmptyCounters(), macro: createEmptyCounters() },
    operator: { bare: createEmptyCounters(), macro: createEmptyCounters() },
    variable: { bare: createEmptyCounters(), macro: createEmptyCounters() },
  };

  const strategies = {
    baseline: createEmptyStrategy(),
    strictDelimiter: createEmptyStrategy(),
    delimiterPlusCaret: createEmptyStrategy(),
    twoStageSpace: createEmptyStrategy(),
    smartMultiDoor: createEmptyStrategy(),
  };

  let filesProcessed = 0;
  let equationsScanned = 0;
  let totalTokens = 0;

  for (const filePath of files) {
    filesProcessed++;
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    if (!content.includes("$")) continue;

    let scan;
    try {
      scan = scanMarkdown(content);
    } catch {
      continue;
    }

    const blocks = [...scan.mathBlocks, ...scan.mathInlines];
    if (blocks.length === 0) continue;
    equationsScanned += blocks.length;

    for (const b of blocks) {
      const eq = content.slice(b.contentStart, b.contentEnd);
      if (!eq) continue;
      let i = 0;

      while (i < eq.length) {
        if (/\s/.test(eq[i])) {
          i++;
          continue;
        }

        // TeX comments %
        if (eq[i] === "%") {
          while (i < eq.length && eq[i] !== "\n" && eq[i] !== "\r") i++;
          continue;
        }

        const hasBackslash = eq[i] === "\\";
        const tokenStart = hasBackslash ? i + 1 : i;
        if (tokenStart >= eq.length) break;

        const firstCh = eq[tokenStart];
        if (!/[A-Za-z]/.test(firstCh)) {
          i = tokenStart + 1;
          continue;
        }

        let tokenEnd = tokenStart;
        while (
          tokenEnd < eq.length &&
          (/[A-Za-z]/.test(eq[tokenEnd]) ||
            (eq[tokenEnd] === "." && tokenEnd + 1 < eq.length && /[A-Za-z]/.test(eq[tokenEnd + 1])))
        ) {
          tokenEnd++;
        }

        const token = eq.slice(tokenStart, tokenEnd);
        const prevChar = i > 0 ? eq[i - 1] : "";
        const lookaheadChar = tokenEnd < eq.length ? eq[tokenEnd] : "";

        // Space lookahead
        let p = tokenEnd;
        while (p < eq.length && /\s/.test(eq[p])) p++;
        const afterSpaceChar = p < eq.length ? eq[p] : "";

        // Features
        const len = token.length;
        const len1 = len === 1;
        const len_le4 = len >= 2 && len <= 4;
        const len_gt4 = len > 4;
        const uppercase = /^[A-Z]/.test(token);
        const openDelim = lookaheadChar === "(" || lookaheadChar === "[" || lookaheadChar === "{";
        const caret = lookaheadChar === "^";
        const underscore = lookaheadChar === "_";
        const closeDelim =
          lookaheadChar === ")" ||
          lookaheadChar === "]" ||
          lookaheadChar === "}" ||
          lookaheadChar === "," ||
          lookaheadChar === ";" ||
          lookaheadChar === "$";
        const operator =
          lookaheadChar === "+" ||
          lookaheadChar === "-" ||
          lookaheadChar === "=" ||
          lookaheadChar === "<" ||
          lookaheadChar === ">" ||
          lookaheadChar === "*" ||
          lookaheadChar === "/";
        const space = /\s/.test(lookaheadChar);
        const spaceValidArg = space && /[0-9A-Za-z\\]/.test(afterSpaceChar);
        const spaceOperator = space && /[+\-=<>\/*,]/.test(afterSpaceChar);
        const precededByDigit = /[0-9]/.test(prevChar);

        // Catalog Ground Truth
        const entry =
          lookupCatalog(token.toLowerCase()) ||
          lookupCatalog(token) ||
          lookupCatalog("\\" + token);

        let cat: CategoryKey = "variable";
        if (entry) {
          if (entry.role === "function") cat = "function";
          else if (entry.role === "parameter") cat = "parameter";
          else if (entry.role === "constant") cat = "constant";
          else if (entry.role === "operator" || entry.role === "relation") cat = "operator";
        }

        totalTokens++;
        const subMap = hasBackslash ? counts[cat].macro : counts[cat].bare;
        subMap.total++;
        if (hasBackslash) subMap.hasBackslash++;
        if (len1) subMap.len1++;
        if (len_le4) subMap.len_le4++;
        if (len_gt4) subMap.len_gt4++;
        if (uppercase) subMap.uppercase++;
        if (openDelim) subMap.openDelim++;
        if (caret) subMap.caret++;
        if (underscore) subMap.underscore++;
        if (closeDelim) subMap.closeDelim++;
        if (operator) subMap.operator++;
        if (space) subMap.space++;
        if (spaceValidArg) subMap.spaceValidArg++;
        if (spaceOperator) subMap.spaceOperator++;
        if (precededByDigit) subMap.precededByDigit++;

        // ═════════════════════════════════════════════════════════════════════
        // Simulate Strategy 1: Current Baseline (Checks everything)
        // ═════════════════════════════════════════════════════════════════════
        strategies.baseline.totalTokens++;
        if (hasBackslash) {
          strategies.baseline.macrosFastExit++;
          strategies.baseline.estimatedTotalNs += 55;
          if (cat === "function") strategies.baseline.functionsCaught++;
        } else {
          // Both matchBareFunction and matchBareSymbol slice & hash everything
          strategies.baseline.estimatedTotalNs += 70;
          if (cat === "function") strategies.baseline.functionsCaught++;
          if (cat === "variable") strategies.baseline.variablesHashed++;
        }

        // ═════════════════════════════════════════════════════════════════════
        // Simulate Strategy 2: Strict Delimiter Gate (Lookahead in '(', '[', '{')
        // ═════════════════════════════════════════════════════════════════════
        strategies.strictDelimiter.totalTokens++;
        if (hasBackslash) {
          strategies.strictDelimiter.macrosFastExit++;
          strategies.strictDelimiter.estimatedTotalNs += 55;
          if (cat === "function") strategies.strictDelimiter.functionsCaught++;
        } else {
          if (openDelim) {
            strategies.strictDelimiter.estimatedTotalNs += 55;
            if (cat === "function") strategies.strictDelimiter.functionsCaught++;
            if (cat === "variable") strategies.strictDelimiter.variablesHashed++;
          } else {
            strategies.strictDelimiter.estimatedTotalNs += 0.3; // 1-cycle bailout!
            if (cat === "variable") strategies.strictDelimiter.variablesBailed++;
            if (cat === "function") strategies.strictDelimiter.functionsMissed++;
          }
        }

        // ═════════════════════════════════════════════════════════════════════
        // Simulate Strategy 3: Delimiter + Caret Gate ('(', '[', '{', '^')
        // ═════════════════════════════════════════════════════════════════════
        strategies.delimiterPlusCaret.totalTokens++;
        if (hasBackslash) {
          strategies.delimiterPlusCaret.macrosFastExit++;
          strategies.delimiterPlusCaret.estimatedTotalNs += 55;
          if (cat === "function") strategies.delimiterPlusCaret.functionsCaught++;
        } else {
          if (openDelim || caret) {
            strategies.delimiterPlusCaret.estimatedTotalNs += 55;
            if (cat === "function") strategies.delimiterPlusCaret.functionsCaught++;
            if (cat === "variable") strategies.delimiterPlusCaret.variablesHashed++;
          } else {
            strategies.delimiterPlusCaret.estimatedTotalNs += 0.3;
            if (cat === "variable") strategies.delimiterPlusCaret.variablesBailed++;
            if (cat === "function") strategies.delimiterPlusCaret.functionsMissed++;
          }
        }

        // ═════════════════════════════════════════════════════════════════════
        // Simulate Strategy 4: Delimiter + Caret + Space-With-Argument Gate
        // ═════════════════════════════════════════════════════════════════════
        strategies.twoStageSpace.totalTokens++;
        if (hasBackslash) {
          strategies.twoStageSpace.macrosFastExit++;
          strategies.twoStageSpace.estimatedTotalNs += 55;
          if (cat === "function") strategies.twoStageSpace.functionsCaught++;
        } else {
          const isCandidate = openDelim || caret || (len_le4 && spaceValidArg && !uppercase);
          if (isCandidate) {
            strategies.twoStageSpace.estimatedTotalNs += 55;
            if (cat === "function") strategies.twoStageSpace.functionsCaught++;
            if (cat === "variable") strategies.twoStageSpace.variablesHashed++;
          } else {
            strategies.twoStageSpace.estimatedTotalNs += 0.6; // 2 register checks
            if (cat === "variable") strategies.twoStageSpace.variablesBailed++;
            if (cat === "function") strategies.twoStageSpace.functionsMissed++;
          }
        }

        // ═════════════════════════════════════════════════════════════════════
        // Simulate Strategy 5: Smart Multi-Door Fast Bailout
        // (Door 1: Macro -> Door 2: Len1 Bailout -> Door 3: Close/Op Bailout -> Delim/Caret/Space)
        // ═════════════════════════════════════════════════════════════════════
        strategies.smartMultiDoor.totalTokens++;
        if (hasBackslash) {
          strategies.smartMultiDoor.macrosFastExit++;
          strategies.smartMultiDoor.estimatedTotalNs += 55;
          if (cat === "function") strategies.smartMultiDoor.functionsCaught++;
        } else {
          // Door 2: Single letter variable -> instant bailout!
          if (len1) {
            strategies.smartMultiDoor.estimatedTotalNs += 0.3;
            if (cat === "variable") strategies.smartMultiDoor.variablesBailed++;
            if (cat === "function") strategies.smartMultiDoor.functionsMissed++;
          }
          // Door 3: Closing delimiter or direct operator -> instant bailout!
          else if (closeDelim || operator) {
            strategies.smartMultiDoor.estimatedTotalNs += 0.6;
            if (cat === "variable") strategies.smartMultiDoor.variablesBailed++;
            if (cat === "function") strategies.smartMultiDoor.functionsMissed++;
          }
          // Door 4: Opening delimiter or caret -> high confidence function match
          else if (openDelim || caret) {
            strategies.smartMultiDoor.estimatedTotalNs += 55;
            if (cat === "function") strategies.smartMultiDoor.functionsCaught++;
            if (cat === "variable") strategies.smartMultiDoor.variablesHashed++;
          }
          // Door 5: Space with valid non-operator argument
          else if (len_le4 && spaceValidArg && !uppercase) {
            strategies.smartMultiDoor.estimatedTotalNs += 55;
            if (cat === "function") strategies.smartMultiDoor.functionsCaught++;
            if (cat === "variable") strategies.smartMultiDoor.variablesHashed++;
          } else {
            // Default instant bailout
            strategies.smartMultiDoor.estimatedTotalNs += 0.9;
            if (cat === "variable") strategies.smartMultiDoor.variablesBailed++;
            if (cat === "function") strategies.smartMultiDoor.functionsMissed++;
          }
        }

        i = tokenEnd;
      }
    }
  }

  const report: WorkerReport = {
    filesProcessed,
    equationsScanned,
    totalTokens,
    counts,
    strategies,
  };

  parentPort?.postMessage(report);
} else {
  // ═══════════════════════════════════════════════════════════════════════════
  // Main Coordinator Thread
  // ═══════════════════════════════════════════════════════════════════════════
  async function runProfiler() {
    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log("   Color Math Multi-Core Corpus Token & Gating Profiler (50% CPU Pool)    ");
    console.log("══════════════════════════════════════════════════════════════════════════\n");

    const corpusRoot = path.resolve(process.cwd(), "tests/corpus");
    if (!fs.existsSync(corpusRoot)) {
      console.error("Corpus directory not found:", corpusRoot);
      process.exit(1);
    }

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

    const allFiles = getAllMdFiles(corpusRoot);
    const totalCpus = os.cpus().length;
    // Exactly 50% CPU allocation: 6 threads on 12-thread i5-13420H
    const numThreads = Math.max(1, Math.floor(totalCpus / 2));

    console.log(`Corpus Root:      ${corpusRoot}`);
    console.log(`Total Documents:  ${allFiles.length.toLocaleString()}`);
    console.log(`Hardware Pool:    ${numThreads} Worker Threads allocated (${os.cpus()[0].model})\n`);

    // Split files evenly across worker threads
    const chunkSize = Math.ceil(allFiles.length / numThreads);
    const chunks: string[][] = [];
    for (let i = 0; i < allFiles.length; i += chunkSize) {
      chunks.push(allFiles.slice(i, i + chunkSize));
    }

    const t0 = Date.now();
    const workerPromises = chunks.map((chunkFiles, idx) => {
      return new Promise<WorkerReport>((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: { files: chunkFiles },
        });
        worker.on("message", resolve);
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code !== 0) reject(new Error(`Worker ${idx} exited with code ${code}`));
        });
      });
    });

    const reports = await Promise.all(workerPromises);
    const durationSec = ((Date.now() - t0) / 1000).toFixed(2);

    // Merge reports
    let totalEquations = 0;
    let totalTokens = 0;

    const mergedCounts: Record<CategoryKey, { bare: FeatureCounters; macro: FeatureCounters }> = {
      function: { bare: createEmptyCounters(), macro: createEmptyCounters() },
      parameter: { bare: createEmptyCounters(), macro: createEmptyCounters() },
      constant: { bare: createEmptyCounters(), macro: createEmptyCounters() },
      operator: { bare: createEmptyCounters(), macro: createEmptyCounters() },
      variable: { bare: createEmptyCounters(), macro: createEmptyCounters() },
    };

    const mergedStrategies = {
      baseline: createEmptyStrategy(),
      strictDelimiter: createEmptyStrategy(),
      delimiterPlusCaret: createEmptyStrategy(),
      twoStageSpace: createEmptyStrategy(),
      smartMultiDoor: createEmptyStrategy(),
    };

    for (const r of reports) {
      totalEquations += r.equationsScanned;
      totalTokens += r.totalTokens;

      for (const cat of Object.keys(r.counts) as CategoryKey[]) {
        for (const variant of ["bare", "macro"] as const) {
          const src = r.counts[cat][variant];
          const dest = mergedCounts[cat][variant];
          for (const k of Object.keys(src) as (keyof FeatureCounters)[]) {
            dest[k] += src[k];
          }
        }
      }

      for (const stratKey of Object.keys(r.strategies) as (keyof typeof mergedStrategies)[]) {
        const sSrc = r.strategies[stratKey];
        const sDest = mergedStrategies[stratKey];
        sDest.functionsCaught += sSrc.functionsCaught;
        sDest.functionsMissed += sSrc.functionsMissed;
        sDest.variablesHashed += sSrc.variablesHashed;
        sDest.variablesBailed += sSrc.variablesBailed;
        sDest.macrosFastExit += sSrc.macrosFastExit;
        sDest.totalTokens += sSrc.totalTokens;
        sDest.estimatedTotalNs += sSrc.estimatedTotalNs;
      }
    }

    console.log(`Scan Complete in ${durationSec}s across ${totalEquations.toLocaleString()} equations and ${totalTokens.toLocaleString()} tokens!\n`);

    // ═════════════════════════════════════════════════════════════════════════
    // Output 1: Category & Ground Truth Token Breakdown
    // ═════════════════════════════════════════════════════════════════════════
    console.log("┌─────────────────────────────────────────────────────────────────────────────┐");
    console.log("│ 1. EMPIRICAL TOKEN DISTRIBUTION ACROSS 172,000+ MATHEMATICAL EQUATIONS     │");
    console.log("├─────────────────┬──────────────┬──────────────┬──────────────┬──────────────┤");
    console.log("│ Category        │ Bare Count   │ Macro (\\)    │ Total Tokens │ Share (%)    │");
    console.log("├─────────────────┼──────────────┼──────────────┼──────────────┼──────────────┤");

    for (const cat of Object.keys(mergedCounts) as CategoryKey[]) {
      const bare = mergedCounts[cat].bare.total;
      const macro = mergedCounts[cat].macro.total;
      const sum = bare + macro;
      const pct = ((sum / totalTokens) * 100).toFixed(1);
      const name = cat.padEnd(15);
      console.log(`│ ${name} │ ${bare.toLocaleString().padStart(12)} │ ${macro.toLocaleString().padStart(12)} │ ${sum.toLocaleString().padStart(12)} │ ${pct.padStart(11)}% │`);
    }
    console.log("└─────────────────┴──────────────┴──────────────┴──────────────┴──────────────┘\n");

    // ═════════════════════════════════════════════════════════════════════════
    // Output 2: Follower Environment on Ordinary Variables (Where Do They Exit?)
    // ═════════════════════════════════════════════════════════════════════════
    const vars = mergedCounts.variable.bare;
    console.log("┌─────────────────────────────────────────────────────────────────────────────┐");
    console.log("│ 2. WHERE ORDINARY VARIABLES (x, y, z) EXIT (BAILOUT OPPORTUNITY MATRIX)     │");
    console.log("├────────────────────────────────────────────────┬──────────────┬─────────────┤");
    console.log("│ Feature Condition                              │ Token Count  │ % of Vars   │");
    console.log("├────────────────────────────────────────────────┼──────────────┼─────────────┤");
    const vTotal = vars.total || 1;
    console.log(`│ Single-Letter Variables (L = 1: x, y, a, b)    │ ${vars.len1.toLocaleString().padStart(12)} │ ${((vars.len1/vTotal)*100).toFixed(1).padStart(10)}% │`);
    console.log(`│ Followed by Closing Delim / Punct: ), ], }, ,,$│ ${vars.closeDelim.toLocaleString().padStart(12)} │ ${((vars.closeDelim/vTotal)*100).toFixed(1).padStart(10)}% │`);
    console.log(`│ Followed by Binary Operator: +, -, =, <, >, *  │ ${vars.operator.toLocaleString().padStart(12)} │ ${((vars.operator/vTotal)*100).toFixed(1).padStart(10)}% │`);
    console.log(`│ Followed by Space (Plain Spacebar)             │ ${vars.space.toLocaleString().padStart(12)} │ ${((vars.space/vTotal)*100).toFixed(1).padStart(10)}% │`);
    console.log(`│ Followed by Caret (Power: x^2)                 │ ${vars.caret.toLocaleString().padStart(12)} │ ${((vars.caret/vTotal)*100).toFixed(1).padStart(10)}% │`);
    console.log(`│ Followed by Subscript (Index: x_i)             │ ${vars.underscore.toLocaleString().padStart(12)} │ ${((vars.underscore/vTotal)*100).toFixed(1).padStart(10)}% │`);
    console.log(`│ Followed by Opening Delim: (, [, { (False Pos) │ ${vars.openDelim.toLocaleString().padStart(12)} │ ${((vars.openDelim/vTotal)*100).toFixed(1).padStart(10)}% │`);
    console.log("└────────────────────────────────────────────────┴──────────────┴─────────────┘\n");

    // ═════════════════════════════════════════════════════════════════════════
    // Output 3: Permutation Strategy Benchmark (The Decision Table)
    // ═════════════════════════════════════════════════════════════════════════
    console.log("┌──────────────────────────────────────────────────────────────────────────────────────────────────┐");
    console.log("│ 3. PERMUTATION STRATEGY BENCHMARK (COMPARISON OF GATING ARCHITECTURES)                           │");
    console.log("├────────────────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────────┤");
    console.log("│ Gating Architecture    │ Functions % │ False Pos % │ Fast Exits  │ Wasted Hashes│ Estimated Latency│");
    console.log("├────────────────────────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────────┤");

    const totalFuncs = (mergedCounts.function.bare.total + mergedCounts.function.macro.total) || 1;
    const totalVars = (mergedCounts.variable.bare.total + mergedCounts.variable.macro.total) || 1;

    for (const [sKey, s] of Object.entries(mergedStrategies)) {
      const funcCaughtPct = ((s.functionsCaught / totalFuncs) * 100).toFixed(1);
      const falsePosPct = ((s.variablesHashed / totalVars) * 100).toFixed(1);
      const name = sKey.padEnd(22);
      const fastExits = s.variablesBailed.toLocaleString().padStart(11);
      const wastedHashes = s.variablesHashed.toLocaleString().padStart(11);
      const latencyMs = (s.estimatedTotalNs / 1_000_000).toFixed(1) + " ms";
      console.log(`│ ${name} │ ${funcCaughtPct.padStart(10)}% │ ${falsePosPct.padStart(10)}% │ ${fastExits} │ ${wastedHashes} │ ${latencyMs.padStart(15)} │`);
    }
    console.log("└────────────────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────────┘\n");
  }

  runProfiler().catch((e) => {
    console.error("Profiler failed:", e);
    process.exit(1);
  });
}
