import { describe, it, expect } from "vitest";
import { convertText, scanMarkdown } from "../src/index";

describe("multiblock test", () => {
  const input = `
$$
\\frac{d}{dx}f(g(y)) = f'(g(y))\\cdot g'(y)y'
$$

$$
\\mathbf{M}=\\left(\\begin{array}{cc}a&b\\\\c&d\\end{array}\\right)
$$

$$
y(x(g(3)))
$$
`;

  it("scans all 3 math blocks", () => {
    const scan = scanMarkdown(input);
    console.log("Found math blocks:", scan.mathBlocks.length);
    expect(scan.mathBlocks.length).toBe(3);
  });

  it("converts all 3 math blocks", () => {
    const result = convertText(input);
    console.log("Converted result:\n", result);
  });

  it("aligns permanent bake with dynamic view for matrix blocks", () => {
    const matrixBlock = `$$
A=
\\begin{bmatrix}
sin(x) & adj(A) & 3\\\\
4 & 5 & 6\\\\
7 & 8 & 9
\\end{bmatrix}
$$`;
    const options = { variableDataFlow: true, enableTaxonomy: true };
    const baked = convertText(matrixBlock, undefined, options);
    // Ensure A is hashed to cyan (#7dcfff)
    expect(baked).toContain("\\textcolor{#7dcfff}{A}");
    // Ensure sin and adj are recognized as functions
    expect(baked).toContain("\\textcolor{#7aa2f7}{sin}");
    expect(baked).toContain("\\textcolor{#7aa2f7}{adj}");
    // Ensure \begin{bmatrix} is clean (not wrapped in outer color)
    expect(baked).toContain("\\begin{bmatrix}");
    expect(baked).not.toContain("\\textcolor{#bb9af7}{\\begin{bmatrix}");
  });
});
