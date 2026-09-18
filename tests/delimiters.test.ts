import { describe, it, expect } from "vitest";
import { findDelimiterPairs, collectDelimiterSpans } from "../src/parsers/delimiters";
import { colorLatexBody } from "../src/converters/generic";
import { RAINBOW_DELIMITER_COLORS } from "../src/config";

describe("Rainbow Delimiters Parser", () => {
  it("parses single bracket pair at depth 0", () => {
    const pairs = findDelimiterPairs("(x + y)");
    expect(pairs.length).toBe(1);
    expect(pairs[0].depth).toBe(0);
    expect(pairs[0].open.type).toBe("paren");
    expect(pairs[0].close.type).toBe("paren");
  });

  it("parses nested brackets with increasing depth", () => {
    const pairs = findDelimiterPairs("([x + y])");
    expect(pairs.length).toBe(2);
    // Outer paren is depth 0
    const paren = pairs.find((p) => p.open.type === "paren");
    const bracket = pairs.find((p) => p.open.type === "bracket");
    expect(paren).toBeDefined();
    expect(bracket).toBeDefined();
    expect(paren!.depth).toBe(0);
    expect(bracket!.depth).toBe(1);
  });

  it("parses set braces \\{ and \\}", () => {
    const pairs = findDelimiterPairs("\\{ a, b, c \\}");
    expect(pairs.length).toBe(1);
    expect(pairs[0].depth).toBe(0);
    expect(pairs[0].open.type).toBe("brace");
  });

  it("parses LaTeX sized delimiters \\bigl( and \\bigr)", () => {
    const pairs = findDelimiterPairs("\\bigl( x \\bigr)");
    expect(pairs.length).toBe(1);
    expect(pairs[0].open.type).toBe("paren");
    expect(pairs[0].close.type).toBe("paren");
  });

  it("parses \\left( and \\right) pairs", () => {
    const pairs = findDelimiterPairs("\\left( \\frac{a}{b} \\right)");
    expect(pairs.length).toBe(1);
    expect(pairs[0].open.isLeftRight).toBe(true);
    expect(pairs[0].close.isLeftRight).toBe(true);
    expect(pairs[0].depth).toBe(0);
  });

  it("cycles colors across 4+ nesting depths", () => {
    const pairs = findDelimiterPairs("([([x])])");
    expect(pairs.length).toBe(4);
    const depths = pairs.map((p) => p.depth).sort();
    expect(depths).toEqual([0, 1, 2, 3]);

    const spans = collectDelimiterSpans("([([x])])");
    expect(spans.length).toBe(8); // 4 pairs * 2 delimiters
    // Depth 0 -> Gold
    expect(spans[0].color).toBe(RAINBOW_DELIMITER_COLORS[0]);
  });

  it("colors math latex with rainbow delimiters when enabled", () => {
    const input = "(a + [b + c])";
    const result = colorLatexBody(input, undefined, { rainbowDelimiters: true });
    // Depth 0: Gold #e0af68
    // Depth 1: Cyan #7aa2f7
    expect(result).toContain(`\\textcolor{${RAINBOW_DELIMITER_COLORS[0]}}{(}`);
    expect(result).toContain(`\\textcolor{${RAINBOW_DELIMITER_COLORS[0]}}{)}`);
    expect(result).toContain(`\\textcolor{${RAINBOW_DELIMITER_COLORS[1]}}{[}`);
    expect(result).toContain(`\\textcolor{${RAINBOW_DELIMITER_COLORS[1]}}{]}`);
  });

  it("parses bare angle brackets \\langle and \\rangle", () => {
    const pairs = findDelimiterPairs("\\langle x, y \\rangle");
    expect(pairs.length).toBe(1);
    expect(pairs[0].depth).toBe(0);
    expect(pairs[0].open.type).toBe("angle");
    expect(pairs[0].close.type).toBe("angle");
  });

  it("parses \\left\\langle and \\right\\rangle pairs", () => {
    const pairs = findDelimiterPairs("\\left\\langle x, y \\right\\rangle");
    expect(pairs.length).toBe(1);
    expect(pairs[0].open.isLeftRight).toBe(true);
    expect(pairs[0].close.isLeftRight).toBe(true);
    expect(pairs[0].open.type).toBe("angle");
    expect(pairs[0].close.type).toBe("angle");
  });

  it("correctly colors inner product and norms without cross-matching ket regex", () => {
    const expr1 = "|x| =\\sqrt{\\langle x,x\\rangle},";
    const res1 = colorLatexBody(expr1, undefined, {
      rainbowDelimiters: true,
      colorBraKet: true,
      variableDataFlow: true,
    });
    expect(res1).toContain("\\langle");
    expect(res1).toContain("\\rangle");
    // Both angle brackets are colored
    expect(res1).toMatch(/\\textcolor\{[^}]+\}\{\\langle\}/);
    expect(res1).toMatch(/\\textcolor\{[^}]+\}\{\\rangle\}/);
    // |x| must not be swallowed into a single ket
    expect(res1).toContain("|\\textcolor{");

    const expr2 = "\\cos\\theta=\\frac{\\langle x,y\\rangle}{|x||y|},";
    const res2 = colorLatexBody(expr2, undefined, {
      rainbowDelimiters: true,
      colorBraKet: true,
      variableDataFlow: true,
    });
    expect(res2).toMatch(/\\textcolor\{[^}]+\}\{\\langle\}/);
    expect(res2).toMatch(/\\textcolor\{[^}]+\}\{\\rangle\}/);
  });

  it("parses bare braces { and } when includeBareBraces is enabled", () => {
    const pairs = findDelimiterPairs("\\frac{a}{b}", { includeBareBraces: true });
    expect(pairs.length).toBe(2);
    expect(pairs[0].open.type).toBe("bare_brace");
    expect(pairs[0].depth).toBe(0);
    expect(pairs[1].open.type).toBe("bare_brace");
    expect(pairs[1].depth).toBe(0);
  });

  it("tracks nested bare braces depth in \\frac{x^{2}}{y}", () => {
    const pairs = findDelimiterPairs("\\frac{x^{2}}{y}", { includeBareBraces: true });
    expect(pairs.length).toBe(3);
    const inner = pairs.find((p) => p.depth === 1);
    expect(inner).toBeDefined();
    expect(inner!.open.start).toBe(8); // '{' in x^{2}
  });

  it("detects unclosed bare brace in \\frac{a}{b", () => {
    const scan = collectDelimiterSpans("\\frac{a}{b", {
      includeBareBraces: true,
      highlightUnmatched: true,
    });
    const errorSpans = scan.filter((s) => s.priority === 99);
    expect(errorSpans.length).toBe(1);
    expect(errorSpans[0].color).toBe("#f7768e");
  });

  it("detects stray closing bare brace in \\frac{a}{b}}", () => {
    const scan = collectDelimiterSpans("\\frac{a}{b}}", {
      includeBareBraces: true,
      highlightUnmatched: true,
    });
    const errorSpans = scan.filter((s) => s.priority === 99);
    expect(errorSpans.length).toBe(1);
    expect(errorSpans[0].color).toBe("#f7768e");
  });

  it("strictly ignores bare braces during permanent LaTeX baking (forLatexWrap: true)", () => {
    const bakedSpans = collectDelimiterSpans("\\frac{a}{b}", {
      forLatexWrap: true,
      includeBareBraces: true,
    });
    // Must NOT emit any bare braces into LaTeX string output!
    expect(bakedSpans.length).toBe(0);

    const converted = colorLatexBody("\\frac{a}{b}", undefined, {
      rainbowDelimiters: true,
      rainbowBareBraces: true,
    });
    // Raw bare braces must never be wrapped with \textcolor
    expect(converted).not.toContain("\\textcolor{#");
    expect(converted).toBe("\\frac{a}{b}");
  });
});

