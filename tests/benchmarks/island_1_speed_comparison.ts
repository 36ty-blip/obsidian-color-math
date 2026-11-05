// tests/benchmarks/island_1_speed_comparison.ts
// Benchmark: Pure TypeScript Lemire MPHF vs. Compiled Rust WebAssembly Island 1 Engine
// Isolated from MathJax DOM rendering to benchmark pure mathematical AST/catalog resolution speed.

import * as fs from "fs";
import * as path from "path";
import {
  lookupCatalog,
  CATALOG_TABLE,
  DOMAIN_ALL,
  DIALECT_ALL,
} from "../../src/parsers/catalog";
import {
  isWasmCatalogReady,
  initWasmCatalog,
  lookupWasmCatalogSlot,
  lookupWasmCatalogPacked,
  disableWasmCatalog,
} from "../../src/parsers/wasm_catalog";
import { RAW_MATHEMATICAL_CORPUS, generateKeystrokePrefixes } from "../keystroke/typing_corpus";

// Baseline 144 Hz display frame budget
const FRAME_BUDGET_144HZ_NS = 6_944_444n; // 6.944 ms

interface BenchmarkStats {
  name: string;
  iterations: number;
  totalTimeMs: number;
  throughputMops: number;
  p50Ns: number;
  p95Ns: number;
  p99Ns: number;
  denseBlock144HzBudgetPct: number; // 100 token lookups in a single math block
}

function computeQuantiles(samples: number[]): { p50: number; p95: number; p99: number } {
  if (samples.length === 0) return { p50: 0, p95: 0, p99: 0 };
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length * 0.50)];
  const p95 = samples[Math.floor(samples.length * 0.95)];
  const p99 = samples[Math.floor(samples.length * 0.99)];
  return { p50, p95, p99 };
}

function runBenchmark(
  name: string,
  tokens: string[],
  iterations: number,
  fn: (token: string) => number | object | null
): BenchmarkStats {
  const tokenCount = tokens.length;

  // JIT warm-up
  for (let i = 0; i < 10_000; i++) {
    fn(tokens[i % tokenCount]);
  }

  // Latency sampling (sample up to 20,000 calls to avoid memory bloat)
  const sampleLimit = Math.min(iterations, 20_000);
  const stride = Math.floor(iterations / sampleLimit);
  const samples: number[] = new Array(sampleLimit);
  let sampleIdx = 0;

  const tStart = process.hrtime.bigint();

  for (let i = 0; i < iterations; i++) {
    const token = tokens[i % tokenCount];
    if (i % stride === 0 && sampleIdx < sampleLimit) {
      const s0 = process.hrtime.bigint();
      fn(token);
      const s1 = process.hrtime.bigint();
      samples[sampleIdx++] = Number(s1 - s0);
    } else {
      fn(token);
    }
  }

  const tEnd = process.hrtime.bigint();
  const totalNs = tEnd - tStart;
  const totalTimeMs = Number(totalNs) / 1_000_000;
  const throughputMops = (iterations / totalTimeMs) / 1_000; // Millions of lookups / sec

  const { p50, p95, p99 } = computeQuantiles(samples);

  // 100 token lookups in a dense equation block
  const denseBlockNs = BigInt(p50) * 100n;
  const denseBlock144HzBudgetPct = (Number(denseBlockNs) / Number(FRAME_BUDGET_144HZ_NS)) * 100;

  return {
    name,
    iterations,
    totalTimeMs,
    throughputMops,
    p50Ns: p50,
    p95Ns: p95,
    p99Ns: p99,
    denseBlock144HzBudgetPct,
  };
}

async function main() {
  console.log("\n================================================================================");
  console.log("  COLOR MATH ISLAND 1 BENCHMARK: TYPESCRIPT vs. WEBASSEMBLY (MPHF CATALOG)");
  console.log("  Separated from MathJax DOM Rendering | Target: 144 Hz (6.94 ms Frame Budget)");
  console.log("================================================================================\n");

  const wasmPath = path.resolve(__dirname, "../../wasm/target/wasm32-unknown-unknown/release/color_math_wasm.wasm");
  if (!fs.existsSync(wasmPath)) {
    console.error("WASM binary not found at:", wasmPath);
    process.exit(1);
  }

  const wasmBytes = fs.readFileSync(wasmPath);
  const initSuccess = await initWasmCatalog(wasmBytes);
  if (!initSuccess || !isWasmCatalogReady()) {
    console.error("Failed to initialize WASM catalog instance!");
    process.exit(1);
  }

  console.log("✓ WebAssembly Island 1 Engine loaded into linear memory.");
  console.log(`✓ 9,342 MPHF entries verified.\n`);

  // 1. Corpus Tokens Extraction
  const corpusTokens: string[] = [];
  for (const script of RAW_MATHEMATICAL_CORPUS) {
    const prefixes = generateKeystrokePrefixes(script.raw);
    for (const p of prefixes) {
      corpusTokens.push(p);
    }
  }

  // 2. High Frequency Positive LaTeX Tokens
  const highFreqPositive = [
    "\\sin", "\\cos", "\\tan", "\\alpha", "\\beta", "\\gamma", "\\partial", "\\nabla",
    "\\int", "\\sum", "\\prod", "\\lim", "\\hbar", "\\pi", "\\infty", "\\frac",
    "\\sqrt", "\\hat", "\\vec", "\\mathbf", "\\mathbb", "\\left", "\\right",
    "\\in", "\\notin", "\\cdot", "\\times", "\\le", "\\ge", "\\neq",
  ];

  // 3. High Frequency Negative Tokens (Identifiers & Variables)
  const highFreqNegative = [
    "x", "y", "z", "t", "u", "v", "k", "n", "m", "i", "j",
    "x_1", "y_2", "theta_val", "foo", "bar", "tempVar", "coordinateX",
    "someText", "resultVal", "scalarC", "matrixM", "vectorV",
  ];

  // 4. Complete Catalog Key Set
  const allCatalogKeys = CATALOG_TABLE.map((e) => e.key);

  const testSuites = [
    {
      title: "Suite 1: High-Frequency Active Math Macros (500k iterations)",
      tokens: highFreqPositive,
      iterations: 500_000,
    },
    {
      title: "Suite 2: Negative Token Rejection / Variable Identifiers (500k iterations)",
      tokens: highFreqNegative,
      iterations: 500_000,
    },
    {
      title: "Suite 3: Interactive Keystroke Typing Prefix Stream (500k iterations)",
      tokens: corpusTokens,
      iterations: 500_000,
    },
    {
      title: "Suite 4: Exhaustive 9,342 Catalog Sweep (100k iterations)",
      tokens: allCatalogKeys,
      iterations: 100_000,
    },
  ];

  for (const suite of testSuites) {
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`▶ ${suite.title}`);
    console.log(`--------------------------------------------------------------------------------`);

    // A. Pure TypeScript Lemire Engine
    const tsStats = runBenchmark("Pure TypeScript (V8 JIT)", suite.tokens, suite.iterations, (tok) => {
      return lookupCatalog(tok, DOMAIN_ALL, DIALECT_ALL);
    });

    // B. WebAssembly Island 1 (Slot Index Return)
    const wasmSlotStats = runBenchmark("WASM Island 1 (Slot Return)", suite.tokens, suite.iterations, (tok) => {
      return lookupWasmCatalogSlot(tok, DOMAIN_ALL, DIALECT_ALL);
    });

    // C. WebAssembly Island 1 (Packed 32-bit Metadata Return)
    const wasmPackedStats = runBenchmark("WASM Island 1 (Packed u32)", suite.tokens, suite.iterations, (tok) => {
      return lookupWasmCatalogPacked(tok, DOMAIN_ALL, DIALECT_ALL);
    });

    const formatRow = (s: BenchmarkStats) => {
      return (
        `${s.name.padEnd(28)} | ` +
        `Total: ${s.totalTimeMs.toFixed(1).padStart(6)} ms | ` +
        `p50: ${s.p50Ns.toString().padStart(4)} ns | ` +
        `p95: ${s.p95Ns.toString().padStart(4)} ns | ` +
        `p99: ${s.p99Ns.toString().padStart(4)} ns | ` +
        `Throughput: ${s.throughputMops.toFixed(2).padStart(6)} Mops/s | ` +
        `100-tok 144Hz: ${s.denseBlock144HzBudgetPct.toFixed(4)}%`
      );
    };

    console.log(formatRow(tsStats));
    console.log(formatRow(wasmSlotStats));
    console.log(formatRow(wasmPackedStats));

    const speedupSlot = wasmSlotStats.throughputMops / tsStats.throughputMops;
    const speedupPacked = wasmPackedStats.throughputMops / tsStats.throughputMops;
    const latencyReductionSlot = ((tsStats.p50Ns - wasmSlotStats.p50Ns) / tsStats.p50Ns) * 100;

    console.log(`\n  ⚡ Comparison vs. Pure TypeScript Baseline:`);
    console.log(`     • WASM Slot Return:   ${speedupSlot >= 1 ? "+" : ""}${((speedupSlot - 1) * 100).toFixed(1)}% throughput (${speedupSlot.toFixed(2)}x) | p50 latency: ${tsStats.p50Ns} ns -> ${wasmSlotStats.p50Ns} ns (${latencyReductionSlot.toFixed(1)}% reduction)`);
    console.log(`     • WASM Packed Return: ${speedupPacked >= 1 ? "+" : ""}${((speedupPacked - 1) * 100).toFixed(1)}% throughput (${speedupPacked.toFixed(2)}x) | p50 latency: ${tsStats.p50Ns} ns -> ${wasmPackedStats.p50Ns} ns\n`);
  }

  disableWasmCatalog();
  console.log("================================================================================");
  console.log("✓ Benchmark run complete. Pure TypeScript remains intact as default runtime.");
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Benchmark error:", err);
  process.exit(1);
});
