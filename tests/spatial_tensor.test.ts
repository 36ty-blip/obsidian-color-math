// tests/spatial_tensor.test.ts
import { describe, it, expect } from "vitest";
import { stampMathJaxDOM } from "../src/editor/dom_stamper";
import { getMathJaxElementRange } from "../src/editor/weakmap_index";
import { MathCSTParser } from "../src/parsers/cst/parser";
import { QuaternionSpatialReconciler as SpatialTensorReconciler } from "../src/editor/quaternion_reconciler";

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
  lastElementChild?: FakeElement | null;
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
    get lastElementChild() {
      return children.length > 0 ? children[children.length - 1] : null;
    },
    querySelector: (sel: string) => {
      const results = el.querySelectorAll(sel);
      return results[0] || null;
    },
    querySelectorAll: (sel: string) => {
      const targets = sel.split(/,\s*/).map((s) => s.trim().toUpperCase());
      const matched: FakeElement[] = [];

      function walk(curr: FakeElement) {
        for (const child of curr.children) {
          const tag = child.tagName.toUpperCase();
          const hasMatch = targets.some((t) => {
            if (t.includes(":NOT(")) {
              const base = t.replace(/:NOT\(.*\)/, "");
              const notCls = t.match(/:NOT\(\.(.*)\)/)?.[1];
              return (base === "*" || tag === base) && (!notCls || !child.classList.contains(notCls));
            }
            if (t.startsWith(".")) {
              return child.classList.contains(t.slice(1).toLowerCase());
            }
            return tag === t || t === "*";
          });

          if (hasMatch) {
            matched.push(child);
          }
          walk(child);
        }
      }

      walk(el);
      return matched;
    },
    matches: (sel: string) => {
      const targets = sel.split(/,\s*/).map((s) => s.trim().toUpperCase());
      return targets.some((t) => {
        if (t.startsWith(".")) {
          return classes.has(t.slice(1).toLowerCase());
        }
        return el.tagName === t;
      });
    },
  };

  for (const child of children) {
    child.parentElement = el;
  }

  return el;
}

describe("4D Spatial Coordinate Tensor & Structural Tree Reconciliation (Roadmap 0.20.1 / 1.4.1)", () => {
  it("reconciles limit stacks with authoring order invariance (\\sum_{i=0}^n vs \\sum^n_{i=0})", () => {
    const latex1 = "\\sum_{i=0}^n x_i";
    const parser1 = new MathCSTParser(latex1);
    const ast1 = parser1.parse();

    // MathJax CHTML output structure for \sum_{i=0}^n
    const baseMo = createFakeElement("mjx-mo", [createFakeElement("mjx-c")]);
    const under = createFakeElement("mjx-under", [
      createFakeElement("mjx-mi", [createFakeElement("mjx-c")]), // i
      createFakeElement("mjx-mo", [createFakeElement("mjx-c")]), // =
      createFakeElement("mjx-mn", [createFakeElement("mjx-c")]), // 0
    ]);
    const over = createFakeElement("mjx-over", [
      createFakeElement("mjx-mi", [createFakeElement("mjx-c")]), // n
    ]);
    const munderover = createFakeElement("mjx-munderover", [baseMo, under, over]);
    const container1 = createFakeElement("mjx-container", [
      createFakeElement("mjx-math", [munderover])
    ]);

    const reconciler = new SpatialTensorReconciler(latex1);
    reconciler.reconcile(container1 as any, ast1);

    const overRange = getMathJaxElementRange(over as any);
    const underRange = getMathJaxElementRange(under as any);

    expect(underRange).toBeDefined();
    expect(underRange?.coord?.y).toBe(-1); // Lower limit is Y = -1

    expect(overRange).toBeDefined();
    expect(overRange?.coord?.y).toBe(1);  // Upper limit is Y = +1
  });

  it("reconciles extensible underbraces without prefix-to-postfix trailing shifts", () => {
    const latex = "\\underbrace{a+b}_{c}";
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();

    const baseBox = createFakeElement("mjx-box", [
      createFakeElement("mjx-mi", [createFakeElement("mjx-c")]), // a
      createFakeElement("mjx-mo", [createFakeElement("mjx-c")]), // +
      createFakeElement("mjx-mi", [createFakeElement("mjx-c")]), // b
    ]);
    const underLabel = createFakeElement("mjx-under", [
      createFakeElement("mjx-mi", [createFakeElement("mjx-c")]), // c
    ]);
    const munder = createFakeElement("mjx-munder", [baseBox, underLabel]);
    const container = createFakeElement("mjx-container", [
      createFakeElement("mjx-math", [munder])
    ]);

    const reconciler = new SpatialTensorReconciler(latex);
    reconciler.reconcile(container as any, ast);

    const labelRange = getMathJaxElementRange(underLabel as any);
    expect(labelRange).toBeDefined();
    expect(labelRange?.coord?.y).toBe(-1); // Underscript label bound to Y = -1
  });

  it("reconciles indexed roots (<mjx-mroot>) with index degree (Y=+1) and radicand (Y=0)", () => {
    const latex = "\\sqrt[3]{x+1}";
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();

    const surd = createFakeElement("mjx-surd");
    const box = createFakeElement("mjx-box", [
      createFakeElement("mjx-mi", [createFakeElement("mjx-c")]), // x
      createFakeElement("mjx-mo", [createFakeElement("mjx-c")]), // +
      createFakeElement("mjx-mn", [createFakeElement("mjx-c")]), // 1
    ]);
    const rootDegree = createFakeElement("mjx-root", [
      createFakeElement("mjx-mn", [createFakeElement("mjx-c")]), // 3
    ]);
    const mroot = createFakeElement("mjx-mroot", [surd, box, rootDegree]);
    const container = createFakeElement("mjx-container", [
      createFakeElement("mjx-math", [mroot])
    ]);

    const reconciler = new SpatialTensorReconciler(latex);
    reconciler.reconcile(container as any, ast);

    const degRange = getMathJaxElementRange(rootDegree as any);
    const radRange = getMathJaxElementRange(box as any);

    expect(degRange).toBeDefined();
    expect(degRange?.coord?.y).toBe(1);  // Root index degree is Y = +1
    expect(radRange).toBeDefined();
    expect(radRange?.coord?.y).toBe(0);  // Radicand is Y = 0
  });

  it("parses and reconciles first-class TextNode matching <mjx-mtext> 1:1", () => {
    const latex = "x = 1 \\quad \\text{if } y = 0";
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();

    const textNodes = ast.filter((n) => n.kind === "text");
    expect(textNodes.length).toBe(1);
    expect((textNodes[0] as any).text).toBe("if ");

    const mtext = createFakeElement("mjx-mtext", [createFakeElement("mjx-c")]);
    const container = createFakeElement("mjx-container", [
      createFakeElement("mjx-math", [
        createFakeElement("mjx-mi", [createFakeElement("mjx-c")]), // x
        createFakeElement("mjx-mo", [createFakeElement("mjx-c")]), // =
        createFakeElement("mjx-mn", [createFakeElement("mjx-c")]), // 1
        mtext,
        createFakeElement("mjx-mi", [createFakeElement("mjx-c")]), // y
        createFakeElement("mjx-mo", [createFakeElement("mjx-c")]), // =
        createFakeElement("mjx-mn", [createFakeElement("mjx-c")]), // 0
      ])
    ]);

    stampMathJaxDOM(container as any, latex);

    const textRange = getMathJaxElementRange(mtext as any);
    expect(textRange).toBeDefined();
    expect(textRange?.kind).toBe("text");
    expect(latex.slice(textRange!.start, textRange!.end)).toContain("\\text{if }");
  });

  it("quarantines fraction subtrees (Z-Plane) to prevent off-by-one cascades to outer tokens", () => {
    const latex = "\\frac{x^2+1}{y} + z";
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();

    const num = createFakeElement("mjx-num", [
      createFakeElement("mjx-msup", [
        createFakeElement("mjx-mi", [createFakeElement("mjx-c")]), // x
        createFakeElement("mjx-script", [createFakeElement("mjx-mn", [createFakeElement("mjx-c")])]), // 2
      ]),
      createFakeElement("mjx-mo", [createFakeElement("mjx-c")]), // +
      createFakeElement("mjx-mn", [createFakeElement("mjx-c")]), // 1
    ]);
    const den = createFakeElement("mjx-den", [
      createFakeElement("mjx-mi", [createFakeElement("mjx-c")]), // y
    ]);
    const frac = createFakeElement("mjx-frac", [num, den]);
    const plusOuter = createFakeElement("mjx-mo", [createFakeElement("mjx-c")]); // +
    const zOuter = createFakeElement("mjx-mi", [createFakeElement("mjx-c")]);    // z

    const container = createFakeElement("mjx-container", [
      createFakeElement("mjx-math", [frac, plusOuter, zOuter])
    ]);

    const reconciler = new SpatialTensorReconciler(latex);
    reconciler.reconcile(container as any, ast);

    const zOuterRange = getMathJaxElementRange(zOuter as any);
    expect(zOuterRange).toBeDefined();
    // z is at the end of the formula: \frac{x^2+1}{y} + z
    expect(latex.slice(zOuterRange!.start, zOuterRange!.end)).toBe("z");
    expect(zOuterRange?.coord?.z).toBe(0); // Outer baseline is Z = 0
  });

  it("computes multi-scale W-plane range expansion hierarchy", () => {
    const latex = "\\frac{x^2+1}{2y}";
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();

    const xMi = createFakeElement("mjx-mi", [createFakeElement("mjx-c")]);
    const num = createFakeElement("mjx-num", [
      createFakeElement("mjx-msup", [
        xMi,
        createFakeElement("mjx-script", [createFakeElement("mjx-mn", [createFakeElement("mjx-c")])]),
      ]),
      createFakeElement("mjx-mo", [createFakeElement("mjx-c")]),
      createFakeElement("mjx-mn", [createFakeElement("mjx-c")]),
    ]);
    const den = createFakeElement("mjx-den", [
      createFakeElement("mjx-mn", [createFakeElement("mjx-c")]),
      createFakeElement("mjx-mi", [createFakeElement("mjx-c")]),
    ]);
    const frac = createFakeElement("mjx-frac", [num, den]);
    const container = createFakeElement("mjx-container", [
      createFakeElement("mjx-math", [frac])
    ]);

    const reconciler = new SpatialTensorReconciler(latex);
    reconciler.reconcile(container as any, ast);

    const xRange = getMathJaxElementRange(xMi as any) as any;
    expect(xRange).toBeDefined();
    expect(xRange.scales).toBeDefined();

    // W = 0/1: glyph / atom
    expect(latex.slice(xRange.scales.glyph.start, xRange.scales.glyph.end)).toBe("x");
    // W = 2: slot (whole numerator x^2+1)
    expect(latex.slice(xRange.scales.slot.start, xRange.scales.slot.end)).toBe("x^2+1");
    // W = 3: molecule (whole fraction \frac{x^2+1}{2y})
    expect(latex.slice(xRange.scales.molecule.start, xRange.scales.molecule.end)).toBe(latex);
  });
});
