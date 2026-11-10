// tests/wasm_delimiters_parity.test.ts
// Bijective Parity Test Suite: Pure TypeScript Delimiter Engine vs. WebAssembly Island 2 Engine

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  findDelimiterPairs,
  collectDelimiterSpans,
  findDelimiterScan,
} from "../src/parsers/delimiters";
import {
  initWasmCatalog,
  disableWasmCatalog,
} from "../src/parsers/wasm_catalog";
import {
  isWasmDelimitersReady,
  scanWasmDelimiters,
  collectWasmDelimiterSpans,
} from "../src/parsers/wasm_delimiters";

describe("Island 2: WebAssembly Rainbow Delimiter Engine Bijective Parity", () => {
  beforeAll(async () => {
    const candidatePaths = [
      path.resolve(__dirname, "../wasm/target/wasm32-unknown-unknown/release/color_math_wasm.wasm"),
      path.resolve(__dirname, "../wasm/wasm_pkg/color_math_wasm_bg.wasm"),
    ];
    const wasmPath = candidatePaths.find((p) => fs.existsSync(p));
    if (wasmPath) {
      const wasmBytes = fs.readFileSync(wasmPath);
      await initWasmCatalog(wasmBytes);
    }
  });

  afterAll(() => {
    disableWasmCatalog();
  });

  it("verifies WASM Island 2 module is loaded and operational", () => {
    expect(isWasmDelimitersReady()).toBe(true);
  });

  it("matches pure TypeScript on single bracket pair at depth 0", () => {
    const input = "(x + y)";
    const tsScan = findDelimiterScan(input);
    const wasmScan = scanWasmDelimiters(input);

    expect(wasmScan.pairs.length).toBe(tsScan.pairs.length);
    expect(wasmScan.pairs.length).toBe(1);
    expect(wasmScan.pairs[0].depth).toBe(0);
    expect(wasmScan.pairs[0].open.start).toBe(tsScan.pairs[0].open.start);
    expect(wasmScan.pairs[0].open.end).toBe(tsScan.pairs[0].open.end);
    expect(wasmScan.pairs[0].close.start).toBe(tsScan.pairs[0].close.start);
    expect(wasmScan.pairs[0].close.end).toBe(tsScan.pairs[0].close.end);
  });

  it("matches pure TypeScript on nested brackets with increasing depth", () => {
    const input = "([x + y])";
    const tsScan = findDelimiterScan(input);
    const wasmScan = scanWasmDelimiters(input);

    expect(wasmScan.pairs.length).toBe(tsScan.pairs.length);
    expect(wasmScan.pairs.length).toBe(2);

    for (let i = 0; i < tsScan.pairs.length; i++) {
      expect(wasmScan.pairs[i].depth).toBe(tsScan.pairs[i].depth);
      expect(wasmScan.pairs[i].open.start).toBe(tsScan.pairs[i].open.start);
      expect(wasmScan.pairs[i].close.start).toBe(tsScan.pairs[i].close.start);
    }
  });

  it("matches pure TypeScript on set braces \\{ and \\}", () => {
    const input = "\\{ a, b, c \\}";
    const tsScan = findDelimiterScan(input);
    const wasmScan = scanWasmDelimiters(input);

    expect(wasmScan.pairs.length).toBe(tsScan.pairs.length);
    expect(wasmScan.pairs.length).toBe(1);
    expect(wasmScan.pairs[0].open.type).toBe("brace");
  });

  it("matches pure TypeScript on LaTeX sized delimiters \\bigl( and \\bigr)", () => {
    const input = "\\bigl( x \\bigr)";
    const tsScan = findDelimiterScan(input);
    const wasmScan = scanWasmDelimiters(input);

    expect(wasmScan.pairs.length).toBe(tsScan.pairs.length);
    expect(wasmScan.pairs.length).toBe(1);
    expect(wasmScan.pairs[0].open.start).toBe(tsScan.pairs[0].open.start);
    expect(wasmScan.pairs[0].close.start).toBe(tsScan.pairs[0].close.start);
  });

  it("matches pure TypeScript on \\left( and \\right) pairs", () => {
    const input = "\\left( \\frac{a}{b} \\right)";
    const tsScan = findDelimiterScan(input);
    const wasmScan = scanWasmDelimiters(input);

    expect(wasmScan.pairs.length).toBe(tsScan.pairs.length);
    expect(wasmScan.pairs.length).toBe(1);
    expect(wasmScan.pairs[0].open.start).toBe(tsScan.pairs[0].open.start);
    expect(wasmScan.pairs[0].close.start).toBe(tsScan.pairs[0].close.start);
  });

  it("matches pure TypeScript on half-open mathematical intervals [a, b)", () => {
    const input = "[a, b)";
    const tsScan = findDelimiterScan(input);
    const wasmScan = scanWasmDelimiters(input);

    expect(wasmScan.pairs.length).toBe(tsScan.pairs.length);
    expect(wasmScan.pairs.length).toBe(1);
    expect(wasmScan.pairs[0].open.start).toBe(0);
    expect(wasmScan.pairs[0].close.start).toBe(5);
  });

  it("matches pure TypeScript on deep nesting depth cycling ([([x])])", () => {
    const input = "([([x])])";
    const tsSpans = collectDelimiterSpans(input);
    const wasmSpans = collectWasmDelimiterSpans(input);

    expect(wasmSpans.length).toBe(tsSpans.length);
    expect(wasmSpans.length).toBe(8);

    for (let i = 0; i < tsSpans.length; i++) {
      expect(wasmSpans[i].start).toBe(tsSpans[i].start);
      expect(wasmSpans[i].end).toBe(tsSpans[i].end);
      expect(wasmSpans[i].color).toBe(tsSpans[i].color);
    }
  });

  it("matches pure TypeScript on bare grouping braces when enabled", () => {
    const input = "{a + b} + {c + d}";
    const tsScan = findDelimiterScan(input, { includeBareBraces: true });
    const wasmScan = scanWasmDelimiters(input, { includeBareBraces: true });

    expect(wasmScan.pairs.length).toBe(tsScan.pairs.length);
    expect(wasmScan.pairs.length).toBe(2);
  });

  it("matches pure TypeScript on diverse real mathematical expressions", () => {
    const formulas = [
      "\\int_{0}^{\\infty} \\left( \\frac{\\sin(x)}{x} \\right) dx = \\frac{\\pi}{2}",
      "\\left[ \\sum_{i=1}^n \\bigl( x_i - \\bar{x} \\bigr)^2 \\right]^{1/2}",
      "\\left( \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\right)",
      "\\{ x \\in \\mathbb{R} \\mid (x > 0) \\land [x < 10) \\}",
      "\\det \\left( \\mathbf{A} - \\lambda \\mathbf{I} \\right) = 0",
      "\\langle \\psi | \\hat{H} | \\psi \\rangle = E",
      "\\frac{\\partial^2 u}{\\partial t^2} = c^2 \\left( \\frac{\\partial^2 u}{\\partial x^2} + \\frac{\\partial^2 u}{\\partial y^2} \\right)",
      "v(t) = \\left[ 120 \\text{ km/h} + \\left( 9.8 \\text{ m/s}^2 \\cdot t \\right) \\right]",
    ];

    for (const formula of formulas) {
      const tsSpans = collectDelimiterSpans(formula);
      const wasmSpans = collectWasmDelimiterSpans(formula);

      expect(wasmSpans.length).toBe(tsSpans.length);
      for (let i = 0; i < tsSpans.length; i++) {
        expect(wasmSpans[i].start).toBe(tsSpans[i].start);
        expect(wasmSpans[i].end).toBe(tsSpans[i].end);
        expect(wasmSpans[i].color).toBe(tsSpans[i].color);
      }
    }
  });
});
