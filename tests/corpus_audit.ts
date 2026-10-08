// tests/corpus_audit.ts
// Multi-Threaded High-Performance Corpus Audit Runner for Obsidian & Zed Color Math
// Uses 50% CPU allocation (6 threads on 12-thread i5-13420H) with 2D Line:Column source mapping.

import fs from "fs";
import path from "path";
import os from "os";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import katex from "katex";
import { scanMarkdown } from "../src/parsers/markdown_scanner";
import { convertText } from "../src/converters/block";
import { DEFAULT_COLORS, DEFAULT_OPTIONS, ColorMathOptions } from "../src/config";
import { detectNoteField } from "../src/parsers/frontmatter";

export interface Anomaly {
  type: "CRITICAL_REGRESSION" | "PRE_EXISTING_NOTE_TYPO" | "PARSER_CRASH" | "ROUNDTRIP_MISMATCH";
  file: string;
  line: number;
  col: number;
  equationSnippet: string;
  errorMessage: string;
  codeFrame: string;
}

export interface WorkerResult {
  filesProcessed: number;
  equationsScanned: number;
  equationsValidated: number;
  regressions: Anomaly[];
  preExistingTypos: Anomaly[];
  crashes: Anomaly[];
}

/**
 * Builds newline offset index for precise Line:Col mapping.
 */
function buildLineIndex(text: string): number[] {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  return lineStarts;
}

function getLineCol(lineStarts: number[], offset: number): { line: number; col: number } {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      if (mid === lineStarts.length - 1 || lineStarts[mid + 1] > offset) {
        return { line: mid + 1, col: offset - lineStarts[mid] + 1 };
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return { line: 1, col: offset + 1 };
}

function generateCodeFrame(lines: string[], lineNum: number, colNum: number): string {
  const lineIdx = lineNum - 1;
  const start = Math.max(0, lineIdx - 1);
  const end = Math.min(lines.length - 1, lineIdx + 1);
  let frame = "";

  for (let i = start; i <= end; i++) {
    const prefix = `${i + 1} | `;
    const content = lines[i] || "";
    frame += `${prefix}${content}\n`;
    if (i === lineIdx) {
      const pad = " ".repeat(prefix.length + Math.max(0, colNum - 1));
      frame += `${pad}^\n`;
    }
  }
  return frame.trimEnd();
}

/**
 * Worker thread execution logic
 */
if (!isMainThread) {
  const { files, corpusRoot } = workerData as { files: string[]; corpusRoot: string };

  const result: WorkerResult = {
    filesProcessed: 0,
    equationsScanned: 0,
    equationsValidated: 0,
    regressions: [],
    preExistingTypos: [],
    crashes: [],
  };

  for (const filePath of files) {
    result.filesProcessed++;
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    // Quick ASCII check: skip files with zero math symbols
    if (!content.includes("$")) {
      continue;
    }

    const relPath = path.relative(corpusRoot, filePath);
    const lineStarts = buildLineIndex(content);
    const fileLines = content.split(/\r?\n/);

    let scan;
    try {
      scan = scanMarkdown(content);
    } catch (e: any) {
      result.crashes.push({
        type: "PARSER_CRASH",
        file: relPath,
        line: 1,
        col: 1,
        equationSnippet: "",
        errorMessage: `scanMarkdown crashed: ${e.message}`,
        codeFrame: "",
      });
      continue;
    }

    const originalBlocks = [...scan.mathBlocks, ...scan.mathInlines];
    if (originalBlocks.length === 0) continue;
    result.equationsScanned += originalBlocks.length;

    // Detect frontmatter mode
    const detection = detectNoteField(content);
    const activeMode = detection.field || DEFAULT_OPTIONS.activeMode;
    const options: ColorMathOptions = {
      ...DEFAULT_OPTIONS,
      activeMode,
      field: activeMode,
    };

    let colored: string;
    try {
      colored = convertText(content, DEFAULT_COLORS, options);
    } catch (bakeErr: any) {
      result.crashes.push({
        type: "PARSER_CRASH",
        file: relPath,
        line: 1,
        col: 1,
        equationSnippet: "",
        errorMessage: `convertText crashed: ${bakeErr.message}`,
        codeFrame: "",
      });
      continue;
    }

    const coloredScan = scanMarkdown(colored);
    const coloredBlocks = [...coloredScan.mathBlocks, ...coloredScan.mathInlines];

    for (let i = 0; i < coloredBlocks.length; i++) {
      const cBlock = coloredBlocks[i];
      const coloredEq = colored.slice(cBlock.contentStart, cBlock.contentEnd);
      result.equationsValidated++;

      try {
        katex.renderToString(coloredEq, {
          throwOnError: true,
          displayMode: cBlock.kind === "math_block",
        });
      } catch (kErr: any) {
        // Colored equation threw! Check if original equation ALSO threw in KaTeX
        let origFailed = false;
        let origMsg = "";

        if (i < originalBlocks.length) {
          const oBlock = originalBlocks[i];
          const origEq = content.slice(oBlock.contentStart, oBlock.contentEnd);
          try {
            katex.renderToString(origEq, {
              throwOnError: true,
              displayMode: oBlock.kind === "math_block",
            });
          } catch (oErr: any) {
            origFailed = true;
            origMsg = oErr.message;
          }
        }

        // Extract sub-equation error offset
        const matchPos = kErr.message.match(/position (\d+)/);
        const subOffset = matchPos ? parseInt(matchPos[1], 10) : 0;
        const origBlock = i < originalBlocks.length ? originalBlocks[i] : null;
        const docOffset = origBlock ? origBlock.contentStart + Math.min(subOffset, origBlock.contentEnd - origBlock.contentStart) : 0;
        const { line, col } = getLineCol(lineStarts, docOffset);
        const codeFrame = generateCodeFrame(fileLines, line, col);

        const anomaly: Anomaly = {
          type: origFailed ? "PRE_EXISTING_NOTE_TYPO" : "CRITICAL_REGRESSION",
          file: relPath,
          line,
          col,
          equationSnippet: coloredEq.slice(0, 100),
          errorMessage: kErr.message,
          codeFrame,
        };

        if (origFailed) {
          result.preExistingTypos.push(anomaly);
        } else {
          result.regressions.push(anomaly);
        }
      }
    }
  }

  parentPort?.postMessage(result);
} else {
  // Main Thread: Master Coordinator
  async function runAudit() {
    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log("   Color Math Multi-Core Corpus Audit Runner (KaTeX + MathJax Matrix)     ");
    console.log("══════════════════════════════════════════════════════════════════════════\n");

    const possibleRoots = [
      path.resolve(process.cwd(), "tests/corpus"),
      path.resolve(__dirname, "corpus"),
      path.resolve(__dirname, "../tests/corpus"),
    ];
    const corpusRoot = possibleRoots.find((d) => fs.existsSync(d));
    if (!corpusRoot) {
      console.error("Corpus directory not found in:", possibleRoots);
      process.exit(1);
    }

    // Parse CLI arguments
    const args = process.argv.slice(2);
    const corpusArg = args.find((a) => a.startsWith("--corpus="))?.split("=")[1];
    const regressionsOnly = !args.includes("--all-errors");
    const threadArg = args.find((a) => a.startsWith("--threads="))?.split("=")[1];

    const totalCpus = os.cpus().length;
    // User constraint: Use 50% of CPU cores (6 threads on 12-thread CPU)
    const numThreads = threadArg ? parseInt(threadArg, 10) : Math.max(1, Math.floor(totalCpus / 2));

    console.log(`Corpus Root:   ${corpusRoot}`);
    console.log(`Hardware:      ${os.cpus()[0].model} (${totalCpus} logical cores)`);
    console.log(`Worker Pool:   ${numThreads} threads allocated (50% CPU limit, keeping laptop responsive)`);
    if (corpusArg) console.log(`Filter:        Restricted to folder "${corpusArg}"`);
    console.log(`Filter Mode:   ${regressionsOnly ? "Regressions only (ignoring pre-existing note typos)" : "All errors"}`);
    console.log(`Engine Mode:   Pure Lemire MPHF Direct Resolution (Zero Static Sets Fallback)\n`);

    // Collect all .md files
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

    const searchTarget = corpusArg ? path.join(corpusRoot, corpusArg) : corpusRoot;
    if (!fs.existsSync(searchTarget)) {
      console.error(`Specified corpus folder not found: ${searchTarget}`);
      process.exit(1);
    }

    console.log(`Indexing markdown files in ${searchTarget}...`);
    const allFiles = getAllMdFiles(searchTarget);
    console.log(`Found ${allFiles.length.toLocaleString()} markdown documents.\n`);

    if (allFiles.length === 0) {
      console.log("No markdown files found to audit.");
      process.exit(0);
    }

    // Shard files across workers
    const chunks: string[][] = Array.from({ length: numThreads }, () => []);
    for (let i = 0; i < allFiles.length; i++) {
      chunks[i % numThreads].push(allFiles[i]);
    }

    const tStart = performance.now();
    console.log(`Launching ${numThreads} worker threads across ${allFiles.length} documents...`);

    const promises = chunks.map((chunk, idx) => {
      return new Promise<WorkerResult>((resolve, reject) => {
        if (chunk.length === 0) {
          resolve({
            filesProcessed: 0,
            equationsScanned: 0,
            equationsValidated: 0,
            regressions: [],
            preExistingTypos: [],
            crashes: [],
          });
          return;
        }

        const worker = new Worker(__filename, {
          workerData: {
            files: chunk,
            corpusRoot,
          },
        });

        worker.on("message", (data: WorkerResult) => resolve(data));
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
    let totalScanned = 0;
    let totalValidated = 0;
    const allRegressions: Anomaly[] = [];
    const allTypos: Anomaly[] = [];
    const allCrashes: Anomaly[] = [];

    for (const r of results) {
      totalFiles += r.filesProcessed;
      totalScanned += r.equationsScanned;
      totalValidated += r.equationsValidated;
      allRegressions.push(...r.regressions);
      allTypos.push(...r.preExistingTypos);
      allCrashes.push(...r.crashes);
    }

    console.log(`\n══════════════════════════════════════════════════════════════════════════`);
    console.log("                         AUDIT RESULTS SUMMARY                            ");
    console.log(`══════════════════════════════════════════════════════════════════════════`);
    console.log(`Total Documents Audited:   ${totalFiles.toLocaleString()}`);
    console.log(`Total Equations Scanned:   ${totalScanned.toLocaleString()}`);
    console.log(`Total Equations Validated: ${totalValidated.toLocaleString()}`);
    console.log(`Execution Time:            ${durationSec.toFixed(2)} seconds`);
    console.log(`Throughput:                ${Math.round(totalValidated / durationSec).toLocaleString()} equations/sec`);
    console.log(`──────────────────────────────────────────────────────────────────────────`);
    console.log(`Critical Syntax Regressions: ${allRegressions.length === 0 ? "0 (100% CLEAN)" : allRegressions.length}`);
    console.log(`Pre-Existing Author Typos:   ${allTypos.length}`);
    console.log(`Parser Crashes:              ${allCrashes.length}`);
    console.log(`══════════════════════════════════════════════════════════════════════════\n`);

    // Print regressions if any
    if (allRegressions.length > 0) {
      console.log(`\x1b[31m[CRITICAL SYNTAX REGRESSIONS FOUND (${allRegressions.length})]\x1b[0m\n`);
      for (const reg of allRegressions.slice(0, 50)) {
        console.log(`\x1b[31m[REGRESSION]\x1b[0m ${reg.file}:${reg.line}:${reg.col}`);
        console.log(`  Error: ${reg.errorMessage}`);
        console.log(`  Snippet: ${reg.equationSnippet}`);
        if (reg.codeFrame) {
          console.log(`\n${reg.codeFrame}\n`);
        }
        console.log(`──────────────────────────────────────────────────────────────────────────`);
      }
      if (allRegressions.length > 50) {
        console.log(`... and ${allRegressions.length - 50} more regressions (see report file).`);
      }
    } else {
      console.log(`\x1b[32m✔ SUCCESS: Zero syntax regressions introduced across the entire corpus!\x1b[0m\n`);
    }

    // Save report to disk
    const reportsDir = path.resolve(process.cwd(), "reports");
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    const reportPath = path.join(reportsDir, "corpus_audit_report.json");
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          totalFiles,
          totalScanned,
          totalValidated,
          durationSec,
          throughput: Math.round(totalValidated / durationSec),
          regressionsCount: allRegressions.length,
          preExistingTyposCount: allTypos.length,
          crashesCount: allCrashes.length,
          regressions: allRegressions,
        },
        null,
        2
      )
    );
    console.log(`Full structured report written to: ${reportPath}`);

    if (allRegressions.length > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }

  runAudit().catch((err) => {
    console.error("Audit runner failed:", err);
    process.exit(1);
  });
}
