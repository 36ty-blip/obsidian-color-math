import { describe, it, expect } from "vitest";
import { findUnitSpans } from "../src/parsers/units";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_COLORS } from "../src/config";

describe("Physical Units & Metric Prefixes Disambiguation", () => {
  describe("findUnitSpans", () => {
    it("detects micro units with \\text{} and bare syntax", () => {
      const textCombo = findUnitSpans("1.064\\, \\mu\\text{m}");
      expect(textCombo.length).toBe(1);
      expect(textCombo[0].text).toBe("\\mu\\text{m}");

      const bareCombo = findUnitSpans("1.064\\, \\mu m");
      expect(bareCombo.length).toBe(1);
      expect(bareCombo[0].text).toBe("\\mu m");
    });

    it("detects common SI base, derived, and compound units following magnitudes", () => {
      const cases = [
        { input: "10 m/s", expected: "m/s" },
        { input: "500 nm", expected: "nm" },
        { input: "300 K", expected: "K" },
        { input: "50 kg", expected: "kg" },
        { input: "9.8 m/s^2", expected: "m/s^2" },
        { input: "100 MHz", expected: "MHz" },
        { input: "101.3 kPa", expected: "kPa" },
        { input: "10\\text{ m/s}", expected: "\\text{ m/s}" },
      ];

      for (const { input, expected } of cases) {
        const spans = findUnitSpans(input);
        expect(spans.length).toBe(1);
        expect(spans[0].text).toBe(expected);
      }
    });

    it("does NOT treat standalone \\mu as a unit", () => {
      expect(findUnitSpans("\\mu = 0.5").length).toBe(0);
      expect(findUnitSpans("F = \\mu N").length).toBe(0);
      expect(findUnitSpans("\\mu_0 \\cdot I").length).toBe(0);
      expect(findUnitSpans("\\dot N = \\frac{P\\lambda}{hc}").length).toBe(0);
      expect(findUnitSpans("E = mc^2").length).toBe(0);
      expect(findUnitSpans("F = ma").length).toBe(0);
    });
  });

  describe("colorLatexBody with units enabled", () => {
    it("colors units with unit role (#73daca)", () => {
      const result1 = colorLatexBody("1.064\\, \\mu m", DEFAULT_COLORS, {
        enableTaxonomy: true,
        colorUnits: true,
      });
      expect(result1).toContain(`\\textcolor{${DEFAULT_COLORS.unit}}{\\mu m}`);
      // \mu must not be colored as parameter
      expect(result1).not.toContain(`\\textcolor{${DEFAULT_COLORS.parameter}}{\\mu}`);

      const result2 = colorLatexBody("1.064\\, \\mu\\text{m}", DEFAULT_COLORS, {
        enableTaxonomy: true,
        colorUnits: true,
      });
      expect(result2).toContain(`\\textcolor{${DEFAULT_COLORS.unit}}{\\mu\\text{m}}`);

      const result3 = colorLatexBody("10 m/s", DEFAULT_COLORS, {
        enableTaxonomy: true,
        variableDataFlow: true,
        colorUnits: true,
      });
      expect(result3).toContain(`\\textcolor{${DEFAULT_COLORS.unit}}{m/s}`);
    });

    it("preserves standalone \\mu as parameter when taxonomy is enabled", () => {
      const result = colorLatexBody("\\mu = 0.5", DEFAULT_COLORS, {
        enableTaxonomy: true,
        colorUnits: true,
      });
      expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.parameter}}{\\mu}`);
      expect(result).not.toContain(DEFAULT_COLORS.unit);
    });

    it("handles equations mixing parameters and units properly", () => {
      const input = "\\lambda = 1.064\\, \\mu m";
      const result = colorLatexBody(input, DEFAULT_COLORS, {
        enableTaxonomy: true,
        colorUnits: true,
      });
      // \lambda is parameter
      expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.parameter}}{\\lambda}`);
      // \mu m is unit
      expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.unit}}{\\mu m}`);
      // \mu inside unit is NOT parameter
      expect(result).not.toContain(`\\textcolor{${DEFAULT_COLORS.parameter}}{\\mu}`);
    });
  });

  describe("colorLatexBody with units disabled (natural uncolored mode)", () => {
    it("leaves units completely uncolored in natural theme font", () => {
      const result = colorLatexBody("1.064\\, \\mu m", DEFAULT_COLORS, {
        enableTaxonomy: true,
        variableDataFlow: true,
        colorUnits: false,
      });
      // Must not contain unit color
      expect(result).not.toContain(DEFAULT_COLORS.unit);
      // Must not color \mu as parameter
      expect(result).not.toContain(`\\textcolor{${DEFAULT_COLORS.parameter}}{\\mu}`);
      // Must not color m as variable
      expect(result).toContain("\\mu m");
      expect(result).not.toContain(`\\textcolor{${DEFAULT_COLORS.unit}}{\\mu m}`);
    });

    it("leaves 10 m/s uncolored without variable hashing", () => {
      const result = colorLatexBody("10 m/s", DEFAULT_COLORS, {
        enableTaxonomy: true,
        variableDataFlow: true,
        colorUnits: false,
      });
      expect(result).not.toContain(DEFAULT_COLORS.unit);
      expect(result).toContain("10 m/s");
    });
  });
});
