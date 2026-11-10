// tests/decoupled_cst_grammar.test.ts
//! Tier 1 Decoupled Test: Pure CST Grammar & Lexical AST Construction.
//! Asserts source code byte spans, fraction numerator/denominator boundaries,
//! matrix grid structures, and script arguments in pure isolation.
//! Strict requirements: ZERO DOM, ZERO MathJax, execution time < 10ms.

import { describe, it, expect } from "vitest";
import { MathCSTParser } from "../src/parsers/cst/parser";
import { FractionNode, GroupNode } from "../src/parsers/cst/types";

describe("Tier 1: Decoupled CST Grammar Parser", () => {
  it("parses vertical 2-slot fractions with exact byte spans and child ranges", () => {
    const raw = "{a_0}/{2}";
    const parser = new MathCSTParser(raw);
    const nodes = parser.parse();

    expect(nodes.length).toBe(1);
    const frac = nodes[0] as FractionNode;
    expect(frac.kind).toBe("fraction");
    expect(frac.start).toBe(0);
    expect(frac.end).toBe(raw.length);

    // Numerator: {a_0} -> child nodes span [1, 4] ("a_0")
    expect(frac.numerator).toBeDefined();
    expect(frac.numerator.length).toBeGreaterThan(0);
    const numStart = frac.numerator[0].start;
    const numEnd = frac.numerator[frac.numerator.length - 1].end;
    expect(raw.slice(numStart, numEnd)).toBe("a_0");

    // Denominator: {2} -> child node spans [7, 8] ("2")
    expect(frac.denominator).toBeDefined();
    expect(frac.denominator.length).toBeGreaterThan(0);
    const denStart = frac.denominator[0].start;
    const denEnd = frac.denominator[frac.denominator.length - 1].end;
    expect(raw.slice(denStart, denEnd)).toBe("2");
  });

  it("parses nested fractions in Fourier series without bleeding spans", () => {
    const raw = "f(x)={a_0}/{2} + \\sum_{n=1}^{oo} a_n{cos({n pi x}/{l})}+b_n{sin({n pi x}/{l})}";
    const parser = new MathCSTParser(raw);
    const nodes = parser.parse();

    // Verify all 3 fractions exist with non-overlapping ranges
    const fractions: FractionNode[] = [];
    function findFractions(list: any[]) {
      for (const n of list) {
        if (n.kind === "fraction") fractions.push(n);
        if (n.children) findFractions(n.children);
        if (n.numerator) findFractions(n.numerator);
        if (n.denominator) findFractions(n.denominator);
      }
    }
    findFractions(nodes);

    expect(fractions.length).toBe(3);

    // Frac 1: {a_0}/{2}
    expect(raw.slice(fractions[0].start, fractions[0].end)).toBe("{a_0}/{2}");
    const den1Start = fractions[0].denominator[0].start;
    const den1End = fractions[0].denominator[fractions[0].denominator.length - 1].end;
    expect(raw.slice(den1Start, den1End)).toBe("2");

    // Frac 2: {n pi x}/{l} in cos
    expect(raw.slice(fractions[1].start, fractions[1].end)).toBe("{n pi x}/{l}");
    const den2Start = fractions[1].denominator[0].start;
    const den2End = fractions[1].denominator[fractions[1].denominator.length - 1].end;
    expect(raw.slice(den2Start, den2End)).toBe("l");

    // Frac 3: {n pi x}/{l} in sin
    expect(raw.slice(fractions[2].start, fractions[2].end)).toBe("{n pi x}/{l}");
    const den3Start = fractions[2].denominator[0].start;
    const den3End = fractions[2].denominator[fractions[2].denominator.length - 1].end;
    expect(raw.slice(den3Start, den3End)).toBe("l");
  });

  it("parses LaTeX matrix environments with grid cell topology", () => {
    const raw = "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}";
    const parser = new MathCSTParser(raw);
    const nodes = parser.parse();

    expect(nodes.length).toBe(1);
    const matrix = nodes[0] as GroupNode;
    expect(matrix.kind).toBe("group");
    expect(matrix.delimType).toBe("matrix");
    expect(matrix.openText).toBe("\\begin{pmatrix}");
    expect(matrix.closeText).toBe("\\end{pmatrix}");

    expect(matrix.grid).toBeDefined();
    expect(matrix.grid!.rowCount).toBe(2);
    expect(matrix.grid!.colCount).toBe(2);

    // Verify individual cells
    const cell00 = matrix.grid!.cells[0][0];
    expect(raw.slice(cell00.start, cell00.end).trim()).toBe("a");

    const cell01 = matrix.grid!.cells[0][1];
    expect(raw.slice(cell01.start, cell01.end).trim()).toBe("b");

    const cell10 = matrix.grid!.cells[1][0];
    expect(raw.slice(cell10.start, cell10.end).trim()).toBe("c");

    const cell11 = matrix.grid!.cells[1][1];
    expect(raw.slice(cell11.start, cell11.end).trim()).toBe("d");
  });

  it("parses cases environment with synthesized fence perimeter", () => {
    const raw = "\\begin{cases} 1 & x > 0 \\\\ 0 & x \\le 0 \\end{cases}";
    const parser = new MathCSTParser(raw);
    const nodes = parser.parse();

    expect(nodes.length).toBe(1);
    const cases = nodes[0] as GroupNode;
    expect(cases.kind).toBe("group");
    expect(cases.openText).toBe("\\begin{cases}");
    expect(cases.closeText).toBe("\\end{cases}");
    expect(cases.grid).toBeDefined();
    expect(cases.grid!.rowCount).toBe(2);
    expect(cases.grid!.colCount).toBe(2);
  });

  it("completes parsing under 10ms (144Hz latency budget compliance)", () => {
    const raw = "\\begin{aligned} b_n &= {2}/{pi}\\int_{0}^{pi}e^{ax}{sin({n pi x}/{pi})}dx \\end{aligned}";
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) {
      new MathCSTParser(raw).parse();
    }
    const t1 = performance.now();
    const avgMs = (t1 - t0) / 50;
    expect(avgMs).toBeLessThan(1.0); // Sub-millisecond CST parsing
  });
});
