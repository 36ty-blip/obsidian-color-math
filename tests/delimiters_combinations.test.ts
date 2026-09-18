// tests/delimiters_combinations.test.ts
import { describe, it, expect } from "vitest";
import { findDelimiterPairs, findDelimiterScan, collectDelimiterSpans } from "../src/parsers/delimiters";
import { colorLatexBody } from "../src/converters/generic";
import { RAINBOW_DELIMITER_COLORS } from "../src/config";

describe("Bare Braces & Delimiter Stress Combinations", () => {
  const optionsAllOn = {
    rainbowDelimiters: true,
    rainbowBareBraces: true,
    highlightUnmatchedBraces: true,
    enableTaxonomy: true,
    variableDataFlow: true,
  };

  it("Combo 1: Bare braces nested inside \left( ... \right)", () => {
    const input = "\\left( \\frac{a + b}{c + d} \\right)";
    const scan = findDelimiterScan(input, { includeBareBraces: true });
    expect(scan.unmatched.length).toBe(0);
    // Outer \left( \right) is depth 0, inner {a+b} and {c+d} are depth 1
    const outer = scan.pairs.find((p) => p.open.isLeftRight);
    expect(outer).toBeDefined();
    expect(outer!.depth).toBe(0);

    const innerBraces = scan.pairs.filter((p) => p.open.type === "bare_brace");
    expect(innerBraces.length).toBe(2);
    expect(innerBraces[0].depth).toBe(1);
    expect(innerBraces[1].depth).toBe(1);

    // Bake check
    const baked = colorLatexBody(input, undefined, optionsAllOn);
    expect(baked).not.toMatch(/\\textcolor\{[^}]+\}\{[\{\}]/);
  });

  it("Combo 2: Parentheses nested inside bare braces", () => {
    const input = "\\frac{(a + b)}{(c + d)}";
    const scan = findDelimiterScan(input, { includeBareBraces: true });
    expect(scan.unmatched.length).toBe(0);
    // Outer bare braces are depth 0
    const bareBraces = scan.pairs.filter((p) => p.open.type === "bare_brace");
    expect(bareBraces.length).toBe(2);
    expect(bareBraces[0].depth).toBe(0);
    expect(bareBraces[1].depth).toBe(0);

    // Inner parens are depth 1
    const parens = scan.pairs.filter((p) => p.open.type === "paren");
    expect(parens.length).toBe(2);
    expect(parens[0].depth).toBe(1);
    expect(parens[1].depth).toBe(1);

    // Bake check
    const baked = colorLatexBody(input, undefined, optionsAllOn);
    expect(baked).not.toMatch(/\\textcolor\{[^}]+\}\{[\{\}]/);
  });

  it("Combo 3: Deep Gaussian fraction with multiple nested exponents & square root", () => {
    const input = "\\frac{e^{-\\frac{(x - \\mu)^2}{2\\sigma^2}}}{\\sqrt{2\\pi\\sigma^2}}";
    const scan = findDelimiterScan(input, { includeBareBraces: true });
    expect(scan.unmatched.length).toBe(0);

    // Live preview collector test
    const liveSpans = collectDelimiterSpans(input, {
      forLatexWrap: false,
      includeBareBraces: true,
      highlightUnmatched: true,
    });
    expect(liveSpans.length).toBeGreaterThan(0);
    // No error spans (priority 99)
    const errSpans = liveSpans.filter((s) => s.priority === 99);
    expect(errSpans.length).toBe(0);

    // Bake check: strictly no bare braces wrapped
    const baked = colorLatexBody(input, undefined, optionsAllOn);
    expect(baked).not.toMatch(/\\textcolor\{[^}]+\}\{[\{\}]/);
  });

  it("Combo 4: Escaped set braces \\{ ... \\} mixed with bare braces", () => {
    const input = "\\left\\{ x \\in \\mathbb{R} \\;\\middle|\\; \\frac{x^2}{2} > 0 \\right\\}";
    const scan = findDelimiterScan(input, { includeBareBraces: true });
    expect(scan.unmatched.length).toBe(0);

    // Escaped set braces are type 'brace'
    const setBraces = scan.pairs.find((p) => p.open.type === "brace");
    expect(setBraces).toBeDefined();

    // Bare braces in \mathbb{R} and \frac{x^2}{2} are type 'bare_brace' (3 pairs: {R}, {x^2}, {2})
    const bare = scan.pairs.filter((p) => p.open.type === "bare_brace");
    expect(bare.length).toBe(3);

    const baked = colorLatexBody(input, undefined, optionsAllOn);
    // Escaped \{ can be wrapped by \left...\right, but bare { never is wrapped on its own
    expect(baked).not.toMatch(/\\textcolor\{[^}]+\}\{\{/);
  });

  it("Combo 5: Matrix environment with \\begin{pmatrix} and \\\\ line breaks", () => {
    const input = "\\begin{pmatrix} a_{1,1} & \\frac{b}{c} \\\\ d & e^{i\\pi} \\end{pmatrix}";
    const scan = findDelimiterScan(input, { includeBareBraces: true });
    expect(scan.unmatched.length).toBe(0);

    // Environment names {pmatrix} must not be matched as math delimiters
    const envPairs = scan.pairs.filter((p) => input.slice(p.open.start, p.close.end).includes("pmatrix"));
    expect(envPairs.length).toBe(0);

    // {1,1}, {b}, {c}, and {i\pi} inside the matrix ARE matched (4 pairs)
    const bareInMatrix = scan.pairs.filter((p) => p.open.type === "bare_brace");
    expect(bareInMatrix.length).toBe(4);

    const baked = colorLatexBody(input, undefined, optionsAllOn);
    expect(baked).not.toMatch(/\\textcolor\{[^}]+\}\{[\{\}]/);
  });

  it("Combo 6: Empty bare braces like x^{} and \\sqrt{}", () => {
    const input = "x^{} + \\sqrt{} + \\frac{}{b}";
    const scan = findDelimiterScan(input, { includeBareBraces: true });
    expect(scan.unmatched.length).toBe(0);
    expect(scan.pairs.length).toBe(4);

    const baked = colorLatexBody(input, undefined, optionsAllOn);
    expect(baked).not.toMatch(/\\textcolor\{[^}]+\}\{[\{\}]/);
  });

  it("Combo 7: Subscripts and superscripts with and without braces", () => {
    const input = "x_1^2 + x_{i,j}^{n+1} + A_{k}^m";
    const scan = findDelimiterScan(input, { includeBareBraces: true });
    expect(scan.unmatched.length).toBe(0);
    // {i,j}, {n+1}, {k}
    expect(scan.pairs.length).toBe(3);

    const baked = colorLatexBody(input, undefined, optionsAllOn);
    expect(baked).not.toMatch(/\\textcolor\{[^}]+\}\{[\{\}]/);
  });

  it("Combo 8: Unmatched nested braces \\frac{\\frac{a}{b", () => {
    const input = "\\frac{\\frac{a}{b";
    const scan = findDelimiterScan(input, { includeBareBraces: true });
    // One matched pair {a}, two unclosed '{'
    expect(scan.pairs.length).toBe(1);
    expect(scan.unmatched.length).toBe(2);

    const liveSpans = collectDelimiterSpans(input, {
      forLatexWrap: false,
      includeBareBraces: true,
      highlightUnmatched: true,
    });
    const errors = liveSpans.filter((s) => s.priority === 99);
    expect(errors.length).toBe(2);
    expect(errors[0].color).toBe("#f7768e");
    expect(errors[1].color).toBe("#f7768e");
  });

  it("Combo 9: Stray extra closing braces a + b}}", () => {
    const input = "a + b}}";
    const scan = findDelimiterScan(input, { includeBareBraces: true });
    expect(scan.pairs.length).toBe(0);
    expect(scan.unmatched.length).toBe(2);
    expect(scan.unmatched[0].start).toBe(5);
    expect(scan.unmatched[1].start).toBe(6);

    const liveSpans = collectDelimiterSpans(input, {
      forLatexWrap: false,
      includeBareBraces: true,
      highlightUnmatched: true,
    });
    const errors = liveSpans.filter((s) => s.priority === 99);
    expect(errors.length).toBe(2);
  });

  it("Combo 10: Mixed unmatched delimiters ([{])", () => {
    const input = "([{})";
    const scan = findDelimiterScan(input, { includeBareBraces: true });
    // '(' matched with ')'
    // '[' never closed
    // '{' matched with '}'
    const matchedParen = scan.pairs.find((p) => p.open.type === "paren");
    expect(matchedParen).toBeDefined();

    const unmatchedBracket = scan.unmatched.find((u) => u.type === "bracket");
    expect(unmatchedBracket).toBeDefined();
  });
});
