import { describe, it, expect } from "vitest";
import { findDifferentialSpans } from "../src/parsers/differentials";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_COLORS } from "../src/config";

describe("Calculus Differentials & Derivatives Disambiguation", () => {
  describe("findDifferentialSpans", () => {
    it("detects infinitesimal differentials following integrals or spacing", () => {
      const single = findDifferentialSpans("\\int x^2 \\, dx");
      expect(single.length).toBe(1);
      expect(single[0].text).toBe("dx");

      const double = findDifferentialSpans("\\iint f(x, y) \\, dx \\, dy");
      expect(double.length).toBe(2);
      expect(double[0].text).toBe("dx");
      expect(double[1].text).toBe("dy");

      const greek = findDifferentialSpans("\\int \\sin(\\theta) \\, d\\theta");
      expect(greek.length).toBe(1);
      expect(greek[0].text).toBe("d\\theta");
    });

    it("detects derivative fractions", () => {
      const cases = [
        { input: "\\frac{df}{dx} = 2x", expected: "\\frac{df}{dx}" },
        { input: "\\frac{d}{dx} f(x)", expected: "\\frac{d}{dx}" },
        { input: "\\frac{\\partial \\psi}{\\partial t} = -i\\hat{H}\\psi", expected: "\\frac{\\partial \\psi}{\\partial t}" },
        { input: "\\frac{d^2 y}{dx^2} + y = 0", expected: "\\frac{d^2 y}{dx^2}" },
      ];

      for (const { input, expected } of cases) {
        const spans = findDifferentialSpans(input);
        expect(spans.length).toBeGreaterThanOrEqual(1);
        expect(spans[0].text).toBe(expected);
      }
    });

    it("does NOT treat standalone distance 'd' as a differential", () => {
      expect(findDifferentialSpans("W = F d").length).toBe(0);
      expect(findDifferentialSpans("d = vt").length).toBe(0);
      expect(findDifferentialSpans("d = 5 m").length).toBe(0);
      expect(findDifferentialSpans("10 m/s").length).toBe(0);
      expect(findDifferentialSpans("1.064\\, \\mu m").length).toBe(0);
    });
  });

  describe("colorLatexBody with differentials enabled", () => {
    it("colors differentials with derivative role (#bb9af7)", () => {
      const result = colorLatexBody("\\int x^2 \\, dx", DEFAULT_COLORS, {
        colorDifferentials: true,
      });
      expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.derivative}}{dx}`);
    });

    it("colors derivative operators like \\frac{d}{dx}", () => {
      const result = colorLatexBody("\\frac{d}{dx} f(x)", DEFAULT_COLORS, {
        colorDifferentials: true,
      });
      expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.derivative}}{\\frac{d}{dx}}`);
    });

    it("protects 'd' from variable data-flow hashing in dx", () => {
      const result = colorLatexBody("\\int x^2 \\, dx", DEFAULT_COLORS, {
        variableDataFlow: true,
        colorDifferentials: true,
      });
      // dx should be atomic derivative color, not split into random hashed variable colors
      expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.derivative}}{dx}`);
      expect(result).not.toContain(`\\textcolor{${DEFAULT_COLORS.main}}{d}`);
    });
  });

  describe("colorLatexBody with differentials disabled (natural color mode)", () => {
    it("leaves differentials uncolored while shielding 'd' from variable hashing", () => {
      const result = colorLatexBody("\\int x^2 \\, dx", DEFAULT_COLORS, {
        variableDataFlow: true,
        colorDifferentials: false,
      });
      // Must not add derivative wrapper to dx
      expect(result).not.toContain(`\\textcolor{${DEFAULT_COLORS.derivative}}{dx}`);
      // Must not hash d as variable
      expect(result).toContain("dx");
    });

    it("allows standalone 'd' to be hashed as variable", () => {
      const result = colorLatexBody("W = F d", DEFAULT_COLORS, {
        variableDataFlow: true,
        colorDifferentials: true,
      });
      // Standalone d is a variable, so it should be hashed
      expect(result).toContain("d");
    });
  });
});
