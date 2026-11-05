// tests/syntactic_sugar.test.ts
import { describe, it, expect } from "vitest";
import {
  normalizeAsciiEllipses,
  normalizeChainedRoots,
  normalizeBracketMatrices,
  validateMatrixDelimiters,
  normalizeMathSyntax,
} from "../src/utils/latex_helpers";
import { collectTaxonomySpans } from "../src/parsers/taxonomy";
import { collectVariableSpans } from "../src/parsers/variable_hash";
import { DEFAULT_COLORS } from "../src/config";
import { colorLatexBody } from "../src/converters/generic";

describe("Phase 8: ⚡ Max Speed Syntactic Sugar & Ergonomics", () => {
  describe("Contextual ASCII Ellipses (normalizeAsciiEllipses)", () => {
    it("converts dots between binary operators into \\cdots", () => {
      expect(normalizeAsciiEllipses("1 + ... + n")).toBe("1 + \\cdots + n");
      expect(normalizeAsciiEllipses("x_1 * ... * x_k")).toBe("x_1 * \\cdots * x_k");
      expect(normalizeAsciiEllipses("a_1 - ... - a_n")).toBe("a_1 - \\cdots - a_n");
    });

    it("converts 4+ dots (e.g. .....) in operator contexts into \\cdots", () => {
      expect(normalizeAsciiEllipses("1 + ..... + n")).toBe("1 + \\cdots + n");
      expect(normalizeAsciiEllipses("a * .... * b")).toBe("a * \\cdots * b");
    });

    it("converts dots between commas or punctuation into \\ldots", () => {
      expect(normalizeAsciiEllipses("x_1, ..., x_n")).toBe("x_1, \\ldots , x_n");
      expect(normalizeAsciiEllipses("1, 2, ..., n")).toBe("1, 2, \\ldots , n");
      expect(normalizeAsciiEllipses("(a, b, ...)")).toBe("(a, b, \\ldots )");
    });

    it("preserves LaTeX commands and comments", () => {
      expect(normalizeAsciiEllipses("\\cdots + \\ldots")).toBe("\\cdots + \\ldots");
      expect(normalizeAsciiEllipses("% note ...\nx + y")).toBe("% note ...\nx + y");
      expect(normalizeAsciiEllipses('\\text{waiting...}')).toBe('\\text{waiting...}');
    });
  });

  describe("Arity-Gated Chained Roots (normalizeChainedRoots)", () => {
    it("normalizes single-argument root sqrt[x] to \\sqrt{x}", () => {
      expect(normalizeChainedRoots("sqrt[x]")).toBe("\\sqrt{x}");
      expect(normalizeChainedRoots("sqrt[x^2 + 1]")).toBe("\\sqrt{x^2 + 1}");
    });

    it("normalizes chained double-argument root sqrt[n][x] to \\sqrt[n]{x}", () => {
      expect(normalizeChainedRoots("sqrt[3][x]")).toBe("\\sqrt[3]{x}");
      expect(normalizeChainedRoots("sqrt[n][x^2 + y^2]")).toBe("\\sqrt[n]{x^2 + y^2}");
    });

    it("strictly respects arity = 2 limit and preserves subsequent brackets (e.g. sqrt[3][aj][kd])", () => {
      expect(normalizeChainedRoots("sqrt[3][aj][kd]")).toBe("\\sqrt[3]{aj}[kd]");
      expect(normalizeChainedRoots("\\sqrt[3][aj][kd]")).toBe("\\sqrt[3]{aj}[kd]");
    });

    it("preserves canonical LaTeX roots and grouped expressions intact", () => {
      expect(normalizeChainedRoots("\\sqrt{x}")).toBe("\\sqrt{x}");
      expect(normalizeChainedRoots("\\sqrt[n]{x}")).toBe("\\sqrt[n]{x}");
      expect(normalizeChainedRoots("\\sqrt[n]{jsh}{dud}")).toBe("\\sqrt[n]{jsh}{dud}");
    });

    it("never touches array indexing like A[i][j]", () => {
      expect(normalizeChainedRoots("A[i][j]")).toBe("A[i][j]");
      expect(normalizeChainedRoots("M[row][col]")).toBe("M[row][col]");
    });
  });

  describe("Shift-Free Breathing-Room Matrices (normalizeBracketMatrices)", () => {
    it("normalizes mat[1, 2; 3, 4] to matrix environment", () => {
      expect(normalizeBracketMatrices("mat[1, 2; 3, 4]")).toBe(
        "\\begin{matrix} 1 & 2 \\\\ 3 & 4 \\end{matrix}"
      );
    });

    it("normalizes pmat[1, 2; 3, 4] and bmat[1, 2; 3, 4]", () => {
      expect(normalizeBracketMatrices("pmat[1, 2; 3, 4]")).toBe(
        "\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}"
      );
      expect(normalizeBracketMatrices("bmat[a, b; c, d]")).toBe(
        "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}"
      );
    });

    it("accepts physical newlines, semicolons, and \\\\ interchangeably as row delimiters", () => {
      expect(normalizeBracketMatrices("pmat[1, 2 \n 3, 4]")).toBe(
        "\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}"
      );
      expect(normalizeBracketMatrices("mat[1, 2 \\\\ 3, 4]")).toBe(
        "\\begin{matrix} 1 & 2 \\\\ 3 & 4 \\end{matrix}"
      );
    });

    it("shields inner parentheses and brackets from column splitting", () => {
      expect(normalizeBracketMatrices("mat[f(a, b), 2; 3, 4]")).toBe(
        "\\begin{matrix} f(a, b) & 2 \\\\ 3 & 4 \\end{matrix}"
      );
      expect(normalizeBracketMatrices("mat[[1, 2], 3; 4, 5]")).toBe(
        "\\begin{matrix} [1, 2] & 3 \\\\ 4 & 5 \\end{matrix}"
      );
    });

    it("accepts both brackets [] and braces {} as matrix delimiters", () => {
      expect(normalizeBracketMatrices("mat{1, 2; 3, 4}")).toBe(
        "\\begin{matrix} 1 & 2 \\\\ 3 & 4 \\end{matrix}"
      );
      expect(normalizeBracketMatrices("pmat{a, b; c, d}")).toBe(
        "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}"
      );
    });

    it("strictly rejects parentheses () to avoid confusion with functions or variable products", () => {
      // mat(x) is NOT a matrix constructor
      expect(normalizeBracketMatrices("mat(1, 2; 3, 4)")).toBe("mat(1, 2; 3, 4)");
    });

    it("cleanly ignores trailing semicolons without creating empty phantom rows", () => {
      expect(normalizeBracketMatrices("mat[1, 2; 3, 4;]")).toBe(
        "\\begin{matrix} 1 & 2 \\\\ 3 & 4 \\end{matrix}"
      );
    });

    it("normalizes dmat, cmat, nmat, and Vmat to their canonical LaTeX environments", () => {
      expect(normalizeBracketMatrices("dmat[1, 2; 3, 4]")).toBe(
        "\\begin{vmatrix} 1 & 2 \\\\ 3 & 4 \\end{vmatrix}"
      );
      expect(normalizeBracketMatrices("cmat[1, 2; 3, 4]")).toBe(
        "\\begin{Bmatrix} 1 & 2 \\\\ 3 & 4 \\end{Bmatrix}"
      );
      expect(normalizeBracketMatrices("nmat[1, 2; 3, 4]")).toBe(
        "\\begin{Vmatrix} 1 & 2 \\\\ 3 & 4 \\end{Vmatrix}"
      );
      expect(normalizeBracketMatrices("Vmat[1, 2; 3, 4]")).toBe(
        "\\begin{Vmatrix} 1 & 2 \\\\ 3 & 4 \\end{Vmatrix}"
      );
    });

    it("normalizes cases, dcases, rcases, align, aligned, gather, and split environments", () => {
      expect(normalizeBracketMatrices("cases[x, x >= 0; -x, x < 0]")).toBe(
        "\\begin{cases} x & x >= 0 \\\\ -x & x < 0 \\end{cases}"
      );
      expect(normalizeBracketMatrices("dcases[x, x >= 0; -x, x < 0]")).toBe(
        "\\begin{dcases} x & x >= 0 \\\\ -x & x < 0 \\end{dcases}"
      );
      expect(normalizeBracketMatrices("rcases[x, x >= 0; -x, x < 0]")).toBe(
        "\\begin{rcases} x & x >= 0 \\\\ -x & x < 0 \\end{rcases}"
      );
      expect(normalizeBracketMatrices("align[a &= b + c; d &= e + f]")).toBe(
        "\\begin{aligned} a &= b + c \\\\ d &= e + f \\end{aligned}"
      );
      expect(normalizeBracketMatrices("aligned[a &= b; c &= d]")).toBe(
        "\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}"
      );
      expect(normalizeBracketMatrices("gather[E = mc^2; F = ma]")).toBe(
        "\\begin{gathered} E = mc^2 \\\\ F = ma \\end{gathered}"
      );
      expect(normalizeBracketMatrices("split[a &= b + c; &= d]")).toBe(
        "\\begin{split} a &= b + c \\\\ &= d \\end{split}"
      );
    });

    it("normalizes delimiter-wrapped matrix shorthands (|mat[]|, ||mat[]||, \\{mat[]\\})", () => {
      expect(normalizeBracketMatrices("|mat[1, 2; 3, 4]|")).toBe(
        "\\begin{vmatrix} 1 & 2 \\\\ 3 & 4 \\end{vmatrix}"
      );
      expect(normalizeBracketMatrices("||mat[1, 2; 3, 4]||")).toBe(
        "\\begin{Vmatrix} 1 & 2 \\\\ 3 & 4 \\end{Vmatrix}"
      );
      expect(normalizeBracketMatrices("\\|mat[1, 2; 3, 4]\\|")).toBe(
        "\\begin{Vmatrix} 1 & 2 \\\\ 3 & 4 \\end{Vmatrix}"
      );
      expect(normalizeBracketMatrices("\\{mat[1, 2; 3, 4]\\}")).toBe(
        "\\begin{Bmatrix} 1 & 2 \\\\ 3 & 4 \\end{Bmatrix}"
      );
      expect(normalizeBracketMatrices("\\{dmat[1, 2; 3, 4]\\}")).toBe(
        "\\begin{Bmatrix} 1 & 2 \\\\ 3 & 4 \\end{Bmatrix}"
      );
      expect(normalizeBracketMatrices("(mat[1, 2; 3, 4])")).toBe(
        "\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}"
      );
      expect(normalizeBracketMatrices("[mat[1, 2; 3, 4]]")).toBe(
        "\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}"
      );
    });
  });

  describe("Non-Blocking Matrix Column Diagnostic (validateMatrixDelimiters)", () => {
    it("reports valid on uniform rectangular matrices", () => {
      const valid = "\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}";
      expect(validateMatrixDelimiters(valid)).toEqual({ isRagged: false, raggedRows: [] });
    });

    it("flags ragged/inconsistent matrix rows without throwing", () => {
      const ragged = "\\begin{matrix} 1 & 2 & 3 \\\\ 4 & 5 \\end{matrix}";
      const res = validateMatrixDelimiters(ragged);
      expect(res.isRagged).toBe(true);
      expect(res.raggedRows).toEqual([2]);
    });

    it("auto-pads ragged matrix rows to maximum column dimension when enabled", () => {
      const ragged = "mat[1, 2, 3; 4, 5]";
      const padded = normalizeMathSyntax(ragged, { raggedRowDiagnostics: true });
      expect(padded).toBe("\\begin{matrix} 1 & 2 & 3 \\\\ 4 & 5 & \\end{matrix}");
    });

    it("leaves ragged rows unpadded when raggedRowDiagnostics is false", () => {
      const ragged = "mat[1, 2, 3; 4, 5]";
      const unpadded = normalizeMathSyntax(ragged, { raggedRowDiagnostics: false });
      expect(unpadded).toBe("\\begin{matrix} 1 & 2 & 3 \\\\ 4 & 5 \\end{matrix}");
    });

    it("rectifies raw LaTeX matrix environments when raggedRowDiagnostics is true", () => {
      const rawRagged = "\\begin{pmatrix} 1 & 2 & 3 \\\\ 4 & 5 \\end{pmatrix}";
      const rectified = normalizeMathSyntax(rawRagged, { raggedRowDiagnostics: true });
      expect(rectified).toBe("\\begin{pmatrix} 1 & 2 & 3 \\\\ 4 & 5 & \\end{pmatrix}");
    });

    it("strictly exempts alignment families (aligned, cases) from rectilinear column padding", () => {
      const alignedInput = "aligned[a &= b + c; &= d]";
      const alignedOutput = normalizeBracketMatrices(alignedInput, "matrix", true, true, true);
      expect(alignedOutput).toBe("\\begin{aligned} a &= b + c \\\\ &= d \\end{aligned}");

      const casesInput = "cases[x > 0, 1; 0]";
      const casesOutput = normalizeBracketMatrices(casesInput, "matrix", true, true, true);
      expect(casesOutput).toBe("\\begin{cases} x > 0 & 1 \\\\ 0 \\end{cases}");
    });
  });

  describe("Mid-Typing Virtual Delimiter Sealing & Crash Immunity", () => {
    it("auto-seals mid-typing unclosed bracket matrices", () => {
      // With default padding, row 2 is padded to 2 columns
      expect(normalizeBracketMatrices("pmat[1, 2; 3")).toBe(
        "\\begin{pmatrix} 1 & 2 \\\\ 3 & \\end{pmatrix}"
      );
      // With padding disabled, row 2 remains unpadded
      expect(normalizeBracketMatrices("pmat[1, 2; 3", "matrix", true, true, false)).toBe(
        "\\begin{pmatrix} 1 & 2 \\\\ 3 \\end{pmatrix}"
      );
      expect(normalizeBracketMatrices("mat[1, 2; 3, 4")).toBe(
        "\\begin{matrix} 1 & 2 \\\\ 3 & 4 \\end{matrix}"
      );
    });

    it("auto-seals unclosed delimiter-wrapped matrix shorthands", () => {
      // Unclosed inner bracket
      expect(normalizeBracketMatrices("|mat[1, 2")).toBe(
        "\\begin{vmatrix} 1 & 2 \\end{vmatrix}"
      );
      // Closed inner bracket, unclosed outer delimiter
      expect(normalizeBracketMatrices("|mat[1, 2; 3, 4]")).toBe(
        "\\begin{vmatrix} 1 & 2 \\\\ 3 & 4 \\end{vmatrix}"
      );
    });

    it("auto-seals mid-typing chained roots and bracket fractions in normalizeMathSyntax", () => {
      expect(normalizeMathSyntax("sqrt[3][x")).toBe("\\sqrt[3]{x}");
      expect(normalizeMathSyntax("frac[a][b")).toBe("\\frac{a}{b}");
      expect(normalizeMathSyntax("frac[a")).toBe("\\frac{a}{}");
    });

    it("auto-seals mid-typing unclosed raw LaTeX environments in normalizeMathSyntax", () => {
      expect(normalizeMathSyntax("\\begin{pmatrix} 1 & 2", { crashImmunityAutoSeal: true })).toBe(
        "\\begin{pmatrix} 1 & 2 \\end{pmatrix}"
      );
    });
  });

  describe("Master Normalizer Integration & Settings Gating", () => {
    it("normalizes sugar combinations through normalizeMathSyntax", () => {
      const input = 'pmat[1, 2; 3, 4] \\quad sqrt[3][x] \\quad a >= b \\quad 1 + ... + n';
      const output = normalizeMathSyntax(input);
      expect(output).toContain("\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}");
      expect(output).toContain("\\sqrt[3]{x}");
      expect(output).toContain("\\ge");
      expect(output).toContain("\\cdots");
    });

    it("respects master toggle speedSyntacticSugar: false", () => {
      const input = "a >= b \\quad sqrt[3][x] \\quad mat[1, 2; 3, 4]";
      const output = normalizeMathSyntax(input, { speedSyntacticSugar: false });
      expect(output).toBe(input);
    });

    it("respects granular sub-toggles", () => {
      const input = "a >= b \\quad sqrt[3][x] \\quad mat[1, 2; 3, 4]";
      const output = normalizeMathSyntax(input, {
        speedSyntacticSugar: true,
        sugarAsciiOperators: false,
        sugarChainedRoots: true,
        sugarBracketMatrices: false,
      });
      expect(output).toContain("a >= b");
      expect(output).toContain("\\sqrt[3]{x}");
      expect(output).toContain("mat[1, 2; 3, 4]");
    });
  });

  describe("Editor Tokenizer & Variable Data-Flow Protection", () => {
    it("recognizes mat[ as an atomic constructor keyword (not m, a, t variables)", () => {
      const input = "mat[1, 2; 3, 4]";
      const taxSpans = collectTaxonomySpans(input, DEFAULT_COLORS);
      const matSpan = taxSpans.find((s) => s.start === 0 && s.end === 3);
      expect(matSpan).toBeDefined();
      expect(matSpan?.priority).toBe(25);

      const varSpans = collectVariableSpans(input);
      const varInsideMat = varSpans.filter((s) => s.start >= 0 && s.end <= 3);
      expect(varInsideMat).toHaveLength(0); // m, a, t are NOT split into individual variables!
    });

    it("recognizes mat{ as an atomic constructor keyword", () => {
      const input = "mat{1, 2; 3, 4}";
      const taxSpans = collectTaxonomySpans(input, DEFAULT_COLORS);
      const matSpan = taxSpans.find((s) => s.start === 0 && s.end === 3);
      expect(matSpan).toBeDefined();

      const varSpans = collectVariableSpans(input);
      const varInsideMat = varSpans.filter((s) => s.start >= 0 && s.end <= 3);
      expect(varInsideMat).toHaveLength(0);
    });

    it("preserves m, a, t as separate variables when NOT followed by [] or {}", () => {
      const input = "mat + x";
      const taxSpans = collectTaxonomySpans(input, DEFAULT_COLORS);
      const matSpan = taxSpans.find((s) => s.start === 0 && s.end === 3);
      expect(matSpan).toBeUndefined(); // NOT a matrix constructor

      const varSpans = collectVariableSpans(input);
      // m, a, t are preserved as individual variables
      const letters = varSpans.filter((s) => s.start >= 0 && s.end <= 3);
      expect(letters.length).toBeGreaterThan(0);
    });

    it("preserves m, a, t as function/variables when followed by () e.g. mat(x)", () => {
      const input = "mat(x)";
      const taxSpans = collectTaxonomySpans(input, DEFAULT_COLORS);
      const matSpan = taxSpans.find((s) => s.start === 0 && s.end === 3);
      expect(matSpan).toBeUndefined(); // Strictly rejected () to avoid confusion
    });

    it("recognizes sqrt[ as an atomic radical constructor", () => {
      const input = "sqrt[3][x]";
      const taxSpans = collectTaxonomySpans(input, DEFAULT_COLORS);
      const sqrtSpan = taxSpans.find((s) => s.start === 0 && s.end === 4);
      expect(sqrtSpan).toBeDefined();

      const varSpans = collectVariableSpans(input);
      const varInsideSqrt = varSpans.filter((s) => s.start >= 0 && s.end <= 4);
      expect(varInsideSqrt).toHaveLength(0);
    });
    it("recognizes align[ as an atomic alignment constructor and desugars in colorLatexBody without splitting align into letters", () => {
      const input = "align[\na &= b + c;\nd &= e + f\n]";
      const normalized = normalizeMathSyntax(input);
      expect(normalized).toBe("\\begin{aligned} a &= b + c \\\\ d &= e + f \\end{aligned}");

      const colored = colorLatexBody(input, DEFAULT_COLORS);
      expect(colored).toContain("\\begin{aligned}");
      expect(colored).toContain("\\end{aligned}");
      // Must NOT contain separate \textcolor wraps on letters of "align"
      expect(colored).not.toMatch(/\\textcolor\{[^}]+\}\{a\}\\textcolor\{[^}]+\}\{l\}/);

      const taxSpans = collectTaxonomySpans(input, DEFAULT_COLORS);
      const alignSpan = taxSpans.find((s) => s.start === 0 && s.end === 5);
      expect(alignSpan).toBeDefined();

      const varSpans = collectVariableSpans(input);
      const varInsideAlign = varSpans.filter((s) => s.start >= 0 && s.end <= 5);
      expect(varInsideAlign).toHaveLength(0);
    });
  });

  describe("Uncolored Relations & Contrast Invariance", () => {
    it("never wraps binary relations (>=, <=, =, \\ge, \\le) in \\textcolor{white}", () => {
      const inputs = [
        "a >= b",
        "x = y",
        "u <= v",
        "a != b",
        "p \\ge q",
        "m \\le n",
      ];
      for (const input of inputs) {
        const colored = colorLatexBody(input, DEFAULT_COLORS);
        expect(colored).not.toContain("\\textcolor{white}{=}");
        expect(colored).not.toContain("\\textcolor{white}{\\ge}");
        expect(colored).not.toContain("\\textcolor{white}{\\le}");
        expect(colored).not.toContain("\\textcolor{white}{>=}");
        expect(colored).not.toContain("\\textcolor{white}{<=}");
        expect(colored).not.toContain("\\textcolor{white}{!=}");
      }
    });

    it("allows spacing macros to maintain layout styling without corrupting text", () => {
      const input = "a \\quad b";
      const colored = colorLatexBody(input, DEFAULT_COLORS);
      // \\quad is permitted to be wrapped or preserved
      expect(colored).toContain("b");
    });
  });
});
