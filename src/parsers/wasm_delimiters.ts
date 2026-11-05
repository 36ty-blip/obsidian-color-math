// src/parsers/wasm_delimiters.ts
// Experimental WebAssembly Island 2: Whole-Block Rainbow Delimiter & Interval Engine.
// Single-jump linear scanning: the entire math block text is transferred once.
// Dual-implementation safety: pure TypeScript remains default and active fallback.

import { RAINBOW_DELIMITER_COLORS } from "../config";
import { ColorSpan } from "../utils/spans";
import {
  DelimiterItem,
  DelimiterPair,
  DelimiterScanResult,
  DelimiterCollectorOptions,
  findDelimiterScan as tsFindDelimiterScan,
  collectDelimiterSpans as tsCollectDelimiterSpans,
} from "./delimiters";
import { getRawWasmExports, isWasmCatalogReady } from "./wasm_catalog";

const DELIM_TYPE_MAP: string[] = [
  "paren",      // 0
  "bracket",    // 1
  "brace",      // 2
  "bare_brace", // 3
  "angle",      // 4
  "pipe",       // 5
  "other",      // 6
  "quote",      // 7
  "bare_left",  // 8
  "bare_right", // 9
];

/**
 * Returns whether the WebAssembly delimiter scanner is operational.
 */
export function isWasmDelimitersReady(): boolean {
  const exports = getRawWasmExports();
  return (
    isWasmCatalogReady() &&
    exports !== null &&
    typeof exports.cm_delim_text_ptr === "function" &&
    typeof exports.cm_delim_output_ptr === "function" &&
    typeof exports.cm_scan_delimiters === "function"
  );
}

/**
 * High-performance whole-block delimiter scan using WebAssembly linear memory.
 * Falls back transparently to pure TypeScript if WASM is not instantiated.
 */
export function scanWasmDelimiters(
  text: string,
  options?: { includeBareBraces?: boolean; highlightUnmatched?: boolean }
): DelimiterScanResult {
  const exports = getRawWasmExports();
  const len = text.length;

  if (
    !exports ||
    !exports.cm_delim_text_ptr ||
    !exports.cm_delim_output_ptr ||
    !exports.cm_scan_delimiters ||
    len === 0 ||
    len > 32768
  ) {
    return tsFindDelimiterScan(text, options);
  }

  const textPtr = exports.cm_delim_text_ptr();
  const outPtr = exports.cm_delim_output_ptr();
  const memoryU16 = new Uint16Array(exports.memory.buffer);
  const textOffset = textPtr >> 1;

  // Single zero-allocation write into linear memory
  for (let i = 0; i < len; i++) {
    memoryU16[textOffset + i] = text.charCodeAt(i);
  }

  const includeBareBraces = options?.includeBareBraces ?? false;
  const highlightUnmatched = options?.highlightUnmatched ?? true;

  // Single jump into WebAssembly: processes full block internally
  const res = exports.cm_scan_delimiters(
    len,
    includeBareBraces ? 1 : 0,
    highlightUnmatched ? 1 : 0
  );

  const pairCount = res >>> 16;
  const unmatchedCount = res & 0xFFFF;

  const memoryU32 = new Uint32Array(exports.memory.buffer);
  let outIdx = outPtr >> 2;

  const pairs: DelimiterPair[] = new Array(pairCount);
  for (let i = 0; i < pairCount; i++) {
    const openStart = memoryU32[outIdx];
    const openEnd = memoryU32[outIdx + 1];
    const closeStart = memoryU32[outIdx + 2];
    const closeEnd = memoryU32[outIdx + 3];
    const depth = memoryU32[outIdx + 4];
    const typeId = memoryU32[outIdx + 5];
    const typeName = DELIM_TYPE_MAP[typeId] || "paren";

    pairs[i] = {
      open: {
        type: typeName,
        start: openStart,
        end: openEnd,
        isLeftRight: typeName === "bare_left" || openStart + 5 <= openEnd,
      },
      close: {
        type: typeName,
        start: closeStart,
        end: closeEnd,
        isLeftRight: typeName === "bare_right" || closeStart + 6 <= closeEnd,
      },
      depth,
    };
    outIdx += 6;
  }

  const unmatched: DelimiterItem[] = new Array(unmatchedCount);
  for (let i = 0; i < unmatchedCount; i++) {
    const start = memoryU32[outIdx];
    const end = memoryU32[outIdx + 1];
    const typeId = memoryU32[outIdx + 2];
    const isLeftRight = memoryU32[outIdx + 3] === 1;
    const typeName = DELIM_TYPE_MAP[typeId] || "paren";

    unmatched[i] = {
      type: typeName,
      start,
      end,
      isLeftRight,
    };
    outIdx += 4;
  }

  return { pairs, unmatched };
}

/**
 * Directly generates ColorSpan[] from WebAssembly linear memory with zero intermediate JS objects.
 */
export function collectWasmDelimiterSpans(
  text: string,
  options?: DelimiterCollectorOptions
): ColorSpan[] {
  const exports = getRawWasmExports();
  const len = text.length;

  if (
    !exports ||
    !exports.cm_delim_text_ptr ||
    !exports.cm_delim_output_ptr ||
    !exports.cm_scan_delimiters ||
    len === 0 ||
    len > 32768
  ) {
    return tsCollectDelimiterSpans(text, options);
  }

  const textPtr = exports.cm_delim_text_ptr();
  const outPtr = exports.cm_delim_output_ptr();
  const memoryU16 = new Uint16Array(exports.memory.buffer);
  const textOffset = textPtr >> 1;

  for (let i = 0; i < len; i++) {
    memoryU16[textOffset + i] = text.charCodeAt(i);
  }

  const includeBareBraces = options?.includeBareBraces ?? false;
  const highlightUnmatched = options?.highlightUnmatched ?? true;
  const onlyUnmatched = options?.onlyUnmatched ?? false;
  const palette = options?.palette ?? RAINBOW_DELIMITER_COLORS;
  const errorColor = options?.errorColor ?? "#ff5555";

  const res = exports.cm_scan_delimiters(
    len,
    includeBareBraces ? 1 : 0,
    highlightUnmatched ? 1 : 0
  );

  const pairCount = res >>> 16;
  const unmatchedCount = res & 0xFFFF;

  const memoryU32 = new Uint32Array(exports.memory.buffer);
  let outIdx = outPtr >> 2;

  const spans: ColorSpan[] = [];

  if (!onlyUnmatched) {
    for (let i = 0; i < pairCount; i++) {
      const openStart = memoryU32[outIdx];
      const openEnd = memoryU32[outIdx + 1];
      const closeStart = memoryU32[outIdx + 2];
      const closeEnd = memoryU32[outIdx + 3];
      const depth = memoryU32[outIdx + 4];

      const color = palette[depth % palette.length];
      spans.push({
        start: openStart,
        end: openEnd,
        color,
        priority: 25,
      });
      spans.push({
        start: closeStart,
        end: closeEnd,
        color,
        priority: 25,
      });
      outIdx += 6;
    }
  } else {
    outIdx += pairCount * 6;
  }

  if (highlightUnmatched) {
    const strict = options?.strictBracketWarnings === true;
    for (let i = 0; i < unmatchedCount; i++) {
      const start = memoryU32[outIdx];
      const end = memoryU32[outIdx + 1];
      const typeId = memoryU32[outIdx + 2];
      const isLeftRight = memoryU32[outIdx + 3] === 1;
      const typeName = DELIM_TYPE_MAP[typeId] || "paren";

      const isSyntaxError = typeName === "bare_brace" || typeName === "quote" || isLeftRight;
      if (!isSyntaxError && !strict) {
        outIdx += 4;
        continue;
      }

      spans.push({
        start,
        end,
        color: errorColor,
        priority: 99,
      });
      outIdx += 4;
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}
