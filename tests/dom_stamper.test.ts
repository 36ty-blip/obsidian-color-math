// tests/dom_stamper.test.ts
import { describe, it, expect } from "vitest";
import { stampMathJaxDOM } from "../src/editor/dom_stamper";

interface FakeElement {
  tagName: string;
  className: string;
  classList: {
    add: (cls: string) => void;
    contains: (cls: string) => boolean;
  };
  children: FakeElement[];
  parentElement?: FakeElement | null;
  firstElementChild?: FakeElement | null;
  querySelector: (sel: string) => FakeElement | null;
  querySelectorAll: (sel: string) => FakeElement[];
  matches: (sel: string) => boolean;
}

function createFakeElement(tagName: string, children: FakeElement[] = []): FakeElement {
  const classes = new Set<string>();
  const el: FakeElement = {
    tagName: tagName.toUpperCase(),
    get className() {
      return Array.from(classes).join(" ");
    },
    set className(val: string) {
      classes.clear();
      val.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
    },
    classList: {
      add: (cls: string) => classes.add(cls),
      contains: (cls: string) => classes.has(cls),
    },
    children,
    parentElement: null,
    get firstElementChild() {
      return children[0] || null;
    },
    querySelector: (sel: string) => {
      const results = el.querySelectorAll(sel);
      return results[0] || null;
    },
    querySelectorAll: (sel: string) => {
      const matchTag = sel.toUpperCase().split(/,\s*/);
      const matched: FakeElement[] = [];
      function walk(curr: FakeElement) {
        for (const child of curr.children) {
          if (matchTag.includes(child.tagName)) {
            matched.push(child);
          }
          walk(child);
        }
      }
      walk(el);
      return matched;
    },
    matches: (sel: string) => {
      return sel.toUpperCase().split(/,\s*/).includes(el.tagName);
    },
  };

  for (const child of children) {
    child.parentElement = el;
  }

  return el;
}

describe("Post-Render DOM Stamper", () => {
  it("stamps fractions with numerator and denominator source ranges", () => {
    // LaTeX: \frac{a + b}{c + d}
    const latex = "\\frac{a + b}{c + d}";

    const miA = createFakeElement("mjx-mi");
    const moPlus1 = createFakeElement("mjx-mo");
    const miB = createFakeElement("mjx-mi");
    const num = createFakeElement("mjx-num", [miA, moPlus1, miB]);

    const line = createFakeElement("mjx-line");

    const miC = createFakeElement("mjx-mi");
    const moPlus2 = createFakeElement("mjx-mo");
    const miD = createFakeElement("mjx-mi");
    const den = createFakeElement("mjx-den", [miC, moPlus2, miD]);

    const frac = createFakeElement("mjx-frac", [num, line, den]);
    const root = createFakeElement("mjx-container", [frac]);

    stampMathJaxDOM(root as unknown as Element, latex);

    // Verify fraction structure
    expect(frac.className).toContain("cm-src-0-19");
    expect(num.className).toContain("cm-src-6-11");
    expect(den.className).toContain("cm-src-13-18");

    // Verify leaf tokens
    expect(miA.className).toContain("cm-src-6-7");
    expect(moPlus1.className).toContain("cm-src-8-9");
    expect(miB.className).toContain("cm-src-10-11");
    expect(miC.className).toContain("cm-src-13-14");
    expect(moPlus2.className).toContain("cm-src-15-16");
    expect(miD.className).toContain("cm-src-17-18");
  });

  it("propagates stamps to child mjx-c glyphs without index doubling", () => {
    // LaTeX: a + b
    const latex = "a + b";

    const glyphA = createFakeElement("mjx-c");
    const miA = createFakeElement("mjx-mi", [glyphA]);

    const glyphPlus = createFakeElement("mjx-c");
    const moPlus = createFakeElement("mjx-mo", [glyphPlus]);

    const glyphB = createFakeElement("mjx-c");
    const miB = createFakeElement("mjx-mi", [glyphB]);

    const root = createFakeElement("mjx-container", [miA, moPlus, miB]);

    stampMathJaxDOM(root as unknown as Element, latex);

    // Both token container and child glyph have identical stamps
    expect(miA.className).toContain("cm-src-0-1");
    expect(glyphA.className).toContain("cm-src-0-1");

    expect(moPlus.className).toContain("cm-src-2-3");
    expect(glyphPlus.className).toContain("cm-src-2-3");

    expect(miB.className).toContain("cm-src-4-5");
    expect(glyphB.className).toContain("cm-src-4-5");
  });

  it("stamps square roots and radicand ranges", () => {
    // LaTeX: \sqrt{x^2 + 1}
    const latex = "\\sqrt{x^2 + 1}";

    const surd = createFakeElement("mjx-surd");
    const box = createFakeElement("mjx-box");
    const sqrt = createFakeElement("mjx-sqrt", [surd, box]);
    const root = createFakeElement("mjx-container", [sqrt]);

    stampMathJaxDOM(root as unknown as Element, latex);

    expect(sqrt.className).toContain("cm-src-0-14");
    expect(box.className).toMatch(/cm-src-(5|6)-1[34]/);
  });

  it("stamps matrix cells accurately", () => {
    // LaTeX: \begin{matrix} a & b \\ c & d \end{matrix}
    const latex = "\\begin{matrix} a & b \\\\ c & d \\end{matrix}";

    const mtdA = createFakeElement("mjx-mtd");
    const mtdB = createFakeElement("mjx-mtd");
    const mtdC = createFakeElement("mjx-mtd");
    const mtdD = createFakeElement("mjx-mtd");

    const mtr1 = createFakeElement("mjx-mtr", [mtdA, mtdB]);
    const mtr2 = createFakeElement("mjx-mtr", [mtdC, mtdD]);
    const table = createFakeElement("mjx-mtable", [mtr1, mtr2]);
    const root = createFakeElement("mjx-container", [table]);

    stampMathJaxDOM(root as unknown as Element, latex);

    expect(mtdA.className).toContain("color-math-cell-target");
    expect(mtdB.className).toContain("color-math-cell-target");
    expect(mtdC.className).toContain("color-math-cell-target");
    expect(mtdD.className).toContain("color-math-cell-target");

    expect(mtdA.className).toMatch(/cm-src-\d+-\d+/);
    expect(mtdB.className).toMatch(/cm-src-\d+-\d+/);
  });

  it("stamps superscripts with base and script argument ranges", () => {
    // LaTeX: x^{2\alpha}
    const latex = "x^{2\\alpha}";

    const miX = createFakeElement("mjx-mi");
    const mn2 = createFakeElement("mjx-mn");
    const miAlpha = createFakeElement("mjx-mi");
    const script = createFakeElement("mjx-script", [mn2, miAlpha]);
    const msup = createFakeElement("mjx-msup", [miX, script]);
    const root = createFakeElement("mjx-container", [msup]);

    stampMathJaxDOM(root as unknown as Element, latex);

    expect(msup.className).toContain("cm-src-0-11");
    expect(miX.className).toContain("cm-src-0-1");
    expect(script.className).toContain("cm-src-3-10");
    expect(mn2.className).toContain("cm-src-3-4");
    expect(miAlpha.className).toContain("cm-src-4-10");
  });

  it("gracefully handles empty, missing, or malformed inputs without crashing", () => {
    const root = createFakeElement("mjx-container");
    expect(() => stampMathJaxDOM(root as unknown as Element, "")).not.toThrow();
    expect(() => stampMathJaxDOM(null as unknown as Element, "x + y")).not.toThrow();
  });
});
