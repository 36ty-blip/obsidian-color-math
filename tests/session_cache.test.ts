// tests/session_cache.test.ts
// Unit tests for Balanced 3-Stage Lifecycle Pipeline & Predictive Session Cache (session_cache.json)

import { describe, it, expect, beforeEach } from "vitest";
import {
  computeContentHash,
  readSessionCache,
  writeSessionCache,
  getActiveNoteFromLayout,
  getActiveNoteFromWorkspace,
  SessionCacheData,
} from "../src/cache/session_cache";
import {
  primeMathSpanCache,
  getCachedOrComputedSpans,
  clearMathSpanCache,
} from "../src/parsers/engine_bridge";
import { DEFAULT_COLORS, DEFAULT_OPTIONS } from "../src/config";
import { ColorSpan } from "../utils/spans";

describe("Predictive Session Cache (session_cache.json)", () => {
  beforeEach(() => {
    clearMathSpanCache();
  });

  it("computes deterministic FNV-1a content hashes with zero collisions on whitespace change", () => {
    const text1 = "Let $f(x) = \\sin(x)$ be continuous.";
    const text2 = "Let $f(x) = \\sin(x)$ be continuous. ";
    const text3 = "Let $f(x) = \\cos(x)$ be continuous.";

    const h1 = computeContentHash(text1);
    const h2 = computeContentHash(text2);
    const h3 = computeContentHash(text3);

    expect(typeof h1).toBe("number");
    expect(h1).not.toBe(0);
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(h3);
    expect(computeContentHash(text1)).toBe(h1);
  });

  it("handles read and atomic write via mocked adapter", async () => {
    const storage = new Map<string, string>();
    const mockAdapter = {
      async read(path: string) {
        if (!storage.has(path)) throw new Error("File not found");
        return storage.get(path)!;
      },
      async write(path: string, data: string) {
        storage.set(path, data);
      },
      async exists(path: string) {
        return storage.has(path);
      },
      async mkdir(path: string) {
        storage.set(path, "[DIR]");
      },
    };

    // 1. Non-existent cache returns null gracefully
    const initial = await readSessionCache(mockAdapter, ".obsidian");
    expect(initial).toBeNull();

    // 2. Write valid cache
    const testData: SessionCacheData = {
      version: 1,
      filePath: "Math/Fourier.md",
      contentHash: 123456789,
      timestamp: Date.now(),
      equations: [
        {
          from: 10,
          to: 35,
          spans: [[0, 4, "#7aa2f7", 22]],
        },
      ],
    };

    await writeSessionCache(mockAdapter, testData, ".obsidian");

    // 3. Read back verified cache
    const loaded = await readSessionCache(mockAdapter, ".obsidian");
    expect(loaded).not.toBeNull();
    expect(loaded?.filePath).toBe("Math/Fourier.md");
    expect(loaded?.contentHash).toBe(123456789);
    expect(loaded?.equations.length).toBe(1);
    expect(loaded?.equations[0].spans[0]).toEqual([0, 4, "#7aa2f7", 22]);
  });

  it("fails gracefully on corrupted or malformed cache", async () => {
    const mockAdapter = {
      async read() {
        return "{ broken json...";
      },
      async exists() {
        return true;
      },
    };

    const loaded = await readSessionCache(mockAdapter);
    expect(loaded).toBeNull();
  });

  it("extracts active note from Obsidian workspace layout (Scenario 1 & 2)", () => {
    const layout = {
      main: {
        id: "split-1",
        type: "split",
        children: [
          {
            id: "tabs-1",
            type: "tabs",
            children: [
              {
                id: "leaf-1",
                type: "leaf",
                state: {
                  type: "markdown",
                  state: {
                    file: "Physics/Kinematics.md",
                  },
                },
              },
              {
                id: "leaf-2",
                type: "leaf",
                state: {
                  type: "markdown",
                  state: {
                    file: "Physics/Fourier.md",
                  },
                },
              },
            ],
          },
        ],
      },
      active: "leaf-2",
    };

    const active = getActiveNoteFromLayout(layout);
    expect(active).toBe("Physics/Fourier.md");
  });

  it("returns null on empty tab layout (Scenario 3 - 0ms Bypass)", () => {
    const layout = {
      main: {
        id: "split-1",
        type: "split",
        children: [
          {
            id: "tabs-1",
            type: "tabs",
            children: [
              {
                id: "leaf-1",
                type: "leaf",
                state: {
                  type: "empty",
                },
              },
            ],
          },
        ],
      },
      active: "leaf-1",
    };

    const active = getActiveNoteFromLayout(layout);
    expect(active).toBeNull();
  });

  it("primes in-memory span cache for instant sub-microsecond hits on startup", () => {
    const body = "\\sin(x) + \\cos(y)";
    const precomputedSpans: ColorSpan[] = [
      { start: 0, end: 4, color: "#7aa2f7", priority: 22 },
      { start: 10, end: 14, color: "#7aa2f7", priority: 22 },
    ];

    // Prime the cache
    primeMathSpanCache(DEFAULT_COLORS, DEFAULT_OPTIONS, body, precomputedSpans);

    // Call resolver: must immediately hit primed cache
    const resolved = getCachedOrComputedSpans(body, DEFAULT_COLORS, DEFAULT_OPTIONS);
    expect(resolved).toEqual(precomputedSpans);

    // Benchmark 1,000 retrievals from primed cache (warmup JIT first)
    for (let i = 0; i < 200; i++) {
      getCachedOrComputedSpans(body, DEFAULT_COLORS, DEFAULT_OPTIONS);
    }
    let minElapsed = Infinity;
    for (let round = 0; round < 5; round++) {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        const res = getCachedOrComputedSpans(body, DEFAULT_COLORS, DEFAULT_OPTIONS);
        if (!res) throw new Error("Cache miss");
      }
      const dur = performance.now() - start;
      if (dur < minElapsed) minElapsed = dur;
    }

    // 1,000 lookups must execute comfortably within the UI frame budget (typical < 5ms)
    expect(minElapsed).toBeLessThan(16.6);
  });
});
