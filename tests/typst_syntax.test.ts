// tests/typst_syntax.test.ts
import { describe, it, expect } from "vitest";
import {
  normalizeQuotedStrings,
  normalizeTypstFontShortcuts,
  normalizeInfixDivision,
  normalizeBareGreekInMath,
  normalizeLatexBraces,
  normalizeMathSyntax,
  normalizeAutoScaledDelimiters,
  autoSealUnclosedDelimiters,
} from "../src/utils/latex_helpers";
import { findAmbiguousTokenAtCursor } from "../src/editor/quick_menu_modal";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_COLORS } from "../src/config";

describe("Phase 1: Lexical Isolation & Quoted Strings", () => {
  it("converts double-quoted strings into \\text{...}", () => {
    expect(normalizeQuotedStrings('"where " x > 0')).toBe("\\text{where } x > 0");
    expect(normalizeQuotedStrings('x = 1 " if " y = 0')).toBe('x = 1 \\text{ if } y = 0');
  });

  it("handles escaped quotes inside text", () => {
    expect(normalizeQuotedStrings('"val: \\"x\\""')).toBe('\\text{val: \\"x\\"}');
  });

  it("does not corrupt double prime derivatives f''(x)", () => {
    expect(normalizeQuotedStrings("f''(x) + f'(x)")).toBe("f''(x) + f'(x)");
  });

  it("leaves unclosed quotes untouched to prevent swallowing following lines", () => {
    expect(normalizeQuotedStrings('"unclosed text')).toBe('"unclosed text');
  });
});

describe("Phase 2: Typst Font Shortcuts & Bare Greek", () => {
  it("converts bb(...) to \\mathbb{...}", () => {
    expect(normalizeTypstFontShortcuts("bb(R)")).toBe("\\mathbb{R}");
    expect(normalizeTypstFontShortcuts("bb(C) \\times bb(Z)")).toBe("\\mathbb{C} \\times \\mathbb{Z}");
  });

  it("converts cal(...) to \\mathcal{...}", () => {
    expect(normalizeTypstFontShortcuts("cal(L) + cal(H)")).toBe("\\mathcal{L} + \\mathcal{H}");
  });

  it("converts bold(...) with balanced nested parentheses", () => {
    expect(normalizeTypstFontShortcuts("bold(f(x))")).toBe("\\mathbf{f(x)}");
    expect(normalizeTypstFontShortcuts("bold(v)")).toBe("\\mathbf{v}");
  });

  it("converts frak(...) and scr(...)", () => {
    expect(normalizeTypstFontShortcuts("frak(g)")).toBe("\\mathfrak{g}");
    expect(normalizeTypstFontShortcuts("scr(F)")).toBe("\\mathscr{F}");
  });

  it("supports nested font shortcuts", () => {
    expect(normalizeTypstFontShortcuts("bold(cal(F))")).toBe("\\mathbf{\\mathcal{F}}");
  });

  it("converts bare Greek letters and constants to canonical macros", () => {
    expect(normalizeBareGreekInMath("alpha + beta = pi")).toBe("\\alpha + \\beta = \\pi");
    expect(normalizeBareGreekInMath("Delta x \\to 0")).toBe("\\Delta x \\to 0");
    expect(normalizeBareGreekInMath("hbar omega")).toBe("\\hbar \\omega");
    expect(normalizeBareGreekInMath("oo")).toBe("\\infty");
  });

  it("does not convert Greek words inside \\text{...}", () => {
    expect(normalizeBareGreekInMath("\\text{alpha version}")).toBe("\\text{alpha version}");
  });

  it("does not duplicate existing backslashes", () => {
    expect(normalizeBareGreekInMath("\\alpha + \\beta")).toBe("\\alpha + \\beta");
  });
});

describe("Phase 3: Structural Expressions & Infix Division", () => {
  it("converts braced infix division {a + b} / {c + d} into \\frac", () => {
    expect(normalizeInfixDivision("{a + b} / {c + d}")).toBe("\\frac{a + b}{c + d}");
  });

  it("preserves visible parentheses inside braces {(a + b)} / {(c + d)}", () => {
    expect(normalizeInfixDivision("{(a + b)} / {(c + d)}")).toBe("\\frac{(a + b)}{(c + d)}");
  });

  it("converts whitespace-bounded numbers 12 / 3 into \\frac", () => {
    expect(normalizeInfixDivision("12 / 3")).toBe("\\frac{12}{3}");
    expect(normalizeInfixDivision("1 / 2")).toBe("\\frac{1}{2}");
  });

  it("preserves flat unit slashes (m/s, km/h)", () => {
    expect(normalizeInfixDivision("9.8 m/s^2")).toBe("9.8 m/s^2");
    expect(normalizeInfixDivision("100 km/h")).toBe("100 km/h");
  });

  it("groups contiguous digits in prefix \\frac: \\frac 12 3 -> \\frac{12}{3}", () => {
    expect(normalizeLatexBraces("\\frac 12 3")).toBe("\\frac{12}{3}");
  });

  it("groups cohesive monomials in prefix \\frac: \\frac 1 2x -> \\frac{1}{2x}", () => {
    expect(normalizeLatexBraces("\\frac 1 2x")).toBe("\\frac{1}{2x}");
  });

  it("groups parenthesized arguments in prefix \\frac: \\frac (a+b) c", () => {
    expect(normalizeLatexBraces("\\frac (a+b) c")).toBe("\\frac{a+b}{c}");
  });

  it("absorbs functions and bare symbols in prefix \\frac", () => {
    expect(normalizeLatexBraces("\\frac \\sin(x) \\cos(x)")).toBe("\\frac{\\sin(x)}{\\cos(x)}");
    expect(normalizeLatexBraces("\\frac sin(x) cos(x)")).toBe("\\frac{sin(x)}{cos(x)}");
  });

  it("strictly stops at matrix cell boundaries & and \\\\", () => {
    expect(normalizeLatexBraces("\\frac a & b")).toBe("\\frac a & b");
  });
});

describe("Phase 4: Typst Auto-Scaling Delimiters & Crash Immunity", () => {
  it("auto-scales parentheses and brackets containing fractions", () => {
    expect(normalizeAutoScaledDelimiters("( \\frac{a}{b} )")).toBe("\\left( \\frac{a}{b} \\right)");
    expect(normalizeAutoScaledDelimiters("[ \\frac{1}{2} ]")).toBe("\\left[ \\frac{1}{2} \\right]");
  });

  it("auto-scales nested parentheses levels", () => {
    expect(normalizeAutoScaledDelimiters("( 1 + ( \\frac{a}{b} ) )")).toBe(
      "\\left( 1 + \\left( \\frac{a}{b} \\right) \\right)"
    );
  });

  it("does not auto-scale standard flat expressions", () => {
    expect(normalizeAutoScaledDelimiters("f(x) + g(y)")).toBe("f(x) + g(y)");
    expect(normalizeAutoScaledDelimiters("[0, 1]")).toBe("[0, 1]");
  });

  it("preserves explicitly sized delimiters", () => {
    expect(normalizeAutoScaledDelimiters("\\left( \\frac{a}{b} \\right)")).toBe(
      "\\left( \\frac{a}{b} \\right)"
    );
  });

  it("auto-scales big operators and matrices", () => {
    expect(normalizeAutoScaledDelimiters("( \\sum_{i=1}^n x_i )")).toBe(
      "\\left( \\sum_{i=1}^n x_i \\right)"
    );
    expect(
      normalizeAutoScaledDelimiters("[ \\begin{matrix} 1 & 0 \\\\ 0 & 1 \\end{matrix} ]")
    ).toBe("\\left[ \\begin{matrix} 1 & 0 \\\\ 0 & 1 \\end{matrix} \\right]");
  });

  it("auto-seals unclosed \\left delimiters with \\right. for crash immunity", () => {
    expect(autoSealUnclosedDelimiters("\\left( \\frac{a}{b}")).toBe(
      "\\left( \\frac{a}{b} \\right."
    );
    expect(autoSealUnclosedDelimiters("\\left[")).toBe("\\left[ \\right.");
  });

  it("auto-seals unclosed { scopes with } for crash immunity", () => {
    expect(autoSealUnclosedDelimiters("\\frac{a}{b")).toBe("\\frac{a}{b}");
    expect(autoSealUnclosedDelimiters("\\mathbf{x")).toBe("\\mathbf{x}");
    expect(autoSealUnclosedDelimiters("\\left( \\frac{a}{b")).toBe(
      "\\left( \\frac{a}{b} \\right."
    );
  });

  it("escapes dollar signs inside quoted strings", () => {
    expect(normalizeQuotedStrings('"price: $10"')).toBe("\\text{price: \\$10}");
    expect(normalizeQuotedStrings('"but $y=z$ then what to do ??"')).toBe(
      "\\text{but \\$y=z\\$ then what to do ??}"
    );
  });
});

describe("Phase 5: Ambiguous Notation Quick Menu", () => {
  it("detects multiplication asterisks at cursor", () => {
    const res = findAmbiguousTokenAtCursor("a * b", 2, 0);
    expect(res).not.toBeNull();
    expect(res?.some((s) => s.label === "\\cdot")).toBe(true);
    expect(res?.some((s) => s.label === "\\times")).toBe(true);
  });

  it("detects arrow notation at cursor", () => {
    const res = findAmbiguousTokenAtCursor("x -> 0", 3, 0);
    expect(res).not.toBeNull();
    expect(res?.some((s) => s.label === "\\to")).toBe(true);
  });

  it("detects implication arrows at cursor", () => {
    const res = findAmbiguousTokenAtCursor("P => Q", 3, 0);
    expect(res).not.toBeNull();
    expect(res?.some((s) => s.label === "\\implies")).toBe(true);
  });
});

describe("Master Pipeline: normalizeMathSyntax", () => {
  it("unifies Typst quotes, fonts, bare Greek, and infix division seamlessly", () => {
    const input = 'bb(R) \\times cal(H) " where " {alpha + beta} / 2';
    const output = normalizeMathSyntax(input);
    expect(output).toContain("\\mathbb{R}");
    expect(output).toContain("\\mathcal{H}");
    expect(output).toContain("\\text{ where }");
    expect(output).toContain("\\frac{\\alpha + \\beta}{2}");
  });

  it("auto-scales delimiters in full pipeline", () => {
    const input = '( {a} / {b} )';
    const output = normalizeMathSyntax(input, { autoScaleDelimiters: true });
    expect(output).toBe("\\left( \\frac{a}{b} \\right)");
  });

  it("auto-scales single vertical bars | ... | enclosing tall fractions or matrices", () => {
    const frac = '| \\frac{a}{b} |';
    expect(normalizeAutoScaledDelimiters(frac)).toBe("\\left| \\frac{a}{b} \\right|");

    const mat = '| \\begin{matrix} a & b \\\\ c & d \\end{matrix} |';
    expect(normalizeAutoScaledDelimiters(mat)).toBe("\\left| \\begin{matrix} a & b \\\\ c & d \\end{matrix} \\right|");
  });

  it("auto-scales double vertical bars \\| ... \\| enclosing tall elements", () => {
    const norm = '\\| \\frac{a}{b} \\|';
    expect(normalizeAutoScaledDelimiters(norm)).toBe("\\left\\| \\frac{a}{b} \\right\\|");
  });

  it("preserves lone vertical bars in conditional probability and set-builder notation without scaling", () => {
    const prob = '( A | B )';
    expect(normalizeAutoScaledDelimiters(prob)).toBe("( A | B )");

    const set = '\\{ x | x > 0 \\}';
    expect(normalizeAutoScaledDelimiters(set)).toBe("\\{ x | x > 0 \\}");
  });

  it("auto-inserts thin space \\; before tightly bound units when colorUnits is enabled", () => {
    expect(normalizeMathSyntax("12 m/s^2", { colorUnits: true })).toBe("12\\; m/s^{2}");
    expect(normalizeMathSyntax("12m/s^2", { colorUnits: true })).toBe("12\\; m/s^{2}");
    // When colorUnits is false: unit spacing is untouched
    expect(normalizeMathSyntax("12 m/s^2", { colorUnits: false })).toBe("12 m/s^{2}");
    // When loose (3 spaces): untouched
    expect(normalizeMathSyntax("12   m/s^2", { colorUnits: true })).toBe("12   m/s^{2}");
    // When operator: untouched
    expect(normalizeMathSyntax("12+m/s^2", { colorUnits: true })).toBe("12+m/s^{2}");
  });

  it("auto-seals unclosed delimiters and braces when crash immunity is enabled", () => {
    const input = '\\left( \\frac{a}{b';
    const output = normalizeMathSyntax(input, { crashImmunityAutoSeal: true });
    expect(output).toBe("\\left( \\frac{a}{b} \\right.");
  });

  it("normalizes and colors matrices enclosed in quotes and vertical bars properly", () => {
    const raw = '"matrices:"|\\begin{pmatrix} \\cfrac{1}{2} & \\cfrac{3}{4} \\\\ \\cfrac{5}{6} & \\cfrac{7}{8} \\end{pmatrix}|';
    const norm = normalizeMathSyntax(raw, { autoScaleDelimiters: true });
    expect(norm).toBe("\\text{matrices:}\\left|\\begin{pmatrix} \\cfrac{1}{2} & \\cfrac{3}{4} \\\\ \\cfrac{5}{6} & \\cfrac{7}{8} \\end{pmatrix}\\right|");

    const colored = colorLatexBody(raw, DEFAULT_COLORS, {
      previewLatexNormalization: true,
      autoScaleDelimiters: true,
      rainbowDelimiters: true,
    });
    // Ensure the matrix is NOT wrapped in an outer delimiter \\textcolor and vertical bars scale
    expect(colored).toContain("\\text{matrices:}\\left|\\begin{pmatrix}");
    expect(colored).not.toMatch(/\\textcolor\{[^}]+\}\{\\left\|\\begin\{pmatrix\}/);
  });

  it("preserves multiple spaces inside quoted strings and shields characters from math coloring", async () => {
    const raw = '"abcdefg         b"';
    const norm = normalizeQuotedStrings(raw);
    expect(norm).toBe("\\text{abcdefg\\ \\ \\ \\ \\ \\ \\ \\ \\ b}");

    const { collectVariableSpans } = await import("../src/parsers/variable_hash");
    const { collectTaxonomySpans } = await import("../src/parsers/taxonomy");
    expect(collectVariableSpans(raw)).toEqual([]);
    expect(collectTaxonomySpans(raw)).toEqual([]);

    const colored = colorLatexBody(raw, DEFAULT_COLORS, {
      enableTaxonomy: true,
      variableDataFlow: true,
      previewLatexNormalization: true,
    });
    expect(colored).toBe("\\text{abcdefg\\ \\ \\ \\ \\ \\ \\ \\ \\ b}");
    expect(colored).not.toContain("\\textcolor");
  });
});


