import { describe, it, expect, beforeEach } from "vitest";
import { LruCache } from "../src/utils/lru_cache";
import {
  initWasmEngine,
  isWasmReady,
  parseWithWasm,
  getCachedOrComputedSpans,
  clearMathSpanCache,
  sanitizeToWellFormed,
} from "../src/parsers/engine_bridge";
import { DEFAULT_COLORS } from "../src/config";
import fs from "fs";
import path from "path";

describe("LRU Cache Layer", () => {
  it("stores and retrieves cached values", () => {
    const cache = new LruCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBeUndefined();
  });

  it("evicts the least recently used item when capacity is reached", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    // Access 'a' to make 'b' the least recently used
    cache.get("a");
    cache.set("c", 3);

    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
    expect(cache.get("b")).toBeUndefined(); // 'b' was evicted
  });

  it("clears all cached entries", () => {
    const cache = new LruCache<string, number>(5);
    cache.set("x", 10);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get("x")).toBeUndefined();
  });
});

describe("UTF-16 Surrogate Pair Sanitizer", () => {
  it("leaves valid strings unmodified", () => {
    const str = "\\frac{dx}{dt} = \\omega x";
    expect(sanitizeToWellFormed(str)).toBe(str);
  });

  it("sanitizes orphaned lone surrogate halves without throwing", () => {
    const loneSurrogate = "foo\uD800bar";
    const sanitized = sanitizeToWellFormed(loneSurrogate);
    expect(() => {
      new TextEncoder().encode(sanitized);
    }).not.toThrow();
  });
});

describe("Engine Bridge Pure TypeScript & Caching", () => {
  beforeEach(() => {
    clearMathSpanCache();
  });

  it("confirms WASM is retired in favor of pure TypeScript", async () => {
    const success = await initWasmEngine();
    expect(success).toBe(false);
    expect(isWasmReady()).toBe(false);
    expect(parseWithWasm("\\int x dx", DEFAULT_COLORS)).toBeNull();
  });

  it("parses math equations via pure TypeScript CST and returns valid spans", () => {
    const latex = "\\int x dx = \\frac{1}{2} x^2";
    const spans = getCachedOrComputedSpans(latex, DEFAULT_COLORS, undefined, () => [
      { start: 0, end: 5, color: DEFAULT_COLORS.derivative, priority: 20 },
    ]);

    expect(spans).not.toBeNull();
    expect(Array.isArray(spans)).toBe(true);
    expect(spans.length).toBeGreaterThan(0);

    // Verify spans have valid offsets within bounds
    for (const span of spans) {
      expect(span.start).toBeGreaterThanOrEqual(0);
      expect(span.end).toBeLessThanOrEqual(latex.length);
      expect(span.start).toBeLessThan(span.end);
      expect(typeof span.color).toBe("string");
    }
  });

  it("serves repeated requests directly from the LRU cache", () => {
    let fallbackCallCount = 0;
    const fallback = () => {
      fallbackCallCount++;
      return [{ start: 0, end: 1, color: "red" }];
    };

    const latex = "\\sum_{i=1}^n i";
    
    // First call: computes via CST or fallback
    const spans1 = getCachedOrComputedSpans(latex, DEFAULT_COLORS, undefined, fallback);
    expect(spans1.length).toBeGreaterThan(0);

    // Second call with identical input: must hit cache immediately
    const prevCalls = fallbackCallCount;
    const spans2 = getCachedOrComputedSpans(latex, DEFAULT_COLORS, undefined, fallback);
    expect(spans2).toEqual(spans1);
    expect(fallbackCallCount).toBe(prevCalls); // Fallback was never touched
  });
});

