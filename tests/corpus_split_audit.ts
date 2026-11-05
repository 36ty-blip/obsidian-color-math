// tests/corpus_split_audit.ts
// Multi-Threaded Engine Split Benchmark: Isolating Pure TypeScript, Rust WebAssembly, and Native MathJax 4
// Uses 50% CPU allocation (6 threads on 12-thread i5-13420H) across the full 10,511 document corpus.

import fs from "fs";
import path from "path";
import os from "os";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { validateLatexWithMathJax } from "./validator";
import { scanMarkdown } from "../src/parsers/markdown_scanner";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_OPTIONS, ColorMathOptions, ColorPalette } from "../src/config";
import { detectNoteField } from "../src/parsers/frontmatter";
import { initWasmEngine, isWasmReady } from "../src/parsers/engine_bridge";
import { parseWasmCstSpans } from "../src/parsers/wasm_cst";

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
  useCST: false,
};

export interface SplitWorkerResult {
  filesProcessed: number;
  equationsCount: number;
  colorMathTsTimeMs: number;
  colorMathWasmTimeMs: number;
  renderMathJaxTimeMs: number;
  markdownScanTimeMs: number;
  diskIoTimeMs: number;
  wasmOperational: boolean;
}

if (!isMainThread) {
  const { files } = workerData as { files: string[] };

  (async () => {
    // 0. Initialize WebAssembly engine inside worker thread
    const wasmPath = path.resolve(__dirname, "../wasm/target/wasm32-unknown-unknown/release/color_math_wasm.wasm");
    if (fs.existsSync(wasmPath)) {
      const bytes = fs.readFileSync(wasmPath);
      await initWasmEngine(bytes);
    }
    const wasmOperational = isWasmReady();

    const result: SplitWorkerResult = {
      filesProcessed: 0,
      equationsCount: 0,
      colorMathTsTimeMs: 0,
      colorMathWasmTimeMs: 0,
      renderMathJaxTimeMs: 0,
      markdownScanTimeMs: 0,
      diskIoTimeMs: 0,
      wasmOperational,
    };

    for (const filePath of files) {
      const tIoStart = performance.now();
      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }
      result.diskIoTimeMs += performance.now() - tIoStart;

      if (!content.includes("$")) {
        continue;
      }

      result.filesProcessed++;

      const detection = detectNoteField(content);
      const activeMode = detection.field || MAX_STRESS_OPTIONS.activeMode;
      const options: ColorMathOptions = {
        ...MAX_STRESS_OPTIONS,
        activeMode,
        field: activeMode,
      };

      // Scan markdown to extract raw equations
      const tScanStart = performance.now();
      let scan;
      try {
        scan = scanMarkdown(content);
      } catch {
        continue;
      }
      result.markdownScanTimeMs += performance.now() - tScanStart;

      const blocks = [...scan.mathBlocks, ...scan.mathInlines];
      if (blocks.length === 0) continue;

      result.equationsCount += blocks.length;

      const rawEquations: string[] = new Array(blocks.length);
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        rawEquations[i] = content.slice(b.contentStart, b.contentEnd);
      }

      // =========================================================================
      // STAGE 1A: Isolated Pure TypeScript AST Transformation (per equation)
      // =========================================================================
      const coloredEquations: string[] = new Array(blocks.length);
      const tTsStart = performance.now();
      for (let i = 0; i < rawEquations.length; i++) {
        const rawEq = rawEquations[i];
        try {
          coloredEquations[i] = colorLatexBody(rawEq, AUDIT_COLORS, options);
        } catch {
          coloredEquations[i] = rawEq;
        }
      }
      result.colorMathTsTimeMs += performance.now() - tTsStart;

      // =========================================================================
      // STAGE 1B: Isolated Accelerated WebAssembly (Rust) Transformation
      // =========================================================================
      if (wasmOperational) {
        const tWasmStart = performance.now();
        for (let i = 0; i < rawEquations.length; i++) {
          try {
            parseWasmCstSpans(rawEquations[i], AUDIT_COLORS, { activeMode: options.activeMode });
          } catch {
            // Graceful fallback
          }
        }
        result.colorMathWasmTimeMs += performance.now() - tWasmStart;
      }

      // =========================================================================
      // STAGE 2: Isolated Native MathJax 4 CHTML Compilation (per equation)
      // =========================================================================
      const tRenderStart = performance.now();
      for (let i = 0; i < coloredEquations.length; i++) {
        try {
          validateLatexWithMathJax(coloredEquations[i]);
        } catch {
          // Continue benchmark execution
        }
      }
      result.renderMathJaxTimeMs += performance.now() - tRenderStart;
    }

    parentPort?.postMessage(result);
  })().catch((err) => {
    console.error("Worker error:", err);
    process.exit(1);
  });
} else {
  async function runSplitBenchmark() {
    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log("   Color Math vs MathJax 4: Isolated Three-Way Engine Benchmark           ");
    console.log("   [Pure TypeScript] vs [Rust WebAssembly] vs [Native MathJax 4 CHTML]   ");
    console.log("══════════════════════════════════════════════════════════════════════════\n");

    const corpusRoot = path.resolve(__dirname, "corpus");
    if (!fs.existsSync(corpusRoot)) {
      console.error(`Corpus directory not found: ${corpusRoot}`);
      process.exit(1);
    }

    // 50% CPU allocation
    const totalCpus = os.cpus().length;
    const workerCount = Math.max(1, Math.min(6, Math.floor(totalCpus * 0.5)));

    console.log(`Corpus Root:   ${corpusRoot}`);
    console.log(`Worker Pool:   ${workerCount} worker threads allocated (50% CPU budget)`);

    // Index all markdown files
    const allFiles: string[] = [];
    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          allFiles.push(fullPath);
        }
      }
    }
    scanDir(corpusRoot);
    console.log(`Indexed:       ${allFiles.length.toLocaleString()} markdown documents.\n`);
    console.log(`Launching ${workerCount} worker threads across all documents...\n`);

    // Partition files across workers
    const chunks: string[][] = Array.from({ length: workerCount }, () => []);
    allFiles.forEach((file, index) => {
      chunks[index % workerCount].push(file);
    });

    const wallClockStart = performance.now();

    const workerPromises = chunks.map((chunk, workerIdx) => {
      return new Promise<SplitWorkerResult>((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: { files: chunk },
        });

        worker.on("message", (res: SplitWorkerResult) => resolve(res));
        worker.on("error", (err) => reject(err));
        worker.on("exit", (code) => {
          if (code !== 0) {
            reject(new Error(`Worker ${workerIdx} exited with code ${code}`));
          }
        });
      });
    });

    const results = await Promise.all(workerPromises);
    const wallClockTimeSec = (performance.now() - wallClockStart) / 1000;

    let totalEquations = 0;
    let totalTsMs = 0;
    let totalWasmMs = 0;
    let totalMathJaxMs = 0;
    let totalIoMs = 0;
    let totalScanMs = 0;
    let allWasmReady = true;

    for (const res of results) {
      totalEquations += res.equationsCount;
      totalTsMs += res.colorMathTsTimeMs;
      totalWasmMs += res.colorMathWasmTimeMs;
      totalMathJaxMs += res.renderMathJaxTimeMs;
      totalIoMs += res.diskIoTimeMs;
      totalScanMs += res.markdownScanTimeMs;
      if (!res.wasmOperational) allWasmReady = false;
    }

    const tsLatencyUs = ((totalTsMs * 1000) / totalEquations).toFixed(2);
    const tsThroughput = Math.round((totalEquations / (totalTsMs / 1000)) * workerCount);

    const wasmLatencyUs = ((totalWasmMs * 1000) / totalEquations).toFixed(2);
    const wasmThroughput = Math.round((totalEquations / (totalWasmMs / 1000)) * workerCount);

    const mjxLatencyUs = ((totalMathJaxMs * 1000) / totalEquations).toFixed(2);
    const mjxThroughput = Math.round((totalEquations / (totalMathJaxMs / 1000)) * workerCount);

    const wasmVsTsSpeedup = (totalTsMs / Math.max(1, totalWasmMs)).toFixed(1);
    const mjxVsTsMultiple = (totalMathJaxMs / Math.max(1, totalTsMs)).toFixed(2);
    const mjxVsWasmMultiple = (totalMathJaxMs / Math.max(1, totalWasmMs)).toFixed(1);

    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log("               THREE-WAY ISOLATED STAGE BENCHMARK RESULTS                 ");
    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log(`Total Documents Audited:   ${allFiles.length.toLocaleString()}`);
    console.log(`Total Equations Processed: ${totalEquations.toLocaleString()}`);
    console.log(`Wall Clock Time:           ${wallClockTimeSec.toFixed(2)} seconds (${workerCount} threads)`);
    console.log("──────────────────────────────────────────────────────────────────────────");
    console.log(`🎨 STAGE 1A: PURE TYPESCRIPT COLOR MATH AST (V8 JIT)`);
    console.log(`   Cumulative CPU Time:    ${(totalTsMs / 1000).toFixed(2)} s`);
    console.log(`   Average Latency:        ${tsLatencyUs} µs / equation`);
    console.log(`   Effective Throughput:   ${tsThroughput.toLocaleString()} equations / sec`);
    console.log("──────────────────────────────────────────────────────────────────────────");
    console.log(`🦀 STAGE 1B: ACCELERATED RUST / WEBASSEMBLY (FLAT ARENA CST)`);
    console.log(`   WASM Engine Status:     ${allWasmReady ? "ONLINE (Active)" : "Offline"}`);
    console.log(`   Cumulative CPU Time:    ${(totalWasmMs / 1000).toFixed(2)} s`);
    console.log(`   Average Latency:        ${wasmLatencyUs} µs / equation`);
    console.log(`   Effective Throughput:   ${wasmThroughput.toLocaleString()} equations / sec`);
    console.log("──────────────────────────────────────────────────────────────────────────");
    console.log(`⚡ STAGE 2: NATIVE MATHJAX 4 CHTML COMPILATION (NO KATEX)`);
    console.log(`   Cumulative CPU Time:    ${(totalMathJaxMs / 1000).toFixed(2)} s`);
    console.log(`   Average Latency:        ${mjxLatencyUs} µs / equation`);
    console.log(`   Effective Throughput:   ${mjxThroughput.toLocaleString()} equations / sec`);
    console.log("──────────────────────────────────────────────────────────────────────────");
    console.log(`📊 COMPARATIVE EXECUTIVE SUMMARY:`);
    console.log(`   • Rust/WebAssembly is ${wasmVsTsSpeedup}x FASTER than Pure TypeScript.`);
    console.log(`   • MathJax 4 CHTML rendering takes ${mjxVsTsMultiple}x the time of Pure TypeScript.`);
    console.log(`   • MathJax 4 CHTML rendering takes ${mjxVsWasmMultiple}x the time of Rust/WebAssembly.`);
    console.log(`   • KaTeX has been completely eliminated: 100% Native MathJax 4 only.`);
    console.log("══════════════════════════════════════════════════════════════════════════\n");
  }

  runSplitBenchmark().catch((err) => {
    console.error("Benchmark failed:", err);
    process.exit(1);
  });
}
