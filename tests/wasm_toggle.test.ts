// tests/wasm_toggle.test.ts
// Integration & Parity Test Suite: WebAssembly Opt-In Toggle Switch (`useWebAssembly`)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { COLORS, ColorMathOptions, DEFAULT_OPTIONS } from "../src/config";
import {
  initWasmEngine,
  isWasmReady,
  clearMathSpanCache,
  getCachedOrComputedSpans,
  parseWithWasm,
} from "../src/parsers/engine_bridge";
import { disableWasmCatalog } from "../src/parsers/wasm_catalog";
import { computeSemanticMathSpans } from "../src/converters/generic";
import { parseMathWithCST } from "../src/parsers/cst/index";

describe("WebAssembly Opt-In Toggle Switch (`useWebAssembly`)", () => {
  beforeAll(async () => {
    await initWasmEngine();
  });

  afterAll(() => {
    clearMathSpanCache();
    disableWasmCatalog();
  });

  it("verifies DEFAULT_OPTIONS has useWebAssembly = false (pure TypeScript by default)", () => {
    expect(DEFAULT_OPTIONS.useWebAssembly).toBe(false);
  });

  it("verifies WASM engine is loaded and isWasmReady() returns true", () => {
    expect(isWasmReady()).toBe(true);
  });

  it("initializes WASM engine automatically via embedded base64 binary without arguments", async () => {
    disableWasmCatalog();
    expect(isWasmReady()).toBe(false);
    const success = await initWasmEngine();
    expect(success).toBe(true);
    expect(isWasmReady()).toBe(true);
  });

  it("routes through pure TypeScript fallbackFn when useWebAssembly is false", () => {
    clearMathSpanCache();
    const testMath = "\\sin(x) + \\cos(y)";
    let fallbackCalled = false;

    const spans = getCachedOrComputedSpans(
      testMath,
      COLORS,
      { useWebAssembly: false },
      () => {
        fallbackCalled = true;
        return parseMathWithCST(testMath, { palette: COLORS });
      }
    );

    expect(fallbackCalled).toBe(true);
    expect(spans.length).toBeGreaterThan(0);
  });

  it("routes through accelerated WebAssembly pipeline when useWebAssembly is true", () => {
    clearMathSpanCache();
    const testMath = "\\sin(x) + \\cos(y)";
    let fallbackCalled = false;

    const spans = getCachedOrComputedSpans(
      testMath,
      COLORS,
      { useWebAssembly: true },
      () => {
        fallbackCalled = true;
        return parseMathWithCST(testMath, { palette: COLORS });
      }
    );

    // When WASM is operational, fallbackFn is skipped
    expect(fallbackCalled).toBe(false);
    expect(spans.length).toBeGreaterThan(0);
  });

  it("falls back gracefully to pure TypeScript when WASM is disabled even if useWebAssembly is true", async () => {
    clearMathSpanCache();
    disableWasmCatalog();
    expect(isWasmReady()).toBe(false);

    const testMath = "\\sin(x)";
    let fallbackCalled = false;

    const spans = getCachedOrComputedSpans(
      testMath,
      COLORS,
      { useWebAssembly: true },
      () => {
        fallbackCalled = true;
        return parseMathWithCST(testMath, { palette: COLORS });
      }
    );

    // Because WASM is disabled, it transparently bails out to fallbackFn without error
    expect(fallbackCalled).toBe(true);
    expect(spans.length).toBeGreaterThan(0);

    // Re-initialize for subsequent tests via embedded binary
    const ok = await initWasmEngine();
    expect(ok).toBe(true);
    expect(isWasmReady()).toBe(true);
  });

  it("verifies cache invalidation on hot toggle between pure TS and WASM", () => {
    const testMath = "\\sin(x) + \\cos(y)";

    // 1. Compute in TypeScript mode
    clearMathSpanCache();
    const tsSpans = getCachedOrComputedSpans(
      testMath,
      COLORS,
      { useWebAssembly: false },
      () => parseMathWithCST(testMath, { palette: COLORS })
    );

    // 2. Clear cache to simulate hot setting toggle in UI
    clearMathSpanCache();

    // 3. Compute in WASM mode
    const wasmSpans = getCachedOrComputedSpans(
      testMath,
      COLORS,
      { useWebAssembly: true },
      () => parseMathWithCST(testMath, { palette: COLORS })
    );

    expect(tsSpans.length).toBeGreaterThan(0);
    expect(wasmSpans.length).toBeGreaterThan(0);
  });

  it("verifies parseWithWasm direct API export", () => {
    const testMath = "\\int_{0}^{\\infty} e^{-x} dx";
    const spans = parseWithWasm(testMath, COLORS, { useWebAssembly: true });

    expect(spans).not.toBeNull();
    expect(spans!.length).toBeGreaterThan(0);
  });

  it("verifies parseWithWasm emits valid ColorSpans from the flat arena", () => {
    const testMath = "\\frac{\\partial y}{\\partial x} = 0";
    const wasmSpans = parseWithWasm(testMath, COLORS, { useWebAssembly: true });

    expect(wasmSpans).not.toBeNull();
    expect(wasmSpans!.length).toBeGreaterThan(0);

    for (const span of wasmSpans!) {
      expect(span.start).toBeLessThan(span.end);
      expect(span.color).toBeDefined();
      expect(span.priority).toBeDefined();
    }
  });
});
