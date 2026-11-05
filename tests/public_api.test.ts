// tests/public_api.test.ts
import { describe, it, expect } from "vitest";
import { ColorMathAPIImpl } from "../src/api";
import { DEFAULT_COLORS } from "../src/config";
import type ColorMathPlugin from "../src/main";
import { CUSTOM_MACRO_FUNCTIONS, CUSTOM_BARE_FUNCTIONS } from "../src/config";

function createMockPlugin(): ColorMathPlugin {
  return {
    manifest: { version: "1.0.87" },
    settings: { palette: { ...DEFAULT_COLORS } },
    getMathOptions: () => ({
      speedSyntacticSugar: true,
      sugarBracketMatrices: true,
      sugarQuotedStrings: true,
      sugarChainedRoots: true,
      sugarAsciiEllipses: true,
      sugarAsciiOperators: true,
      crashImmunityAutoSeal: false,
    }),
  } as unknown as ColorMathPlugin;
}

describe("Color Math Public Developer API", () => {
  it("exposes the correct manifest version", () => {
    const plugin = createMockPlugin();
    const api = new ColorMathAPIImpl(plugin);
    expect(api.version).toBe("1.0.87");
  });

  describe("Dialect Translation Engine", () => {
    it("translates Typst matrices into canonical LaTeX environments", () => {
      const plugin = createMockPlugin();
      const api = new ColorMathAPIImpl(plugin);
      const outputBmat = api.translate("bmat[1, 2; 3, 4]", { from: "typst", to: "latex" });
      expect(outputBmat).toBe("\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}");

      const outputMat = api.translate("mat[1, 2; 3, 4]", { from: "typst", to: "latex" });
      expect(outputMat).toContain("\\begin{matrix}");
    });

    it("translates Typst inverted division {a}/{b} into \\frac{a}{b}", () => {
      const plugin = createMockPlugin();
      const api = new ColorMathAPIImpl(plugin);
      const output = api.translate("{a + b}/{c + d}", { from: "typst", to: "latex" });
      expect(output).toBe("\\frac{a + b}{c + d}");
    });

    it("translates AsciiMath operators (:=, ->, xx, o+) into LaTeX", () => {
      const plugin = createMockPlugin();
      const api = new ColorMathAPIImpl(plugin);
      const output = api.translate("f(x) := a -> b xx c", { from: "asciimath", to: "latex" });
      expect(output).toContain("\\coloneqq");
      expect(output).toContain("\\to");
      expect(output).toContain("\\times");
    });

    it("provides convenience toLatex() shortcut", () => {
      const plugin = createMockPlugin();
      const api = new ColorMathAPIImpl(plugin);
      expect(api.toLatex("sqrt[3][x]")).toBe("\\sqrt[3]{x}");
    });

    it("normalizes syntax via normalizeSyntax()", () => {
      const plugin = createMockPlugin();
      const api = new ColorMathAPIImpl(plugin);
      expect(api.normalizeSyntax('"velocity" = {d}/{t}')).toBe("\\text{velocity} = \\frac{d}{t}");
    });

    it("gracefully informs callers that reverse LaTeX -> Typst AST translation is scheduled for Phase 4", () => {
      const plugin = createMockPlugin();
      const api = new ColorMathAPIImpl(plugin);
      expect(() => {
        api.translate("\\frac{a}{b}", { from: "latex", to: "typst" });
      }).toThrow(/Phase 4/);
    });
  });

  describe("Colorization & Clean Academic Export", () => {
    it("colorizes a mathematical LaTeX string", () => {
      const plugin = createMockPlugin();
      const api = new ColorMathAPIImpl(plugin);
      const colored = api.colorize("E = mc^{2}");
      expect(colored).toContain("\\textcolor{");
    });

    it("reversibly strips colors back to pristine LaTeX via stripColors()", () => {
      const plugin = createMockPlugin();
      const api = new ColorMathAPIImpl(plugin);
      const original = "E = mc^{2}";
      const colored = api.colorize(original);
      const stripped = api.stripColors(colored);
      expect(stripped).toBe(original);
    });
  });

  describe("CST Parser & Token Extractor", () => {
    it("parses math into a valid CST node list via parseCST()", () => {
      const plugin = createMockPlugin();
      const api = new ColorMathAPIImpl(plugin);
      const nodes = api.parseCST("\\frac{a}{b}");
      expect(nodes).toBeDefined();
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes[0].kind).toBe("fraction");
    });

    it("extracts token spans via getTokens()", () => {
      const plugin = createMockPlugin();
      const api = new ColorMathAPIImpl(plugin);
      const tokens = api.getTokens("x + y");
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0]).toHaveProperty("start");
      expect(tokens[0]).toHaveProperty("end");
      expect(tokens[0]).toHaveProperty("color");
    });
  });

  describe("Palette & Macro Registry", () => {
    it("returns active palette and color roles", () => {
      const plugin = createMockPlugin();
      const api = new ColorMathAPIImpl(plugin);
      const palette = api.getPalette();
      expect(palette.main).toBe(DEFAULT_COLORS.main);
      expect(api.getColor("derivative")).toBe(DEFAULT_COLORS.derivative);
    });

    it("registers and unregisters custom domain macros cleanly with IDisposable", () => {
      const plugin = createMockPlugin();
      const api = new ColorMathAPIImpl(plugin);
      const sub = api.registerCustomMacro({ identifier: "\\myCustomOp", bare: true });

      expect(CUSTOM_MACRO_FUNCTIONS.has("\\myCustomOp")).toBe(true);
      expect(CUSTOM_BARE_FUNCTIONS.has("mycustomop")).toBe(true);

      // Unregister
      sub.dispose();
      expect(CUSTOM_MACRO_FUNCTIONS.has("\\myCustomOp")).toBe(false);
      expect(CUSTOM_BARE_FUNCTIONS.has("mycustomop")).toBe(false);
    });
  });
});
