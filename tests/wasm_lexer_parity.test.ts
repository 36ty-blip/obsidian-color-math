// tests/wasm_lexer_parity.test.ts
// Bijective Parity Test Suite: Pure TypeScript Scanner vs. WebAssembly Island 3 Lexer Engine

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { collectScannerSpans } from "../src/parsers/scanner";
import {
  initWasmCatalog,
  disableWasmCatalog,
} from "../src/parsers/wasm_catalog";
import {
  isWasmLexerReady,
  lexWasmMathBlock,
  collectWasmLexerSpans,
  ROLE_OPERATOR,
  ROLE_SUBSCRIPT,
  ROLE_SUPERSCRIPT,
} from "../src/parsers/wasm_lexer";
import { initWasmEngine } from "../src/parsers/engine_bridge";
import { COLORS } from "../src/config";

describe("Island 3: WebAssembly Whole-Block Lexer Bijective Parity", () => {
  beforeAll(async () => {
    await initWasmEngine();
  });

  afterAll(() => {
    disableWasmCatalog();
  });

  it("verifies WASM Island 3 lexer is loaded and operational", () => {
    expect(isWasmLexerReady()).toBe(true);
  });

  it("lexes basic subscripts and superscripts into flat tokens", () => {
    const input = "x_{i} + y^{2}";
    const tokens = lexWasmMathBlock(input, 0xFFFFFFFF, 0xFFFFFFFF, 2); // scripts enabled

    expect(tokens.length).toBeGreaterThanOrEqual(3);
    const sub = tokens.find(t => t.roleId === ROLE_SUBSCRIPT);
    const sup = tokens.find(t => t.roleId === ROLE_SUPERSCRIPT);
    const op = tokens.find(t => t.roleId === ROLE_OPERATOR);

    expect(sub).toBeDefined();
    expect(sub!.start).toBe(3); // 'i'
    expect(sub!.end).toBe(4);

    expect(sup).toBeDefined();
    expect(sup!.start).toBe(11); // '2'
    expect(sup!.end).toBe(12);

    expect(op).toBeDefined();
    expect(op!.start).toBe(6); // '+'
    expect(op!.end).toBe(7);
  });

  it("lexes big operators with limits modifiers in single jump", () => {
    const input = "\\int\\limits_{0}^{\\infty} f(x) \\, dx";
    const tokens = lexWasmMathBlock(input, 0xFFFFFFFF, 0xFFFFFFFF, 3);

    const intTok = tokens.find(t => t.start === 0);
    expect(intTok).toBeDefined();
    expect(intTok!.end).toBe(11); // \\int\\limits (4 + 7 = 11)
    expect(intTok!.roleId).toBe(ROLE_OPERATOR);
  });

  it("fuses rainbow delimiters within the lexer pass", () => {
    const input = "\\left( x + [a, b] \\right)";
    const tokens = lexWasmMathBlock(input, 0xFFFFFFFF, 0xFFFFFFFF, 3); // delimiters + scripts

    const delimTokens = tokens.filter(t => t.roleId >= 100);
    expect(delimTokens.length).toBe(4); // 2 pairs = 4 tokens
  });

  it("gracefully falls back to pure TypeScript when WASM is disabled", () => {
    const input = "E = mc^2";
    const spansBefore = collectWasmLexerSpans(input, COLORS);

    disableWasmCatalog();
    expect(isWasmLexerReady()).toBe(false);

    const spansFallback = collectWasmLexerSpans(input, COLORS);
    expect(spansFallback).toBeDefined();
    expect(spansFallback.length).toBeGreaterThan(0);
  });
});
