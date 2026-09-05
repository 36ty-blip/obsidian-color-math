import { describe, it, expect } from "vitest";
import {
  convertText,
  convertMatrixBlock,
  parseMathBlocks,
  parseMathBody,
  formatMathStructure,
  uncolorText,
  uncolorFragment,
} from "../src/index";

describe("Self Tests (from self_test.py)", () => {
  const nested = "$$y(x(g(3)))$$";
  const nested_colored =
    "$$\\textcolor{#7aa2f7}{y}(" +
    "\\textcolor{#bb9af7}{x}(" +
    "\\textcolor{#9ece6a}{g}(" +
    "\\textcolor{#e0af68}{3})))$$";

  const prime = "$$f'(g(3))$$";
  const prime_colored =
    "$$\\textcolor{#7aa2f7}{f'}(" +
    "\\textcolor{#bb9af7}{g}(" +
    "\\textcolor{#e0af68}{3}))$$";

  const fenced = "```latex\n$$\\sum_{i=1}^n$$\n```";
  const nested_fence =
    "- item\n" +
    "  > [!note]\n" +
    "  > ~~~~latex\n" +
    "  > $$y(x(g(3)))$$\n" +
    "  > ~~~~\n";

  const commented = "$$f(x)% }\n+g(x)% {\n+h(x)$$";
  const commented_colored =
    "$$\\textcolor{#7aa2f7}{f}(x)% }\n" +
    "+\\textcolor{#7aa2f7}{g}(x)% {\n" +
    "+\\textcolor{#7aa2f7}{h}(x)$$";

  const verb = "$$\\verb|y(x(g(3)))|$$";
  const verb_star = "$$\\verb*|y(x(g(3)))|$$";
  const scalar_sum = "$$\\sum_{i=1}^{n} x_i$$";

  const nested_array =
    "$$\\mathbf{M}=\\left(\\begin{array}{cc}a&b\\\\c&d" +
    "\\end{array}\\right)$$";
  const nested_array_colored =
    "$$\\textcolor{#7aa2f7}{\\mathbf{M}}\\textcolor{white}{=}" +
    "\\textcolor{#bb9af7}{\\left(\\begin{array}{cc}a&b\\\\c&d" +
    "\\end{array}\\right)}$$";

  const grouped_command = "$$\\operatorname*{arg\\,max}_{x} f(x)$$";
  const grouped_command_colored =
    "$$\\operatorname*{arg\\textcolor{white}{\\,}max}_" +
    "{\\textcolor{#9ece6a}{x}} \\textcolor{#7aa2f7}{f}(x)$$";

  const styled = "$$f(x)+\\displaystyle g(x)$$";
  const styled_colored =
    "$$\\textcolor{#7aa2f7}{f}(x)+\\displaystyle " +
    "\\textcolor{#7aa2f7}{g}(x)$$";

  const inline_code = "Prose `$$x=1$$` remains plain.";
  const prose = "# Original Equations\n\nOrdinary prose stays unchanged.\n";

  it("scoped nested colors", () => {
    expect(convertText(nested)).toBe(nested_colored);
  });

  it("exact undo round trip", () => {
    expect(uncolorText(nested_colored)).toBe(nested);
  });

  it("conversion idempotence", () => {
    expect(convertText(nested_colored)).toBe(nested_colored);
  });

  it("prime notation", () => {
    expect(convertText(prime)).toBe(prime_colored);
  });

  it("prime round trip", () => {
    expect(uncolorText(prime_colored)).toBe(prime);
  });

  it("no invented primes", () => {
    const converted = convertText(
      "$$\\frac{d}{dx}f(y)^n=nf(y)^{n-1}\\cdot f'(y)y$$"
    );
    expect(converted.includes("y'")).toBe(false);
  });

  it("prose preservation", () => {
    expect(convertText(prose)).toBe(prose);
  });

  it("fenced code preservation", () => {
    expect(convertText(fenced)).toBe(fenced);
  });

  it("comment braces round trip", () => {
    expect(uncolorText(convertText(commented))).toBe(commented);
  });

  it("comment braces idempotence", () => {
    expect(convertText(commented_colored)).toBe(commented_colored);
  });

  it("nested tilde fence preservation", () => {
    expect(convertText(nested_fence)).toBe(nested_fence);
  });

  it("nested tilde fence is not parsed", () => {
    expect(parseMathBlocks(nested_fence)).toEqual([]);
  });

  it("verb payload preservation", () => {
    expect(convertText(verb)).toBe(verb);
  });

  it("verb-star payload preservation", () => {
    expect(convertText(verb_star)).toBe(verb_star);
  });

  it("verb payload is not inspected", () => {
    expect(formatMathStructure(parseMathBody(verb.slice(2, -2)))).toBe(
      "No nested function calls found."
    );
  });

  it("scalar sum is not a matrix", () => {
    expect(convertMatrixBlock(scalar_sum)).toBe(null);
  });

  it("nested array matrix recognition", () => {
    expect(convertMatrixBlock(nested_array)).toBe(nested_array_colored);
  });

  it("operatorname-star stays whole", () => {
    expect(convertText(grouped_command)).toBe(grouped_command_colored);
  });

  it("style declaration stays unwrapped", () => {
    expect(convertText(styled)).toBe(styled_colored);
  });

  it("inline code preservation", () => {
    expect(convertText(inline_code)).toBe(inline_code);
  });

  it("text macro preservation", () => {
    expect(convertText("$$f(\\text{use x=y literally})$$")).toBe(
      "$$\\textcolor{#7aa2f7}{f}(\\text{use x=y literally})$$"
    );
  });

  it("malformed script preservation", () => {
    expect(convertText("$$x^{abc$$")).toBe("$$x^{abc$$");
  });

  it("unclosed call preservation", () => {
    expect(convertText("$$y(x$$")).toBe("$$y(x$$");
  });

  it("nested function structure", () => {
    expect(formatMathStructure(parseMathBody("y(x(g(3)))"))).toBe(
      "Function y\n  Function x\n    Function g\n      Constant 3"
    );
  });

  it("legacy and scoped undo", () => {
    expect(uncolorFragment("\\textcolor{red}{x+\\color{blue}{y}}")).toBe(
      "x+y"
    );
  });
});
