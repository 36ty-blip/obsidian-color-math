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

  it("skips environment arguments in \\begin{bmatrix} and \\begin{cases}", () => {
    const input = "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}";
    const result = colorLatexBody(input, undefined, { variableDataFlow: true });
    expect(result).toContain("\\begin{bmatrix}");
    expect(result).toContain("\\end{bmatrix}");
    expect(result).not.toContain("\\begin{\\textcolor");
    expect(result).not.toContain("\\end{\\textcolor");
  });

  it("does not shred multi-letter function calls like rank(A) and nullity(A)", () => {
    const input = "rank(A) + nullity(A) = n";
    const result = colorLatexBody(input, undefined, { variableDataFlow: true, enableTaxonomy: true });
    expect(result).toContain("rank");
    expect(result).toContain("nullity");
    // Ensure 'rank' is not shredded into r, a, n, k
    expect(result).not.toContain("\\textcolor{#bb9af7}{r}");
    expect(result).not.toContain("\\textcolor{#2ac3de}{n}k");
    const colorA = hashStringToColor("A");
    const colorN = hashStringToColor("n");
    expect(result).toContain(`\\textcolor{${colorA}}{A}`);
    expect(result).toContain(`\\textcolor{${colorN}}{n}`);
  });

  it("treats 2-letter products like ax(y + z) as variable multiplication", () => {
    const input = "ax(y + z)";
    const result = colorLatexBody(input, undefined, { variableDataFlow: true });
    const colorA = hashStringToColor("a");
    const colorX = hashStringToColor("x");
    const colorY = hashStringToColor("y");
    const colorZ = hashStringToColor("z");
    expect(result).toContain(`\\textcolor{${colorA}}{a}`);
    expect(result).toContain(`\\textcolor{${colorX}}{x}`);
    expect(result).toContain(`\\textcolor{${colorY}}{y}`);
    expect(result).toContain(`\\textcolor{${colorZ}}{z}`);
  });

  it("does not shred \\operatorname{rank}(A) arguments into variables", () => {
    const input = "\\operatorname{rank}(A)";
    const result = colorLatexBody(input, undefined, { variableDataFlow: true, enableTaxonomy: true });
    expect(result).not.toContain("\\textcolor{#bb9af7}{r}");
    const colorA = hashStringToColor("A");
    expect(result).toContain(`\\textcolor{${colorA}}{A}`);
  });

  it("recognizes 3-letter functions like adj(A) and var(X)", () => {
    const input = "adj(A) + var(X)";
    const result = colorLatexBody(input, undefined, { variableDataFlow: true, enableTaxonomy: true });
    expect(result).toContain("adj");
    expect(result).toContain("var");
    // Ensure 'a', 'd', 'j' are not shredded into individual variables
    const colorA = hashStringToColor("a");
    expect(result).not.toContain(`\\textcolor{${colorA}}{a}d`);
    const colorCapA = hashStringToColor("A");
    const colorCapX = hashStringToColor("X");
    expect(result).toContain(`\\textcolor{${colorCapA}}{A}`);
    expect(result).toContain(`\\textcolor{${colorCapX}}{X}`);
  });
});
