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
});
