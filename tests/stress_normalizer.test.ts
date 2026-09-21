import { describe, it, expect } from "vitest";
import { normalizeLatexBraces } from "../src/utils/latex_helpers";
import { colorLatexBody } from "../src/converters/generic";
import { convertText } from "../src/converters/block";
import { DEFAULT_COLORS, DEFAULT_OPTIONS } from "../src/config";
import { validateLatexDual } from "./validator";

describe("Stress Test LaTeX Normalization and Auto-Correction", () => {
  const cases = [
    // Basic unbraced
    "\\frac a b",
    "\\frac ab",
    "\\frac 1 2",
    "\\frac 12",
    "\\sqrt x",
    "\\sqrt 2",
    "x^2",
    "x_i",

    // Vectors & accents in fractions
    "\\frac \\vec F b",
    "\\frac \\vec{F} b",
    "\\frac{\\vec F}{b}",
    "\\frac{\\vec{F}}{b}",
    "\\frac \\vec F \\vec p",
    "\\frac \\hat H \\hbar",
    "\\frac \\dot x t",
    "\\frac \\bar v c",

    // Scripts attached to arguments
    "\\frac x_1 y_2",
    "\\frac x^2 y^3",
    "\\frac x_1^2 y_2^3",
    "\\frac x^2_1 y^3_2",
    "\\frac x' y",
    "\\frac x'' y'",
    "\\frac \\vec{F}_1 b",
    "\\frac \\vec{F}^2 b",
    "\\frac \\vec{F}' b",
    "\\frac \\vec F_1 b",
    "\\frac \\vec F' b",

    // Nested fractions & roots
    "\\frac \\frac 1 2 3",
    "\\frac 1 \\frac 2 3",
    "\\frac{\\frac 1 2}{3}",
    "\\frac{1}{\\frac 2 3}",
    "\\sqrt{\\sqrt[3]{x}}",
    "\\frac \\sqrt{\\sqrt x} y",

    // Greek & math symbols
    "\\frac \\alpha \\beta",
    "\\frac \\hbar 2",
    "\\frac \\Delta x \\Delta t",
    "\\frac \\partial \\partial t",
    "\\frac \\vec \\omega t",
    "\\frac \\vec \\mu B",

    // Binomial and two-arg commands
    "\\binom n k",
    "\\binom n_1 k_2",
    "\\dbinom x^2 y^3",
    "\\overset \\alpha =",
    "\\underset x \\to",

    // Functions in unbraced fractions
    "\\frac \\sin x y",
    "\\frac \\sqrt{x} y",
    "\\frac \\sqrt[3]{x} y",
    "\\frac \\sqrt[(a+b)]{x} y",

    // In exponents / subscripts
    "x^\\vec F",
    "x^\\vec{F}",
    "x^\\alpha",
    "A_\\mu",
    "x^{2}_1",

    // Matrices / newlines with optional spacing
    "\\begin{pmatrix} a & b \\\\[1em] c & d \\end{pmatrix}",

    // Edge cases / spaces
    "\\frac   a   b",
    "\\frac  \\vec{F}  b",
    "\\frac{a+b}{c+d}",
    "\\frac 12 + \\frac 34",
    "\\frac 1 2 + \\frac 3 4 = \\frac 5 6",
    "\\vec c \\quad \\vec{c} \\quad  \\frac{a}{b} \\quad \\frac ab \\quad  \\vec F",
  ];

  for (const c of cases) {
    it(`normalizes and validates: ${c}`, () => {
      const normalized = normalizeLatexBraces(c);
      console.log(`Input: "${c}" -> Normalized: "${normalized}"`);

      const converted = colorLatexBody(c, DEFAULT_COLORS, DEFAULT_OPTIONS);
      const val = validateLatexDual(converted);
      if (!val.valid) {
        console.error(`VALIDATION FAILED: "${c}"\n  Normalized: "${normalized}"\n  Converted: "${converted}"\n  Error: ${val.error}`);
      }
      expect(val.valid, `Failed on "${c}": ${val.error}`).toBe(true);
    });
  }

  it("handles incomplete / typing states without crashing", () => {
    const typingStates = [
      "\\frac",
      "\\frac ",
      "\\frac  ",
      "\\frac a",
      "\\frac a ",
      "\\frac \\",
      "\\frac \\vec",
      "\\frac \\vec ",
      "\\frac \\vec{",
      "\\frac \\vec{F",
      "\\frac{",
      "\\frac{a",
      "\\frac{a}",
      "\\frac{a}{",
      "\\frac{a}{b",
      "\\vec",
      "\\vec ",
      "\\vec {",
      "\\vec {F",
      "^",
      "_",
      "x^",
      "x_",
      "\\sqrt",
      "\\sqrt[",
      "\\sqrt[3",
      "\\sqrt[3]",
      "\\sqrt[3]{",
    ];

    for (const s of typingStates) {
      expect(() => normalizeLatexBraces(s)).not.toThrow();
      expect(() => colorLatexBody(s, DEFAULT_COLORS, DEFAULT_OPTIONS)).not.toThrow();
    }
  });

  it("respects previewLatexNormalization toggle", () => {
    const raw = "\\frac a b";
    const withPreview = colorLatexBody(raw, DEFAULT_COLORS, {
      ...DEFAULT_OPTIONS,
      previewLatexNormalization: true,
    });
    expect(withPreview).toContain("\\frac{");

    const withoutPreview = colorLatexBody(raw, DEFAULT_COLORS, {
      ...DEFAULT_OPTIONS,
      previewLatexNormalization: false,
    });
    // Without preview normalization, unbraced \frac remains without newly added outer braces
    expect(withoutPreview).not.toContain("\\frac{");
  });
});
