import { describe, it, expect } from "vitest";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_COLORS } from "../src/config";

describe("Fine-grained Settings & Heuristics Splits", () => {
  describe("Calculus Differentials vs Fractions", () => {
    it("can color derivative fractions while leaving differentials uncolored", () => {
      const input = "\\frac{df}{dx} + dx";
      const res = colorLatexBody(input, DEFAULT_COLORS, {
        colorDerivativeFractions: true,
        colorInfinitesimals: false,
      });
      // Fraction has derivative color (#bb9af7)
      expect(res).toContain("\\textcolor{#bb9af7}{\\frac{df}{dx}}");
      // dx is not wrapped with #bb9af7
      expect(res).not.toContain("\\textcolor{#bb9af7}{dx}");
    });

    it("can color differentials while leaving derivative fractions uncolored", () => {
      const input = "\\frac{df}{dx} + \\, dx";
      const res = colorLatexBody(input, DEFAULT_COLORS, {
        colorDerivativeFractions: false,
        colorInfinitesimals: true,
      });
      expect(res).not.toContain("\\textcolor{#bb9af7}{\\frac{df}{dx}}");
      expect(res).toContain("\\textcolor{#bb9af7}{dx}");
    });
  });

  describe("Granular Symbol Taxonomy", () => {
    it("can disable function coloring while keeping constants and parameters", () => {
      const input = "\\sin(\\theta) + \\pi";
      const res = colorLatexBody(input, DEFAULT_COLORS, {
        enableTaxonomy: true,
        taxonomyFunctions: false,
        taxonomyParameters: true,
        taxonomyConstants: true,
      });
      // sin should not be wrapped with main color #7aa2f7
      expect(res).not.toContain("\\textcolor{#7aa2f7}{\\sin}");
      // theta parameter should be colored
      expect(res).toContain(`\\textcolor{${DEFAULT_COLORS.parameter}}{\\theta}`);
      // pi constant should be colored
      expect(res).toContain("\\textcolor{#e0af68}{\\pi}");
    });

    it("can disable constants while keeping parameters and functions", () => {
      const input = "\\cos(\\alpha) + \\pi";
      const res = colorLatexBody(input, DEFAULT_COLORS, {
        enableTaxonomy: true,
        taxonomyFunctions: true,
        taxonomyParameters: true,
        taxonomyConstants: false,
      });
      expect(res).toContain("\\textcolor{#7aa2f7}{\\cos}");
      expect(res).toContain(`\\textcolor{${DEFAULT_COLORS.parameter}}{\\alpha}`);
      expect(res).not.toContain("\\textcolor{#e0af68}{\\pi}");
    });

    it("can disable bound iteration indices independently", () => {
      const input = "\\sum_{i=1}^n x_i";
      const resWith = colorLatexBody(input, DEFAULT_COLORS, {
        enableTaxonomy: true,
        taxonomyIndices: true,
      });
      expect(resWith).toContain("\\textcolor{#9ece6a}{i}");

      const resWithout = colorLatexBody(input, DEFAULT_COLORS, {
        enableTaxonomy: true,
        taxonomyIndices: false,
      });
      expect(resWithout).not.toContain("\\textcolor{#9ece6a}{i}=");
    });
  });

  describe("Custom Rainbow Delimiter Colors", () => {
    it("respects custom rainbow palette array", () => {
      const customTiers = ["#111111", "#222222", "#333333", "#444444"];
      const input = "( [ \\{ x \\} ] )";
      const res = colorLatexBody(input, DEFAULT_COLORS, {
        rainbowDelimiters: true,
        rainbowColors: customTiers,
      });
      expect(res).toContain("\\textcolor{#111111}{(}");
      expect(res).toContain("\\textcolor{#222222}{[}");
      expect(res).toContain("\\textcolor{#333333}{\\{}");
    });
  });

  describe("Euler's constant & Imaginary Unit toggle", () => {
    it("can toggle Euler e and imaginary i recognition", () => {
      const input = "e^{i\\pi}";
      const resOff = colorLatexBody(input, DEFAULT_COLORS, {
        colorSingleConstants: false,
      });
      expect(resOff).not.toContain("\\textcolor{#e0af68}{e}");
      expect(resOff).not.toContain("\\textcolor{#e0af68}{i}");

      const resOn = colorLatexBody(input, DEFAULT_COLORS, {
        colorSingleConstants: true,
      });
      expect(resOn).toContain("\\textcolor{#e0af68}{e}");
      expect(resOn).toContain("\\textcolor{#e0af68}{i}");
    });
  });
});
