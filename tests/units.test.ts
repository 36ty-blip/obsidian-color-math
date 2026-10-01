import { describe, it, expect } from "vitest";
import { findUnitSpans } from "../src/parsers/units";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_COLORS } from "../src/config";
import { normalizeMathSyntax } from "../src/utils/latex_helpers";

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

    it("protects single-letter units by default, but detects them when explicitly enabled", () => {
      // Default: single letters like 'm', 's', 'K', 'N' are protected as algebraic variables
      expect(findUnitSpans("300 K").length).toBe(0);
      expect(findUnitSpans("12 m").length).toBe(0);
      expect(findUnitSpans("5 s").length).toBe(0);

      // When allowSingleLetterUnits is true (e.g. note YAML units: physics)
      const kSpans = findUnitSpans("300 K", { allowSingleLetterUnits: true });
      expect(kSpans.length).toBe(1);
      expect(kSpans[0].text).toBe("K");

      const mSpans = findUnitSpans("12 m", { allowSingleLetterUnits: true });
      expect(mSpans.length).toBe(1);
      expect(mSpans[0].text).toBe("m");
    });

    it("enforces whitespace affinity: tight (<= 1 space) vs loose (>= 2 spaces)", () => {
      // Tight (1 space): recognized as unit
      const tight = findUnitSpans("12 m/s^2");
      expect(tight.length).toBe(1);
      expect(tight[0].text).toBe("m/s^2");

      // Loose (3 spaces): user separated them as algebra -> 0 unit spans
      const loose = findUnitSpans("12   m/s^2");
      expect(loose.length).toBe(0);

      // Operator separation (12+m/s^2): pure arithmetic -> 0 unit spans
      const op = findUnitSpans("12+m/s^2");
      expect(op.length).toBe(0);
    });

    it("handles extreme multiline 35-space stress test in < 1ms with zero ReDoS freeze", () => {
      const stressInput = `
12                                   /312                                   /3
12                                   /3

12                                   /3
12                                   /3
12                                   /3
`;
      const t0 = performance.now();
      const spans = findUnitSpans(stressInput);
      const elapsed = performance.now() - t0;

      expect(spans.length).toBe(0);
      expect(elapsed).toBeLessThan(10); // Runs instantly in < 10ms (actual is ~0.1ms)
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
    it("colors units with unit role (#73daca) and nested exponents (#9d7cd8)", () => {
      const result1 = colorLatexBody("1.064\\, \\mu m", DEFAULT_COLORS, {
        enableTaxonomy: true,
        colorUnits: true,
      });
      expect(result1).toContain(`\\textcolor{${DEFAULT_COLORS.unit}}{\\mu m}`);
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

      // Nested exponent coloring: m/s^2 -> unit color wraps m/s^ with nested upper color on 2
      const result4 = colorLatexBody("12 m/s^2", DEFAULT_COLORS, {
        enableTaxonomy: true,
        colorUnits: true,
      });
      expect(result4).toContain(DEFAULT_COLORS.unit);
      expect(result4).toContain(DEFAULT_COLORS.upper);
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
      expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.parameter}}{\\lambda}`);
      expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.unit}}{\\mu m}`);
      expect(result).not.toContain(`\\textcolor{${DEFAULT_COLORS.parameter}}{\\mu}`);
    });
  });

  describe("colorLatexBody with units disabled (natural uncolored mode)", () => {
    it("leaves units completely uncolored in natural theme font when colorUnits is false", () => {
      const result = colorLatexBody("1.064\\, \\mu m", DEFAULT_COLORS, {
        enableTaxonomy: true,
        variableDataFlow: true,
        colorUnits: false,
      });
      expect(result).not.toContain(DEFAULT_COLORS.unit);
      expect(result).not.toContain(`\\textcolor{${DEFAULT_COLORS.parameter}}{\\mu}`);
      expect(result).toContain("\\mu m");
      expect(result).not.toContain(`\\textcolor{${DEFAULT_COLORS.unit}}{\\mu m}`);
    });

    it("leaves 10 m/s uncolored without variable hashing when colorUnits is false", () => {
      const result = colorLatexBody("10 m/s", DEFAULT_COLORS, {
        enableTaxonomy: true,
        variableDataFlow: true,
        colorUnits: false,
      });
      expect(result).not.toContain(DEFAULT_COLORS.unit);
      expect(result).toContain("10 m/s");
    });

    it("normalization only inserts thin space when colorUnits toggle is on", () => {
      // Normalization does not insert \\; when colorUnits is false or undefined
      const unnorm = normalizeMathSyntax("12 m/s^2", { colorUnits: false });
      expect(unnorm).toBe("12 m/s^{2}");

      const defaultNorm = normalizeMathSyntax("12 m/s^2");
      expect(defaultNorm).toBe("12 m/s^{2}");

      // Only inserts \\; when colorUnits is explicitly on
      const norm = normalizeMathSyntax("12 m/s^2", { colorUnits: true });
      expect(norm).toBe("12\\; m/s^{2}");
    });
  });
});
