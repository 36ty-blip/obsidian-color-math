import { ColorPalette, ColorMathOptions, COLORS, RAINBOW_DELIMITER_COLORS } from "../config";
import type { DelimiterCollectorOptions } from "./delimiters";
import { ColorSpan, selectColorSpans } from "../utils/spans";
import { LruCache } from "../utils/lru_cache";
import { parseMathWithCST } from "./cst/index";

// Bounded LRU cache: maps `${optionsHash}::${mathBody}` -> ColorSpan[]
const mathSpanCache = new LruCache<string, ColorSpan[]>(1000);

export function isWasmReady(): boolean {
  return false;
}

export function clearMathSpanCache(): void {
  mathSpanCache.clear();
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

/**
 * Ensures strings are valid UTF-16 with no orphaned surrogates
 * before crossing the WebAssembly bridge into Rust.
 */
export function sanitizeToWellFormed(str: string): string {
  if (typeof (str as any).toWellFormed === "function") {
    return (str as any).toWellFormed();
  }
  return str.replace(
    /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF]))|(?:[^\uD800-\uDBFF]|^)([\uDC00-\uDFFF])/g,
    "\uFFFD"
  );
}

/**
 * Asynchronously initializes the WASM module from inlined Base64 or an optional buffer.
/**
 * Legacy stub: WASM engine is retired in favor of pure TypeScript CST engine.
 */
export async function initWasmEngine(_wasmBinary?: ArrayBuffer | Uint8Array): Promise<boolean> {
  return false;
}

/**
 * Legacy stub: Returns null as WASM is retired in favor of 14-discipline TypeScript CST engine.
 */
export function parseWithWasm(
  _body: string,
  _palette: ColorPalette = COLORS,
  _options?: ColorMathOptions
): ColorSpan[] | null {
  return null;
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
    } catch {}
  }
}


function getOptionsKey(palette: ColorPalette, options?: ColorMathOptions): string {
  const pId = Object.values(palette).join(",");
  if (!options) return pId;
  return [
    pId,
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
 * 2. If cache miss, tries WASM engine.
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

  // 1. Compute legacy spans from fallbackFn
  const legacySpans = fallbackFn();

  // 3. Augment with modular 14-discipline CST spans
  let cstSpans: ColorSpan[] = [];
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

  const spans = cstSpans.length > 0
    ? selectColorSpans(body, [...legacySpans, ...cstSpans])
    : legacySpans;

  mathSpanCache.set(cacheKey, spans);
  return spans;
}
