import { describe, it, expect } from "vitest";
import { convertText } from "../src/converters/block";
import { DEFAULT_COLORS, DEFAULT_OPTIONS } from "../src/config";
import { validateLatexDual } from "./validator";

describe("GitHub Issue #4: \\vec and macro arguments", () => {
  const formulas = [
    "$$\n\\vec c \\quad \\vec{c} \\quad  \\frac{a}{b} \\quad \\frac ab \\quad  \\vec F \\quad\n$$",
    "$$\n\\frac  \\vec{F} b\n$$",
    "$$\\frac{\\vec F}{b}$$",
    "$$\\frac\\vec F m$$",
    "$$\\frac \\vec F m$$",
    "$$\\frac{\\vec F}{m}$$",
    "$$\\vec \\nabla$$",
    "$$\\vec\\nabla$$",
    "$$\\vec \\mu$$",
    "$$\\vec \\omega$$",
    "$$\\vec F(t)$$",
    "$$\\vec{\\dot{x}}$$",
    "$$\\dot{\\vec x}$$",
  ];

  for (const f of formulas) {
    it(`correctly converts and validates: ${f.replace(/\n/g, " ")}`, () => {
      const converted = convertText(f, DEFAULT_COLORS, DEFAULT_OPTIONS);
      const val = validateLatexDual(converted);
      expect(val.valid, `Dual validation error on ${f}: ${val.error}`).toBe(true);
      expect(converted).not.toContain("\\vec}");
      expect(converted).not.toContain("\\vec\\textcolor");
      expect(converted).not.toContain("\\frac{\\textcolor{#bb9af7}{\\vec}}");
    });
  }
});
