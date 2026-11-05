// scripts/corpus_keystroke_audit.ts
// Multi-Threaded Real-World Corpus Keystroke Stress Audit
// Crawls all 6,000+ markdown documents in tests/corpus,
// extracts real-world equations with frequency weights,
// slices each unique equation character-by-character (S[0..1] ... S[0..N]),
// and tests normalizeMathSyntax -> autoSealUnclosedDelimiters -> colorLatexBody -> KaTeX.
// Allocates 50% CPU (6 worker threads on 12-thread host).

import fs from "fs";
import path from "path";
import os from "os";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { validateLatexWithMathJax } from "../tests/validator";
import { scanMarkdown } from "../src/parsers/markdown_scanner";
import { normalizeMathSyntax, autoSealUnclosedDelimiters } from "../src/utils/latex_helpers";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_COLORS, DEFAULT_OPTIONS, ColorMathOptions } from "../src/config";

interface EquationItem {
  raw: string;
  count: number;
}

interface WorkerTask {
  equations: EquationItem[];
  workerId: number;
}

interface MacroFailureStat {
  macro: string;
  uniqueFailures: number;
  weightedFailures: number;
  samplePrefixes: string[];
}

interface WorkerResult {
  equationsProcessed: number;
  keystrokesTested: number;
  weightedKeystrokes: number;
  uniquePassed: number;
  weightedPassed: number;
  uniqueFailed: number;
  weightedFailed: number;
  macroArgFailures: Record<string, { unique: number; weighted: number; samples: string[] }>;
  incompleteCmdFailures: Record<string, { unique: number; weighted: number; samples: string[] }>;
  failureTypes: Record<string, number>;
}

// ---------------------------------------------------------------------------
// WORKER THREAD
// ---------------------------------------------------------------------------
if (!isMainThread) {
  const { equations } = workerData as WorkerTask;

  const options: ColorMathOptions = {
    ...DEFAULT_OPTIONS,
    previewLatexNormalization: true,
    crashImmunityAutoSeal: true,
    speedSyntacticSugar: true,
    useCST: true,
  };

  const result: WorkerResult = {
    equationsProcessed: 0,
    keystrokesTested: 0,
    weightedKeystrokes: 0,
    uniquePassed: 0,
    weightedPassed: 0,
    uniqueFailed: 0,
    weightedFailed: 0,
    macroArgFailures: {},
    incompleteCmdFailures: {},
    failureTypes: {},
  };

  for (const item of equations) {
    result.equationsProcessed++;
    const raw = item.raw;
    const weight = item.count;
    const len = raw.length;

    if (len === 0 || len > 400) continue;

    for (let k = 1; k <= len; k++) {
      const prefix = raw.slice(0, k);

      // Filter: Our role only begins once a command name is finished.
      // If the user is mid-spelling a command name (e.g. \f, \fr, \fra before \frac), skip:
      const cmdMatch = prefix.match(/(\\+)([A-Za-z]*)$/);
      if (cmdMatch && cmdMatch[1].length % 2 === 1 && k < len && /[A-Za-z]/.test(raw[k])) {
        continue;
      }

      result.keystrokesTested++;
      result.weightedKeystrokes += weight;

      let sealed = prefix;
      let colored = prefix;

      try {
        const norm = normalizeMathSyntax(prefix, options);
        sealed = autoSealUnclosedDelimiters(norm, true);
        colored = colorLatexBody(sealed, DEFAULT_COLORS, options);
      } catch {
        result.uniqueFailed++;
        result.weightedFailed += weight;
        continue;
      }

      let isValid = false;
      let errMsg = "";

      // Authoritative Obsidian Parity: MathJax 4 Validation by default on colored LaTeX output
      const mj = validateLatexWithMathJax(colored);
      if (mj.valid) {
        isValid = true;
      } else {
        errMsg = mj.error || "MathJax validation error";
      }

      if (isValid) {
        result.uniquePassed++;
        result.weightedPassed += weight;
      } else {
        result.uniqueFailed++;
        result.weightedFailed += weight;

        // Extract macro context
        const allCmds = prefix.match(/\\([A-Za-z]+)/g);
        const lastCmd = allCmds ? allCmds[allCmds.length - 1] : (prefix.includes("^") ? "^" : (prefix.includes("_") ? "_" : "none"));

        // Categorize
        let fType = "OTHER";
        if (errMsg.includes("expected '}'") || errMsg.includes("Missing argument") || errMsg.includes("expected ']'") || errMsg.includes("Expected group")) {
          fType = "UNCLOSED_MACRO_ARG";
          if (!result.macroArgFailures[lastCmd]) {
            result.macroArgFailures[lastCmd] = { unique: 0, weighted: 0, samples: [] };
          }
          result.macroArgFailures[lastCmd].unique++;
          result.macroArgFailures[lastCmd].weighted += weight;
          if (result.macroArgFailures[lastCmd].samples.length < 3) {
            result.macroArgFailures[lastCmd].samples.push(`${prefix} -> ${sealed}`);
          }
        } else if (errMsg.includes("Undefined control sequence")) {
          fType = "INCOMPLETE_COMMAND";
          if (!result.incompleteCmdFailures[lastCmd]) {
            result.incompleteCmdFailures[lastCmd] = { unique: 0, weighted: 0, samples: [] };
          }
          result.incompleteCmdFailures[lastCmd].unique++;
          result.incompleteCmdFailures[lastCmd].weighted += weight;
          if (result.incompleteCmdFailures[lastCmd].samples.length < 3) {
            result.incompleteCmdFailures[lastCmd].samples.push(`${prefix} -> ${sealed}`);
          }
        }
        result.failureTypes[fType] = (result.failureTypes[fType] || 0) + weight;
      }
    }
  }

  parentPort?.postMessage(result);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// MAIN THREAD COORDINATOR
// ---------------------------------------------------------------------------
async function main() {
  console.log("\n=========================================================================");
  console.log("🌐 REAL-WORLD 6,000+ NOTE CORPUS KEYSTROKE STRESS AUDIT");
  console.log("=========================================================================\n");

  const totalCores = os.cpus().length;
  // User Rule: 50% CPU allocation (6 threads on 12-thread CPU)
  const workerCount = Math.max(1, Math.min(6, Math.floor(totalCores * 0.5)));
  console.log(`[Hardware] Host cores: ${totalCores} | Allocated workers: ${workerCount} (50% CPU limit)`);

  const corpusRoot = path.resolve(__dirname, "../tests/corpus");
  if (!fs.existsSync(corpusRoot)) {
    console.error("Corpus directory not found at:", corpusRoot);
    process.exit(1);
  }

  console.log(`[Crawl] Scanning markdown documents in ${corpusRoot}...`);

  function collectMdFiles(dir: string): string[] {
    let files: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name !== ".git" && ent.name !== "node_modules") {
            files = files.concat(collectMdFiles(full));
          }
        } else if (ent.isFile() && ent.name.endsWith(".md")) {
          files.push(full);
        }
      }
    } catch {
      // Skip inaccessible
    }
    return files;
  }

  const allFiles = collectMdFiles(corpusRoot);
  console.log(`[Crawl] Found ${allFiles.length.toLocaleString()} markdown files.\n`);

  console.log(`[Extraction] Extracting and deduplicating real-world equations...`);
  const eqMap = new Map<string, number>();
  let totalEqInstances = 0;

  for (const filePath of allFiles) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    if (!content.includes("$")) continue;

    try {
      const scan = scanMarkdown(content);
      const blocks = [...scan.mathBlocks, ...scan.mathInlines];
      for (const b of blocks) {
        const eq = content.slice(b.contentStart, b.contentEnd).trim();
        if (eq.length > 0 && eq.length <= 300) {
          totalEqInstances++;
          eqMap.set(eq, (eqMap.get(eq) || 0) + 1);
        }
      }
    } catch {
      // scan error fallback
    }
  }

  console.log(`[Extraction] Total equation occurrences: ${totalEqInstances.toLocaleString()}`);
  console.log(`[Extraction] Unique distinct equations:  ${eqMap.size.toLocaleString()}\n`);

  // Sort unique equations by frequency descending
  const sortedEquations: EquationItem[] = Array.from(eqMap.entries())
    .map(([raw, count]) => ({ raw, count }))
    .sort((a, b) => b.count - a.count);

  // Take the top 1,500 unique equations (representing the vast majority of weighted math instances)
  const targetEquations = sortedEquations.slice(0, 1500);
  const totalTargetWeighted = targetEquations.reduce((sum, e) => sum + e.count, 0);
  console.log(`[Workload] Slicing top ${targetEquations.length.toLocaleString()} unique equations (covering ${totalTargetWeighted.toLocaleString()} real note instances)...`);

  // Distribute across workerCount
  const chunkSize = Math.ceil(targetEquations.length / workerCount);
  const chunks: EquationItem[][] = [];
  for (let i = 0; i < targetEquations.length; i += chunkSize) {
    chunks.push(targetEquations.slice(i, i + chunkSize));
  }

  console.log(`[Dispatching] Spawning ${chunks.length} workers (50% CPU allocation)...\n`);
  const startTime = Date.now();

  const workerPromises: Promise<WorkerResult>[] = chunks.map((chunk, index) => {
    return new Promise<WorkerResult>((resolve, reject) => {
      const worker = new Worker(__filename, {
        workerData: {
          equations: chunk,
          workerId: index + 1,
        } as WorkerTask,
        execArgv: process.execArgv,
      });

      worker.on("message", (res: WorkerResult) => resolve(res));
      worker.on("error", (err) => reject(err));
      worker.on("exit", (code) => {
        if (code !== 0) reject(new Error(`Worker ${index + 1} exited with code ${code}`));
      });
    });
  });

  const workerResults = await Promise.all(workerPromises);
  const elapsedMs = Date.now() - startTime;

  // Aggregate results
  let totalUniqueKeystrokes = 0;
  let totalWeightedKeystrokes = 0;
  let totalUniquePassed = 0;
  let totalWeightedPassed = 0;
  let totalUniqueFailed = 0;
  let totalWeightedFailed = 0;

  const combinedMacroArgs: Record<string, { unique: number; weighted: number; samples: string[] }> = {};
  const combinedIncompleteCmds: Record<string, { unique: number; weighted: number; samples: string[] }> = {};
  const combinedTypes: Record<string, number> = {};

  for (const r of workerResults) {
    totalUniqueKeystrokes += r.keystrokesTested;
    totalWeightedKeystrokes += r.weightedKeystrokes;
    totalUniquePassed += r.uniquePassed;
    totalWeightedPassed += r.weightedPassed;
    totalUniqueFailed += r.uniqueFailed;
    totalWeightedFailed += r.weightedFailed;

    for (const [macro, data] of Object.entries(r.macroArgFailures)) {
      if (!combinedMacroArgs[macro]) {
        combinedMacroArgs[macro] = { unique: 0, weighted: 0, samples: [] };
      }
      combinedMacroArgs[macro].unique += data.unique;
      combinedMacroArgs[macro].weighted += data.weighted;
      if (combinedMacroArgs[macro].samples.length < 3) {
        combinedMacroArgs[macro].samples.push(...data.samples.slice(0, 3 - combinedMacroArgs[macro].samples.length));
      }
    }

    for (const [cmd, data] of Object.entries(r.incompleteCmdFailures)) {
      if (!combinedIncompleteCmds[cmd]) {
        combinedIncompleteCmds[cmd] = { unique: 0, weighted: 0, samples: [] };
      }
      combinedIncompleteCmds[cmd].unique += data.unique;
      combinedIncompleteCmds[cmd].weighted += data.weighted;
      if (combinedIncompleteCmds[cmd].samples.length < 3) {
        combinedIncompleteCmds[cmd].samples.push(...data.samples.slice(0, 3 - combinedIncompleteCmds[cmd].samples.length));
      }
    }

    for (const [fType, count] of Object.entries(r.failureTypes)) {
      combinedTypes[fType] = (combinedTypes[fType] || 0) + count;
    }
  }

  const uniquePassRate = ((totalUniquePassed / totalUniqueKeystrokes) * 100).toFixed(1) + "%";
  const weightedPassRate = ((totalWeightedPassed / totalWeightedKeystrokes) * 100).toFixed(1) + "%";

  console.log("=========================================================================");
  console.log("📊 REAL-WORLD CORPUS AUDIT RESULTS (6,392 NOTES CRAWLED)");
  console.log("=========================================================================");
  console.log(`Files Processed:       ${allFiles.length.toLocaleString()}`);
  console.log(`Unique Eq Sliced:      ${targetEquations.length.toLocaleString()}`);
  console.log(`Unique Keystrokes:     ${totalUniqueKeystrokes.toLocaleString()} intermediate states`);
  console.log(`Weighted Keystrokes:   ${totalWeightedKeystrokes.toLocaleString()} real-world keystrokes`);
  console.log(`Unique Pass Rate:      ${uniquePassRate}`);
  console.log(`Weighted Pass Rate:    ${weightedPassRate}`);
  console.log(`Execution Time:        ${(elapsedMs / 1000).toFixed(2)} seconds\n`);

  console.log("-------------------------------------------------------------------------");
  console.log("🏆 TOP 25 MACROS WITH UNCLOSED / MISSING ARGUMENT BREAKDOWNS:");
  console.log("(These are completed commands that crashed because arguments were mid-typing)");
  console.log("-------------------------------------------------------------------------");
  const rankedMacroArgs = Object.entries(combinedMacroArgs)
    .sort((a, b) => b[1].weighted - a[1].weighted)
    .slice(0, 25);

  console.log("Rank | Command           | Real-World Failures | Unique Slices | Sample Breakdown");
  console.log("-----+-------------------+---------------------+---------------+----------------------------------");

  rankedMacroArgs.forEach(([macro, stat], idx) => {
    const rankStr = String(idx + 1).padStart(4);
    const cmdStr = macro.padEnd(17);
    const wStr = String(stat.weighted.toLocaleString()).padStart(19);
    const uStr = String(stat.unique.toLocaleString()).padStart(13);
    const sample = stat.samples[0] ? stat.samples[0].slice(0, 34) : "";
    console.log(`${rankStr} | ${cmdStr} | ${wStr} | ${uStr} | ${sample}`);
  });

  console.log("\n-------------------------------------------------------------------------");
  console.log("BREAKDOWN BY FAILURE MODE (WEIGHTED REAL-WORLD OCCURRENCES):");
  console.log("-------------------------------------------------------------------------");
  for (const [fType, count] of Object.entries(combinedTypes).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / totalWeightedFailed) * 100).toFixed(1) + "%";
    console.log(`• ${fType.padEnd(25)}: ${count.toLocaleString().padStart(10)} occurrences (${pct})`);
  }

  // Export results
  const outDir = path.resolve(__dirname, "../tests/generated");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "full_corpus_keystroke_audit.json");
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        totalFiles: allFiles.length,
        uniqueEquationsTested: targetEquations.length,
        totalUniqueKeystrokes,
        totalWeightedKeystrokes,
        uniquePassRate,
        weightedPassRate,
        rankedMacroArgs,
        rankedIncompleteCmds: Object.entries(combinedIncompleteCmds).sort((a, b) => b[1].weighted - a[1].weighted).slice(0, 25),
        combinedTypes,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`\nFull real-world audit exported to: ${outFile}\n`);
}

main().catch((err) => {
  console.error("Corpus keystroke audit failed:", err);
  process.exit(1);
});
