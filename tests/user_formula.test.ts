import { describe, it, expect } from "vitest";
import { colorLatexBody } from "../src/converters/generic";
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
});
