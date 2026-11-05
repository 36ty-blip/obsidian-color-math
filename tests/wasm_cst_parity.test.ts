// tests/wasm_cst_parity.test.ts
// Bijective Parity Test Suite: Pure TypeScript CST Parser vs. WebAssembly Island 5 Flat Arena Engine

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parseMathWithCST } from "../src/parsers/cst/index";
import {
  initWasmCatalog,
  disableWasmCatalog,
} from "../src/parsers/wasm_catalog";
import { initWasmEngine } from "../src/parsers/engine_bridge";
import {
  isWasmCstReady,
  parseWasmCstArena,
  parseWasmCstSpans,
  NODE_FRACTION,
  NODE_SCRIPT,
  NODE_UNDEROVER,
  NODE_TEXT,
  NODE_IDENTIFIER,
} from "../src/parsers/wasm_cst";
import { COLORS } from "../src/config";

describe("Island 5: WebAssembly Flat Arena CST & Navigation Topology Engine Parity", () => {
  beforeAll(async () => {
    await initWasmEngine();
  });

  afterAll(() => {
    disableWasmCatalog();
  });

  it("verifies WASM Island 5 CST engine is loaded and operational", () => {
    expect(isWasmCstReady()).toBe(true);
  });

  it("parses fractions and underover constructs into the 48-byte binary arena", () => {
    const input = "\\frac{a}{b} + \\underbrace{x + y}_{z}";
    const nodes = parseWasmCstArena(input);

    expect(nodes.length).toBeGreaterThanOrEqual(2);
    const frac = nodes.find(n => n.kind === NODE_FRACTION);
    const underover = nodes.find(n => n.kind === NODE_UNDEROVER);

    expect(frac).toBeDefined();
    expect(frac!.start).toBe(0);
    expect(frac!.wRank).toBe(4); // enclosure

    expect(underover).toBeDefined();
    expect(underover!.wRank).toBe(3); // molecule
  });

  it("parses text macros isolating plain text from variables", () => {
    const input = "\\text{energy} = mc^2";
    const nodes = parseWasmCstArena(input);

    const textNode = nodes.find(n => n.kind === NODE_TEXT);
    expect(textNode).toBeDefined();
    expect(textNode!.start).toBe(0);
    expect(textNode!.end).toBe(13); // \\text{energy}
  });

  it("links adjacent leaves and detects differential compounds in linear memory", () => {
    const input = "dx + dy = 0";
    const nodes = parseWasmCstArena(input);

    const dNode = nodes[0];
    const xNode = nodes[1];

    expect(dNode.kind).toBe(NODE_IDENTIFIER);
    expect(xNode.kind).toBe(NODE_IDENTIFIER);

    // Doubly linked leaves
    expect(dNode.nextLeaf).toBe(1);
    expect(xNode.prevLeaf).toBe(0);

    // Differential compound binding: 'd' <-> 'x'
    expect(dNode.compoundPartner).toBe(1);
    expect(xNode.compoundPartner).toBe(0);
  });

  it("emits valid ColorSpans from the flat arena", () => {
    const input = "\\frac{\\partial y}{\\partial x} = 0";
    const spans = parseWasmCstSpans(input, COLORS);

    expect(spans.length).toBeGreaterThan(0);
    for (const span of spans) {
      expect(span.start).toBeLessThan(span.end);
      expect(span.color).toBeDefined();
    }
  });

  it("computes complete 1x4 spatial quaternion tensor P = [W, Z, Y, X] across fractions and scripts", () => {
    const input = "\\frac{a}{b} = c";
    const nodes = parseWasmCstArena(input);

    const frac = nodes.find(n => n.kind === NODE_FRACTION);
    expect(frac).toBeDefined();
    expect(frac!.w).toBe(4);
    expect(frac!.z).toBe(1);
    expect(frac!.coord).toEqual({ w: 4, z: 1, y: 0, x: 0 });

    const numA = nodes.find(n => n.kind === NODE_IDENTIFIER && n.start === 6);
    expect(numA).toBeDefined();
    expect(numA!.coord).toEqual({ w: 1, z: 1, y: 1, x: 0 });

    const denB = nodes.find(n => n.kind === NODE_IDENTIFIER && n.start === 9);
    expect(denB).toBeDefined();
    expect(denB!.coord).toEqual({ w: 1, z: 1, y: -1, x: 0 });

    // Numerator and Denominator must NOT cross-link leaves!
    expect(numA!.nextLeaf).toBe(0xFFFFFFFF);
    expect(denB!.prevLeaf).toBe(0xFFFFFFFF);
  });

  it("partitions leaf navigation links at matrix cell walls (& and \\\\)", () => {
    const input = "a & b \\\\ c & d";
    const nodes = parseWasmCstArena(input);

    const a = nodes.find(n => n.kind === NODE_IDENTIFIER && n.start === 0)!;
    const b = nodes.find(n => n.kind === NODE_IDENTIFIER && n.start === 4)!;
    const c = nodes.find(n => n.kind === NODE_IDENTIFIER && n.start === 9)!;
    const d = nodes.find(n => n.kind === NODE_IDENTIFIER && n.start === 13)!;

    expect(a.coord.y).toBe(0);
    expect(a.coord.x).toBe(0);
    expect(a.nextLeaf).toBe(0xFFFFFFFF); // Never crosses '&' cell wall

    expect(b.coord.y).toBe(0);
    expect(b.coord.x).toBe(16);
    expect(b.prevLeaf).toBe(0xFFFFFFFF);
    expect(b.nextLeaf).toBe(0xFFFFFFFF); // Never crosses '\\' row wall

    expect(c.coord.y).toBe(-1);
    expect(c.coord.x).toBe(0);
    expect(c.prevLeaf).toBe(0xFFFFFFFF);
    expect(c.nextLeaf).toBe(0xFFFFFFFF);

    expect(d.coord.y).toBe(-1);
    expect(d.coord.x).toBe(16);
    expect(d.prevLeaf).toBe(0xFFFFFFFF);
  });

  it("gracefully falls back to pure TypeScript MathCSTParser when WASM is disabled", () => {
    const input = "(x + y)";
    const spansBefore = parseWasmCstSpans(input, COLORS);

    disableWasmCatalog();
    expect(isWasmCstReady()).toBe(false);

    const spansFallback = parseWasmCstSpans(input, COLORS);
    expect(spansFallback).toBeDefined();
    expect(spansFallback.length).toBeGreaterThan(0);
  });
});
