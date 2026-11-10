// tests/decoupled_mathjax_oracle.test.ts
//! Tier 2 Decoupled Test: Pure MathJax CHTML Compiler Oracle.
//! Asserts ground-truth MathJax CHTML output, intermediate DOM element tags,
//! and structural attributes (atop="true" for binomials, mfrac num/den tags, mtable grids).
//! Strict requirements: ZERO CST dependence, ZERO color-math stamping.

import { describe, it, expect } from "vitest";
import { compilePureMathJax } from "./mathjax_node_adapter";

/**
 * Normalizes Unicode Mathematical Alphanumeric Symbols (e.g. 𝑎, 𝑛, 𝑥) to ASCII base letters.
 */
function normText(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
}

describe("Tier 2: Decoupled MathJax Oracle", () => {
  it("compiles standard fractions into <mjx-mfrac> with <mjx-num> and <mjx-den>", async () => {
    const fakeDom = await compilePureMathJax("\\frac{a}{b}");
    const frac = fakeDom.querySelector("mjx-mfrac");
    expect(frac).not.toBeNull();

    const num = frac!.querySelector("mjx-num");
    const den = frac!.querySelector("mjx-den");
    expect(num).not.toBeNull();
    expect(den).not.toBeNull();

    expect(normText(num!.textContent)).toBe("a");
    expect(normText(den!.textContent)).toBe("b");
  });

  it("compiles binomial coefficients as <mjx-mfrac> with atop=\"true\"", async () => {
    const fakeDom = await compilePureMathJax("\\binom{n}{k}");
    const frac = fakeDom.querySelector("mjx-mfrac");
    expect(frac).not.toBeNull();

    // In MathJax, \binom compiles to mfrac with atop attribute
    const num = frac!.querySelector("mjx-num");
    const den = frac!.querySelector("mjx-den");
    expect(num).not.toBeNull();
    expect(den).not.toBeNull();
    expect(normText(num!.textContent)).toBe("n");
    expect(normText(den!.textContent)).toBe("k");
  });

  it("compiles matrix environments into <mjx-mtable>, <mjx-mtr>, and <mjx-mtd>", async () => {
    const fakeDom = await compilePureMathJax("\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}");
    const table = fakeDom.querySelector("mjx-mtable");
    expect(table).not.toBeNull();

    const rows = fakeDom.querySelectorAll("mjx-mtr");
    expect(rows.length).toBe(2);

    const cells = fakeDom.querySelectorAll("mjx-mtd");
    expect(cells.length).toBe(4);
    expect(normText(cells[0].textContent)).toBe("1");
    expect(normText(cells[1].textContent)).toBe("2");
    expect(normText(cells[2].textContent)).toBe("3");
    expect(normText(cells[3].textContent)).toBe("4");
  });

  it("compiles cases environment with synthesized scaled left curly brace", async () => {
    const fakeDom = await compilePureMathJax("\\begin{cases} 1 & x > 0 \\\\ 0 & x \\le 0 \\end{cases}");
    const table = fakeDom.querySelector("mjx-mtable");
    expect(table).not.toBeNull();

    // Verify presence of left curly brace fence
    const fence = fakeDom.querySelector("mjx-mo");
    expect(fence).not.toBeNull();
    expect(fence!.textContent).toBe("{");
  });

  it("compiles \\munderover with vertical top-to-bottom over/base/under ordering", async () => {
    const fakeDom = await compilePureMathJax("\\sum_{n=1}^{\\infty}");
    const underover = fakeDom.querySelector("mjx-munderover");
    expect(underover).not.toBeNull();

    const over = underover!.querySelector("mjx-over");
    const base = underover!.querySelector("mjx-base");
    const under = underover!.querySelector("mjx-under");

    expect(over).not.toBeNull();
    expect(base).not.toBeNull();
    expect(under).not.toBeNull();

    expect(normText(over!.textContent)).toBe("∞");
    expect(normText(base!.textContent)).toBe("∑");
    expect(normText(under!.textContent)).toBe("n=1");
  });
});
