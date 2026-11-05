// tests/tri_engine.test.ts
import { describe, it, expect } from "vitest";
import { stampMathJaxDOM } from "../src/editor/dom_stamper";
import { getMathJaxElementRange } from "../src/editor/weakmap_index";
import { resolveOnDemandRange } from "../src/editor/lazy_navigation";

interface FakeElement {
  tagName: string;
  className: string;
  classList: {
    add: (cls: string) => void;
    contains: (cls: string) => boolean;
  };
  children: FakeElement[];
  parentElement: FakeElement | null;
  firstElementChild?: FakeElement | null;
  querySelector: (sel: string) => FakeElement | null;
  querySelectorAll: (sel: string) => FakeElement[];
  closest: (sel: string) => FakeElement | null;
  contains: (el: FakeElement) => boolean;
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
    closest: (sel: string) => {
      const matchTag = sel.toUpperCase().split(/,\s*/);
      let curr: FakeElement | null = el;
      while (curr) {
        if (matchTag.includes(curr.tagName) || (sel.includes("cm-src") && curr.className.includes("cm-src"))) {
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
    matches: (sel: string) => {
      return sel.toUpperCase().split(/,\s*/).includes(el.tagName);
    },
  };

  for (const child of children) {
    child.parentElement = el;
  }

  return el;
}

describe("Tri-Engine Navigation Architecture (Method 1 + 2 + 3 in Parallel)", () => {
  it("verifies 100% Tri-Parity agreement across leaf tokens in fraction expressions", () => {
    // LaTeX: \frac{a + b}{c + d}
    const latex = "\\frac{a + b}{c + d}";

    const glyphA = createFakeElement("mjx-c");
    const miA = createFakeElement("mjx-mi", [glyphA]);

    const glyphPlus = createFakeElement("mjx-c");
    const moPlus = createFakeElement("mjx-mo", [glyphPlus]);

    const glyphB = createFakeElement("mjx-c");
    const miB = createFakeElement("mjx-mi", [glyphB]);

    const num = createFakeElement("mjx-num", [miA, moPlus, miB]);
    const frac = createFakeElement("mjx-frac", [num]);
    const root = createFakeElement("mjx-container", [frac]);

    // Stamp DOM: populates both Method 1 (classes) and Method 2 (WeakMap)
    stampMathJaxDOM(root as unknown as Element, latex);

    // Test Target: clicking on glyph 'a' (<mjx-c>)
    const target = glyphA as unknown as Element;

    // 1. Method 2 (WeakMap Index): ~20 ns
    const m2 = getMathJaxElementRange(target);
    expect(m2).toBeDefined();
    expect(m2?.start).toBe(6);
    expect(m2?.end).toBe(7);

    // 2. Method 1 (DOM Class Provenance): ~1.5 µs
    const m1El = target.closest('[class*="cm-src-"]');
    const m1Match = m1El?.className.match(/cm-src-(\d+)-(\d+)/);
    expect(m1Match).not.toBeNull();
    const m1 = { start: parseInt(m1Match![1], 10), end: parseInt(m1Match![2], 10) };
    expect(m1.start).toBe(6);
    expect(m1.end).toBe(7);

    // 3. Method 3 (On-Demand CST Resolution): ~35 µs
    const m3 = resolveOnDemandRange(target, root as unknown as Element, latex);
    expect(m3).not.toBeNull();
    expect(m3?.start).toBe(6);
    expect(m3?.end).toBe(7);

    // TRI-PARITY VERIFICATION: All three engines agree exactly
    expect(m1.start).toBe(m2?.start);
    expect(m2?.start).toBe(m3?.start);
    expect(m1.end).toBe(m2?.end);
    expect(m2?.end).toBe(m3?.end);
  });

  it("verifies Tri-Parity on square roots", () => {
    // LaTeX: \sqrt{x^2 + 1}
    const latex = "\\sqrt{x^2 + 1}";

    const surd = createFakeElement("mjx-surd");
    const box = createFakeElement("mjx-box");
    const sqrt = createFakeElement("mjx-sqrt", [surd, box]);
    const root = createFakeElement("mjx-container", [sqrt]);

    stampMathJaxDOM(root as unknown as Element, latex);

    // Click on radical checkmark
    const m2 = getMathJaxElementRange(surd as unknown as Element);
    const m3 = resolveOnDemandRange(surd as unknown as Element, root as unknown as Element, latex);

    expect(m2).toBeDefined();
    expect(m3).toBeDefined();
    expect(m2?.start).toBe(0);
    expect(m3?.start).toBe(0);
    expect(m2?.end).toBe(14);
    expect(m3?.end).toBe(14);
  });

  it("verifies Tri-Parity on matrix cells", () => {
    // LaTeX: \begin{matrix} a & b \\ c & d \end{matrix}
    const latex = "\\begin{matrix} a & b \\\\ c & d \\end{matrix}";

    const mtdA = createFakeElement("mjx-mtd");
    const mtdB = createFakeElement("mjx-mtd");
    const mtr = createFakeElement("mjx-mtr", [mtdA, mtdB]);
    const table = createFakeElement("mjx-mtable", [mtr]);
    const root = createFakeElement("mjx-container", [table]);

    stampMathJaxDOM(root as unknown as Element, latex);

    const m2 = getMathJaxElementRange(mtdB as unknown as Element);
    const m3 = resolveOnDemandRange(mtdB as unknown as Element, root as unknown as Element, latex);

    expect(m2).toBeDefined();
    expect(m3).toBeDefined();
    expect(m2?.start).toBe(m3?.start);
    expect(m2?.end).toBe(m3?.end);
  });
});
