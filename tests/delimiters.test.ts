import { describe, it, expect } from "vitest";
import { findDelimiterPairs, collectDelimiterSpans, findDelimiterScan } from "../src/parsers/delimiters";
import { colorLatexBody } from "../src/converters/generic";
import { autoSealUnclosedDelimiters } from "../src/utils/latex_helpers";
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

  it("does NOT produce error spans for half-open intervals like (] or [) or escaped braces \\{", () => {
    // (]
    const interval1 = collectDelimiterSpans("(]", {
      highlightUnmatched: true,
      includeBareBraces: true,
    });
    expect(interval1.filter((s) => s.priority === 99).length).toBe(0);

    // (0, 1]
    const interval2 = collectDelimiterSpans("(0, 1]", {
      highlightUnmatched: true,
      includeBareBraces: true,
    });
    expect(interval2.filter((s) => s.priority === 99).length).toBe(0);

    // [0, 1)
    const interval3 = collectDelimiterSpans("[0, 1)", {
      highlightUnmatched: true,
      includeBareBraces: true,
    });
    expect(interval3.filter((s) => s.priority === 99).length).toBe(0);

    // Standalone escaped brace \{
    const escapedBrace = collectDelimiterSpans("\\{", {
      highlightUnmatched: true,
      includeBareBraces: true,
    });
    expect(escapedBrace.filter((s) => s.priority === 99).length).toBe(0);

    // Set notation \{ 1, 2, 3 \}
    const setBraces = collectDelimiterSpans("\\{ 1, 2, 3 \\}", {
      highlightUnmatched: true,
      includeBareBraces: true,
    });
    expect(setBraces.filter((s) => s.priority === 99).length).toBe(0);
  });

  it("still flags actual fatal MathJax syntax errors (unclosed bare braces and unclosed \\left)", () => {
    // Unclosed bare brace {
    const unclosedBrace = collectDelimiterSpans("\\frac{a}{b", {
      highlightUnmatched: true,
      includeBareBraces: true,
    });
    expect(unclosedBrace.filter((s) => s.priority === 99).length).toBe(1);

    // Stray closing brace }
    const strayBrace = collectDelimiterSpans("a + b}", {
      highlightUnmatched: true,
      includeBareBraces: true,
    });
    expect(strayBrace.filter((s) => s.priority === 99).length).toBe(1);

    // Unclosed \left(
    const unclosedLeft = collectDelimiterSpans("\\left( x", {
      highlightUnmatched: true,
      includeBareBraces: true,
    });
    expect(unclosedLeft.filter((s) => s.priority === 99).length).toBe(1);
  });

  it("correctly colors half-open intervals like [a,b) and (a,b]", () => {
    const res1 = colorLatexBody("[a,b] , [a,b)", undefined, {
      rainbowDelimiters: true,
      variableDataFlow: true,
    });
    expect(res1).toBe(
      `\\textcolor{${RAINBOW_DELIMITER_COLORS[0]}}{[}\\textcolor{#bb9af7}{a},\\textcolor{#f7768e}{b}\\textcolor{${RAINBOW_DELIMITER_COLORS[0]}}{]} , \\textcolor{${RAINBOW_DELIMITER_COLORS[0]}}{[}\\textcolor{#bb9af7}{a},\\textcolor{#f7768e}{b}\\textcolor{${RAINBOW_DELIMITER_COLORS[0]}}{)}`
    );

    const res2 = colorLatexBody("(a,b]", undefined, {
      rainbowDelimiters: true,
      variableDataFlow: true,
    });
    expect(res2).toBe(
      `\\textcolor{${RAINBOW_DELIMITER_COLORS[0]}}{(}\\textcolor{#bb9af7}{a},\\textcolor{#f7768e}{b}\\textcolor{${RAINBOW_DELIMITER_COLORS[0]}}{]}`
    );
  });

  describe("Crash Immunity Delimiter Auto-Sealing", () => {
    it("heals unbalanced and in-progress delimiters safely", () => {
      // 1. Fully matched \left[ a + b \right. remains valid
      expect(autoSealUnclosedDelimiters("\\left[ a + b \\right.")).toBe("\\left[ a + b \\right.");

      // 2. Unclosed brace inside \left auto-closes before \right.
      expect(autoSealUnclosedDelimiters("\\left[ {a + b \\right.")).toBe("\\left[ {a + b }\\right.");

      // 3. Unmatched \right delimiters prepend \left.
      expect(autoSealUnclosedDelimiters("x \\right)")).toBe("\\left. x \\right)");
      expect(autoSealUnclosedDelimiters("a + b \\right]")).toBe("\\left. a + b \\right]");

      // 4. Bare \left and \right during active typing
      expect(autoSealUnclosedDelimiters("\\left")).toBe("\\left. \\right.");
      expect(autoSealUnclosedDelimiters("\\right")).toBe("\\left. \\right.");
      expect(autoSealUnclosedDelimiters("\\left( x \\right")).toBe("\\left( x \\right.");

      // 5. Scoped group boundaries and macro arguments
      expect(autoSealUnclosedDelimiters("{\\left( x}")).toBe("{\\left( x \\right.}");
      expect(autoSealUnclosedDelimiters("\\frac{\\left( a}{b}")).toBe("\\frac{\\left( a \\right.}{b}");

      // 6. Delimiter auto-sealing for unclosed \left
      expect(autoSealUnclosedDelimiters("\\left( x")).toBe("\\left( x \\right.");
      expect(autoSealUnclosedDelimiters("\\left[ a + b")).toBe("\\left[ a + b \\right.");
      expect(autoSealUnclosedDelimiters("\\left\\{ x")).toBe("\\left\\{ x \\right.");
      expect(autoSealUnclosedDelimiters("\\left| x")).toBe("\\left| x \\right.");

      // 7. Substack line breaks inside matrices do not get split into \\right. \\\\ \\left.
      expect(autoSealUnclosedDelimiters("\\sum_{\\substack{0 < i < m \\\\ 0 < j < n}} a_{i,j}")).toBe(
        "\\sum_{\\substack{0 < i < m \\\\ 0 < j < n}} a_{i,j}"
      );
    });

    it("detects unmatched \right and \left for red wavy error decoration", () => {
      const spansRightWithDelim = collectDelimiterSpans("x \\right)", {
        highlightUnmatched: true,
        onlyUnmatched: true,
      });
      expect(spansRightWithDelim.length).toBe(1);
      expect(spansRightWithDelim[0].priority).toBe(99);
      expect(spansRightWithDelim[0].color).toBe("#f7768e");

      const spansBareRight = collectDelimiterSpans("x \\right", {
        highlightUnmatched: true,
        onlyUnmatched: true,
      });
      expect(spansBareRight.length).toBe(1);
      expect(spansBareRight[0].priority).toBe(99);
      expect(spansBareRight[0].color).toBe("#f7768e");

      const spansBareLeft = collectDelimiterSpans("x \\left", {
        highlightUnmatched: true,
        onlyUnmatched: true,
      });
      expect(spansBareLeft.length).toBe(1);
      expect(spansBareLeft[0].priority).toBe(99);
      expect(spansBareLeft[0].color).toBe("#f7768e");
    });
  });

  describe("Unicode & Typst Delimiters", () => {
    it("recognizes Unicode bracket pairs and angle brackets", () => {
      const pairs1 = findDelimiterPairs("⟦ x + y ⟧");
      expect(pairs1.length).toBe(1);
      expect(pairs1[0].open.type).toBe("bracket");
      expect(pairs1[0].close.type).toBe("bracket");

      const pairs2 = findDelimiterPairs("⟨ \\phi | \\psi ⟩");
      expect(pairs2.length).toBe(1);
      expect(pairs2[0].open.type).toBe("angle");
      expect(pairs2[0].close.type).toBe("angle");

      const pairs3 = findDelimiterPairs("⦃ a, b ⦄");
      expect(pairs3.length).toBe(1);
      expect(pairs3[0].open.type).toBe("brace");
      expect(pairs3[0].close.type).toBe("brace");
    });

    it("supports extensible and sized Unicode brackets", () => {
      const pairs = findDelimiterPairs("\\left⟦ \\frac{a}{b} \\right⟧");
      expect(pairs.length).toBe(1);
      expect(pairs[0].open.isLeftRight).toBe(true);
      expect(pairs[0].open.type).toBe("bracket");
    });
  });
});


