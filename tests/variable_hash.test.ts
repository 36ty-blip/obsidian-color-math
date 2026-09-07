import { describe, it, expect } from "vitest";
import { collectVariableSpans } from "../src/parsers/variable_hash";
import { colorLatexBody } from "../src/converters/generic";
import { hashStringToColor, VARIABLE_HASH_PALETTE } from "../src/config";

describe("Variable Data-Flow Hashing", () => {
  it("deterministically hashes same variable to same color", () => {
    const spans = collectVariableSpans("x + 2x - 3x");
    expect(spans.length).toBe(3);
    const expectedColor = hashStringToColor("x");
    for (const span of spans) {
      expect(span.color).toBe(expectedColor);
    }
  });

  it("assigns different colors to different variables", () => {
    const spans = collectVariableSpans("x + y");
    expect(spans.length).toBe(2);
    const colorX = hashStringToColor("x");
    const colorY = hashStringToColor("y");
    expect(spans[0].color).toBe(colorX);
    expect(spans[1].color).toBe(colorY);
  });

  it("does not treat function names followed by '(' as variables", () => {
    // In f(x), f is function, x is variable
    const spans = collectVariableSpans("f(x)");
    expect(spans.length).toBe(1);
    expect(spans[0].color).toBe(hashStringToColor("x"));
  });

  it("colors math latex with variable data-flow hashing when enabled", () => {
    const input = "x + y = z";
    const result = colorLatexBody(input, undefined, { variableDataFlow: true });
    const colorX = hashStringToColor("x");
    const colorY = hashStringToColor("y");
    const colorZ = hashStringToColor("z");
    expect(result).toContain(`\\textcolor{${colorX}}{x}`);
    expect(result).toContain(`\\textcolor{${colorY}}{y}`);
    expect(result).toContain(`\\textcolor{${colorZ}}{z}`);
  });
});
