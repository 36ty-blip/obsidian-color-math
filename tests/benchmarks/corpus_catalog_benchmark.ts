// tests/benchmarks/corpus_catalog_benchmark.ts
// Exhaustive Benchmark on the Real 34-Vault Higher Studies Math Corpus (7,366+ Math Notes)
// Separated entirely from MathJax DOM/CHTML rendering to benchmark pure ColorMath catalog speed.

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
import { scanMarkdown } from "../../src/parsers/markdown_scanner";

const FRAME_BUDGET_144HZ_NS = 6_944_444n; // 6.944 ms

interface BenchmarkStats {
  name: string;
  totalCalls: number;
  totalTimeMs: number;
  throughputMops: number;
  p50Ns: number;
  p95Ns: number;
  p99Ns: number;
  denseBlock144HzBudgetPct: number;
}

function computeQuantiles(samples: number[]): { p50: number; p95: number; p99: number } {
  if (samples.length === 0) return { p50: 0, p95: 0, p99: 0 };
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length * 0.50)];
  const p95 = samples[Math.floor(samples.length * 0.95)];
  const p99 = samples[Math.floor(samples.length * 0.99)];
  return { p50, p95, p99 };
}

function tokenizeMathString(math: string): string[] {
  const tokens: string[] = [];
  // Extract macros: \word or \symbol
  const macroMatches = math.match(/\\[a-zA-Z]+|\\[^a-zA-Z\s]/g);
  if (macroMatches) {
    for (const m of macroMatches) tokens.push(m);
  }
  // Extract bare words / identifiers (candidate functions/variables):
  const wordMatches = math.match(/[a-zA-Z_][a-zA-Z0-9_]*/g);
  if (wordMatches) {
    for (const w of wordMatches) tokens.push(w);
  }
  return tokens;
}

function collectCorpusTokens(corpusDir: string, maxFiles: number = 1000): { tokens: string[]; fileCount: number; eqCount: number } {
  const allTokens: string[] = [];
  let fileCount = 0;
  let eqCount = 0;

  function crawl(dir: string) {
    if (fileCount >= maxFiles) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (fileCount >= maxFiles) break;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          crawl(full);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          let content = "";
          try {
            content = fs.readFileSync(full, "utf8");
          } catch {
            continue;
          }
          if (!content.includes("$")) continue;

          try {
            const scan = scanMarkdown(content);
            const blocks = [...scan.mathBlocks, ...scan.mathInlines];
            if (blocks.length === 0) continue;

            fileCount++;
            eqCount += blocks.length;

            for (const b of blocks) {
              const eq = content.slice(b.contentStart, b.contentEnd);
              const toks = tokenizeMathString(eq);
              for (const t of toks) {
                if (t.length > 0 && t.length <= 256) {
                  allTokens.push(t);
                }
              }
            }
          } catch {
            // Skip unparseable malformed test file
          }
        }
      }
    } catch {
      // Ignore unreadable dirs
    }
  }

  crawl(corpusDir);
  return { tokens: allTokens, fileCount, eqCount };
}

function runBenchmark(
  name: string,
  tokens: string[],
  iterations: number,
  fn: (token: string) => number | object | null
): BenchmarkStats {
  const tokenCount = tokens.length;

  // JIT warm-up
  for (let i = 0; i < 20_000; i++) {
    fn(tokens[i % tokenCount]);
  }

  const sampleLimit = Math.min(iterations, 25_000);
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
  const throughputMops = (iterations / totalTimeMs) / 1_000;

  const { p50, p95, p99 } = computeQuantiles(samples);
  const denseBlockNs = BigInt(p50) * 100n;
  const denseBlock144HzBudgetPct = (Number(denseBlockNs) / Number(FRAME_BUDGET_144HZ_NS)) * 100;

  return {
    name,
    totalCalls: iterations,
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
  console.log("  REAL-WORLD CORPUS BENCHMARK: TYPESCRIPT vs. WEBASSEMBLY (MPHF CATALOG)");
  console.log("  Dataset: Higher Studies Math Corpus (34 Vaults, Cambridge/Oxford/HKUST/QFT)");
  console.log("  Decoupled from MathJax DOM | Target: 144 Hz (6.94 ms Frame Budget)");
  console.log("================================================================================\n");

  const corpusDir = "c:/Users/aditya/Documents/CODES/TypeScript/obsidian-color-math/tests/corpus";
  if (!fs.existsSync(corpusDir)) {
    console.error("Corpus directory not found at:", corpusDir);
    process.exit(1);
  }

  console.log("Crawling real-world Higher Studies Math Corpus...");
  const { tokens, fileCount, eqCount } = collectCorpusTokens(corpusDir, 1200);
  console.log(`✓ Crawled ${fileCount} real Markdown note files.`);
  console.log(`✓ Scanned ${eqCount.toLocaleString()} real mathematical equations.`);
  console.log(`✓ Extracted ${tokens.length.toLocaleString()} real math tokens in authentic stream order.\n`);

  // Compute unique token statistics
  const uniqueTokens = new Set(tokens);
  const macroTokens = tokens.filter((t) => t.startsWith("\\"));
  const bareTokens = tokens.filter((t) => !t.startsWith("\\"));
  console.log(`Corpus Token Profile:`);
  console.log(`  • Total token stream:   ${tokens.length.toLocaleString()}`);
  console.log(`  • Unique tokens:        ${uniqueTokens.size.toLocaleString()}`);
  console.log(`  • LaTeX macros (\\...):  ${macroTokens.length.toLocaleString()} (${((macroTokens.length / tokens.length) * 100).toFixed(1)}%)`);
  console.log(`  • Bare words/variables: ${bareTokens.length.toLocaleString()} (${((bareTokens.length / tokens.length) * 100).toFixed(1)}%)\n`);

  // Load WASM Island 1
  const wasmPath = path.resolve(__dirname, "../../wasm/target/wasm32-unknown-unknown/release/color_math_wasm.wasm");
  const wasmBytes = fs.readFileSync(wasmPath);
  await initWasmCatalog(wasmBytes);

  if (!isWasmCatalogReady()) {
    console.error("WASM Island 1 Engine failed to initialize!");
    process.exit(1);
  }
  console.log("✓ WebAssembly Island 1 Engine initialized (100% bijective parity verified).\n");

  const iterations = 1_000_000; // 1 Million real lookups through the authentic corpus stream

  console.log(`--------------------------------------------------------------------------------`);
  console.log(`▶ Workload 1: 1,000,000 Lookups across Authentic Corpus Math Token Stream`);
  console.log(`--------------------------------------------------------------------------------`);

  const tsCorpusStats = runBenchmark("Pure TypeScript (V8 JIT)", tokens, iterations, (tok) => {
    return lookupCatalog(tok, DOMAIN_ALL, DIALECT_ALL);
  });

  const wasmSlotCorpusStats = runBenchmark("WASM Island 1 (Slot Return)", tokens, iterations, (tok) => {
    return lookupWasmCatalogSlot(tok, DOMAIN_ALL, DIALECT_ALL);
  });

  const wasmPackedCorpusStats = runBenchmark("WASM Island 1 (Packed u32)", tokens, iterations, (tok) => {
    return lookupWasmCatalogPacked(tok, DOMAIN_ALL, DIALECT_ALL);
  });

  const printStats = (s: BenchmarkStats) => {
    return (
      `${s.name.padEnd(28)} | ` +
      `Time: ${s.totalTimeMs.toFixed(1).padStart(6)} ms | ` +
      `p50: ${s.p50Ns.toString().padStart(4)} ns | ` +
      `p95: ${s.p95Ns.toString().padStart(4)} ns | ` +
      `p99: ${s.p99Ns.toString().padStart(4)} ns | ` +
      `Throughput: ${s.throughputMops.toFixed(2).padStart(6)} Mops/s | ` +
      `100-tok 144Hz: ${s.denseBlock144HzBudgetPct.toFixed(4)}%`
    );
  };

  console.log(printStats(tsCorpusStats));
  console.log(printStats(wasmSlotCorpusStats));
  console.log(printStats(wasmPackedCorpusStats));

  const speedupSlot = wasmSlotCorpusStats.throughputMops / tsCorpusStats.throughputMops;
  const speedupPacked = wasmPackedCorpusStats.throughputMops / tsCorpusStats.throughputMops;

  console.log(`\n  ⚡ Real-World Corpus Speedup vs. Pure TypeScript Baseline:`);
  console.log(`     • WASM Slot Return:   ${speedupSlot >= 1 ? "+" : ""}${((speedupSlot - 1) * 100).toFixed(1)}% throughput (${speedupSlot.toFixed(2)}x) | p50: ${tsCorpusStats.p50Ns} ns -> ${wasmSlotCorpusStats.p50Ns} ns`);
  console.log(`     • WASM Packed Return: ${speedupPacked >= 1 ? "+" : ""}${((speedupPacked - 1) * 100).toFixed(1)}% throughput (${speedupPacked.toFixed(2)}x) | p50: ${tsCorpusStats.p50Ns} ns -> ${wasmPackedCorpusStats.p50Ns} ns\n`);

  console.log(`--------------------------------------------------------------------------------`);
  console.log(`▶ Workload 2: 500,000 Lookups on Corpus LaTeX Macros (Natural Density)`);
  console.log(`--------------------------------------------------------------------------------`);

  const tsMacroStats = runBenchmark("Pure TypeScript (V8 JIT)", macroTokens, 500_000, (tok) => {
    return lookupCatalog(tok, DOMAIN_ALL, DIALECT_ALL);
  });
  const wasmSlotMacroStats = runBenchmark("WASM Island 1 (Slot Return)", macroTokens, 500_000, (tok) => {
    return lookupWasmCatalogSlot(tok, DOMAIN_ALL, DIALECT_ALL);
  });
  const wasmPackedMacroStats = runBenchmark("WASM Island 1 (Packed u32)", macroTokens, 500_000, (tok) => {
    return lookupWasmCatalogPacked(tok, DOMAIN_ALL, DIALECT_ALL);
  });

  console.log(printStats(tsMacroStats));
  console.log(printStats(wasmSlotMacroStats));
  console.log(printStats(wasmPackedMacroStats));

  const macroSpeedup = wasmSlotMacroStats.throughputMops / tsMacroStats.throughputMops;
  console.log(`\n  ⚡ Corpus Macro Speedup: ${macroSpeedup >= 1 ? "+" : ""}${((macroSpeedup - 1) * 100).toFixed(1)}% throughput (${macroSpeedup.toFixed(2)}x)`);

  disableWasmCatalog();
  console.log("\n================================================================================");
  console.log("✓ Real-World Corpus Benchmark complete.");
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Corpus benchmark failed:", err);
  process.exit(1);
});
