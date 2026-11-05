// src/parsers/wasm_catalog.ts
// Experimental WebAssembly Island 1: 9,342-Entry Lemire MPHF Catalog Engine.
// Dual-implementation safety: pure TypeScript remains default and active fallback.

export interface RawWasmExports {
  memory: WebAssembly.Memory;
  cm_scratch_ptr(): number;
  cm_lookup_catalog_slot(len: number, domains: number, dialects: number): number;
  cm_lookup_catalog_packed(len: number, domains: number, dialects: number): number;
  cm_catalog_count?(): number;
  cm_delim_text_ptr?(): number;
  cm_delim_output_ptr?(): number;
  cm_scan_delimiters?(len: number, includeBareBraces: number, highlightUnmatched: number): number;
  cm_lexer_text_ptr?(): number;
  cm_lexer_output_ptr?(): number;
  cm_lex_math_block?(len: number, domains: number, dialects: number, flags: number): number;
  cm_sugar_text_ptr?(): number;
  cm_sugar_out_ptr?(): number;
  cm_merkle_buf_ptr?(): number;
  cm_hash64_math?(len: number): bigint;
  cm_desugar_math?(len: number, flags: number): number;
  cm_merkle_root?(count: number): bigint;
  cm_cst_text_ptr?(): number;
  cm_cst_output_ptr?(): number;
  cm_cst_arena_ptr?(): number;
  cm_parse_cst?(len: number, domains: number, dialects: number, flags: number): number;
  cm_cst_collect_spans?(nodeCount: number): number;
}

let rawExports: RawWasmExports | null = null;
let scratchU16Index = 0;
let memoryU16: Uint16Array | null = null;
let isReady = false;

/**
 * Returns the active RawWasmExports instance if loaded and verified.
 */
export function getRawWasmExports(): RawWasmExports | null {
  return isReady ? rawExports : null;
}

/**
 * Returns whether the compiled WebAssembly MPHF catalog is loaded and operational.
 */
export function isWasmCatalogReady(): boolean {
  return isReady && rawExports !== null;
}

/**
 * Disables or unloads the WASM catalog (forces pure TypeScript path).
 */
export function disableWasmCatalog(): void {
  rawExports = null;
  scratchU16Index = 0;
  memoryU16 = null;
  isReady = false;
}

/**
 * Initializes the WASM catalog instance from an ArrayBuffer, Uint8Array, or compiled WebAssembly.Module.
 */
export async function initWasmCatalog(
  wasmSource?: ArrayBuffer | Uint8Array | WebAssembly.Module
): Promise<boolean> {
  try {
    if (!wasmSource) {
      disableWasmCatalog();
      return false;
    }

    let moduleInstance: WebAssembly.Instance;
    if (wasmSource instanceof WebAssembly.Module) {
      moduleInstance = await WebAssembly.instantiate(wasmSource, {});
    } else {
      const result = await WebAssembly.instantiate(wasmSource, {});
      moduleInstance = result.instance;
    }

    const exp = moduleInstance.exports as unknown as RawWasmExports;
    if (
      typeof exp.cm_scratch_ptr === "function" &&
      typeof exp.cm_lookup_catalog_slot === "function" &&
      exp.memory instanceof WebAssembly.Memory
    ) {
      rawExports = exp;
      scratchU16Index = exp.cm_scratch_ptr() >> 1;
      memoryU16 = new Uint16Array(exp.memory.buffer);
      isReady = true;
      return true;
    }
  } catch (err) {
    console.warn("[ColorMath WASM] Island 1 instantiation failed, staying on TypeScript engine:", err);
    disableWasmCatalog();
  }
  return false;
}

/**
 * Direct O(1) lookup against compiled WASM MPHF catalog.
 * Returns 0-indexed slot (0..9341) or -1 if no match.
 * Zero-allocation C-ABI via native UTF-16 code units placed in scratch buffer.
 */
export function lookupWasmCatalogSlot(
  token: string,
  activeDomains: number = 0xFFFFFFFF,
  activeDialects: number = 0xFFFFFFFF
): number {
  if (!isReady || !rawExports || !token) {
    return -1;
  }
  const len = token.length;
  if (len === 0 || len > 256) {
    return -1;
  }

  // Refresh buffer view if memory resized
  if (!memoryU16 || memoryU16.buffer !== rawExports.memory.buffer) {
    memoryU16 = new Uint16Array(rawExports.memory.buffer);
  }

  // Ultra-fast UTF-16 direct write (no transcoding, zero heap allocations)
  for (let i = 0; i < len; i++) {
    memoryU16[scratchU16Index + i] = token.charCodeAt(i);
  }

  return rawExports.cm_lookup_catalog_slot(len, activeDomains, activeDialects);
}

/**
 * Direct O(1) packed metadata lookup against compiled WASM MPHF catalog.
 * Returns 32-bit packed integer (Role, Priority, Tier, Arity, Slot) or 0xFFFFFFFF if not found.
 */
export function lookupWasmCatalogPacked(
  token: string,
  activeDomains: number = 0xFFFFFFFF,
  activeDialects: number = 0xFFFFFFFF
): number {
  if (!isReady || !rawExports || !token) {
    return 0xFFFFFFFF;
  }
  const len = token.length;
  if (len === 0 || len > 256) {
    return 0xFFFFFFFF;
  }

  if (!memoryU16 || memoryU16.buffer !== rawExports.memory.buffer) {
    memoryU16 = new Uint16Array(rawExports.memory.buffer);
  }

  for (let i = 0; i < len; i++) {
    memoryU16[scratchU16Index + i] = token.charCodeAt(i);
  }

  return rawExports.cm_lookup_catalog_packed(len, activeDomains, activeDialects);
}
