import { describe, it, expect } from "vitest";
import { colorLatexBody, computeSemanticMathSpans } from "../src/converters/generic";
import { DEFAULT_COLORS, VARIABLE_HASH_PALETTE, hashStringToColor } from "../src/config";
import { findDifferentialSpans } from "../src/parsers/differentials";
import { normalizeMathSyntax } from "../src/utils/latex_helpers";

describe("Semantic Oracle & Color Parity Upgraded Invariant Suite", () => {
  describe("1. Partial Derivative Canonicalization: partial vs \\partial vs ∂", () => {
    it("normalizes bare Typst 'partial' into LaTeX '\\partial' so MathJax renders the true partial symbol", () => {
      const normalized = normalizeMathSyntax("partial + \\partial + ∂");
      // Bare 'partial' must not be left as raw letters 'partial' (7 italic math variables)
      expect(normalized).not.toMatch(/(?:^|[^\\])partial(?![a-zA-Z])/);
      expect(normalized).toContain("\\partial");
    });

    it("assigns consistent derivative role to \\partial, bare partial, and Unicode ∂", () => {
      const spans = computeSemanticMathSpans("partial + \\partial + ∂", DEFAULT_COLORS);
      // All three partial symbols should be tagged with derivative role
      const derivativeSpans = spans.filter((s) => s.color === DEFAULT_COLORS.derivative || s.role === "derivative");
      // Expect all 3 operators to receive derivative styling rather than 0 spans
      expect(derivativeSpans.length).toBe(3);
    });
  });

  describe("2. Differential & Variable Separation: ∂y + ∂x and dy + dx", () => {
    it("detects ∂y and ∂x as differentials", () => {
      const diffs = findDifferentialSpans("∂y + ∂x");
      expect(diffs.length).toBe(2);
      expect(diffs[0].text).toBe("∂y");
      expect(diffs[1].text).toBe("∂x");
    });

    it("separates operator ∂ from coordinate variable y in ∂y when variableDataFlow is enabled", () => {
      const spans = computeSemanticMathSpans("∂y + ∂x", DEFAULT_COLORS, {
        variableDataFlow: true,
        colorDifferentials: true,
      });

      // y and x must have their distinct variable hash colors
      const expectedYColor = hashStringToColor("y", VARIABLE_HASH_PALETTE);
      const expectedXColor = hashStringToColor("x", VARIABLE_HASH_PALETTE);

      const ySpan = spans.find((s) => s.start === 1 && s.end === 2);
      const xSpan = spans.find((s) => s.start === 6 && s.end === 7);

      expect(ySpan).toBeDefined();
      expect(xSpan).toBeDefined();

      // The coordinate variables x and y must NOT be painted with the same color unless their hashes collide
      expect(expectedYColor).not.toBe(expectedXColor);

      // y must receive y's variable hash color, and x must receive x's variable hash color
      expect(ySpan!.color).toBe(expectedYColor);
      expect(xSpan!.color).toBe(expectedXColor);

      // The operator ∂ (index 0 and index 5) must NOT be swallowed into the variable's hash color
      const op1Span = spans.find((s) => s.start === 0 && s.end === 1);
      const op2Span = spans.find((s) => s.start === 5 && s.end === 6);
      expect(op1Span).toBeDefined();
      expect(op2Span).toBeDefined();
      expect(op1Span!.color).toBe(DEFAULT_COLORS.derivative);
      expect(op2Span!.color).toBe(DEFAULT_COLORS.derivative);
    });

    it("bakes MathJax output separating ∂ from y so both receive distinct semantic styling", () => {
      const result = colorLatexBody("∂y + ∂x", DEFAULT_COLORS, {
        variableDataFlow: true,
        colorDifferentials: true,
      });

      const expectedYColor = hashStringToColor("y", VARIABLE_HASH_PALETTE);
      const expectedXColor = hashStringToColor("x", VARIABLE_HASH_PALETTE);

      // Must not wrap monolithic \textcolor{...}{∂y}
      expect(result).not.toContain(`\\textcolor{${expectedYColor}}{∂y}`);
      expect(result).not.toContain(`\\textcolor{${DEFAULT_COLORS.derivative}}{∂y}`);

      // Must separately wrap operator and variable
      expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.derivative}}{∂}`);
      expect(result).toContain(`\\textcolor{${expectedYColor}}{y}`);
      expect(result).toContain(`\\textcolor{${expectedXColor}}{x}`);
    });
  });

  describe("3. Subscript Boundary & Differential Collision: C_VdT vs C_{V}dT", () => {
    it("identifies V as Volume variable and dT as differential in unbraced C_VdT", () => {
      const spans = computeSemanticMathSpans("\\Delta C_VdT", DEFAULT_COLORS, {
        variableDataFlow: true,
        colorDifferentials: true,
      });

      const expectedVColor = hashStringToColor("V", VARIABLE_HASH_PALETTE);
      const expectedTColor = hashStringToColor("T", VARIABLE_HASH_PALETTE);

      // V should have Volume's variable hash color
      const vSpan = spans.find((s) => s.color === expectedVColor);
      expect(vSpan).toBeDefined();

      // dT should have differential styling (d in derivative purple, T in variable hash)
      const dSpan = spans.find((s) => s.color === DEFAULT_COLORS.derivative);
      expect(dSpan).toBeDefined();

      const tSpan = spans.find((s) => s.color === expectedTColor);
      expect(tSpan).toBeDefined();
    });

    it("ensures MathJax LaTeX output does not skip differential d in \\Delta C_VdT", () => {
      const result = colorLatexBody("\\Delta C_VdT", DEFAULT_COLORS, {
        variableDataFlow: true,
        colorDifferentials: true,
      });

      // Must include derivative color for d
      expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.derivative}}{d}`);
    });
  });

  describe("4. Greek Letter Hash Invariance: \\delta vs delta vs δ", () => {
    it("hashes \\delta, bare delta, and Unicode δ to the exact same variable color", () => {
      const spansMacro = computeSemanticMathSpans("\\delta", DEFAULT_COLORS, { variableDataFlow: true });
      const spansBare = computeSemanticMathSpans("delta", DEFAULT_COLORS, { variableDataFlow: true });
      const spansUnicode = computeSemanticMathSpans("δ", DEFAULT_COLORS, { variableDataFlow: true });

      expect(spansMacro.length).toBeGreaterThanOrEqual(1);
      expect(spansBare.length).toBeGreaterThanOrEqual(1);
      expect(spansUnicode.length).toBeGreaterThanOrEqual(1);

      // Invariant: all three representations represent the exact same mathematical entity
      // and must participate in the same variable data-flow stream.
      expect(spansMacro[0].color).toBe(spansBare[0].color);
      expect(spansMacro[0].color).toBe(spansUnicode[0].color);
    });

    it("detects δx and delta x as differential variations just like \\delta x", () => {
      const diffMacro = findDifferentialSpans("\\delta x");
      const diffUnicode = findDifferentialSpans("δx");
      const diffBare = findDifferentialSpans("delta x");

      expect(diffMacro.length).toBe(1);
      expect(diffUnicode.length).toBe(1);
      expect(diffBare.length).toBe(1);
    });
  });

  describe("5. Delimiter Scope Decoupling: CodeMirror 6 vs MathJax CHTML", () => {
    it("allows CodeMirror 6 to mark opening \\left( without wrapping outer expression in MathJax", () => {
      const rawSpans = computeSemanticMathSpans("\\left( x + y \\right)", DEFAULT_COLORS, {
        rainbowDelimiters: true,
      }, false);

      // In CM6 (forLatexWrap = false), discrete marks on \\left( are allowed
      const openMark = rawSpans.find((s) => s.start === 0);
      expect(openMark).toBeDefined();

      // In MathJax baking (forLatexWrap = true), \\left( must NOT wrap the whole expression in \\textcolor
      const latexBaked = colorLatexBody("\\left( x + y \\right)", DEFAULT_COLORS, {
        rainbowDelimiters: true,
      });

      // Scope flooding guard: \textcolor must not wrap \left( ... \right)
      expect(latexBaked).not.toMatch(/^\\textcolor\{[^}]+\}\{\\left\(/);
    });
  });
});
