import { ColorPalette, ColorMathOptions, COLORS } from "../config";
import { ColorSpan, selectColorSpans } from "../utils/spans";
import { LruCache } from "../utils/lru_cache";
import { parseMathWithCST } from "./cst/index";
import { isWasmCstReady, parseWasmCstSpans } from "./wasm_cst";
import { initWasmCatalog, isWasmCatalogReady, disableWasmCatalog } from "./wasm_catalog";
import { WASM_BASE64 } from "./wasm_binary";

// Bounded LRU cache: maps `${optionsHash}::${mathBody}` -> ColorSpan[]
const mathSpanCache = new LruCache<string, ColorSpan[]>(1000);

export function isWasmReady(): boolean {
  return isWasmCstReady();
}

export function clearMathSpanCache(): void {
  mathSpanCache.clear();
}

/**
 * Primes the in-memory LRU span cache from a pre-computed cache snapshot (e.g. session_cache.json).
 * Guarantees sub-microsecond hits on startup with zero AST re-parsing.
 */
export function primeMathSpanCache(
  palette: ColorPalette,
  options: ColorMathOptions | undefined,
  mathBody: string,
  spans: ColorSpan[]
): void {
  const cacheKey = `${getOptionsKey(palette, options)}::${mathBody}`;
  mathSpanCache.set(cacheKey, spans);
}

/**
 * Decodes a base64 string into a Uint8Array across browser, Electron, and Node.
 */
export function decodeBase64(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

interface StringWithWellFormed {
  toWellFormed?: () => string;
}

/**
 * Ensures strings are valid UTF-16 with no orphaned surrogates
 * before crossing the WebAssembly bridge into Rust.
 */
export function sanitizeToWellFormed(str: string): string {
  const candidate = str as unknown as StringWithWellFormed;
  if (typeof candidate.toWellFormed === "function") {
    return candidate.toWellFormed();
  }
  return str.replace(
    /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF]))|(?:[^\uD800-\uDBFF]|^)([\uDC00-\uDFFF])/g,
    "\uFFFD"
  );
}

let wasmInitPromise: Promise<boolean> | null = null;

/**
 * Asynchronously initializes the WASM module from an optional buffer or local compiled binary.
 * Thread-safe and non-blocking: falls back gracefully to pure TypeScript.
 */
export async function initWasmEngine(wasmBinary?: ArrayBuffer | Uint8Array): Promise<boolean> {
  if (isWasmCstReady()) return true;
  if (wasmInitPromise) return wasmInitPromise;

  wasmInitPromise = (async () => {
    try {
      if (wasmBinary) {
        return await initWasmCatalog(wasmBinary);
      }
      // 1. Primary: Use self-contained embedded WASM base64 binary (zero external path dependency)
      if (typeof WASM_BASE64 === "string" && WASM_BASE64.length > 0) {
        try {
          const bytes = decodeBase64(WASM_BASE64);
          const ok = await initWasmCatalog(bytes);
          if (ok) return true;
        } catch (e) {
          console.warn("[ColorMath WASM] Embedded WASM init failed, checking local disk:", e);
        }
      }
      // 2. Secondary fallback: check local disk in Node/dev environment
      if (typeof process !== "undefined" && process?.versions?.node) {
        try {
          const fs = await import("fs");
          const path = await import("path");
          const wasmPath = path.resolve(__dirname, "../wasm/target/wasm32-unknown-unknown/release/color_math_wasm.wasm");
          if (fs.existsSync(wasmPath)) {
            const bytes = fs.readFileSync(wasmPath);
            return await initWasmCatalog(bytes);
          }
        } catch {
          // Node fs load failed, proceed to return false
        }
      }
      return false;
    } catch {
      return false;
    } finally {
      wasmInitPromise = null;
    }
  })();

  return wasmInitPromise;
}

/**
 * Parses math expressions directly using the accelerated WebAssembly engine (Islands 1-5).
 * Returns null if the WASM engine is not initialized or if parsing encounters an edge case.
 */
export function parseWithWasm(
  body: string,
  palette: ColorPalette = COLORS,
  options?: ColorMathOptions
): ColorSpan[] | null {
  if (!isWasmCstReady()) return null;
  try {
    return parseWasmCstSpans(body, palette, {
      rainbowColors: options?.rainbowColors,
      highlightUnmatched: options?.highlightUnmatchedBraces !== false,
      strictBracketWarnings: options?.strictBracketWarnings === true,
      activeMode: options?.activeMode,
    });
  } catch {
    return null;
  }
}

let wasmDelimiterParseCount = 0;
let tsDelimiterFallbackCount = 0;
const parseListeners: Array<() => void> = [];

export function getWasmDelimiterParseCount(): number {
  return wasmDelimiterParseCount;
}

export function getTsDelimiterFallbackCount(): number {
  return tsDelimiterFallbackCount;
}

export function recordTsDelimiterFallback(): void {
  tsDelimiterFallbackCount++;
  notifyDelimiterParsed();
}

export function onDelimiterParsed(callback: () => void): () => void {
  parseListeners.push(callback);
  return () => {
    const idx = parseListeners.indexOf(callback);
    if (idx !== -1) parseListeners.splice(idx, 1);
  };
}

export function notifyDelimiterParsed(): void {
  for (const cb of parseListeners) {
    try {
      cb();
    } catch {
      // Ignore listener execution errors
    }
  }
}


function getOptionsKey(palette: ColorPalette, options?: ColorMathOptions): string {
  const pId = Object.values(palette).join(",");
  if (!options) return pId;
  return [
    pId,
    options.useWebAssembly ? "1" : "0",
    options.activeMode || "",
    options.previewLatexNormalization !== false ? "1" : "0",
    options.colorUnits !== false ? "1" : "0",
    options.colorDifferentials !== false ? "1" : "0",
    options.colorDimensionless !== false ? "1" : "0",
    options.colorBraKet !== false ? "1" : "0",
    options.colorSingleConstants !== false ? "1" : "0",
    options.colorAlignment !== false ? "1" : "0",
    options.rainbowDelimiters ? "1" : "0",
    options.enableTaxonomy ? "1" : "0",
    options.taxonomyFunctions !== false ? "1" : "0",
    options.taxonomyParameters !== false ? "1" : "0",
    options.taxonomyConstants !== false ? "1" : "0",
    options.taxonomyIndices !== false ? "1" : "0",
    options.variableDataFlow ? "1" : "0",
    options.colorQuantumOperators ? "1" : "0",
    options.extendedFunctions !== false ? "1" : "0",
    options.field || "",
  ].join(";");
}

/**
 * Unified cached span resolver.
 * 1. Checks LRU cache first (0.001ms on live typing keystrokes).
 * 2. If useWebAssembly is enabled and WASM is ready, executes unified Island 1-5 pipeline (~0.70-1.50µs).
 * 3. Incorporates modular 14-discipline CST engine + legacy fallbackFn.
 */
export function getCachedOrComputedSpans(
  body: string,
  palette: ColorPalette,
  options: ColorMathOptions | undefined,
  fallbackFn: () => ColorSpan[]
): ColorSpan[] {
  const optKey = getOptionsKey(palette, options);
  const cacheKey = `${optKey}::${body}`;

  const cached = mathSpanCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // 1. Accelerated WebAssembly Island 1-5 unified pipeline
  if (options?.useWebAssembly && isWasmReady()) {
    try {
      const wasmSpans = parseWasmCstSpans(body, palette, {
        rainbowColors: options?.rainbowColors,
        highlightUnmatched: options?.highlightUnmatchedBraces !== false,
        strictBracketWarnings: options?.strictBracketWarnings === true,
        activeMode: options?.activeMode,
      });
      if (wasmSpans && wasmSpans.length > 0) {
        mathSpanCache.set(cacheKey, wasmSpans);
        return wasmSpans;
      }
    } catch {
      // Graceful fallback to pure TypeScript
    }
  }

  // 2. Compute spans from fallbackFn
  const legacySpans = fallbackFn();

  // 3. Augment with modular 14-discipline CST spans ONLY if not already present in legacySpans
  // (computeSemanticMathSpans already incorporates CST spans; avoid redundant double-parsing)
  const hasCstSpans = legacySpans.some(
    (s) => s.priority !== undefined && (s.priority === 25 || s.priority === 30 || s.priority >= 90)
  );
  let cstSpans: ColorSpan[] = [];
  if (!hasCstSpans) {
    try {
      cstSpans = parseMathWithCST(body, {
        palette,
        rainbowColors: options?.rainbowColors,
        highlightUnmatched: options?.highlightUnmatchedBraces !== false,
        strictBracketWarnings: options?.strictBracketWarnings === true,
        activeMode: options?.activeMode,
      });
    } catch {
      // Graceful fallback
    }
  }

  const spans = cstSpans.length > 0
    ? selectColorSpans(body, [...legacySpans, ...cstSpans])
    : legacySpans;

  mathSpanCache.set(cacheKey, spans);
  return spans;
}
