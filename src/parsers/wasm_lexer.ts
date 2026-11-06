// src/parsers/wasm_lexer.ts
// Experimental WebAssembly Island 3: Fast Whole-Block Byte-Stream Lexer & Token Slicer Engine.
// Single-jump whole-block execution: transfers active math block once to WASM linear memory.
// Fuses Island 1 Lemire MPHF catalog and Island 2 delimiter scan in a single zero-allocation pass.
// Dual-implementation safety: pure TypeScript remains default and active fallback.

import { COLORS, ColorPalette, ColorMathOptions, RAINBOW_DELIMITER_COLORS } from "../config";
import { ColorSpan } from "../utils/spans";
import { collectScannerSpans as tsCollectScannerSpans } from "./scanner";
import { getRawWasmExports, isWasmCatalogReady } from "./wasm_catalog";

export const ROLE_FUNCTION = 0;
export const ROLE_OPERATOR = 1;
export const ROLE_RELATION = 2;
export const ROLE_CONSTANT = 3;
export const ROLE_PARAMETER = 4;
export const ROLE_DERIVATIVE = 5;
export const ROLE_DELIMITER = 6;
export const ROLE_STRUCTURAL = 7;
export const ROLE_UNIT = 8;
export const ROLE_VARIABLE = 9;
export const ROLE_ARROW = 10;
export const ROLE_SET = 11;
export const ROLE_DOT = 12;
export const ROLE_TRANSFORM = 13;
export const ROLE_SPACING = 14;
export const ROLE_ARITHMETIC = 15;
export const ROLE_SUBSCRIPT = 16;
export const ROLE_SUPERSCRIPT = 17;
export const ROLE_SYNTAX_ERROR = 999;

export interface FlatToken {
  start: number;
  end: number;
  roleId: number;
  priority: number;
}

/**
 * Returns whether the WebAssembly lexer is operational.
 */
export function isWasmLexerReady(): boolean {
  const exports = getRawWasmExports();
  return (
    isWasmCatalogReady() &&
    exports !== null &&
    typeof exports.cm_lexer_text_ptr === "function" &&
    typeof exports.cm_lexer_output_ptr === "function" &&
    typeof exports.cm_lex_math_block === "function"
  );
}

/**
 * Fast zero-allocation whole-block lexer using WebAssembly linear memory.
 * Emits flat tokens in a single jump across the C-ABI boundary.
 */
export function lexWasmMathBlock(
  text: string,
  activeDomains: number = 0xFFFFFFFF,
  activeDialects: number = 0xFFFFFFFF,
  flags: number = 3 // bit 0: delimiters, bit 1: scripts, bit 2: forLatexWrap
): FlatToken[] {
  const exports = getRawWasmExports();
  const len = text.length;

  if (
    !exports ||
    !exports.cm_lexer_text_ptr ||
    !exports.cm_lexer_output_ptr ||
    !exports.cm_lex_math_block ||
    len === 0 ||
    len > 32768
  ) {
    return [];
  }

  const textPtr = exports.cm_lexer_text_ptr();
  const u16View = new Uint16Array(exports.memory.buffer, textPtr, len);
  for (let i = 0; i < len; i++) {
    u16View[i] = text.charCodeAt(i);
  }

  const tokenCount = exports.cm_lex_math_block(len, activeDomains, activeDialects, flags);
  if (tokenCount === 0) {
    return [];
  }

  const outPtr = exports.cm_lexer_output_ptr();
  const u32View = new Uint32Array(exports.memory.buffer, outPtr, tokenCount * 4);

  const tokens: FlatToken[] = new Array(tokenCount);
  for (let i = 0; i < tokenCount; i++) {
    const base = i * 4;
    tokens[i] = {
      start: u32View[base],
      end: u32View[base + 1],
      roleId: u32View[base + 2],
      priority: u32View[base + 3],
    };
  }

  return tokens;
}

/**
 * Resolves color string for a given role ID.
 */
function resolveRoleColor(
  roleId: number,
  palette: ColorPalette,
  rainbowColors: string[],
  errorColor: string
): string {
  if (roleId >= 100 && roleId < 200) {
    const depth = roleId - 100;
    return rainbowColors[depth % rainbowColors.length];
  }

  switch (roleId) {
    case ROLE_FUNCTION:
      return palette.main;
    case ROLE_OPERATOR:
      return palette.orange;
    case ROLE_RELATION:
      return palette.relation;
    case ROLE_CONSTANT:
      return palette.orange;
    case ROLE_PARAMETER:
      return palette.parameter;
    case ROLE_DERIVATIVE:
      return palette.derivative;
    case ROLE_DELIMITER:
      return rainbowColors[0] || palette.main;
    case ROLE_STRUCTURAL:
      return palette.chain;
    case ROLE_UNIT:
      return palette.chain;
    case ROLE_VARIABLE:
      return palette.main;
    case ROLE_ARROW:
      return palette.arrow;
    case ROLE_SET:
      return palette.set;
    case ROLE_DOT:
      return palette.dot;
    case ROLE_TRANSFORM:
      return palette.derivative;
    case ROLE_SPACING:
      return palette.spacing;
    case ROLE_ARITHMETIC:
      return palette.arithmetic;
    case ROLE_SUBSCRIPT:
      return palette.chain;
    case ROLE_SUPERSCRIPT:
      return palette.upper;
    case ROLE_SYNTAX_ERROR:
      return errorColor;
    default:
      return palette.relation;
  }
}

/**
 * Collects ColorSpans using WebAssembly Island 3 Whole-Block Lexer with automatic fallback to pure TypeScript.
 */
export function collectWasmLexerSpans(
  body: string,
  palette: ColorPalette = COLORS,
  options?: ColorMathOptions,
  forLatexWrap: boolean = false
): ColorSpan[] {
  if (!body) return [];

  if (!isWasmLexerReady()) {
    return tsCollectScannerSpans(body, palette, forLatexWrap);
  }

  let flags = 0;
  if (options?.rainbowDelimiters || options?.highlightUnmatchedBraces !== false) {
    flags |= 1; // enable delimiters
  }
  flags |= 2; // enable scripts
  if (forLatexWrap) {
    flags |= 4; // forLatexWrap
  }

  const tokens = lexWasmMathBlock(body, 0xFFFFFFFF, 0xFFFFFFFF, flags);
  if (tokens.length === 0) {
    return tsCollectScannerSpans(body, palette, forLatexWrap);
  }

  const rainbowColors = options?.rainbowColors || RAINBOW_DELIMITER_COLORS;
  const rawErrorColor: unknown = (options as Record<string, unknown> | undefined)?.errorColor;
  const errorColor: string = typeof rawErrorColor === "string" ? rawErrorColor : "#f7768e";

  const spans: ColorSpan[] = new Array(tokens.length);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    spans[i] = {
      start: t.start,
      end: t.end,
      color: resolveRoleColor(t.roleId, palette, rainbowColors, errorColor),
      priority: t.priority,
    };
  }

  spans.sort((a, b) => a.start - b.start);
  return spans;
}
