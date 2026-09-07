import { describe, it, expect } from "vitest";
import { colorLatexBody } from "../src/converters/generic";
import { convertText } from "../src/converters/block";
import { DEFAULT_COLORS } from "../src/config";

describe("User Formula Test", () => {
  it("colors user formula with arrow, parameter lambda, mu, and relation", () => {
    const input = "\\boxed{^{4}F_{3/2}\\rightarrow{}^{4}I_{11/2}, \\qquad\\lambda=1.064\\, \\mu\\text{m}}";
    const result = colorLatexBody(input, DEFAULT_COLORS, {
      enableTaxonomy: true,
      rainbowDelimiters: true,
      variableDataFlow: false,
    });
    console.log("Transformed User Formula:\n", result);
    // \rightarrow colored with arrow color
    expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.arrow}}{\\rightarrow}`);
    // \lambda colored with parameter color
    expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.parameter}}{\\lambda}`);
    // \mu colored with parameter color
    expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.parameter}}{\\mu}`);
    // = colored with relation color
    expect(result).toContain(`\\textcolor{white}{=}`);
  });

  it("checks dot N = P lambda / hc with taxonomy", () => {
    const input = "\\dot N = \\frac{P\\lambda}{hc}";
    const result = colorLatexBody(input, DEFAULT_COLORS, {
      enableTaxonomy: true,
      rainbowDelimiters: true,
      variableDataFlow: false,
    });
    console.log("Transformed dot N (taxonomy):\n", result);
    // Should wrap the whole \dot N together as derivative, never \dot \textcolor
    expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.derivative}}{\\dot N}`);
    expect(result).not.toContain("\\dot \\textcolor");
  });

  it("checks dot N = P lambda / hc with variable data-flow hashing", () => {
    const input = "\\dot N = \\frac{P\\lambda}{hc}";
    const result = colorLatexBody(input, DEFAULT_COLORS, {
      enableTaxonomy: true,
      rainbowDelimiters: true,
      variableDataFlow: true,
    });
    console.log("Transformed dot N (variable hashing):\n", result);
    // Should wrap the whole \dot N together in the variable color, never \dot \textcolor
    expect(result).not.toContain("\\dot \\textcolor");
    expect(result).toContain("{\\dot N}");
  });

  it("converts inline math with single dollar signs", () => {
    const text = "Rate is $\\dot N = \\frac{P\\lambda}{hc}$ for laser.";
    const result = convertText(text, DEFAULT_COLORS, {
      enableTaxonomy: true,
      rainbowDelimiters: true,
      variableDataFlow: true,
    });
    console.log("Transformed inline math markdown:\n", result);
    expect(result).toContain("$");
    expect(result).not.toContain("$$");
    expect(result).toContain("{\\dot N}");
    expect(result).not.toContain("\\dot \\textcolor");
  });
});
