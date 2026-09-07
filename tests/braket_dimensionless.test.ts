import { describe, it, expect } from "vitest";
import { findDimensionlessSpans } from "../src/parsers/dimensionless";
import { findBraKetSpans } from "../src/parsers/braket";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_COLORS } from "../src/config";

describe("Quantum Bra-Ket Notation & Engineering Dimensionless Numbers", () => {
  describe("findDimensionlessSpans", () => {
    it("detects contiguous dimensionless numbers", () => {
      const bare = findDimensionlessSpans("Re = \\frac{\\rho v D}{\\mu}");
      expect(bare.length).toBe(1);
      expect(bare[0].text).toBe("Re");

      const wrapped = findDimensionlessSpans("\\text{Re} = 2300");
      expect(wrapped.length).toBe(1);
      expect(wrapped[0].text).toBe("\\text{Re}");

      const multiple = findDimensionlessSpans("Nu = 0.023 Re^{0.8} Pr^{0.4}");
      expect(multiple.length).toBe(3);
      expect(multiple.map((s) => s.text)).toEqual(["Nu", "Re", "Pr"]);
    });

    it("does NOT match separated 'R e' or words containing 'Re'", () => {
      // User constraint: 'R e' should be separate variables, not Reynolds number!
      expect(findDimensionlessSpans("R e = 5").length).toBe(0);
      expect(findDimensionlessSpans("R \\, e = 5").length).toBe(0);
      expect(findDimensionlessSpans("R ~ e = 5").length).toBe(0);
      expect(findDimensionlessSpans("Area = 10").length).toBe(0);
      expect(findDimensionlessSpans("\\Re(z) = x").length).toBe(0);
    });
  });

  describe("colorLatexBody for Dimensionless Numbers", () => {
    it("colors contiguous Re with orange role and shields from variable hashing", () => {
      const result = colorLatexBody("Re = 2300", DEFAULT_COLORS, {
        variableDataFlow: true,
        colorDimensionless: true,
      });
      expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.orange}}{Re}`);
    });

    it("treats 'R e' as two separate variables when separated", () => {
      const result = colorLatexBody("R e = 5", DEFAULT_COLORS, {
        variableDataFlow: true,
        colorDimensionless: true,
      });
      // Re should NOT be colored together
      expect(result).not.toContain(`\\textcolor{${DEFAULT_COLORS.orange}}{Re}`);
      // R and e should be distinct
      expect(result).toContain("R");
      expect(result).toContain("e");
    });
  });

  describe("findBraKetSpans", () => {
    it("detects kets, bras, and brackets", () => {
      const ket = findBraKetSpans("|\\psi\\rangle");
      expect(ket.length).toBe(1);
      expect(ket[0].kind).toBe("ket");

      const bra = findBraKetSpans("\\langle\\phi|");
      expect(bra.length).toBe(1);
      expect(bra[0].kind).toBe("bra");

      const bracket = findBraKetSpans("\\langle\\phi|\\psi\\rangle");
      expect(bracket.length).toBe(1);
      expect(bracket[0].kind).toBe("bracket");

      const expectation = findBraKetSpans("\\langle\\psi|\\hat{H}|\\psi\\rangle");
      expect(expectation.length).toBe(1);
      expect(expectation[0].kind).toBe("bracket");
    });

    it("does NOT treat absolute values or inequalities as bra-kets", () => {
      expect(findBraKetSpans("|x| < 5").length).toBe(0);
      expect(findBraKetSpans("|a - b| > 0").length).toBe(0);
    });
  });

  describe("colorLatexBody for Bra-Ket Notation", () => {
    it("colors bra-ket delimiters with delimiter color", () => {
      const result = colorLatexBody("\\langle\\phi|\\psi\\rangle", DEFAULT_COLORS, {
        colorBraKet: true,
      });
      expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.orange}}{\\langle}`);
      expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.orange}}{|}`);
      expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.orange}}{\\rangle}`);
    });

    it("colors kets |\\psi\\rangle delimiters properly", () => {
      const result = colorLatexBody("|\\psi\\rangle", DEFAULT_COLORS, {
        colorBraKet: true,
      });
      expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.orange}}{|}`);
      expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.orange}}{\\rangle}`);
    });

    it("does NOT color absolute value |x| < 5 as bra-ket", () => {
      const result = colorLatexBody("|x| < 5", DEFAULT_COLORS, {
        colorBraKet: true,
      });
      expect(result).not.toContain(`\\textcolor{${DEFAULT_COLORS.orange}}{|}`);
    });
  });
});
