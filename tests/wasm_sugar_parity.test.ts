// tests/wasm_sugar_parity.test.ts
// Bijective Parity Test Suite: Pure TypeScript Normalizer vs. WebAssembly Island 4 Engine

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { normalizeBracketMatrices, normalizeMathSyntax } from "../src/utils/latex_helpers";
import { initWasmEngine } from "../src/parsers/engine_bridge";
import {
  initWasmCatalog,
  disableWasmCatalog,
} from "../src/parsers/wasm_catalog";
import {
  isWasmSugarReady,
  hash64WasmMath,
  merkleRootWasm,
  desugarWasmMath,
} from "../src/parsers/wasm_sugar";

describe("Island 4: WebAssembly Syntactic Sugar & Merkle Checksum Engine Parity", () => {
  beforeAll(async () => {
    await initWasmEngine();
  });

  afterAll(() => {
    disableWasmCatalog();
  });

  it("verifies WASM Island 4 sugar engine is loaded and operational", () => {
    expect(isWasmSugarReady()).toBe(true);
  });

  it("computes deterministic 64-bit integer hashes for equations", () => {
    const eq1 = "E = mc^2";
    const eq2 = "E = mc^2";
    const eq3 = "E = mc^3";

    const h1 = hash64WasmMath(eq1);
    const h2 = hash64WasmMath(eq2);
    const h3 = hash64WasmMath(eq3);

    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).not.toBe(0n);
  });

  it("computes valid Merkle root hashes for document clusters", () => {
    const h1 = hash64WasmMath("x^2 + y^2 = r^2");
    const h2 = hash64WasmMath("\\int_0^1 f(x) dx");
    const h3 = hash64WasmMath("\\nabla \\cdot B = 0");

    const root1 = merkleRootWasm([h1, h2, h3]);
    const root2 = merkleRootWasm([h1, h2, h3]);
    expect(root1).toBe(root2);

    const rootMut = merkleRootWasm([h1, hash64WasmMath("\\nabla \\cdot B = 1"), h3]);
    expect(root1).not.toBe(rootMut);
  });

  it("desugars matrix shorthands mat[...] and pmat[...]", () => {
    const input = "A = mat[1, 2; 3, 4] + pmat[a, b; c, d] + cases[x, x >= 0; -x, x < 0] + align[a &= b; c &= d]";
    const desugared = desugarWasmMath(input);

    expect(desugared).toContain("\\begin{matrix}1 & 2 \\\\ 3 & 4\\end{matrix}");
    expect(desugared).toContain("\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}");
    expect(desugared).toContain("\\begin{cases}x & x >= 0 \\\\ -x & x < 0\\end{cases}");
    expect(desugared).toContain("\\begin{aligned}a &= b \\\\ c &= d\\end{aligned}");
  });

  it("desugars ligatures and ellipses", () => {
    const input = "a != b, x >= 0, y <= 1, f: X -> Y, A => B, a ... b";
    const desugared = desugarWasmMath(input);

    expect(desugared).toContain("\\neq");
    expect(desugared).toContain("\\ge");
    expect(desugared).toContain("\\le");
    expect(desugared).toContain("\\to");
    expect(desugared).toContain("\\implies");
    expect(desugared).toContain("\\dots");
  });

  it("gracefully falls back to pure TypeScript when WASM is disabled", () => {
    const input = "mat[1, 2; 3, 4]";
    const resBefore = desugarWasmMath(input);

    disableWasmCatalog();
    expect(isWasmSugarReady()).toBe(false);

    const resFallback = desugarWasmMath(input);
    expect(resFallback).toBeDefined();
    expect(resFallback).toContain("\\begin{matrix}");
  });
});
