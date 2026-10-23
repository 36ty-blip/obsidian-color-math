// tests/natural_none_color.test.ts

import { describe, it, expect } from "vitest";
import { applyColorSpans, ColorSpan } from "../src/utils/spans";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_COLORS, ColorPalette } from "../src/config";

describe("Natural 'None' & 'Off' Color Engine", () => {
  it("suppresses \\textcolor wrapping when span color is 'none', 'off', or 'transparent'", () => {
    const source = "\\sin(x) + \\cos(y) = 1";
    const spans: ColorSpan[] = [
      { start: 0, end: 4, color: "none", priority: 20 },
      { start: 10, end: 14, color: "off", priority: 20 },
      { start: 5, end: 6, color: "#7aa2f7", priority: 10 },
      { start: 15, end: 16, color: "transparent", priority: 10 },
      { start: 18, end: 19, color: "default", priority: 30 },
    ];

    const result = applyColorSpans(source, spans);

    // Only the span with "#7aa2f7" should have \textcolor
    expect(result).toContain("\\textcolor{#7aa2f7}{x}");
    // Spans with none/off/transparent/default should NOT have \textcolor
    expect(result).not.toContain("\\textcolor{none}");
    expect(result).not.toContain("\\textcolor{off}");
    expect(result).not.toContain("\\textcolor{transparent}");
    expect(result).not.toContain("\\textcolor{default}");
    expect(result).toContain("\\sin(");
    expect(result).toContain("\\cos(");
  });

  it("renders pure bare LaTeX for categories set to 'none' in colorLatexBody", () => {
    const customPalette: ColorPalette = {
      ...DEFAULT_COLORS,
      main: "none", // Functions (sin, cos, ln) set to none
      orange: "none", // Constants (\pi, \hbar) set to none
      derivative: "#bb9af7", // Derivatives kept colored
    };

    const equation = "\\sin(x) + \\pi + \\frac{df}{dx}";
    const output = colorLatexBody(equation, customPalette, {
      enableTaxonomy: true,
      taxonomyFunctions: true,
      taxonomyConstants: true,
      colorDerivativeFractions: true,
    });

    // \sin and \pi should NOT be wrapped in \textcolor
    expect(output).not.toContain("\\textcolor{none}{\\sin}");
    expect(output).not.toContain("\\textcolor{none}{\\pi}");
    expect(output).toContain("\\sin");
    expect(output).toContain("\\pi");

    // Derivatives should still be colored with derivative color
    expect(output).toContain("\\textcolor{#bb9af7}");
  });

  it("handles whitespace commands appropriately while suppressing 'none'", () => {
    const source = "a \\quad b";
    const spans: ColorSpan[] = [
      { start: 0, end: 1, color: "none", priority: 20 },
      { start: 2, end: 7, color: "white", priority: 10 },
    ];

    const result = applyColorSpans(source, spans);
    // 'a' has color 'none' -> uncolored
    expect(result).not.toContain("\\textcolor{none}{a}");
    // Spacing command '\quad' is completely decoupled from \textcolor (strictly CodeMirror decoration)
    expect(result).not.toContain("\\textcolor");
    expect(result).toBe("a \\quad b");
  });
});
