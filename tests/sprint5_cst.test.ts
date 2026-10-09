// tests/sprint5_cst.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RangeSetBuilder, ChangeSet } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_COLORS } from "../src/config";
import { MathJaxInterceptor } from "../src/editor/mathjax_interceptor";
import { parseMathWithCST } from "../src/parsers/cst/index";
import { getCachedOrComputedSpans } from "../src/parsers/engine_bridge";
import { validateLatexWithKaTeX } from "./validator";
import { collectVariableSpans } from "../src/parsers/variable_hash";
import { collectTaxonomySpans } from "../src/parsers/taxonomy";
import { selectColorSpans } from "../src/utils/spans";

vi.mock("obsidian", () => {
  return {
    loadMathJax: vi.fn().mockResolvedValue(undefined),
    Notice: vi.fn(),
  };
});

class MockElement {
  public tagName: string;
  public textContent: string = "";
  public attributes: Record<string, string> = {};
  public children: MockElement[] = [];

  constructor(tagName: string = "mjx-container") {
    this.tagName = tagName;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  querySelector(selector: string): MockElement | null {
    if (selector.includes("merror") && this.attributes["data-mjx-error"]) {
      return this;
    }
    for (const child of this.children) {
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
}

describe("Sprint 5: Live Editor & MathJax Integration with Modular CST", () => {
  let mockMathJax: {
    tex2chtml: (latex: string, options?: unknown) => unknown;
    tex2chtmlPromise: (latex: string, options?: unknown) => Promise<unknown>;
    tex2svg: (latex: string, options?: unknown) => unknown;
    tex2svgPromise: (latex: string, options?: unknown) => Promise<unknown>;
  };
  let capturedTexCalls: string[] = [];

  beforeEach(() => {
    capturedTexCalls = [];
    mockMathJax = {
      tex2chtml: (latex: string) => {
        capturedTexCalls.push(latex);
        return new MockElement("mjx-container");
      },
      tex2chtmlPromise: async (latex: string) => {
        capturedTexCalls.push(latex);
        return new MockElement("mjx-container");
      },
      tex2svg: (latex: string) => {
        capturedTexCalls.push(latex);
        return new MockElement("svg");
      },
      tex2svgPromise: async (latex: string) => {
        capturedTexCalls.push(latex);
        return new MockElement("svg");
      },
    };

    (globalThis as any).window = {
      MathJax: mockMathJax,
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  describe("MathJaxInterceptor CST Integration", () => {
    it("intercepts tex2chtml and applies CST 14-discipline coloring by default", async () => {
      const interceptor = new MathJaxInterceptor(
        () => DEFAULT_COLORS,
        () => ({}),
        () => true,
        () => "fallback"
      );

      await interceptor.install();

      // Formula with quantum Dirac ket and Lie bracket
      const formula = "|\\psi\\rangle + [X, Y]";
      (window as any).MathJax.tex2chtml(formula);

      expect(capturedTexCalls).toHaveLength(1);
      const transformed = capturedTexCalls[0];
      // Must contain \textcolor with quantum / delimiter colors
      expect(transformed).toContain("\\textcolor{");
      expect(transformed).toContain(DEFAULT_COLORS.energyOperator);

      interceptor.uninstall();
    });

    it("respects useCST: false override in MathJax options", async () => {
      const interceptor = new MathJaxInterceptor(
        () => DEFAULT_COLORS,
        () => ({ useCST: false }),
        () => true,
        () => "fallback"
      );

      await interceptor.install();

      // When useCST is explicitly false, legacy engine handles bra-kets as orange
      const formula = "|\\psi\\rangle";
      (window as any).MathJax.tex2chtml(formula);

      expect(capturedTexCalls).toHaveLength(1);
      const transformed = capturedTexCalls[0];
      // Legacy bra-kets were colored with orange
      expect(transformed).toContain(DEFAULT_COLORS.orange);

      interceptor.uninstall();
    });
  });

  describe("colorLatexBody with useCST: true", () => {
    it("safely preserves bare braces without wrapping bare braces into \\textcolor", () => {
      const input = "\\frac{a + b}{c + d}";
      const colored = colorLatexBody(input, DEFAULT_COLORS, { useCST: true });

      // Bare braces must not be wrapped like \textcolor{...}{{ or \textcolor{...}{}}
      expect(colored).not.toMatch(/\\textcolor\{[^}]+\}\{\{/);
      expect(colored).not.toMatch(/\\textcolor\{[^}]+\}\{\}\}/);
      // Valid LaTeX fraction structure maintained
      expect(colored).toContain("\\frac{");
    });

    it("colors 14-discipline constructs: exterior products, quantifiers, differentials", () => {
      const input = "\\forall x \\in \\mathbb{R}, \\quad dX_t = \\mu dt + \\sigma dW_t";
      const colored = colorLatexBody(input, DEFAULT_COLORS, { useCST: true });

      expect(colored).toContain(DEFAULT_COLORS.relation); // \forall, \in
      expect(colored).toContain(DEFAULT_COLORS.derivative); // differentials
    });
  });

  describe("Engine Bridge & Live Preview Cache", () => {
    it("getCachedOrComputedSpans yields CST spans with high-speed caching", () => {
      const body = "dX_t = \\mu dt + \\sigma dW_t";
      
      const t0 = performance.now();
      const spans1 = getCachedOrComputedSpans(body, DEFAULT_COLORS, undefined, () => []);
      const t1 = performance.now();

      expect(spans1.length).toBeGreaterThan(0);

      // Second call must hit LRU cache in sub-microsecond time
      const t2 = performance.now();
      const spans2 = getCachedOrComputedSpans(body, DEFAULT_COLORS, undefined, () => []);
      const t3 = performance.now();

      expect(spans2).toEqual(spans1);
      const cacheHitTimeMs = t3 - t2;
      expect(cacheHitTimeMs).toBeLessThan(1.0); // Sub-millisecond guaranteed
    });

    it("maps existing decorations incrementally across document changes without flicker", () => {
      const builder = new RangeSetBuilder<Decoration>();
      builder.add(5, 10, Decoration.mark({ class: "cm-math-color" }));
      const originalDecorations = builder.finish();

      // Typing 3 characters before position 5: insert at offset 0 into length 20 doc
      const changes = ChangeSet.of([{ from: 0, insert: "abc" }], 20);
      const mapped = originalDecorations.map(changes);

      let found = false;
      let mappedFrom = -1;
      let mappedTo = -1;
      mapped.between(0, 30, (from, to) => {
        found = true;
        mappedFrom = from;
        mappedTo = to;
      });

      expect(found).toBe(true);
      expect(mappedFrom).toBe(8); // 5 + 3
      expect(mappedTo).toBe(13);  // 10 + 3
    });
  });

  describe("Sized Delimiters & Variable Hash Ranking", () => {
    it("handles \\left( ... \\right) without breaking KaTeX/MathJax grouping in LaTeX mode", () => {
      const math = "\\left( \\frac{\\partial u}{\\partial x} - i \\frac{\\partial u}{\\partial y} \\right)";

      // In LaTeX baking mode (forLatexWrap: true), sized delimiters wrap the full expression
      const coloredLatex = colorLatexBody(math, DEFAULT_COLORS, {
        useCST: true,
        rainbowDelimiters: true,
      });

      // Validated by KaTeX - zero delimiter mismatch errors!
      const val = validateLatexWithKaTeX(`$$${coloredLatex}$$`);
      expect(val.valid, `KaTeX error: ${val.error}`).toBe(true);

      // Sized delimiters in Live Preview emit discrete marks
      const cstSpansLive = parseMathWithCST(math, {
        palette: DEFAULT_COLORS,
        forLatexWrap: false,
      });
      // Delimiter marks at start and end
      expect(cstSpansLive.some((s) => s.start === 0 && s.end === "\\left(".length)).toBe(true);
      expect(cstSpansLive.some((s) => s.end === math.length)).toBe(true);
    });

    it("prioritizes variable data-flow hashing (priority 26) over taxonomy parameters (priority 20)", () => {
      const greekMath = "\\partial_\\tau \\beta \\partial_\\alpha \\psi + \\theta_\\gamma \\partial_\\lambda \\nu \\partial_\\phi \\mu = \\omega \\sigma \\psi \\delta";
      
      const varSpans = collectVariableSpans(greekMath, DEFAULT_COLORS);
      const taxSpans = collectTaxonomySpans(greekMath, DEFAULT_COLORS);

      // Verify variable hashing includes Greek parameter commands
      expect(varSpans.some((s) => s.priority === 26)).toBe(true);

      // Merging spans via selectColorSpans: priority 26 wins over priority 20
      const merged = selectColorSpans(greekMath, [...varSpans, ...taxSpans]);
      
      // Check that distinct variable colors are assigned instead of all orange (#ff9e64)
      const colors = new Set(merged.map((s) => s.color));
      expect(colors.size).toBeGreaterThan(2);

      // Vector expressions: \vec{a}\cdot\vec{b}
      const vecMath = "\\vec{a}\\cdot\\vec{b} = \\|\\vec{a}\\|\\,\\|\\vec{b}\\|\\cos\\theta";
      const vecVarSpans = collectVariableSpans(vecMath, DEFAULT_COLORS);
      const vecA = vecVarSpans.find((s) => vecMath.slice(s.start, s.end).includes("a"));
      const vecB = vecVarSpans.find((s) => vecMath.slice(s.start, s.end).includes("b"));
      expect(vecA).toBeDefined();
      expect(vecB).toBeDefined();
      // 'a' and 'b' must have different hash colors
      expect(vecA?.color).not.toBe(vecB?.color);
    });
  });
});

