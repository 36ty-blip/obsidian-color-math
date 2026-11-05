// tests/quick_wins.test.ts
import { describe, it, expect } from "vitest";
import {
  normalizeChainedRoots,
  normalizeNumberBoundUnits,
  normalizeBracketMatrices,
  normalizeMathSyntax,
} from "../src/utils/latex_helpers";
import { validateLatexWithMathJax } from "./validator";

describe("⚡ Life Quality Quick Wins: Ergonomics & Syntactic Precision", () => {
  describe("Item 1: Chained-Bracket Roots Engine", () => {
    it("normalizes single-argument root sqrt[x] to \\sqrt{x}", () => {
      expect(normalizeChainedRoots("sqrt[x]")).toBe("\\sqrt{x}");
      expect(normalizeChainedRoots("sqrt[x^2 + 1]")).toBe("\\sqrt{x^2 + 1}");
    });

    it("normalizes chained double-argument root sqrt[n][x] to \\sqrt[n]{x}", () => {
      expect(normalizeChainedRoots("sqrt[3][x]")).toBe("\\sqrt[3]{x}");
      expect(normalizeChainedRoots("sqrt[12][x]")).toBe("\\sqrt[12]{x}");
      expect(normalizeChainedRoots("sqrt[n][x^2 + \\frac{1}{y}]")).toBe(
        "\\sqrt[n]{x^2 + \\frac{1}{y}}"
      );
    });

    it("normalizes nested radicals recursively", () => {
      expect(normalizeChainedRoots("sqrt[sqrt[x]]")).toBe("\\sqrt{\\sqrt{x}}");
      expect(normalizeChainedRoots("sqrt[3][sqrt[y]]")).toBe(
        "\\sqrt[3]{\\sqrt{y}}"
      );
    });

    it("strictly respects arity = 2 limit and preserves subsequent brackets", () => {
      expect(normalizeChainedRoots("sqrt[3][a][b]")).toBe("\\sqrt[3]{a}[b]");
      expect(normalizeChainedRoots("\\sqrt[3][a][b]")).toBe("\\sqrt[3]{a}[b]");
    });

    it("leaves standard LaTeX \\sqrt intact", () => {
      expect(normalizeChainedRoots("\\sqrt{x}")).toBe("\\sqrt{x}");
      expect(normalizeChainedRoots("\\sqrt[3]{x}")).toBe("\\sqrt[3]{x}");
    });

    it("validates cleanly against MathJax", async () => {
      const latex = normalizeChainedRoots("sqrt[3][x^2 + 1]");
      const result = await validateLatexWithMathJax(latex);
      expect(result.valid).toBe(true);
    });
  });

  describe("Item 2: Backslash-Free Number-Bound Physical Units & % Comment-Cut Fix", () => {
    it("normalizes degree units", () => {
      expect(normalizeNumberBoundUnits("90 deg")).toBe("90^\\circ");
      expect(normalizeNumberBoundUnits("90deg")).toBe("90^\\circ");
      expect(normalizeNumberBoundUnits("25 degC")).toBe("25^\\circ\\text{C}");
      expect(normalizeNumberBoundUnits("25 deg_C")).toBe("25^\\circ\\text{C}");
      expect(normalizeNumberBoundUnits("98 degF")).toBe("98^\\circ\\text{F}");
      expect(normalizeNumberBoundUnits("98 deg_F")).toBe("98^\\circ\\text{F}");
    });

    it("normalizes electrical resistance units", () => {
      expect(normalizeNumberBoundUnits("10 ohm")).toBe("10\\; \\Omega");
      expect(normalizeNumberBoundUnits("4.7 kohm")).toBe("4.7\\; \\text{k}\\Omega");
      expect(normalizeNumberBoundUnits("1 Mohm")).toBe("1\\; \\text{M}\\Omega");
    });

    it("normalizes capacitance and inductance units", () => {
      expect(normalizeNumberBoundUnits("10 uF")).toBe("10\\; \\mu\\text{F}");
      expect(normalizeNumberBoundUnits("100 nF")).toBe("100\\; \\text{nF}");
      expect(normalizeNumberBoundUnits("22 pF")).toBe("22\\; \\text{pF}");
      expect(normalizeNumberBoundUnits("10 mH")).toBe("10\\; \\text{mH}");
      expect(normalizeNumberBoundUnits("47 uH")).toBe("47\\; \\mu\\text{H}");
    });

    it("normalizes frequency, current, and time units", () => {
      expect(normalizeNumberBoundUnits("100 kHz")).toBe("100\\; \\text{kHz}");
      expect(normalizeNumberBoundUnits("2.4 GHz")).toBe("2.4\\; \\text{GHz}");
      expect(normalizeNumberBoundUnits("10 mA")).toBe("10\\; \\text{mA}");
      expect(normalizeNumberBoundUnits("5 uA")).toBe("5\\; \\mu\\text{A}");
      expect(normalizeNumberBoundUnits("12 mV")).toBe("12\\; \\text{mV}");
      expect(normalizeNumberBoundUnits("10 ns")).toBe("10\\; \\text{ns}");
      expect(normalizeNumberBoundUnits("25 ms")).toBe("25\\; \\text{ms}");
      expect(normalizeNumberBoundUnits("50 us")).toBe("50\\; \\mu\\text{s}");
    });

    it("neutralizes comment line-truncation on number-bound percent signs", () => {
      expect(normalizeNumberBoundUnits("50 %")).toBe("50\\%");
      expect(normalizeNumberBoundUnits("50%")).toBe("50\\%");
      expect(normalizeNumberBoundUnits("x = 50% + 10%")).toBe("x = 50\\% + 10\\%");
    });

    it("preserves genuine LaTeX comments when not number-bound", () => {
      expect(normalizeNumberBoundUnits("% this is a comment\nx + y")).toBe(
        "% this is a comment\nx + y"
      );
    });

    it("respects loose spacing (>= 2 spaces) as intentional algebra", () => {
      expect(normalizeNumberBoundUnits("90  deg")).toBe("90  deg");
    });

    it("validates cleanly against MathJax", async () => {
      const latex = normalizeNumberBoundUnits("25 degC + 10 ohm + 50 %");
      const result = await validateLatexWithMathJax(latex);
      expect(result.valid).toBe(true);
    });
  });

  describe("Item 3: Augmented Matrix Partition Engine", () => {
    it("translates partitioned mat[...] into canonical LaTeX array", () => {
      const input = "mat[1, 0 | 4; 0, 1 | 5]";
      const output = normalizeBracketMatrices(input, "bmatrix");
      expect(output).toBe(
        "\\left[ \\begin{array}{cc|c} 1 & 0 & 4 \\\\ 0 & 1 & 5 \\end{array} \\right]"
      );
    });

    it("supports pmat and vmat partitioned environments", () => {
      expect(normalizeBracketMatrices("pmat[1, 0 | 4; 0, 1 | 5]")).toBe(
        "\\left( \\begin{array}{cc|c} 1 & 0 & 4 \\\\ 0 & 1 & 5 \\end{array} \\right)"
      );
      expect(normalizeBracketMatrices("vmat[1, 0 | 4; 0, 1 | 5]")).toBe(
        "\\left| \\begin{array}{cc|c} 1 & 0 & 4 \\\\ 0 & 1 & 5 \\end{array} \\right|"
      );
      expect(normalizeBracketMatrices("bmat[1, 0 | 4; 0, 1 | 5]")).toBe(
        "\\left[ \\begin{array}{cc|c} 1 & 0 & 4 \\\\ 0 & 1 & 5 \\end{array} \\right]"
      );
    });

    it("supports multi-partition augmented matrices", () => {
      const input = "mat[1 | 2, 3 | 4; 5 | 6, 7 | 8]";
      const output = normalizeBracketMatrices(input, "bmatrix");
      expect(output).toBe(
        "\\left[ \\begin{array}{c|cc|c} 1 & 2 & 3 & 4 \\\\ 5 & 6 & 7 & 8 \\end{array} \\right]"
      );
    });

    it("supports delimiter-wrapped shorthand with partitions", () => {
      expect(normalizeBracketMatrices("[mat[1, 0 | 4; 0, 1 | 5]]")).toBe(
        "\\left[ \\begin{array}{cc|c} 1 & 0 & 4 \\\\ 0 & 1 & 5 \\end{array} \\right]"
      );
      expect(normalizeBracketMatrices("(mat[1, 0 | 4; 0, 1 | 5])")).toBe(
        "\\left( \\begin{array}{cc|c} 1 & 0 & 4 \\\\ 0 & 1 & 5 \\end{array} \\right)"
      );
    });

    it("shields inner commas inside functions or brackets", () => {
      const input = "mat[f(1, 2), 0 | 4; 0, 1 | g(a, b)]";
      const output = normalizeBracketMatrices(input, "bmatrix");
      expect(output).toBe(
        "\\left[ \\begin{array}{cc|c} f(1, 2) & 0 & 4 \\\\ 0 & 1 & g(a, b) \\end{array} \\right]"
      );
    });

    it("preserves unpartitioned standard matrices with zero regression", () => {
      expect(normalizeBracketMatrices("mat[1, 2; 3, 4]", "matrix")).toBe(
        "\\begin{matrix} 1 & 2 \\\\ 3 & 4 \\end{matrix}"
      );
      expect(normalizeBracketMatrices("pmat[1, 2; 3, 4]")).toBe(
        "\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}"
      );
      expect(normalizeBracketMatrices("bmat[1, 2; 3, 4]")).toBe(
        "\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}"
      );
    });

    it("validates augmented matrix cleanly against MathJax", async () => {
      const latex = normalizeBracketMatrices("mat[1, 0 | 4; 0, 1 | 5]", "bmatrix");
      const result = await validateLatexWithMathJax(latex);
      expect(result.valid).toBe(true);
    });
  });

  describe("End-to-End Syntactic Sugar Integration (normalizeMathSyntax)", () => {
    it("normalizes expressions combining roots, units, percent, and augmented matrices", async () => {
      const input = "mat[1, 0 | 4; 0, 1 | 5] \\quad sqrt[3][x] \\quad 25 degC \\quad 50 %";
      const output = normalizeMathSyntax(input, {
        speedSyntacticSugar: true,
        sugarBracketMatrices: true,
        sugarChainedRoots: true,
        sugarNumberBoundUnits: true,
        defaultMatrixEnvironment: "bmatrix",
      });

      expect(output).toContain("\\begin{array}{cc|c}");
      expect(output).toContain("\\sqrt[3]{x}");
      expect(output).toContain("25^{\\circ}\\text{C}");
      expect(output).toContain("50\\%");

      const result = await validateLatexWithMathJax(output);
      expect(result.valid).toBe(true);
    });
  });
});
