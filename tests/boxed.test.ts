import { describe, it, expect } from "vitest";
import { convertText } from "../src/index";

describe("boxed tests", () => {
  it("converts boxed simple equation", () => {
    const input = "$$\\boxed{x = 1}$$";
    const result = convertText(input);
    expect(result).toBe("$$\\boxed{x \\textcolor{white}{=} 1}$$");
  });

  it("converts boxed nested functions", () => {
    const input = "$$\\boxed{y(x(3))}$$";
    const result = convertText(input);
    expect(result).toBe("$$\\boxed{\\textcolor{#7aa2f7}{y}(\\textcolor{#bb9af7}{x}(\\textcolor{#e0af68}{3}))}$$");
  });

  it("converts boxed derivative equation", () => {
    const input = "$$\\boxed{\\frac{d}{dx}f(x) = f'(x)}$$";
    const result = convertText(input);
    console.log("Boxed derivative result:", result);
  });

  it("converts equation with boxed rhs", () => {
    const input = "$$\\frac{d}{dx}f(x) = \\boxed{f'(x)}$$";
    const result = convertText(input);
    console.log("Boxed rhs result:", result);
  });
});
