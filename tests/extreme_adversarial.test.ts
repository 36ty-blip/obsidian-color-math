import { describe, it, expect } from "vitest";
import { convertMathBlock, convertText } from "../src/converters/block";
import { uncolorFragment, uncolorText } from "../src/undo";
import { DEFAULT_COLORS, ColorMathOptions } from "../src/config";

function checkBraceBalance(tex: string): boolean {
  let depth = 0;
  let i = 0;
  while (i < tex.length) {
    if (tex[i] === "\\" && i + 1 < tex.length) {
      i += 2; // skip escaped characters like \{ or \}
      continue;
    }
    if (tex[i] === "%") {
      const nl = tex.indexOf("\n", i);
      if (nl === -1) break;
      i = nl + 1;
      continue;
    }
    if (tex[i] === "{") {
      depth++;
    } else if (tex[i] === "}") {
      depth--;
      if (depth < 0) return false;
    }
    i++;
  }
  return depth === 0;
}

function checkNoCellCrossingTextcolor(tex: string): boolean {
  const pattern = /\\textcolor\{[^{}]+\}\{/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(tex)) !== null) {
    const startBody = m.index + m[0].length;
    let depth = 1;
    let j = startBody;
    while (j < tex.length && depth > 0) {
      if (tex[j] === "\\" && j + 1 < tex.length) {
        j += 2;
        continue;
      }
      if (tex[j] === "{") {
        depth++;
      } else if (tex[j] === "}") {
        depth--;
      }
      j++;
    }
    const body = tex.slice(startBody, j - 1);
    if (body.includes("&") || body.includes("\\\\")) {
      return false;
    }
  }
  return true;
}

describe("Extreme Adversarial & Cursed LaTeX Suite", () => {
  const palette = {
    ...DEFAULT_COLORS,
    energyOperator: "#2ac3de",
  };

  const options: ColorMathOptions = {
    enableTaxonomy: true,
    rainbowDelimiters: true,
    variableDataFlow: true,
    colorUnits: true,
    colorDifferentials: true,
    colorBraKet: true,
    colorDimensionless: true,
    colorQuantumOperators: true,
    field: "quantum",
  };

  function verifyEquationIntegrity(rawEq: string) {
    const colored = convertMathBlock(rawEq, palette, options);

    // 1. Brace balancing check
    expect(checkBraceBalance(colored)).toBe(true);

    // 2. Alignment boundary check (Misplaced & / Missing \cr)
    expect(checkNoCellCrossingTextcolor(colored)).toBe(true);

    // 3. Idempotency (coloring already-colored LaTeX must not change or double-wrap)
    const recolored = convertMathBlock(colored, palette, options);
    expect(recolored).toBe(colored);

    // 4. Clean lossless undo
    const uncolored = uncolorFragment(colored);
    expect(uncolored).not.toContain("\\textcolor");
    expect(checkBraceBalance(uncolored)).toBe(true);
  }

  it("Category 1: Zero-Brace Macro Eating (TeX single-token expansion)", () => {
    const cases = [
      "$$\\frac\\partial\\partial t \\psi = E\\psi$$",
      "$$\\frac12 x + \\frac\\hbar2m = 0$$",
      "$$\\sqrt2 x + \\sqrt\\pi y$$",
      "$$\\partial_t\\psi+\\nabla\\cdot\\mathbf{j}=0$$",
      "$$\\frac\\partial{\\partial t}\\psi$$",
      "$$\\frac{\\partial}\\partial x$$",
      "$$x^2_3 + y_i^2$$",
    ];
    for (const eq of cases) {
      verifyEquationIntegrity(eq);
    }
  });

  it("Category 2: Illegal Cell-Crossing Boundaries (& and \\\\)", () => {
    const cases = [
      `$$\\begin{aligned}
    i\\hbar \\frac{\\partial \\psi}{\\partial t} &= \\hat{H}\\psi \\\\
    \\hat{\\mathbf{p}} &= -i\\hbar \\nabla
\\end{aligned}$$`,
      `$$\\begin{cases}
    \\frac{df}{dx} = 1 & \\text{if } x > 0 \\\\
    \\frac{df}{dx} = 0 & \\text{otherwise}
\\end{cases}$$`,
      `$$\\begin{matrix}
    a & b & c \\\\
    d & e & f
\\end{matrix}$$`,
      `$$\\begin{split}
    A &= B + C \\\\
      &= D
\\end{split}$$`,
    ];
    for (const eq of cases) {
      verifyEquationIntegrity(eq);
    }
  });

  it("Category 3: Delimiter Anarchy", () => {
    const cases = [
      "$$\\left[ 0, 1 \\right)$$",
      "$$\\left. \\frac{\\partial f}{\\partial x} \\right|_{x=0} = 42$$",
      "$$\\{ x \\in \\mathbb{R} \\mid x > 0 \\}$$",
      "$$\\langle \\psi | \\hat{H} | \\phi \\rangle$$",
      "$$\\left( \\frac{a}{b} \\right\\}$$",
      "$$| \\psi \\rangle \\langle \\phi |$$",
    ];
    for (const eq of cases) {
      verifyEquationIntegrity(eq);
    }
  });

  it("Category 4: Math-in-Text-in-Math", () => {
    const cases = [
      "$$\\int_0^1 f(x)\\,dx \\quad \\text{where $f(x) = \\frac{1}{x}$ for all $x > 0$}$$",
      "$$x = 1 \\quad \\text{since $\\frac{df}{dx} = 0$}$$",
    ];
    for (const eq of cases) {
      verifyEquationIntegrity(eq);
    }
  });

  it("Category 5: Infix TeX Primitive \\over", () => {
    const cases = [
      "$${i\\hbar {\\partial \\psi \\over \\partial t} = \\hat{H}\\psi}$$",
      "$${a + b \\over c + d} = 1$$",
    ];
    for (const eq of cases) {
      verifyEquationIntegrity(eq);
    }
  });

  it("Category 6: Tensor Index Staggering & Empty Groups", () => {
    const cases = [
      "$$T^{\\mu}{}_{\\nu\\rho} + R^\\lambda{}_{\\mu\\nu\\sigma} = 0$$",
      "$$g_{\\mu\\nu;\\rho} = 0$$",
      "$$x_{} + y^{} = z$$",
      "$$A^{\\mu}_{\\phantom{\\mu}\\nu} B^{\\nu}$$",
    ];
    for (const eq of cases) {
      verifyEquationIntegrity(eq);
    }
  });

  it("Category 7: Prime Clustering & Negative Micro-Spacing", () => {
    const cases = [
      "$$f'''(x) + f''(x) + y' = 0$$",
      "$$f'(g(x))' \\cdot g'(x)$$",
      "$$\\iint \\! f(x,y) \\, dx\\,dy$$",
      "$$\\frac{d^n\\!f}{dx^n}$$",
    ];
    for (const eq of cases) {
      verifyEquationIntegrity(eq);
    }
  });

  it("Category 8: Identifier Collisions", () => {
    const cases = [
      "$$d = v \\cdot t$$",
      "$$x \\text{ in } A$$",
      "$$\\mathbf{d}x = \\mathbf{d}y$$",
      "$$\\operatorname{Re} z \\neq \\mathrm{Re}$$",
      "$$\\sin x + \\cos y$$",
      "$$\\fractal = 1$$",
    ];
    for (const eq of cases) {
      verifyEquationIntegrity(eq);
    }
  });

  it("Document-Level Markdown with Frontmatter, Code blocks, and Aligned Math", () => {
    const doc = `---
field: quantum
tags: [physics, qm]
---
# Quantum & Field Theory Notes

Here is an equation with inline math $\\frac\\partial\\partial t \\psi$ and text.

\`\`\`python
# Code block should remain completely untouched
def compute():
    return "frac{1}{2}"
\`\`\`

Now a complex multi-line aligned system:
$$\\begin{aligned}
    i\\hbar \\frac{\\partial \\psi}{\\partial t} &= \\hat{H}\\psi \\\\
    \\hat{\\mathbf{p}} &= -i\\hbar \\nabla
\\end{aligned}$$

Half-open interval $\\left[ 0, 1 \\right)$ and set $\\{ x \\in \\mathbb{R} \\mid x > 0 \\}$.

End of note.
`;
    const converted = convertText(doc, palette, options);

    // Frontmatter and code fences untouched
    expect(converted).toContain("```python\n# Code block should remain completely untouched");
    expect(converted).toContain("field: quantum");

    // Alignment and brace checks
    expect(checkNoCellCrossingTextcolor(converted)).toBe(true);
    expect(checkBraceBalance(converted)).toBe(true);

    // Idempotency
    const reconverted = convertText(converted, palette, options);
    expect(reconverted).toBe(converted);

    // Clean undo
    const uncolored = uncolorText(converted);
    expect(uncolored).not.toContain("\\textcolor");
    expect(uncolored).toContain("i\\hbar \\frac{\\partial \\psi}{\\partial t}");
  });
});
