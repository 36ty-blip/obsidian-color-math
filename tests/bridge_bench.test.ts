// tests/bridge_bench.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import {
  initWasmEngine,
  isWasmReady,
  parseWithWasm,
} from "../src/parsers/engine_bridge";
import { findDelimiterScan } from "../src/parsers/delimiters";
import { collectUnitSpans } from "../src/parsers/units";
import { parseMathWithCST } from "../src/parsers/cst_parser";
import { DEFAULT_COLORS } from "../src/config";

describe("TS vs CST Performance & Parity Benchmark", () => {
  beforeAll(async () => {
    expect(isWasmReady()).toBe(false);
  });

  const SAMPLES = {
    short: "(x + y)",
    medium: "\\vec{F} = m \\cdot \\left[ \\frac{d\\vec{v}}{dt} + (\\omega \\times \\vec{r}) \\right]",
    large: `\\begin{pmatrix}
      \\frac{\\partial f_1}{\\partial x_1} & \\cdots & \\frac{\\partial f_1}{\\partial x_n} \\\\
      \\vdots & \\ddots & \\vdots \\\\
      \\frac{\\partial f_m}{\\partial x_1} & \\cdots & \\frac{\\partial f_m}{\\partial x_n}
    \\end{pmatrix} = \\left[ \\sum_{i=1}^n \\left( \\int_0^1 \\frac{dx}{1+x^2} \\right) \\right]`,
  };

  it("measures Delimiter Engine: Classic TypeScript vs Context-Aware CST Parser", () => {
    const WARMUP_ROUNDS = 50;
    const BENCH_ROUNDS = 500;

    for (const [tier, text] of Object.entries(SAMPLES)) {
      // Warmup
      for (let i = 0; i < WARMUP_ROUNDS; i++) {
        findDelimiterScan(text, { includeBareBraces: true });
        parseMathWithCST(text);
      }

      // Benchmark Classic TS Delimiter Scan
      const tsStart = performance.now();
      for (let i = 0; i < BENCH_ROUNDS; i++) {
        findDelimiterScan(text, { includeBareBraces: true });
      }
      const tsDurationMs = performance.now() - tsStart;
      const tsAvgUs = (tsDurationMs / BENCH_ROUNDS) * 1000;

      // Benchmark Context-Aware CST Parser
      const cstStart = performance.now();
      for (let i = 0; i < BENCH_ROUNDS; i++) {
        parseMathWithCST(text);
      }
      const cstDurationMs = performance.now() - cstStart;
      const cstAvgUs = (cstDurationMs / BENCH_ROUNDS) * 1000;

      const cstSpans = parseMathWithCST(text);
      expect(cstSpans).not.toBeNull();
      expect(cstSpans.length).toBeGreaterThan(0);

      console.log(
        `[Parser Bench - ${tier}] Classic TS: ${tsAvgUs.toFixed(2)} µs/op | CST Parser: ${cstAvgUs.toFixed(2)} µs/op`
      );
    }
  });

  it("verifies General Math Parser spans parity", () => {
    const text = "\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}";
    const cstSpans = parseMathWithCST(text, { palette: DEFAULT_COLORS });
    expect(cstSpans).not.toBeNull();
    expect(cstSpans.length).toBeGreaterThan(0);
  });

  it("measures TypeScript Units Scanner performance on real formulas", () => {
    const BENCH_ROUNDS = 1000;

    const UNIT_CASES: Record<string, string> = {
      "no-units (pure math)": "\\int_0^\\infty \\frac{x^3}{e^x - 1} dx = \\frac{\\pi^4}{15}",
      "simple unit": "E = 1.064\\, \\mu m",
      "compound units": "g = 9.8\\, \\text{m/s}^2, \\quad m = 50\\, \\text{kg}, \\quad F = 490\\, \\text{N}",
      "scientific notation + compound":
        "\\lambda = \\frac{6.626 \\times 10^{-34}\\, \\text{J}\\cdot\\text{s}}{9.109 \\times 10^{-31}\\, \\text{kg} \\cdot 2.2 \\times 10^6\\, \\text{m/s}} = 0.33\\, \\text{nm}",
      "ambiguous Greek symbols":
        "\\mu = 0.5, \\quad F = \\mu N, \\quad \\Delta V = I R, \\quad C = 10\\, \\mu\\text{F}",
    };

    console.log("\n--- Units Scanner (TypeScript RegExp) Benchmark ---");
    for (const [name, text] of Object.entries(UNIT_CASES)) {
      // Warmup
      for (let i = 0; i < 100; i++) {
        collectUnitSpans(text, DEFAULT_COLORS);
      }

      const start = performance.now();
      for (let i = 0; i < BENCH_ROUNDS; i++) {
        collectUnitSpans(text, DEFAULT_COLORS);
      }
      const durationMs = performance.now() - start;
      const avgUs = (durationMs / BENCH_ROUNDS) * 1000;
      const spans = collectUnitSpans(text, DEFAULT_COLORS);

      console.log(
        `[Units TS - ${name}] ${avgUs.toFixed(2)} µs/op (${spans.length} units detected)`
      );
    }
  });
});
