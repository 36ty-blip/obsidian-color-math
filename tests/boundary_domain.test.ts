import { describe, it, expect } from "vitest";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_COLORS } from "../src/config";
import { parseMathWithCST } from "../src/parsers/cst/index";

describe("Domain Boundary Isolation 0.4 (Option A)", () => {
  it("colors boundary operator ∂ in palette.chain (#9ece6a) and preserves individual variable colors", () => {
    const unicodeInput = "∂Ω,∂V,∂D,∂M,∂Σ,∂U,∂B";
    const coloredUnicode = colorLatexBody(unicodeInput, DEFAULT_COLORS, {
      useCST: true,
      variableDataFlow: true,
      enableTaxonomy: true,
    });

    console.log("Colored Unicode:", coloredUnicode);
    
    // Each boundary operator ∂ is styled with \textcolor{#9ece6a}{∂}, and each target has its own variable color
    expect(coloredUnicode).toContain("\\textcolor{#9ece6a}{∂}");
    expect(coloredUnicode).toContain("\\textcolor{#51c9ff}{V}");
    expect(coloredUnicode).toContain("\\textcolor{#c6bc33}{D}");
    expect(coloredUnicode).toContain("\\textcolor{#d8a2ff}{M}");
    expect(coloredUnicode).toContain("\\textcolor{#ff929e}{Σ}");
    expect(coloredUnicode).toContain("\\textcolor{#9cc958}{U}");
    expect(coloredUnicode).toContain("\\textcolor{#fc9e47}{B}");
  });

  it("colors LaTeX boundary operator \\partial in palette.chain (#9ece6a) and preserves individual variable colors", () => {
    const latexInput = "\\partial\\Omega,\\partial V,\\partial D,\\partial M,\\partial\\Sigma,\\partial U,\\partial B";
    const coloredLatex = colorLatexBody(latexInput, DEFAULT_COLORS, {
      useCST: true,
      variableDataFlow: true,
      enableTaxonomy: true,
    });

    console.log("Colored LaTeX:", coloredLatex);

    expect(coloredLatex).toContain("\\textcolor{#9ece6a}{\\partial}");
    expect(coloredLatex).toContain("\\textcolor{#51c9ff}{V}");
    expect(coloredLatex).toContain("\\textcolor{#c6bc33}{D}");
    expect(coloredLatex).toContain("\\textcolor{#d8a2ff}{M}");
    expect(coloredLatex).toContain("\\textcolor{#ff929e}{\\Sigma}");
    expect(coloredLatex).toContain("\\textcolor{#9cc958}{U}");
    expect(coloredLatex).toContain("\\textcolor{#fc9e47}{B}");
  });

  it("emits boundary operator spans in live preview CST parsing", () => {
    const unicodeInput = "∂Ω,∂V,∂D,∂M,∂Σ,∂U,∂B";
    const spans = parseMathWithCST(unicodeInput, { palette: DEFAULT_COLORS });

    // Each boundary operator ∂ should have a span with palette.chain (#9ece6a)
    const boundarySpans = spans.filter((s) => s.color === DEFAULT_COLORS.chain);
    expect(boundarySpans.length).toBe(7);
    expect(spans.some((s) => s.start === 0 && s.end === 1)).toBe(true); // ∂
  });
});

