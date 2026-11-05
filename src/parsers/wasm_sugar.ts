// src/parsers/wasm_sugar.ts
// Experimental WebAssembly Island 4: Fast In-Place Syntactic Sugar & Merkle Checksum Engine.
// Single-jump linear rewriting: desugars ergonomic syntax (mat[...], ligatures, ellipses)
// and computes 64-bit Merkle hashes directly within WASM linear memory.
// Dual-implementation safety: pure TypeScript remains default and active fallback.

import { ColorMathOptions } from "../config";
import { normalizeBracketMatrices, normalizeMathSyntax } from "../utils/latex_helpers";
import { getRawWasmExports, isWasmCatalogReady } from "./wasm_catalog";

/**
 * Returns whether the WebAssembly syntactic sugar and checksum engine is operational.
 */
export function isWasmSugarReady(): boolean {
  const exports = getRawWasmExports();
  return (
    isWasmCatalogReady() &&
    exports !== null &&
    typeof exports.cm_sugar_text_ptr === "function" &&
    typeof exports.cm_sugar_out_ptr === "function" &&
    typeof exports.cm_desugar_math === "function" &&
    typeof exports.cm_hash64_math === "function"
  );
}

/**
 * Computes a high-dispersion 64-bit integer hash for an equation in sub-nanosecond time.
 * Replaces expensive V8 string cache key allocations (${options}::${body}).
 */
export function hash64WasmMath(text: string): bigint {
  const exports = getRawWasmExports();
  const len = text.length;

  if (
    !exports ||
    !exports.cm_sugar_text_ptr ||
    !exports.cm_hash64_math ||
    len === 0 ||
    len > 32768
  ) {
    // Pure TypeScript FNV-1a 64-bit fallback
    let h = 0xcbf29ce484222325n;
    for (let i = 0; i < len; i++) {
      h ^= BigInt(text.charCodeAt(i));
      h = BigInt.asUintN(64, h * 0x100000001b3n);
    }
    return h;
  }

  const textPtr = exports.cm_sugar_text_ptr();
  const u16View = new Uint16Array(exports.memory.buffer, textPtr, len);
  for (let i = 0; i < len; i++) {
    u16View[i] = text.charCodeAt(i);
  }

  return BigInt.asUintN(64, BigInt(exports.cm_hash64_math(len)));
}

/**
 * Computes a document-level Merkle root hash across a list of equation fingerprints.
 */
export function merkleRootWasm(hashes: bigint[]): bigint {
  const exports = getRawWasmExports();
  const count = hashes.length;

  if (
    !exports ||
    !exports.cm_merkle_buf_ptr ||
    !exports.cm_merkle_root ||
    count === 0 ||
    count > 2048
  ) {
    return 0n;
  }

  const bufPtr = exports.cm_merkle_buf_ptr();
  const u64View = new BigUint64Array(exports.memory.buffer, bufPtr, count);
  for (let i = 0; i < count; i++) {
    u64View[i] = BigInt.asUintN(64, hashes[i]);
  }

  return BigInt.asUintN(64, BigInt(exports.cm_merkle_root(count)));
}

/**
 * Desugars ergonomic math block syntax (mat[...], ligatures, ellipses) in a single linear-memory pass.
 * Falls back immediately to pure TypeScript if WASM is not instantiated.
 */
export function desugarWasmMath(
  text: string,
  options?: ColorMathOptions
): string {
  if (!text) return text;

  if (!isWasmSugarReady() || text.length > 32768) {
    return normalizeMathSyntax(text, options);
  }

  const exports = getRawWasmExports()!;
  const len = text.length;

  let flags = 0;
  if (options?.speedSyntacticSugar !== false) {
    if (options?.sugarBracketMatrices !== false) flags |= 1; // matrices
    if (options?.sugarAsciiOperators !== false)  flags |= 2; // ligatures
    if (options?.sugarAsciiEllipses !== false)   flags |= 4; // ellipses
  } else {
    return text;
  }

  const textPtr = exports.cm_sugar_text_ptr!();
  const u16In = new Uint16Array(exports.memory.buffer, textPtr, len);
  for (let i = 0; i < len; i++) {
    u16In[i] = text.charCodeAt(i);
  }

  const outLen = exports.cm_desugar_math!(len, flags);
  if (outLen === 0) {
    return text;
  }

  const outPtr = exports.cm_sugar_out_ptr!();
  const u16Out = new Uint16Array(exports.memory.buffer, outPtr, outLen);

  // Fast string construction from UTF-16 code units
  let result = "";
  const CHUNK_SIZE = 4096;
  for (let i = 0; i < outLen; i += CHUNK_SIZE) {
    const chunk = u16Out.subarray(i, Math.min(i + CHUNK_SIZE, outLen));
    result += String.fromCharCode.apply(null, Array.from(chunk));
  }

  return result;
}
