// tests/lazy_navigation.test.ts
import { describe, it, expect } from "vitest";
import { resolveOnDemandRange } from "../src/editor/lazy_navigation";

interface FakeElement {
  tagName: string;
  className: string;
  children: FakeElement[];
  parentElement: FakeElement | null;
  querySelector: (sel: string) => FakeElement | null;
  querySelectorAll: (sel: string) => FakeElement[];
  closest: (sel: string) => FakeElement | null;
  contains: (el: FakeElement) => boolean;
}

function createFakeNode(tagName: string, children: FakeElement[] = []): FakeElement {
  const el: FakeElement = {
    tagName: tagName.toUpperCase(),
    className: "",
    children,
    parentElement: null,
    querySelector: (sel: string) => {
      const all = el.querySelectorAll(sel);
      return all[0] || null;
    },
    querySelectorAll: (sel: string) => {
      const matchTags = sel.toUpperCase().split(/,\s*/);
      const matched: FakeElement[] = [];
      function walk(curr: FakeElement) {
        for (const child of curr.children) {
          if (matchTags.includes(child.tagName)) {
            matched.push(child);
          }
          walk(child);
        }
      }
      walk(el);
      return matched;
    },
    closest: (sel: string) => {
      const matchTags = sel.toUpperCase().split(/,\s*/);
      let curr: FakeElement | null = el;
      while (curr) {
        if (matchTags.includes(curr.tagName)) {
          return curr;
        }
        curr = curr.parentElement;
      }
      return null;
    },
    contains: (other: FakeElement) => {
      let curr: FakeElement | null = other;
      while (curr) {
        if (curr === el) return true;
        curr = curr.parentElement;
      }
      return false;
    },
  };

  for (const child of children) {
    child.parentElement = el;
  }

  return el;
}

describe("Method 3: On-Demand Lazy Navigation Resolver", () => {
  it("resolves numerator and denominator ranges on click without pre-existing DOM stamps", () => {
    // LaTeX: \frac{a + b}{c + d}
    const latex = "\\frac{a + b}{c + d}";

    const miA = createFakeNode("mjx-mi");
    const moPlus1 = createFakeNode("mjx-mo");
    const miB = createFakeNode("mjx-mi");
    const num = createFakeNode("mjx-num", [miA, moPlus1, miB]);

    const line = createFakeNode("mjx-line");

    const miC = createFakeNode("mjx-mi");
    const moPlus2 = createFakeNode("mjx-mo");
    const miD = createFakeNode("mjx-mi");
    const den = createFakeNode("mjx-den", [miC, moPlus2, miD]);

    const frac = createFakeNode("mjx-frac", [num, line, den]);
    const root = createFakeNode("mjx-container", [frac]);

    // 1. Direct click on individual leaf token 'a'
    const aRes = resolveOnDemandRange(miA as unknown as Element, root as unknown as Element, latex);
    expect(aRes).not.toBeNull();
    expect(aRes?.start).toBe(6);
    expect(aRes?.end).toBe(7);
    expect(aRes?.kind).toBe("leaf");

    // 2. Direct click on numerator container (e.g. background padding)
    const numRes = resolveOnDemandRange(num as unknown as Element, root as unknown as Element, latex);
    expect(numRes).not.toBeNull();
    expect(numRes?.start).toBe(6);
    expect(numRes?.end).toBe(11);
    expect(numRes?.kind).toBe("numerator");

    // 3. Direct click on denominator container
    const denRes = resolveOnDemandRange(den as unknown as Element, root as unknown as Element, latex);
    expect(denRes).not.toBeNull();
    expect(denRes?.start).toBe(13);
    expect(denRes?.end).toBe(18);
    expect(denRes?.kind).toBe("denominator");
  });

  it("accurately resolves leaf tokens when clicking child mjx-c glyph elements (no index doubling)", () => {
    // LaTeX: a + b
    const latex = "a + b";

    // In real MathJax CHTML, every token contains a child <mjx-c> glyph element
    const mjxCA = createFakeNode("mjx-c");
    const miA = createFakeNode("mjx-mi", [mjxCA]);

    const mjxCPlus = createFakeNode("mjx-c");
    const moPlus = createFakeNode("mjx-mo", [mjxCPlus]);

    const mjxCB = createFakeNode("mjx-c");
    const miB = createFakeNode("mjx-mi", [mjxCB]);

    const root = createFakeNode("mjx-container", [miA, moPlus, miB]);

    // Clicking child glyph inside 'a'
    const aRes = resolveOnDemandRange(mjxCA as unknown as Element, root as unknown as Element, latex);
    expect(aRes).not.toBeNull();
    expect(aRes?.start).toBe(0);
    expect(aRes?.end).toBe(1);

    // Clicking child glyph inside '+'
    const plusRes = resolveOnDemandRange(mjxCPlus as unknown as Element, root as unknown as Element, latex);
    expect(plusRes).not.toBeNull();
    expect(plusRes?.start).toBe(2);
    expect(plusRes?.end).toBe(3);

    // Clicking child glyph inside 'b' (must NOT be doubled/shifted!)
    const bRes = resolveOnDemandRange(mjxCB as unknown as Element, root as unknown as Element, latex);
    expect(bRes).not.toBeNull();
    expect(bRes?.start).toBe(4);
    expect(bRes?.end).toBe(5);
  });

  it("resolves square roots and radicand ranges accurately", () => {
    // LaTeX: \sqrt{x^2 + 1}
    const latex = "\\sqrt{x^2 + 1}";

    const surd = createFakeNode("mjx-surd");
    const miX = createFakeNode("mjx-mi");
    const box = createFakeNode("mjx-box", [miX]);
    const sqrt = createFakeNode("mjx-sqrt", [surd, box]);
    const root = createFakeNode("mjx-container", [sqrt]);

    // Clicking the surd checkmark resolves whole sqrt
    const surdRes = resolveOnDemandRange(surd as unknown as Element, root as unknown as Element, latex);
    expect(surdRes).not.toBeNull();
    expect(surdRes?.kind).toBe("root");
    expect(surdRes?.start).toBe(0);
    expect(surdRes?.end).toBe(14);

    // Clicking the radicand box resolves the inner group
    const boxRes = resolveOnDemandRange(box as unknown as Element, root as unknown as Element, latex);
    expect(boxRes).not.toBeNull();
    expect(boxRes?.kind).toBe("root");
    expect(boxRes?.start).toBe(5);
    expect(boxRes?.end).toBe(14);
  });

  it("resolves matrix and table cells accurately", () => {
    // LaTeX: \begin{matrix} a & b \\ c & d \end{matrix}
    const latex = "\\begin{matrix} a & b \\\\ c & d \\end{matrix}";

    const mtdA = createFakeNode("mjx-mtd");
    const mtdB = createFakeNode("mjx-mtd");
    const mtdC = createFakeNode("mjx-mtd");
    const mtdD = createFakeNode("mjx-mtd");

    const mtr1 = createFakeNode("mjx-mtr", [mtdA, mtdB]);
    const mtr2 = createFakeNode("mjx-mtr", [mtdC, mtdD]);
    const table = createFakeNode("mjx-mtable", [mtr1, mtr2]);
    const root = createFakeNode("mjx-container", [table]);

    // Resolves cell 0 (a)
    const resA = resolveOnDemandRange(mtdA as unknown as Element, root as unknown as Element, latex);
    expect(resA).not.toBeNull();
    expect(resA?.kind).toBe("matrix_cell");
    expect(latex.slice(resA!.start, resA!.end)).toContain("a");

    // Resolves cell 1 (b)
    const resB = resolveOnDemandRange(mtdB as unknown as Element, root as unknown as Element, latex);
    expect(resB).not.toBeNull();
    expect(resB?.kind).toBe("matrix_cell");
    expect(latex.slice(resB!.start, resB!.end)).toContain("b");
  });

  it("resolves superscript ranges on click", () => {
    // LaTeX: x^{2\alpha}
    const latex = "x^{2\\alpha}";

    const miX = createFakeNode("mjx-mi");
    const mn2 = createFakeNode("mjx-mn");
    const miAlpha = createFakeNode("mjx-mi");
    const script = createFakeNode("mjx-script", [mn2, miAlpha]);
    const msup = createFakeNode("mjx-msup", [miX, script]);
    const root = createFakeNode("mjx-container", [msup]);

    // Click on exponent slot
    const expRes = resolveOnDemandRange(script as unknown as Element, root as unknown as Element, latex);
    expect(expRes).not.toBeNull();
    expect(expRes?.start).toBe(3);
    expect(expRes?.end).toBe(10);
    expect(expRes?.kind).toBe("script");
  });

  it("gracefully returns null on malformed or empty inputs", () => {
    const root = createFakeNode("mjx-container");
    expect(resolveOnDemandRange(root as unknown as Element, root as unknown as Element, "")).toBeNull();
  });
});
