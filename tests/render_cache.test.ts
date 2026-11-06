// tests/render_cache.test.ts
// Unit tests for Zero-MathJax Persistent Render & Math AST Cache (render_cache.json)
// and Dynamic CSS Variable Role Binding (var(--color-math-role-*))

import { describe, it, expect, beforeEach } from "vitest";
import {
  computeSettingsFingerprint,
  readRenderCache,
  writeRenderCache,
  pruneRenderCache,
  sanitizeRenderCache,
  hydrateElementFromHtml,
  RenderCacheData,
} from "../src/cache/render_cache";
import {
  DEFAULT_COLORS,
  DEFAULT_OPTIONS,
  CSS_VARIABLE_PALETTE,
  getLiveCssPalette,
  syncPaletteToCss,
  setPalette,
  ColorPalette,
} from "../src/config";
import { MathJaxInterceptor, computeMathHash } from "../src/editor/mathjax_interceptor";

describe("Zero-MathJax Persistent Render Cache (render_cache.json)", () => {
  it("computes deterministic structural settings fingerprints immune to color hex mutations", () => {
    const opts1 = { ...DEFAULT_OPTIONS, activeMode: "standard" };
    const opts2 = { ...DEFAULT_OPTIONS, activeMode: "standard" };
    const optsDifferent = { ...DEFAULT_OPTIONS, activeMode: "complex", rainbowDelimiters: true };

    const fp1 = computeSettingsFingerprint(opts1);
    const fp2 = computeSettingsFingerprint(opts2);
    const fpDiff = computeSettingsFingerprint(optsDifferent);

    expect(typeof fp1).toBe("string");
    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fpDiff);
  });

  it("maps live rendering palette to dynamic CSS custom properties preserving 'none'", () => {
    const testPalette: ColorPalette = {
      ...DEFAULT_COLORS,
      main: "#7aa2f7",
      derivative: "#bb9af7",
      relation: "none",
      arithmetic: "none",
    };

    const live = getLiveCssPalette(testPalette);

    expect(live.main).toBe("var(--color-math-role-main)");
    expect(live.derivative).toBe("var(--color-math-role-derivative)");
    expect(live.relation).toBe("none");
    expect(live.arithmetic).toBe("none");
  });

  it("synchronizes palette to CSS custom properties on document element", () => {
    const properties = new Map<string, string>();
    const fakeDoc = {
      documentElement: {
        style: {
          setProperty(name: string, value: string) {
            properties.set(name, value);
          },
        },
      },
    };

    // Temporarily bind fake document for test
    const originalDoc = (globalThis as any).document;
    (globalThis as any).document = fakeDoc;

    try {
      syncPaletteToCss({
        ...DEFAULT_COLORS,
        main: "#ff007f",
        relation: "none",
      });

      expect(properties.get("--color-math-role-main")).toBe("#ff007f");
      expect(properties.get("--color-math-role-relation")).toBe("initial");
    } finally {
      (globalThis as any).document = originalDoc;
    }
  });

  it("handles read and atomic write of RenderCacheData (version 2) via mocked adapter", async () => {
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
    const initial = await readRenderCache(mockAdapter, ".obsidian");
    expect(initial).toBeNull();

    // 2. Write valid version 2 cache with renders and activeNote
    const testData: RenderCacheData = {
      version: 2,
      settingsFingerprint: "std|u1|d1",
      renders: {
        "hash_emc2": {
          html: `<mjx-container class="MathJax" jax="CHTML"><mjx-math><mjx-mstyle style="color: var(--color-math-role-main);"><mjx-mi>E</mjx-mi></mjx-mstyle></mjx-math></mjx-container>`,
          display: true,
          ts: 1000,
        },
      },
      activeNote: {
        filePath: "Physics/Relativity.md",
        contentHash: 987654321,
        timestamp: Date.now(),
        equations: [
          {
            from: 10,
            to: 25,
            spans: [[0, 1, "var(--color-math-role-main)", 20]],
          },
        ],
      },
    };

    await writeRenderCache(mockAdapter, testData, ".obsidian");

    // 3. Read back verified cache
    const loaded = await readRenderCache(mockAdapter, ".obsidian");
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(2);
    expect(loaded?.settingsFingerprint).toBe("std|u1|d1");
    expect(loaded?.renders["hash_emc2"]).toBeDefined();
    expect(loaded?.renders["hash_emc2"].html).toContain("var(--color-math-role-main)");
    expect(loaded?.activeNote?.filePath).toBe("Physics/Relativity.md");
  });

  it("transparently migrates legacy session_cache.json (version 1) to version 2 schema", async () => {
    const storage = new Map<string, string>();
    const legacyPath = ".obsidian/plugins/color-math/cache/session_cache.json";
    storage.set(
      legacyPath,
      JSON.stringify({
        version: 1,
        filePath: "Math/Calculus.md",
        contentHash: 555666777,
        timestamp: 1234567,
        equations: [
          {
            from: 0,
            to: 10,
            spans: [[0, 3, "#7aa2f7", 20]],
          },
        ],
      })
    );

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
    };

    const loaded = await readRenderCache(mockAdapter, ".obsidian");
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(2);
    expect(loaded?.activeNote?.filePath).toBe("Math/Calculus.md");
    expect(loaded?.activeNote?.contentHash).toBe(555666777);
    expect(loaded?.renders).toEqual({});
  });

  it("prunes oldest renders when exceeding maxEntries ceiling (LRU eviction)", () => {
    const data: RenderCacheData = {
      version: 2,
      settingsFingerprint: "test",
      renders: {
        eq1: { html: "<div1>", display: false, ts: 100 },
        eq2: { html: "<div2>", display: false, ts: 200 },
        eq3: { html: "<div3>", display: false, ts: 300 },
        eq4: { html: "<div4>", display: false, ts: 400 },
      },
    };

    pruneRenderCache(data, 2);

    expect(Object.keys(data.renders).length).toBe(2);
    expect(data.renders["eq1"]).toBeUndefined();
    expect(data.renders["eq2"]).toBeUndefined();
    expect(data.renders["eq3"]).toBeDefined();
    expect(data.renders["eq4"]).toBeDefined();
  });

  it("hydrates DOM element from cached HTML string in mock DOM environment", () => {
    const fakeTemplate = {
      innerHTML: "",
      content: {
        firstElementChild: {
          tagName: "MJX-CONTAINER",
          outerHTML: `<mjx-container class="MathJax"><mjx-math>x</mjx-math></mjx-container>`,
          cloneNode(deep: boolean) {
            return { ...this };
          },
        },
      },
    };

    const originalDoc = (globalThis as any).document;
    (globalThis as any).document = {
      createElement(tag: string) {
        if (tag === "template") return fakeTemplate;
        return {};
      },
    };

    try {
      const el = hydrateElementFromHtml<any>(fakeTemplate.content.firstElementChild.outerHTML);
      expect(el).not.toBeNull();
      expect(el.tagName).toBe("MJX-CONTAINER");
    } finally {
      (globalThis as any).document = originalDoc;
    }
  });

  it("MathJaxInterceptor hits persistent render cache and bypasses MathJax completely", async () => {
    let mathJaxCalled = false;
    const fakeMathJax = {
      tex2chtml(latex: string, options?: any) {
        mathJaxCalled = true;
        return {
          tagName: "MJX-CONTAINER",
          outerHTML: `<mjx-container><mjx-math>${latex}</mjx-math></mjx-container>`,
          setAttribute: () => {},
          querySelectorAll: () => [],
          cloneNode: function() { return { ...this }; },
        } as any;
      },
    };

    (globalThis as any).window = { MathJax: fakeMathJax };

    const interceptor = new MathJaxInterceptor(
      () => DEFAULT_COLORS,
      () => DEFAULT_OPTIONS,
      () => true,
      () => "inline"
    );

    const testLatex = "\\int_0^1 f(x) dx";
    const testHash = computeMathHash(testLatex, (interceptor as any).getContextKey() + "|D");

    // Seed persistent cache with pre-rendered HTML
    const persistentCache: RenderCacheData = {
      version: 2,
      settingsFingerprint: "test",
      renders: {
        [testHash]: {
          html: `<mjx-container class="MathJax" jax="CHTML"><mjx-math data-cached="true">TEST_HYDRATED</mjx-math></mjx-container>`,
          display: true,
          ts: Date.now(),
        },
      },
    };

    // Mock document template for hydration
    const originalDoc = (globalThis as any).document;
    (globalThis as any).document = {
      createElement(tag: string) {
        if (tag === "template") {
          const t: any = {
            innerHTML: "",
            content: {
              get firstElementChild() {
                return {
                  tagName: "MJX-CONTAINER",
                  outerHTML: t.innerHTML,
                  cloneNode: function() { return { ...this }; },
                  setAttribute: () => {},
                  querySelectorAll: () => [],
                };
              },
            },
          };
          return t;
        }
        return {};
      },
    };

    try {
      interceptor.setPersistentCache(persistentCache);
      await interceptor.install();

      mathJaxCalled = false;
      const result = fakeMathJax.tex2chtml(testLatex, { display: true });

      // Verifies MathJax was NEVER called — returned straight from persistent cache!
      expect(mathJaxCalled).toBe(false);
      expect(result).toBeDefined();
      expect((result as any).outerHTML).toContain("TEST_HYDRATED");
    } finally {
      (globalThis as any).document = originalDoc;
      delete (globalThis as any).window;
    }
  });

  it("enforces Write Gate: never caches MathJax error nodes and purges any existing entry", async () => {
    let errorReturned = true;
    const fakeMathJax = {
      tex2chtml(latex: string, options?: any) {
        if (errorReturned) {
          return {
            tagName: "MJX-CONTAINER",
            getAttribute: (attr: string) => (attr === "data-mjx-error" ? "Syntax error" : null),
            querySelector: (sel: string) => ({
              getAttribute: () => "Syntax error",
              textContent: "Misplaced &",
            }),
            outerHTML: `<mjx-container data-mjx-error="Syntax error"><mjx-merror>Misplaced &</mjx-merror></mjx-container>`,
          } as any;
        }
        return {
          tagName: "MJX-CONTAINER",
          getAttribute: () => null,
          querySelector: () => null,
          outerHTML: `<mjx-container><mjx-math>CLEAN</mjx-math></mjx-container>`,
        } as any;
      },
    };

    (globalThis as any).window = { MathJax: fakeMathJax };

    const interceptor = new MathJaxInterceptor(
      () => DEFAULT_COLORS,
      () => DEFAULT_OPTIONS,
      () => true,
      () => "native"
    );

    const persistentCache: RenderCacheData = {
      version: 2,
      settingsFingerprint: "test",
      renders: {},
    };

    try {
      interceptor.setPersistentCache(persistentCache);
      await interceptor.install();

      const testLatex = "\\begin{align} & \\end{align}";
      const res = fakeMathJax.tex2chtml(testLatex);

      // Verify the result is returned, BUT persistent cache is EMPTY (Write Gate prevented error caching)
      expect(res).toBeDefined();
      expect(Object.keys(persistentCache.renders).length).toBe(0);
    } finally {
      delete (globalThis as any).window;
    }
  });

  it("enforces Read Gate: auto-purges poisoned error records upon retrieval from disk cache", async () => {
    let mathJaxCalled = false;
    const fakeMathJax = {
      tex2chtml(latex: string, options?: any) {
        mathJaxCalled = true;
        return {
          tagName: "MJX-CONTAINER",
          getAttribute: () => null,
          querySelector: () => null,
          outerHTML: `<mjx-container><mjx-math>RE_RENDERED_FRESH</mjx-math></mjx-container>`,
        } as any;
      },
    };

    (globalThis as any).window = { MathJax: fakeMathJax };

    const interceptor = new MathJaxInterceptor(
      () => DEFAULT_COLORS,
      () => DEFAULT_OPTIONS,
      () => true,
      () => "inline"
    );

    const testLatex = "x = 1";
    const testHash = computeMathHash(testLatex, (interceptor as any).getContextKey() + "|I");

    // Poison the persistent cache with a legacy error node
    const persistentCache: RenderCacheData = {
      version: 2,
      settingsFingerprint: "test",
      renders: {
        [testHash]: {
          html: `<mjx-container data-mjx-error="Legacy error"><mjx-merror>Misplaced &</mjx-merror></mjx-container>`,
          display: false,
          ts: Date.now(),
        },
      },
    };

    const originalDoc = (globalThis as any).document;
    (globalThis as any).document = {
      createElement(tag: string) {
        if (tag === "template") {
          const t: any = {
            innerHTML: "",
            content: {
              get firstElementChild() {
                return {
                  tagName: "MJX-CONTAINER",
                  outerHTML: t.innerHTML,
                  getAttribute: (attr: string) => (attr === "data-mjx-error" ? "Legacy error" : null),
                  querySelector: (sel: string) => ({
                    getAttribute: () => "Legacy error",
                    textContent: "Misplaced &",
                  }),
                };
              },
            },
          };
          return t;
        }
        return {};
      },
    };

    try {
      interceptor.setPersistentCache(persistentCache);
      await interceptor.install();

      expect(persistentCache.renders[testHash]).toBeDefined();

      // Step 1: getCachedElement directly detects error node, purges it from disk cache, and returns null
      const cached = (interceptor as any).getCachedElement(testHash, testLatex);
      expect(cached).toBeNull();
      expect(persistentCache.renders[testHash]).toBeUndefined();

      // Step 2: wrapped tex2chtml now falls through to MathJax and re-renders clean
      const res = fakeMathJax.tex2chtml(testLatex);
      expect(mathJaxCalled).toBe(true);
      expect((res as any).outerHTML).toContain("RE_RENDERED_FRESH");
      expect(persistentCache.renders[testHash].html).toContain("RE_RENDERED_FRESH");
      expect(persistentCache.renders[testHash].html).not.toContain("Misplaced &");
    } finally {
      (globalThis as any).document = originalDoc;
      delete (globalThis as any).window;
    }
  });

  it("isolates cache namespaces across plugin versions", () => {
    const interceptor = new MathJaxInterceptor(
      () => DEFAULT_COLORS,
      () => DEFAULT_OPTIONS,
      () => true,
      () => "inline"
    );

    interceptor.setPluginVersion("1.0.106");
    const key1 = (interceptor as any).getContextKey();

    interceptor.setPluginVersion("1.0.107");
    const key2 = (interceptor as any).getContextKey();

    expect(key1).toContain("v:1.0.106");
    expect(key2).toContain("v:1.0.107");
    expect(key1).not.toBe(key2);

    const fp1 = computeSettingsFingerprint(DEFAULT_OPTIONS, "1.0.106");
    const fp2 = computeSettingsFingerprint(DEFAULT_OPTIONS, "1.0.107");
    expect(fp1).toContain("v:1.0.106");
    expect(fp2).toContain("v:1.0.107");
    expect(fp1).not.toBe(fp2);
  });

  it("sanitizes poisoned syntax errors and error banners from persistent cache data", () => {
    const data: RenderCacheData = {
      version: 2,
      settingsFingerprint: "test",
      renders: {
        clean1: { html: "<mjx-container><mjx-math>clean</mjx-math></mjx-container>", ts: 100 },
        error1: { html: '<mjx-container title="Color Math Error: Misplaced &"></mjx-container>', ts: 101 },
        error2: { html: '<mjx-container data-mjx-error="Syntax error"></mjx-container>', ts: 102 },
        error3: { html: '<mjx-container><mjx-merror>Error</mjx-merror></mjx-container>', ts: 103 },
        empty: { html: "   ", ts: 104 },
      },
    };

    sanitizeRenderCache(data);

    expect(data.renders.clean1).toBeDefined();
    expect(data.renders.error1).toBeUndefined();
    expect(data.renders.error2).toBeUndefined();
    expect(data.renders.error3).toBeUndefined();
    expect(data.renders.empty).toBeUndefined();
  });

  it("never persists ephemeral floating math tooltip renders to disk", async () => {
    const fakeMathJax = {
      tex2chtml(latex: string, options?: any) {
        return {
          tagName: "MJX-CONTAINER",
          outerHTML: `<mjx-container class="MathJax">${latex}</mjx-container>`,
          cloneNode: () => ({ outerHTML: `<mjx-container class="MathJax">${latex}</mjx-container>` }),
          setAttribute: () => {},
          getAttribute: () => null,
          querySelector: () => null,
        } as any;
      },
    };

    const originalDoc = (globalThis as any).document;
    (globalThis as any).document = {
      createElement: () => ({ setAttribute: () => {} }),
      head: { querySelector: () => ({ textContent: "long stylesheet rule content exceeding 50 chars for test" }) },
    };
    (globalThis as any).window = { MathJax: fakeMathJax };

    const interceptor = new MathJaxInterceptor(
      () => DEFAULT_COLORS,
      () => DEFAULT_OPTIONS,
      () => true,
      () => "inline"
    );

    const persistentCache: RenderCacheData = {
      version: 2,
      settingsFingerprint: "test",
      renders: {},
    };

    try {
      interceptor.setPersistentCache(persistentCache);
      await interceptor.install();

      // Tooltip renders with ephemeral: true
      const testLatex = "x + y";
      fakeMathJax.tex2chtml(testLatex, { display: true, ephemeral: true });

      // In-memory cache has it for fast live tooltip hover
      const hash = computeMathHash(testLatex, (interceptor as any).getContextKey() + "|D");
      expect((interceptor as any).renderCache.has(hash)).toBe(true);

      // BUT persistent disk cache has ZERO entries (never polluted by in-flight typing!)
      expect(persistentCache.renders[hash]).toBeUndefined();
      expect(Object.keys(persistentCache.renders).length).toBe(0);
    } finally {
      (globalThis as any).document = originalDoc;
      delete (globalThis as any).window;
    }
  });

  it("bypasses persistent cache when MathJax stylesheet in head is empty or unmounted", async () => {
    let mathJaxCalled = false;
    const fakeMathJax = {
      tex2chtml(latex: string, options?: any) {
        mathJaxCalled = true;
        return {
          tagName: "MJX-CONTAINER",
          outerHTML: `<mjx-container class="MathJax">COMPILED_BY_MATHJAX</mjx-container>`,
          cloneNode: () => ({ outerHTML: `<mjx-container class="MathJax">COMPILED_BY_MATHJAX</mjx-container>` }),
          setAttribute: () => {},
          getAttribute: () => null,
          querySelector: () => null,
        } as any;
      },
    };

    // Simulate empty stylesheet in head (e.g. right after reload or cold boot)
    const originalDoc = (globalThis as any).document;
    (globalThis as any).document = {
      createElement: () => ({ setAttribute: () => {} }),
      head: {
        querySelector: (sel: string) => {
          if (sel === "style#MJX-CHTML-styles") return { textContent: "" }; // Empty!
          return null;
        },
      },
    };
    (globalThis as any).window = { MathJax: fakeMathJax };

    const interceptor = new MathJaxInterceptor(
      () => DEFAULT_COLORS,
      () => DEFAULT_OPTIONS,
      () => true,
      () => "inline"
    );

    const testLatex = "e^{i\\pi} + 1 = 0";
    const testHash = computeMathHash(testLatex, (interceptor as any).getContextKey() + "|D");
    const persistentCache: RenderCacheData = {
      version: 2,
      settingsFingerprint: "test",
      renders: {
        [testHash]: {
          html: `<mjx-container class="MathJax">CACHED_UNSTYLED_HTML</mjx-container>`,
          display: true,
          ts: Date.now(),
        },
      },
    };

    try {
      interceptor.setPersistentCache(persistentCache);
      await interceptor.install();

      // Because stylesheet is empty, getCachedElement must return null and fall through to MathJax
      const res = fakeMathJax.tex2chtml(testLatex, { display: true });
      expect(mathJaxCalled).toBe(true);
      expect((res as any).outerHTML).toContain("COMPILED_BY_MATHJAX");
    } finally {
      (globalThis as any).document = originalDoc;
      delete (globalThis as any).window;
    }
  });
});
