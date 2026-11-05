// tests/regression_audit.test.ts
import { describe, it, expect } from "vitest";
import { MathCSTParser } from "../src/parsers/cst/parser";
import { collectSpansFromCST } from "../src/parsers/cst/collector";
import { applyColorSpans } from "../src/utils/spans";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_COLORS } from "../src/config";
import { validateLatexWithMathJax } from "./validator";

describe("Regression Audit: 7 Maximum-Stress CST & Normalizer Fixes", () => {
  // -------------------------------------------------------------------------
  // 1. Dirac Kets In-Place Parsing
  // -------------------------------------------------------------------------
  describe("1. Dirac Ket In-Place Parsing", () => {
    it("parses |\\psi(t)\\rangle with child coordinates in-place without corrupting index 0", () => {
      const formula = "|\\psi(t)\\rangle";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();

      expect(ast.length).toBe(1);
      const ket = ast[0];
      expect(ket.kind).toBe("group");
      if (ket.kind === "group") {
        expect(ket.isKet).toBe(true);
        expect(ket.start).toBe(0);
        expect(ket.end).toBe(formula.length);
        expect(ket.openStart).toBe(0);
        expect(ket.closeStart).toBe(formula.indexOf("\\rangle"));

        // Children: \psi and (t)
        const parenGroup = ket.children.find((c) => c.kind === "group" && c.delimType === "paren");
        expect(parenGroup).toBeDefined();
        // (t) must start at index 5, NOT at index 0!
        expect(parenGroup?.start).toBe(formula.indexOf("(t)"));
      }

      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true });
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });

    it("parses compound equation with Dirac ket without slicing prefix command", () => {
      const formula = "\\int_0^T |\\psi(t)\\rangle dt";
      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true });
      // Slicing prefix command would produce \in\textcolor{...}{t}
      expect(colored).not.toContain("\\in\\textcolor");
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });

    it("does not falsely classify order of cyclic group |\\langle x \\rangle| as a ket", () => {
      const formula = "|\\langle x \\rangle|";
      const ast = new MathCSTParser(formula).parse();
      const first = ast[0];
      // Should not be a ket with openText: "|" and closeText: "\rangle"
      if (first.kind === "group") {
        expect(first.isKet).toBeFalsy();
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. ScriptNode forLatexWrap Syntax Safety
  // -------------------------------------------------------------------------
  describe("2. ScriptNode forLatexWrap Syntax Safety", () => {
    it("wraps unified Pauli matrix \\sigma_x as \\textcolor{...}{\\sigma_x}, never \\sigma\\textcolor{...}{_x}", () => {
      const formula = "\\sigma_x + \\sigma_y + \\sigma_z";
      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true, colorQuantumOperators: true });
      expect(colored).not.toMatch(/\\sigma\s*\\textcolor\{[^}]+\}\{_[xyz]\}/);
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });

    it("wraps optimal minimizer x^* and Fenchel dual f^* cleanly without expected group error", () => {
      const formula = "x^* = \\arg\\min f(x) \\quad f^*(y)";
      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true });
      expect(colored).not.toMatch(/[xf]\s*\\textcolor\{[^}]+\}\{\^\*\}/);
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });

    it("wraps matrix transpose A^T keeping '^' outside \\textcolor", () => {
      const formula = "A^T A = I";
      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true });
      expect(colored).not.toContain("A\\textcolor");
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });

    it("wraps contravariant tensor indices T^{\\mu\\nu} keeping '^' outside \\textcolor", () => {
      const formula = "T^{\\mu\\nu} g_{\\mu\\nu}";
      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true });
      expect(colored).not.toMatch(/T\s*\\textcolor\{[^}]+\}\{\^/);
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });

    it("wraps evaluation bar [F(x)]_a^b without wrapping raw _ or ^", () => {
      const formula = "\\left[ F(x) \\right]_a^b";
      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true });
      expect(colored).not.toMatch(/\\right\]\s*\\textcolor\{[^}]+\}\{_[ab]\}/);
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });

    it("wraps stochastic quadratic variation [X]_t keeping '_' outside \\textcolor", () => {
      const formula = "[X]_t = \\int_0^t \\sigma_s^2 ds";
      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true });
      expect(colored).not.toMatch(/\]\s*\\textcolor\{[^}]+\}\{_t\}/);
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Limit Controls on Large Operators
  // -------------------------------------------------------------------------
  describe("3. Operator Limit Controls Binding", () => {
    it("binds \\limits to \\bigotimes and renders valid KaTeX without limit controls error", () => {
      const formula = "\\bigotimes\\limits_{i \\in I} V_i";
      const ast = new MathCSTParser(formula).parse();
      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS, forLatexWrap: true });
      const wrapped = applyColorSpans(formula, spans);
      expect(validateLatexWithMathJax(wrapped).valid).toBe(true);

      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true });
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });

    it("binds \\limits to \\bigwedge without KaTeX parse error", () => {
      const formula = "\\bigwedge\\limits_{k=1}^n \\omega_k";
      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true });
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Balanced Braces in MathCSTParser
  // -------------------------------------------------------------------------
  describe("4. Balanced Braces & Unbraced Command Tokens", () => {
    it("handles unbraced \\bar\\Upsilon without slicing backslash", () => {
      const formula = "\\bar\\Upsilon + \\bar\\phi";
      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true });
      expect(colored).not.toContain("\\bar\\");
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });

    it("handles nested environments in \\overline{\\begin{bmatrix}...\\end{bmatrix}} with balanced brace tracking", () => {
      const formula = "\\overline{\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}}";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();
      expect(ast.length).toBeGreaterThan(0);

      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true });
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Unbraced Accent Macros Normalization
  // -------------------------------------------------------------------------
  describe("5. Unbraced Accent Macros Normalization", () => {
    it("normalizes \\dot\\nu, \\vec\\alpha, and \\hat\\lambda into valid KaTeX", () => {
      const formula = "\\dot\\nu + \\vec\\alpha + \\hat\\lambda";
      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true, enableTaxonomy: true });
      expect(colored).not.toContain("\\dot\\textcolor");
      expect(colored).not.toContain("\\vec\\textcolor");
      expect(colored).not.toContain("\\hat\\textcolor");
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });

    it("normalizes \\hat a^\\dagger and ladder operators cleanly", () => {
      const formula = "\\hat a^\\dagger |0\\rangle";
      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true, colorQuantumOperators: true });
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Verbatim and Macro Isolation
  // -------------------------------------------------------------------------
  describe("6. Verbatim and Macro Isolation", () => {
    it("skips \\verb|...| in CST parser so pipe characters are not parsed as math division", () => {
      const formula = "\\verb|a|b|c| + x";
      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true });
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });

    it("skips macro definitions \\newcommand and \\def in CST parser", () => {
      const formula = "\\newcommand{\\d}[1]{\\,\\mathrm{d}#1\\,} x";
      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true });
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });

    it("skips opaque text blocks like \\text{[1]} without rainbow bracket coloring", () => {
      const formula = "x + \\text{[1]} + y";
      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true, rainbowDelimiters: true });
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Ladder Operator Regex Lookbehind
  // -------------------------------------------------------------------------
  describe("7. Quantum Ladder Operator Regex Lookbehind", () => {
    it("does not match trailing letter 'a' of \\alpha^\\dagger", () => {
      const formula = "\\alpha^\\dagger \\beta^\\dagger";
      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true, colorQuantumOperators: true });
      // Slicing \alpha would produce \alph\textcolor{...}{a^\dagger}
      expect(colored).not.toContain("\\alph\\");
      expect(colored).not.toContain("\\alph ");
      expect(colored).not.toContain("\\alph\\textcolor");
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });

    it("correctly matches standalone a^\\dagger and \\hat{a}^\\dagger", () => {
      const formula = "a^\\dagger + \\hat{a}^\\dagger";
      const colored = colorLatexBody(formula, DEFAULT_COLORS, { useCST: true, colorQuantumOperators: true });
      expect(validateLatexWithMathJax(colored).valid).toBe(true);
    });
  });
});
