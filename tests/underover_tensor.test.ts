// tests/underover_tensor.test.ts
import { describe, it, expect } from "vitest";
import { stampMathJaxDOM } from "../src/editor/dom_stamper";
import { getMathJaxElementRange } from "../src/editor/weakmap_index";
import { MathCSTParser } from "../src/parsers/cst/parser";
import { UnderOverNode } from "../src/parsers/cst/types";
import { MathQuaternion } from "../src/editor/quaternion";

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

describe("4D Tensor Extensible Under/Over Molecule Reconciliation", () => {
  it("parses \\underbrace and \\overbrace as first-class 4D UnderOverNode molecules", () => {
    const latex = "\\underbrace{a+b+c}_{\\text{ three terms }}\\qquad\\overbrace{x_{1}+x_{2}+\\cdots+x_{n}}^{\\text{sum}}";
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();

    expect(ast.length).toBe(3); // [UnderOverNode, CommandNode(\qquad), UnderOverNode]
    expect(ast[0].kind).toBe("underover");
    expect(ast[1].kind).toBe("command");
    expect(ast[2].kind).toBe("underover");

    const underNode = ast[0] as UnderOverNode;
    expect(underNode.operator).toBe("\\underbrace");
    expect(underNode.targetRole).toBe("underscript");
    expect(underNode.base.length).toBe(5); // a, +, b, +, c
    expect(underNode.script.length).toBe(1); // \text{ three terms }
    expect(underNode.script[0].kind).toBe("text");

    const overNode = ast[2] as UnderOverNode;
    expect(overNode.operator).toBe("\\overbrace");
    expect(overNode.targetRole).toBe("overscript");
    expect(overNode.script.length).toBe(1); // \text{sum}
    expect(overNode.script[0].kind).toBe("text");
  });

  it("reconciles \\underbrace and \\overbrace without rightward shift or token theft", () => {
    const latex = "\\underbrace{a+b+c}_{\\text{ three terms }}\\qquad\\overbrace{x_{1}+x_{2}+\\cdots+x_{n}}^{\\text{sum}}";

    // Build mock MathJax CHTML DOM for:
    // \underbrace{a+b+c}_{\text{ three terms }}\qquad\overbrace{x_{1}+x_{2}+\cdots+x_{n}}^{\text{sum}}

    // Underbrace components:
    const elA = createFakeElement("mjx-mi");
    const elPlus1 = createFakeElement("mjx-mo");
    const elB = createFakeElement("mjx-mi");
    const elPlus2 = createFakeElement("mjx-mo");
    const elC = createFakeElement("mjx-mi");
    const baseUnder = createFakeElement("mjx-base", [elA, elPlus1, elB, elPlus2, elC]);

    const braceGlyphUnder = createFakeElement("mjx-c");
    const scriptMtextUnder = createFakeElement("mjx-mtext");
    const scriptElUnder = createFakeElement("mjx-script", [scriptMtextUnder]);
    const scriptContainerUnder = createFakeElement("mjx-under", [braceGlyphUnder, scriptElUnder]);
    const munderEl = createFakeElement("mjx-munder", [baseUnder, scriptContainerUnder]);

    // Spacing
    const mspaceEl = createFakeElement("mjx-mspace");

    // Overbrace components:
    const elX1_base = createFakeElement("mjx-mi");
    const elX1_sub = createFakeElement("mjx-mn");
    const elX1 = createFakeElement("mjx-msub", [elX1_base, elX1_sub]);

    const elPlusOver1 = createFakeElement("mjx-mo");

    const elX2_base = createFakeElement("mjx-mi");
    const elX2_sub = createFakeElement("mjx-mn");
    const elX2 = createFakeElement("mjx-msub", [elX2_base, elX2_sub]);

    const elPlusOver2 = createFakeElement("mjx-mo");
    const elCdots = createFakeElement("mjx-mo");
    const elPlusOver3 = createFakeElement("mjx-mo");

    const elXn_base = createFakeElement("mjx-mi");
    const elXn_sub = createFakeElement("mjx-mi");
    const elXn = createFakeElement("mjx-msub", [elXn_base, elXn_sub]);

    const baseOver = createFakeElement("mjx-base", [
      elX1,
      elPlusOver1,
      elX2,
      elPlusOver2,
      elCdots,
      elPlusOver3,
      elXn,
    ]);

    const braceGlyphOver = createFakeElement("mjx-c");
    const scriptMtextOver = createFakeElement("mjx-mtext");
    const scriptElOver = createFakeElement("mjx-script", [scriptMtextOver]);
    const scriptContainerOver = createFakeElement("mjx-over", [braceGlyphOver, scriptElOver]);
    const moverEl = createFakeElement("mjx-mover", [baseOver, scriptContainerOver]);

    const mathRoot = createFakeElement("mjx-math", [munderEl, mspaceEl, moverEl]);
    const container = createFakeElement("mjx-container", [mathRoot]);

    // Execute DOM stamping
    stampMathJaxDOM(container as any, latex);

    // 1. Verify underbrace molecule is stamped at W=3
    const underRange = getMathJaxElementRange(munderEl as any);
    expect(underRange).toBeDefined();
    expect(underRange?.kind).toBe("underover");
    expect(underRange?.coord?.w).toBe(3);
    expect(underRange?.coord?.z).toBe(0);

    // 2. Verify \text{ three terms } is stamped on scriptMtextUnder with exact source range
    const threeTermsRange = getMathJaxElementRange(scriptMtextUnder as any);
    expect(threeTermsRange).toBeDefined();
    expect(threeTermsRange?.kind).toBe("text");
    const threeTermsText = latex.slice(threeTermsRange!.start, threeTermsRange!.end);
    expect(threeTermsText).toBe("\\text{ three terms }");

    // 3. Verify x_1's base is stamped with x_1's start, NOT with the '+' sign!
    const x1Range = getMathJaxElementRange(elX1_base as any);
    expect(x1Range).toBeDefined();
    expect(x1Range?.kind).toBe("leaf");
    const x1Text = latex.slice(x1Range!.start, x1Range!.end);
    expect(x1Text).toBe("x");

    // 4. Verify the '+' beside x_1 is stamped with '+', NOT with something else!
    const plusRange = getMathJaxElementRange(elPlusOver1 as any);
    expect(plusRange).toBeDefined();
    expect(plusRange?.kind).toBe("leaf");
    const plusText = latex.slice(plusRange!.start, plusRange!.end);
    expect(plusText).toBe("+");

    // 5. Verify \text{sum} is stamped on scriptMtextOver
    const sumRange = getMathJaxElementRange(scriptMtextOver as any);
    expect(sumRange).toBeDefined();
    expect(sumRange?.kind).toBe("text");
    const sumText = latex.slice(sumRange!.start, sumRange!.end);
    expect(sumText).toBe("\\text{sum}");
  });

  it("parses bare \\underbrace without subscript as script: null", () => {
    const latex = "\\underbrace{a + b}";
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();

    expect(ast.length).toBe(1);
    expect(ast[0].kind).toBe("underover");
    const node = ast[0] as UnderOverNode;
    expect(node.operator).toBe("\\underbrace");
    expect(node.script).toBeNull();
    expect(node.base.length).toBe(3); // a, +, b
  });

  it("parses prefix operators \\underset and \\overset with canonical slot mapping", () => {
    const latex = "\\underset{x \\to 0}{\\lim} f(x) + A \\overset{\\text{def}}{=} B";
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();

    // 1. \underset{x \to 0}{\lim}
    expect(ast[0].kind).toBe("underover");
    const under = ast[0] as UnderOverNode;
    expect(under.operator).toBe("\\underset");
    expect(under.targetRole).toBe("underscript");
    expect(under.script).toBeDefined();
    expect(under.script!.length).toBeGreaterThan(0); // x \to 0
    expect(under.base.length).toBe(1); // \lim

    // 2. \overset{\text{def}}{=}
    const overNode = ast.find((n) => n.kind === "underover" && (n as UnderOverNode).operator === "\\overset") as UnderOverNode;
    expect(overNode).toBeDefined();
    expect(overNode.targetRole).toBe("overscript");
    expect(overNode.script).toBeDefined();
    expect(overNode.script![0].kind).toBe("text"); // \text{def}
    expect(overNode.base.length).toBe(1); // =
  });

  it("penalizes structural depth jumps with w_Z = 100 in anisotropic geodesic metric", () => {
    // Dominant baseline token (Z=0, Y=0, X=5)
    const baseQuat = new MathQuaternion(1, 0, 0, 5);
    // Sub-baseline token at depth Z=1, same horizontal position (Z=1, Y=-1, X=5)
    const depthQuat = new MathQuaternion(1, 1, -1, 5);
    // Sibling token on same baseline at distance 5 (Z=0, Y=0, X=10)
    const siblingQuat = new MathQuaternion(1, 0, 0, 10);

    const depthDist = baseQuat.geodesicDistanceTo(depthQuat);
    const siblingDist = baseQuat.geodesicDistanceTo(siblingQuat);

    // With w_Z = 100 and w_Y = 25:
    // depthDist = sqrt(100 * 1^2 + 25 * (-1)^2) = sqrt(125) ≈ 11.18
    // siblingDist = sqrt(1 * 5^2) = 5
    // The depth jump is heavily penalized compared to horizontal movement within the same slot!
    expect(depthDist).toBeGreaterThan(siblingDist * 2);
  });
});
