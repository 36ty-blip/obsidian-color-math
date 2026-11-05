// src/parsers/wasm_cst.ts
// Experimental WebAssembly Island 5: Flat Linear Arena CST & 4D Navigation Topology Engine.
// Single-jump complete pipeline: parses CST directly into 48-byte binary records in linear memory.
// Powers both semantic color highlighting and on-demand 4D Quaternion navigation queries.
// Dual-implementation safety: pure TypeScript MathCSTParser remains default and active fallback.

import { COLORS, ColorPalette, RAINBOW_DELIMITER_COLORS } from "../config";
import { ColorSpan } from "../utils/spans";
import { parseMathWithCST as tsParseMathWithCST, CSTCollectorOptions } from "./cst/index";
import { SpatialCoordinate4D } from "./cst/types";
import { getRawWasmExports, isWasmCatalogReady } from "./wasm_catalog";

export const NODE_COMMAND = 1;
export const NODE_GROUP = 2;
export const NODE_FRACTION = 3;
export const NODE_SCRIPT = 4;
export const NODE_IDENTIFIER = 5;
export const NODE_OPERATOR = 6;
export const NODE_BOUNDARY = 7;
export const NODE_TEXT = 8;
export const NODE_UNDEROVER = 9;
export const NODE_PUNCTUATION = 10;

export const NO_INDEX = 0xFFFFFFFF;

export interface CstNodeRecordView {
  kind: number;
  flags: number;
  start: number;
  end: number;
  roleId: number;
  priority: number;
  childStart: number;
  childCount: number;
  prevLeaf: number;
  nextLeaf: number;
  compoundPartner: number;
  w: number;       // Multi-scale rank: 0=glyph, 1=atom, 2=slot, 3=molecule, 4=enclosure
  z: number;       // Molecule isolation plane (0=dominant baseline, >=1=unique molecule plane)
  y: number;       // Orthogonal elevation (+1=superscript/numerator, 0=baseline, -1=subscript/denominator, -row=matrix)
  x: number;       // Local horizontal sequence index along active slot (0..65535)
  wRank: number;   // Backwards-compatible alias for w
  coord: SpatialCoordinate4D; // Complete 1x4 spatial quaternion tensor P = [W, Z, Y, X]
  extraData: number;
}

/**
 * Returns whether the WebAssembly Flat Linear Arena CST engine is operational.
 */
export function isWasmCstReady(): boolean {
  const exports = getRawWasmExports();
  return (
    isWasmCatalogReady() &&
    exports !== null &&
    typeof exports.cm_cst_text_ptr === "function" &&
    typeof exports.cm_cst_arena_ptr === "function" &&
    typeof exports.cm_cst_output_ptr === "function" &&
    typeof exports.cm_parse_cst === "function" &&
    typeof exports.cm_cst_collect_spans === "function"
  );
}

/**
 * Parses raw math text into the 48-byte Flat Binary Arena for O(1) multi-scale navigation queries.
 */
export function parseWasmCstArena(
  text: string,
  domains: number = 0xFFFFFFFF,
  dialects: number = 0xFFFFFFFF,
  flags: number = 0
): CstNodeRecordView[] {
  const exports = getRawWasmExports();
  const len = text.length;

  if (
    !exports ||
    !exports.cm_cst_text_ptr ||
    !exports.cm_cst_arena_ptr ||
    !exports.cm_parse_cst ||
    len === 0 ||
    len > 32768
  ) {
    return [];
  }

  const textPtr = exports.cm_cst_text_ptr();
  const u16View = new Uint16Array(exports.memory.buffer, textPtr, len);
  for (let i = 0; i < len; i++) {
    u16View[i] = text.charCodeAt(i);
  }

  const nodeCount = exports.cm_parse_cst(len, domains, dialects, flags);
  if (nodeCount === 0) {
    return [];
  }

  const arenaPtr = exports.cm_cst_arena_ptr();
  // Each node is 48 bytes = 12 x 32-bit words
  // Layout:
  // [0]: kind(u16) | flags(u16)
  // [1]: start(u32)
  // [2]: end(u32)
  // [3]: role_id(u16) | priority(u16)
  // [4]: child_start(u32)
  // [5]: child_count(u32)
  // [6]: prev_leaf(u32)
  // [7]: next_leaf(u32)
  // [8]: compound_partner(u32)
  // [9]: w(u16) | (z(u16) << 16)
  // [10]: y(i16) | (x(u16) << 16)
  // [11]: extra_data(u16) | (reserved(u16) << 16)
  const u32Arena = new Uint32Array(exports.memory.buffer, arenaPtr, nodeCount * 12);

  const nodes: CstNodeRecordView[] = new Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    const base = i * 12;
    const w0 = u32Arena[base];
    const w3 = u32Arena[base + 3];
    const w9 = u32Arena[base + 9];
    const w10 = u32Arena[base + 10];
    const w11 = u32Arena[base + 11];

    const w = w9 & 0xFFFF;
    const z = (w9 >>> 16) & 0xFFFF;
    // Sign-extend signed 16-bit integer for y (-row or -1 denominator/subscript)
    const rawY = w10 & 0xFFFF;
    const y = (rawY << 16) >> 16;
    const x = (w10 >>> 16) & 0xFFFF;

    nodes[i] = {
      kind: w0 & 0xFFFF,
      flags: (w0 >>> 16) & 0xFFFF,
      start: u32Arena[base + 1],
      end: u32Arena[base + 2],
      roleId: w3 & 0xFFFF,
      priority: (w3 >>> 16) & 0xFFFF,
      childStart: u32Arena[base + 4],
      childCount: u32Arena[base + 5],
      prevLeaf: u32Arena[base + 6],
      nextLeaf: u32Arena[base + 7],
      compoundPartner: u32Arena[base + 8],
      w,
      z,
      y,
      x,
      wRank: w,
      coord: { w, z, y, x },
      extraData: w11 & 0xFFFF,
    };
  }

  return nodes;
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
    case 0:  return palette.main;        // function
    case 1:  return palette.orange;      // operator
    case 2:  return palette.relation;    // relation
    case 3:  return palette.orange;      // constant
    case 4:  return palette.parameter;   // parameter
    case 5:  return palette.derivative;  // derivative
    case 6:  return rainbowColors[0] || palette.main; // delimiter
    case 7:  return palette.chain;       // structural
    case 8:  return palette.chain;       // unit
    case 9:  return palette.main;        // variable
    case 10: return palette.arrow;       // arrow
    case 11: return palette.set;         // set
    case 12: return palette.dot;         // dot
    case 13: return palette.derivative;  // transform
    case 14: return palette.spacing;     // spacing
    case 15: return palette.arithmetic;  // arithmetic
    case 16: return palette.chain;       // subscript
    case 17: return palette.upper;       // superscript
    case 999: return errorColor;
    default: return palette.relation;
  }
}

/**
 * Parses CST and extracts ColorSpans using WebAssembly Island 5 Flat Arena with immediate TypeScript fallback.
 */
export function parseWasmCstSpans(
  body: string,
  palette: ColorPalette = COLORS,
  options?: CSTCollectorOptions
): ColorSpan[] {
  if (!body) return [];

  if (!isWasmCstReady()) {
    return tsParseMathWithCST(body, { palette, ...options });
  }

  const exports = getRawWasmExports()!;
  const len = body.length;

  const textPtr = exports.cm_cst_text_ptr!();
  const u16View = new Uint16Array(exports.memory.buffer, textPtr, len);
  for (let i = 0; i < len; i++) {
    u16View[i] = body.charCodeAt(i);
  }

  const nodeCount = exports.cm_parse_cst!(len, 0xFFFFFFFF, 0xFFFFFFFF, 0);
  if (nodeCount === 0) {
    return tsParseMathWithCST(body, options);
  }

  const spanCount = exports.cm_cst_collect_spans!(nodeCount);
  if (spanCount === 0) {
    return [];
  }

  const outPtr = exports.cm_cst_output_ptr!();
  const u32Out = new Uint32Array(exports.memory.buffer, outPtr, spanCount * 4);

  const rainbowColors = options?.rainbowColors || RAINBOW_DELIMITER_COLORS;
  const errorColor = options?.errorColor || "#f7768e";

  const spans: ColorSpan[] = new Array(spanCount);
  for (let i = 0; i < spanCount; i++) {
    const base = i * 4;
    const start = u32Out[base];
    const end = u32Out[base + 1];
    const roleId = u32Out[base + 2];
    const priority = u32Out[base + 3];

    spans[i] = {
      start,
      end,
      color: resolveRoleColor(roleId, palette, rainbowColors, errorColor),
      priority,
    };
  }

  spans.sort((a, b) => a.start - b.start);
  return spans;
}
