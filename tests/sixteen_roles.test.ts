// tests/sixteen_roles.test.ts

import { describe, it, expect } from "vitest";
import { DEFAULT_COLORS, ColorPalette, ColorRole } from "../src/config";
import { colorLatexBody } from "../src/converters/generic";
import { parseMathWithCST } from "../src/parsers/cst/index";
import { applyColorSpans } from "../src/utils/spans";

describe("16-Role Taxonomy & Connective Glue Architecture", () => {
  it("configures exactly 16 first-class semantic roles in DEFAULT_COLORS", () => {
    const roles = Object.keys(DEFAULT_COLORS) as ColorRole[];
    expect(roles.length).toBe(16);
    expect(roles).toContain("structural");
    expect(roles).toContain("transform");
    expect(roles).toContain("arithmetic");
  });

  it("defaults connective glue, relations, arithmetic, and layout constructors to 'none'", () => {
    expect(DEFAULT_COLORS.relation).toBe("none");
    expect(DEFAULT_COLORS.arithmetic).toBe("none");
    expect(DEFAULT_COLORS.dot).toBe("none");
    expect(DEFAULT_COLORS.structural).toBe("none");
    expect(DEFAULT_COLORS.spacing).toBe("none");
  });

  it("renders x^2 + 2x - 1 = 0 with clean, natural connective glue by default (zero \\textcolor on =, +, -)", () => {
    const equation = "x^2 + 2x - 1 = 0";
    const result = colorLatexBody(equation, DEFAULT_COLORS, {
      enableTaxonomy: true,
      variableDataFlow: false,
    });

    // Relations and arithmetic should NOT have \textcolor
    expect(result).not.toContain("\\textcolor{none}{=}");
    expect(result).not.toContain("\\textcolor{none}{+}");
    expect(result).not.toContain("\\textcolor{none}{-}");
    expect(result).toContain("=");
    expect(result).toContain("+");
    expect(result).toContain("-");

    // Exponent 2 should still be styled with upper exponent color
    expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.upper}}{2}`);
  });

  it("colors linear algebra matrix transformations (A^T, A^\\top, A^\\dagger) with palette.transform", () => {
    const customPalette: ColorPalette = {
      ...DEFAULT_COLORS,
      transform: "#fab387", // Peach
    };

    const equation = "A^T + B^\\top + C^\\dagger";
    const spans = parseMathWithCST(equation, { palette: customPalette });
    expect(spans).toBeDefined();

    const transformSpans = spans.filter((s) => s.color === "#fab387");
    expect(transformSpans.length).toBeGreaterThan(0);
  });

  it("unconditionally suppresses \\textcolor on spacing macros in rendered output", () => {
    const source = "a \\quad b \\, c";
    const spans = [
      { start: 2, end: 7, color: "#ffffff", priority: 10 },
      { start: 10, end: 12, color: "#64748b", priority: 10 },
    ];

    const result = applyColorSpans(source, spans);
    expect(result).not.toContain("\\textcolor");
    expect(result).toBe("a \\quad b \\, c");
  });

  it("correctly colors arithmetic operators (+, -) when palette.arithmetic is actively configured", () => {
    const customPalette: ColorPalette = {
      ...DEFAULT_COLORS,
      arithmetic: "#f7768e", // Pink
    };

    const equation = "a + b - c";
    const result = colorLatexBody(equation, customPalette, {
      enableTaxonomy: true,
      variableDataFlow: false,
    });

    expect(result).toContain("\\textcolor{#f7768e}{+}");
    expect(result).toContain("\\textcolor{#f7768e}{-}");
  });

  it("handles multi-dialect operators (+-, -+, xx, uu, nn, vv, ^^, ox, o+, o.) across appropriate semantic roles", () => {
    const customPalette: ColorPalette = {
      ...DEFAULT_COLORS,
      arithmetic: "#f7768e",
      dot: "#e0af68",
      set: "#7dcfff",
    };

    // 1. Arithmetic (+- and -+ normalized to \pm and \mp, o+ normalized to \oplus, colored with arithmetic)
    const arithEq = "a +- b -+ c o+ d";
    const arithRes = colorLatexBody(arithEq, customPalette, { enableTaxonomy: true, variableDataFlow: false });
    expect(arithRes).toContain("\\textcolor{#f7768e}{\\pm}");
    expect(arithRes).toContain("\\textcolor{#f7768e}{\\mp}");
    expect(arithRes).toContain("\\textcolor{#f7768e}{\\oplus}");

    // 2. AsciiMath xx normalized to \times, ox to \otimes, o. to \odot and colored with palette.dot
    const dotEq = "A xx B ox C o. D";
    const dotRes = colorLatexBody(dotEq, customPalette, { enableTaxonomy: true, variableDataFlow: false });
    expect(dotRes).toContain("\\textcolor{#e0af68}{\\times}");
    expect(dotRes).toContain("\\textcolor{#e0af68}{\\otimes}");
    expect(dotRes).toContain("\\textcolor{#e0af68}{\\odot}");

    // 3. AsciiMath uu, nn, vv, ^^ route to palette.set
    const setEq = "A uu B nn C vv D ^^ E";
    const setRes = colorLatexBody(setEq, customPalette, { enableTaxonomy: true, variableDataFlow: false });
    expect(setRes).toContain("\\textcolor{#7dcfff}{\\cup}");
    expect(setRes).toContain("\\textcolor{#7dcfff}{\\cap}");
    expect(setRes).toContain("\\textcolor{#7dcfff}{\\vee}");
    expect(setRes).toContain("\\textcolor{#7dcfff}{\\wedge}");
  });
});
