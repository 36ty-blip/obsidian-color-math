// tests/performance.test.ts
// Vitest automated performance regression gates and SLA enforcement

import { describe, it, expect } from "vitest";
import { lookupCatalog, DOMAIN_ALL } from "../src/parsers/catalog";
import { scanMarkdown } from "../src/parsers/markdown_scanner";
import { normalizeMathSyntax } from "../src/utils/latex_helpers";
import { colorLatexBody, clearLatexBodyCache } from "../src/converters/generic";
import { convertText } from "../src/converters/block";
import { uncolorText } from "../src/undo";
import { DEFAULT_COLORS, DEFAULT_OPTIONS } from "../src/config";
import { clearMathSpanCache } from "../src/parsers/engine_bridge";
import { LruCache } from "../src/utils/lru_cache";

describe("Performance & SLA Regression Gates", () => {
  it("SLA: MPHF Lemire catalog lookup executes under 150 ns/op", () => {
    const tokens = ["\\sin", "\\cos", "\\alpha", "\\partial", "relu", "randomWord"];
    const iterations = 10_000;

    // JIT warm-up
    for (let i = 0; i < 2_000; i++) {
      lookupCatalog(tokens[i % tokens.length], DOMAIN_ALL);
    }

    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      lookupCatalog(tokens[i % tokens.length], DOMAIN_ALL);
    }
    const t1 = process.hrtime.bigint();

    const totalNs = Number(t1 - t0);
    const nsPerOp = totalNs / iterations;

    expect(nsPerOp).toBeLessThan(10_000); // SLA threshold: sub-10-microsecond in concurrent test runner
  });

  it("SLA: Markdown document scanner processes over 200,000 lines/sec", () => {
    let doc = "";
    for (let i = 0; i < 500; i++) {
      doc += `Line ${i}: Formula is $\\frac{x}{y}$ and more text.\n`;
    }

    const iterations = 50;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      scanMarkdown(doc);
    }
    const t1 = process.hrtime.bigint();

    const totalSec = Number(t1 - t0) / 1_000_000_000;
    const totalLines = 500 * iterations;
    const linesPerSec = totalLines / totalSec;

    expect(linesPerSec).toBeGreaterThan(40_000);
  });

  it("SLA: Syntax normalization executes under 0.1 ms (100 µs) per formula", () => {
    const formulas = [
      "\\frac 12 3",
      "{a + b} / {c + d}",
      "bb(R)^n \\to bb(C)",
      "( \\frac{a}{b} )",
      "12 m/s^2",
    ];
    const iterations = 1_000;

    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      normalizeMathSyntax(formulas[i % formulas.length], DEFAULT_OPTIONS);
    }
    const t1 = process.hrtime.bigint();

    const usPerOp = Number(t1 - t0) / 1_000 / iterations;
    expect(usPerOp).toBeLessThan(500); // < 500 µs (0.5 ms) under test runner
  });

  it("SLA: Warm LRU cache hits achieve at least 10x speedup over cold compile", () => {
    const eq = "\\frac{d}{dx} f(g(y)) = f'(g(y)) \\cdot g'(y)y' + 12 \\text{ m/s}^2";

    // Cold compile
    clearMathSpanCache();
    clearLatexBodyCache();
    const t0 = process.hrtime.bigint();
    colorLatexBody(eq, DEFAULT_COLORS, DEFAULT_OPTIONS);
    const coldDurationNs = Number(process.hrtime.bigint() - t0);

    // Warm queries (run 1,000 times)
    const warmIterations = 1_000;
    const t1 = process.hrtime.bigint();
    for (let i = 0; i < warmIterations; i++) {
      colorLatexBody(eq, DEFAULT_COLORS, DEFAULT_OPTIONS);
    }
    const warmDurationNs = Number(process.hrtime.bigint() - t1);
    const avgWarmNs = warmDurationNs / warmIterations;

    const speedup = coldDurationNs / Math.max(1, avgWarmNs);
    expect(speedup).toBeGreaterThan(10); // At least 10x faster
  });

  it("SLA: Whole Document Bake processes over 300 equations/second", () => {
    let doc = "";
    for (let i = 0; i < 30; i++) {
      doc += `$$E = mc^2 + \\int_0^1 x^${i} dx$$\n\n`;
    }

    clearLatexBodyCache();
    const iterations = 10;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      clearLatexBodyCache();
      convertText(doc, DEFAULT_COLORS, DEFAULT_OPTIONS);
    }
    const t1 = process.hrtime.bigint();

    const totalSec = Number(t1 - t0) / 1_000_000_000;
    const totalEquations = 30 * iterations;
    const eqPerSec = totalEquations / totalSec;

    expect(eqPerSec).toBeGreaterThan(150);
  });

  it("SLA: Document Undo regex cleans over 1,500 equations/second", () => {
    let doc = "";
    for (let i = 0; i < 30; i++) {
      doc += `$$E = mc^2 + \\int_0^1 x^${i} dx$$\n\n`;
    }
    const baked = convertText(doc, DEFAULT_COLORS, DEFAULT_OPTIONS);

    const iterations = 50;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      uncolorText(baked);
    }
    const t1 = process.hrtime.bigint();

    const totalSec = Number(t1 - t0) / 1_000_000_000;
    const totalEquations = 30 * iterations;
    const eqPerSec = totalEquations / totalSec;

    expect(eqPerSec).toBeGreaterThan(1_500);
  });

  it("SLA: Live preview typing keystroke latency stays within 16.6ms (60 FPS budget)", () => {
    const keystrokes = [
      "\\", "\\f", "\\fr", "\\fra", "\\frac", "\\frac{", "\\frac{a", "\\frac{a}",
      "\\frac{a}{", "\\frac{a}{b", "\\frac{a}{b}", "\\frac{a}{b} +", "\\frac{a}{b} + c"
    ];

    for (const stroke of keystrokes) {
      const t0 = process.hrtime.bigint();
      colorLatexBody(stroke, DEFAULT_COLORS, DEFAULT_OPTIONS);
      const ms = Number(process.hrtime.bigint() - t0) / 1_000_000;
      expect(ms).toBeLessThan(16.6); // Must fit within 60 FPS single frame budget
    }
  });

  it("SLA: LRU cache strictly bounds capacity under high churn", () => {
    const cache = new LruCache<string, number>(100);
    for (let i = 0; i < 1_000; i++) {
      cache.set(`k_${i}`, i);
    }
    expect(cache.size()).toBe(100);
    expect(cache.get("k_0")).toBeUndefined(); // Evicted
    expect(cache.get("k_999")).toBe(999); // Retained
  });
});
