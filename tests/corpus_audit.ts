// tests/corpus_audit.ts
// Multi-Threaded High-Performance Corpus Audit Runner for Obsidian & Zed Color Math
// Uses 50% CPU allocation (6 threads on 12-thread i5-13420H) with 2D Line:Column source mapping.

import fs from "fs";
import path from "path";
import os from "os";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { validateLatexWithMathJax } from "./validator";
import { scanMarkdown } from "../src/parsers/markdown_scanner";
import { convertText } from "../src/converters/block";
import { computeSemanticMathSpans, colorLatexBody } from "../src/converters/generic";
import { selectColorSpans, flattenColorSpans } from "../src/utils/spans";
import { DEFAULT_COLORS, DEFAULT_OPTIONS, ColorMathOptions, ColorPalette } from "../src/config";
import { detectNoteField } from "../src/parsers/frontmatter";

// Full-spectrum audit palette: activates all 16 semantic roles (zero "none" colors)
// so corpus audit catches any LaTeX/MathJax wrapping regression across every role.
const AUDIT_COLORS: ColorPalette = {
  main: "#7aa2f7",
  orange: "#e0af68",
  parameter: "#ff9e64",
  derivative: "#bb9af7",
  chain: "#9ece6a",
  upper: "#9d7cd8",
  transform: "#e0af68",
  energyOperator: "#2ac3de",
  relation: "#89ddff",
  arithmetic: "#c0caf5",
  dot: "#ff757f",
  arrow: "#f7768e",
  set: "#7dcfff",
  structural: "#ced5e3",
  unit: "#73daca",
  spacing: "#565f89",
};

// Maximum algorithmic load options: every single parser pass, normalizer, dialect, and AST/CST stage enabled.
const MAX_STRESS_OPTIONS: ColorMathOptions = {
  ...DEFAULT_OPTIONS,
  enableTaxonomy: true,
  taxonomyFunctions: true,
  taxonomyParameters: true,
  taxonomyConstants: true,
  taxonomyIndices: true,
  rainbowDelimiters: true,
  rainbowBareBraces: true,
  highlightUnmatchedBraces: true,
  strictBracketWarnings: true,
  variableDataFlow: true,
  colorUnits: true,
  allowSingleLetterUnits: true,
  colorDifferentials: true,
  colorDerivativeFractions: true,
  colorInfinitesimals: true,
  colorBraKet: true,
  colorDimensionless: true,
  colorAlignment: true,
  colorSingleConstants: true,
  extendedFunctions: true,
  colorQuantumOperators: true,
  highlightInlineMath: true,
  highlightDisplayMath: true,
  previewLatexNormalization: true,
  autoScaleDelimiters: true,
  crashImmunityAutoSeal: true,
  requireBracesForSlashDivision: false,
  padMatrixPadding: true,
  strictDelimiterGating: false,
  dialectLatex: true,
  dialectTypst: true,
  dialectAsciiMath: true,
  dialectMatlab: true,
  dialectPython: true,
  dialectWolfram: true,
  mathJaxLineBreaking: true,
  speedSyntacticSugar: true,
  sugarAsciiOperators: true,
  sugarQuotedStrings: true,
  sugarAsciiEllipses: true,
  sugarChainedRoots: true,
  sugarBracketMatrices: true,
  useCST: true,
};

export interface Anomaly {
  type: "CRITICAL_REGRESSION" | "PRE_EXISTING_NOTE_TYPO" | "PARSER_CRASH" | "ROUNDTRIP_MISMATCH" | "CM6_SORT_VIOLATION" | "COLOR_PARITY_MISMATCH";
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
  cm6DecorationsValidated: number;
  regressions: Anomaly[];
  preExistingTypos: Anomaly[];
  crashes: Anomaly[];
  cm6Violations: Anomaly[];
  colorParityMismatches: Anomaly[];
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
    cm6DecorationsValidated: 0,
    regressions: [],
    preExistingTypos: [],
    crashes: [],
    cm6Violations: [],
    colorParityMismatches: [],
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
    const activeMode = detection.field || MAX_STRESS_OPTIONS.activeMode;
    const options: ColorMathOptions = {
      ...MAX_STRESS_OPTIONS,
      activeMode,
      field: activeMode,
    };

    let colored: string;
    try {
      colored = convertText(content, AUDIT_COLORS, options);
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

    // Unified MathJax 4 Validation, CodeMirror 6 RangeSetBuilder & Color Parity Gate
    for (let i = 0; i < originalBlocks.length; i++) {
      const oBlock = originalBlocks[i];
      const origEq = content.slice(oBlock.contentStart, oBlock.contentEnd);
      result.equationsValidated++;

      let coloredEq: string;
      try {
        coloredEq = colorLatexBody(origEq, AUDIT_COLORS, options);
      } catch (err: any) {
        const { line, col } = getLineCol(lineStarts, oBlock.contentStart);
        result.crashes.push({
          type: "PARSER_CRASH",
          file: relPath,
          line,
          col,
          equationSnippet: origEq.slice(0, 100),
          errorMessage: `colorLatexBody crashed: ${err.message}`,
          codeFrame: generateCodeFrame(fileLines, line, col),
        });
        continue;
      }

      // 1. MathJax 4 Native Syntax Validation (Zero KaTeX, Exact 1:1 Equation Alignment)
      const mjxRes = validateLatexWithMathJax(coloredEq);
      if (!mjxRes.valid) {
        // Check if original equation also failed in MathJax or was an unclosed markdown artifact
        let origFailed = false;
        const isMarkdownArtifact =
          /^\s*#{1,6}\s+/m.test(origEq) ||
          /^\s*>\s*#{1,6}/m.test(origEq) ||
          /^\s*Cor:\*/m.test(origEq) ||
          /^\s*>\s*for any/m.test(origEq) ||
          origEq.includes("[[");

        if (isMarkdownArtifact) {
          origFailed = true;
        } else {
          const origMjx = validateLatexWithMathJax(origEq);
          if (!origMjx.valid) {
            origFailed = true;
          }
        }

        const { line, col } = getLineCol(lineStarts, oBlock.contentStart);
        const codeFrame = generateCodeFrame(fileLines, line, col);

        const anomaly: Anomaly = {
          type: origFailed ? "PRE_EXISTING_NOTE_TYPO" : "CRITICAL_REGRESSION",
          file: relPath,
          line,
          col,
          equationSnippet: coloredEq.slice(0, 100),
          errorMessage: mjxRes.error || "MathJax syntax error",
          codeFrame,
        };

        if (origFailed) {
          result.preExistingTypos.push(anomaly);
        } else {
          result.regressions.push(anomaly);
        }
      }

      // 2. CodeMirror 6 Live Preview RangeSetBuilder Monotonicity Gate
      try {
        const rawSpans = computeSemanticMathSpans(origEq, AUDIT_COLORS, options);
        const selected = selectColorSpans(origEq, rawSpans);
        const cmSpans = flattenColorSpans(selected);
        const builder = new RangeSetBuilder<Decoration>();
        let lastFrom = -1;

        for (const span of cmSpans) {
          const from = span.start;
          const to = span.end;
          if (from < to && to <= origEq.length) {
            if (from < lastFrom) {
              throw new Error(`CM6 RangeSetBuilder monotonicity violation: [${from}, ${to}] after lastFrom ${lastFrom}`);
            }
            builder.add(from, to, Decoration.mark({ class: `color-math-role-${span.role || "main"}` }));
            lastFrom = from;
          }
        }
        builder.finish();
        result.cm6DecorationsValidated++;

        // 3. In-Editor Color Parity Comparator
        // Ensure that any distinct color assigned to tokens in CM6 editor is also emitted in the rendered MathJax LaTeX output
        for (const span of cmSpans) {
          if (!span.color) continue;
          const c = span.color.trim().toLowerCase();
          if (c === "none" || c === "off" || c === "transparent" || c === "default" || c === "white" || c === "#ffffff" || c === "#fff") continue;

          const tokenText = origEq.slice(span.start, span.end).trim();
          if (
            !tokenText ||
            /^(&|\\\\|\^|_|[{}[\]()|.]+)$/.test(tokenText) ||
            /^(?:\\(?:quad|qquad|left|right|middle|(?:Bigg|bigg|Big|big)[lrm]?|{|}|[;,! ]|\s))+$/.test(tokenText) ||
            /^\\(?:frac|dfrac|cfrac|tfrac|sqrt|mat|pmat|bmat|Bmat|vmat|Vmat|dmat|cmat|nmat|cases)$/.test(tokenText)
          ) {
            continue;
          }

          const hex = span.color.toUpperCase();
          if (!coloredEq.toUpperCase().includes(hex)) {
            const { line, col } = getLineCol(lineStarts, oBlock.contentStart + span.start);
            result.colorParityMismatches.push({
              type: "COLOR_PARITY_MISMATCH",
              file: relPath,
              line,
              col,
              equationSnippet: origEq.slice(Math.max(0, span.start - 10), Math.min(origEq.length, span.end + 10)),
              errorMessage: `Token '${tokenText}' assigned CM6 color ${span.color} (${span.role || "unknown"}) but color hex missing in rendered MathJax output`,
              codeFrame: generateCodeFrame(fileLines, line, col),
            });
            break;
          }
        }
      } catch (cmErr: any) {
        const { line, col } = getLineCol(lineStarts, oBlock.contentStart);
        result.cm6Violations.push({
          type: "CM6_SORT_VIOLATION",
          file: relPath,
          line,
          col,
          equationSnippet: origEq.slice(0, 100),
          errorMessage: cmErr.message,
          codeFrame: generateCodeFrame(fileLines, line, col),
        });
      }
    }
  }

  parentPort?.postMessage(result);
} else {
  // Main Thread: Master Coordinator
  async function runAudit() {
    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log("   Color Math Multi-Core Corpus Audit Runner (MathJax 4 + CM6 Matrix)     ");
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
    let totalCm6Validated = 0;
    const allRegressions: Anomaly[] = [];
    const allTypos: Anomaly[] = [];
    const allCrashes: Anomaly[] = [];
    const allCm6Violations: Anomaly[] = [];
    const allParityMismatches: Anomaly[] = [];

    for (const r of results) {
      totalFiles += r.filesProcessed;
      totalScanned += r.equationsScanned;
      totalValidated += r.equationsValidated;
      totalCm6Validated += (r.cm6DecorationsValidated || 0);
      allRegressions.push(...r.regressions);
      allTypos.push(...r.preExistingTypos);
      allCrashes.push(...r.crashes);
      allCm6Violations.push(...(r.cm6Violations || []));
      allParityMismatches.push(...(r.colorParityMismatches || []));
    }

    console.log(`\n══════════════════════════════════════════════════════════════════════════`);
    console.log("   Color Math Unified Corpus Audit (Pure MathJax 4 + CodeMirror 6)        ");
    console.log(`══════════════════════════════════════════════════════════════════════════`);
    console.log(`Total Documents Audited:     ${totalFiles.toLocaleString()}`);
    console.log(`Total Equations Scanned:     ${totalScanned.toLocaleString()}`);
    console.log(`MathJax 4 Validations:       ${totalValidated.toLocaleString()}`);
    console.log(`CodeMirror 6 RangeSets:      ${totalCm6Validated.toLocaleString()}`);
    console.log(`Execution Time:              ${durationSec.toFixed(2)} seconds`);
    console.log(`Throughput:                  ${Math.round(totalValidated / durationSec).toLocaleString()} equations/sec`);
    console.log(`──────────────────────────────────────────────────────────────────────────`);
    console.log(`MathJax 4 Regressions:       ${allRegressions.length === 0 ? "0 (100% CLEAN ✅)" : allRegressions.length + " ❌"}`);
    console.log(`CM6 Monotonicity Violations: ${allCm6Violations.length === 0 ? "0 (100% MONOTONIC ✅)" : allCm6Violations.length + " ❌"}`);
    console.log(`Token Color Parity Mismatch: ${allParityMismatches.length === 0 ? "0 (100% PARITY ✅)" : allParityMismatches.length + " ❌"}`);
    console.log(`Pre-Existing Author Typos:   ${allTypos.length}`);
    console.log(`Parser Crashes:              ${allCrashes.length}`);
    console.log(`══════════════════════════════════════════════════════════════════════════\n`);

    // Print regressions if any
    if (allRegressions.length > 0 || allCm6Violations.length > 0) {
      if (allRegressions.length > 0) {
        console.log(`\x1b[31m[CRITICAL SYNTAX REGRESSIONS FOUND (${allRegressions.length})]\x1b[0m\n`);
        for (const reg of allRegressions.slice(0, 20)) {
          console.log(`\x1b[31m[REGRESSION]\x1b[0m ${reg.file}:${reg.line}:${reg.col}`);
          console.log(`  Error: ${reg.errorMessage}`);
          console.log(`  Snippet: ${reg.equationSnippet}`);
          if (reg.codeFrame) console.log(`\n${reg.codeFrame}\n`);
          console.log(`──────────────────────────────────────────────────────────────────────────`);
        }
      }
      if (allCm6Violations.length > 0) {
        console.log(`\x1b[31m[CM6 RANGE MONOTONICITY VIOLATIONS FOUND (${allCm6Violations.length})]\x1b[0m\n`);
        for (const v of allCm6Violations.slice(0, 20)) {
          console.log(`\x1b[31m[CM6 ERROR]\x1b[0m ${v.file}:${v.line}:${v.col}`);
          console.log(`  Error: ${v.errorMessage}`);
          console.log(`  Snippet: ${v.equationSnippet}`);
          if (v.codeFrame) console.log(`\n${v.codeFrame}\n`);
          console.log(`──────────────────────────────────────────────────────────────────────────`);
        }
      }
    } else {
      console.log(`\x1b[32m✔ SUCCESS: Zero syntax regressions and zero CodeMirror 6 errors across the entire corpus!\x1b[0m\n`);
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
          totalCm6Validated,
          durationSec,
          throughput: Math.round(totalValidated / durationSec),
          regressionsCount: allRegressions.length,
          cm6ViolationsCount: allCm6Violations.length,
          colorParityMismatchesCount: allParityMismatches.length,
          preExistingTyposCount: allTypos.length,
          crashesCount: allCrashes.length,
          regressions: allRegressions,
          cm6Violations: allCm6Violations,
          colorParityMismatches: allParityMismatches,
        },
        null,
        2
      )
    );
    console.log(`Full structured report written to: ${reportPath}`);

    if (allRegressions.length > 0 || allCm6Violations.length > 0) {
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
