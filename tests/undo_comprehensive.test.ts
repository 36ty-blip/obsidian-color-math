import { describe, it, expect } from "vitest";
import { convertText, uncolorText, uncolorFragment } from "../src/index";

describe("Comprehensive Undo and Uncolor Tests", () => {
  describe("Inline Math Undo", () => {
    it("removes \\textcolor from inline math", () => {
      const input = "Here is $x + \\textcolor{#bb9af7}{y} = z$ inline.";
      const expected = "Here is $x + y = z$ inline.";
      expect(uncolorText(input)).toBe(expected);
    });

    it("handles multiple inline math expressions on the same line", () => {
      const input = "Let $\\textcolor{#7aa2f7}{a}$ and $\\textcolor{#9ece6a}{b}$ be numbers.";
      const expected = "Let $a$ and $b$ be numbers.";
      expect(uncolorText(input)).toBe(expected);
    });
  });

  describe("Block Math Undo", () => {
    it("removes \\textcolor from block math", () => {
      const input = "$$\\textcolor{#7aa2f7}{E} = \\textcolor{#f7768e}{m}c^2$$";
      const expected = "$$E = mc^2$$";
      expect(uncolorText(input)).toBe(expected);
    });

    it("removes multiline block math colors", () => {
      const input = `$$
\\begin{aligned}
\\textcolor{#7aa2f7}{x} &= 1 \\\\
\\textcolor{#9ece6a}{y} &= 2
\\end{aligned}
$$`;
      const expected = `$$
\\begin{aligned}
x &= 1 \\\\
y &= 2
\\end{aligned}
$$`;
      expect(uncolorText(input)).toBe(expected);
    });
  });

  describe("LaTeX Color Command Variants", () => {
    it("strips standalone \\color{...} declarations and cleans trailing space", () => {
      const input = "$$\\color{red} x + y$$";
      const expected = "$$x + y$$";
      expect(uncolorText(input)).toBe(expected);
    });

    it("strips grouped {\\color{...} ...} declarations", () => {
      const input = "$${\\color{#bb9af7} f(x)}$$";
      const expected = "$${f(x)}$$";
      expect(uncolorText(input)).toBe(expected);
    });

    it("strips optional color model brackets like \\textcolor[HTML]{...}{...}", () => {
      const input = "$$\\textcolor[HTML]{bb9af7}{x} + \\color[rgb]{1,0,0} y$$";
      const expected = "$$x + y$$";
      expect(uncolorText(input)).toBe(expected);
    });

    it("strips \\colorbox wrappers", () => {
      const input = "$$\\colorbox{yellow}{highlight}$$";
      const expected = "$$highlight$$";
      expect(uncolorText(input)).toBe(expected);
    });

    it("handles nested color wrappers", () => {
      const input = "$$\\textcolor{red}{\\textcolor{blue}{x}}$$";
      const expected = "$$x$$";
      expect(uncolorText(input)).toBe(expected);
    });
  });

  describe("Raw Fragment Uncoloring (No Delimiters)", () => {
    it("uncolors raw LaTeX fragments directly when no delimiters are present", () => {
      const input = "\\textcolor{#7aa2f7}{a}^{2} + \\textcolor{#bb9af7}{b}^{2} = \\textcolor{#f7768e}{c}^{2}";
      const expected = "a^{2} + b^{2} = c^{2}";
      expect(uncolorText(input)).toBe(expected);
    });

    it("uncolorFragment preserves comments and verbatim", () => {
      const input = "% \\textcolor{red}{keep comment}\n\\textcolor{blue}{x}";
      const expected = "% \\textcolor{red}{keep comment}\nx";
      expect(uncolorFragment(input)).toBe(expected);
    });
  });

  describe("Roundtrip Conversion and Undo", () => {
    it("restores original inline and block math accurately after convertText", () => {
      const original = `# Notes
Here is an inline equation $f(x) = x^{2} + 2x + 1$ in text.

And a block equation:
$$
\\int_{0}^{\\infty} e^{-x^{2}} dx = \\frac{\\sqrt{\\pi}}{2}
$$
`;
      const colored = convertText(original);
      expect(colored).not.toBe(original);
      const restored = uncolorText(colored);
      expect(restored).toBe(original);
    });
  });
});
