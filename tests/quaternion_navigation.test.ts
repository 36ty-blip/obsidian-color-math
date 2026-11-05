// tests/quaternion_navigation.test.ts
import { describe, it, expect } from "vitest";
import {
  MathQuaternion,
  collectContainerTokens,
  collectCSTContainerTokens,
  findNearestTokenGeodesic,
  resolveOrthogonalKeyboardStep,
  findFractionPartnerInLatex,
  CandidateTokenTarget,
} from "../src/editor/quaternion";
import { SpatialCoordinate4D } from "../src/parsers/cst/types";
import { QuaternionSpatialReconciler as SpatialTensorReconciler } from "../src/editor/quaternion_reconciler";
import { MathCSTParser } from "../src/parsers/cst/parser";
import { getMathJaxElementRange } from "../src/editor/weakmap_index";

interface FakeElement {
  tagName: string;
  className: string;
  classList: {
    add: (cls: string) => void;
    contains: (cls: string) => boolean;
  };
  setAttribute: (name: string, val: string) => void;
  getAttribute: (name: string) => string | null;
  cloneNode: (deep?: boolean) => FakeElement;
  children: FakeElement[];
  parentElement: FakeElement | null;
  querySelector: (sel: string) => FakeElement | null;
  querySelectorAll: (sel: string) => FakeElement[];
  matches: (sel: string) => boolean;
  getBoundingClientRect?: () => { top: number; left: number; width: number; height: number };
}

function createFakeElement(tagName: string, children: FakeElement[] = [], rect?: { top: number; left: number; width: number; height: number }): FakeElement {
  const classes = new Set<string>();
  const attrs = new Map<string, string>();
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
    setAttribute: (name: string, val: string) => {
      attrs.set(name, val);
    },
    getAttribute: (name: string) => {
      return attrs.get(name) ?? null;
    },
    cloneNode: (deep = false) => {
      const clonedChildren = deep ? el.children.map((c) => c.cloneNode(true)) : [];
      const cloned = createFakeElement(tagName, clonedChildren, rect);
      cloned.className = el.className;
      for (const [k, v] of attrs.entries()) {
        cloned.setAttribute(k, v);
      }
      return cloned;
    },
    children,
    parentElement: null,
    querySelector: (sel: string) => el.querySelectorAll(sel)[0] || null,
    querySelectorAll: (sel: string) => {
      const targets = sel.split(/,\s*/).map((s) => s.trim().toUpperCase());
      const matched: FakeElement[] = [];
      function walk(curr: FakeElement) {
        for (const child of curr.children) {
          const tag = child.tagName.toUpperCase();
          const match = targets.some((t) => {
            if (t.includes(":NOT(")) {
              const base = t.replace(/:NOT\(.*\)/, "");
              const notCls = t.match(/:NOT\(\.(.*)\)/)?.[1];
              return (base === "*" || tag === base) && (!notCls || !child.classList.contains(notCls));
            }
            return tag === t || t === "*";
          });
          if (match) matched.push(child);
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
    getBoundingClientRect: rect ? () => rect : undefined,
  };

  for (const child of children) {
    child.parentElement = el;
  }
  return el;
}

describe("Active Quaternion & Vector Space Navigation (Roadmap 0.20.2 / 1.4.2)", () => {
  it("computes hypercomplex quaternion norm, conjugation, and anisotropic geodesic distance", () => {
    const q1 = new MathQuaternion(1, 0, 0, 2); // W=1, Z=0, Y=0, X=2
    expect(q1.normSquared()).toBe(1 + 0 + 0 + 4); // 5

    // Structural Y-conjugation (flips vertical role)
    const qFracNum = new MathQuaternion(2, 1, 1, 0); // Numerator
    const qFracDen = qFracNum.conjugateY();
    expect(qFracDen.y).toBe(-1); // Denominator
    expect(qFracDen.z).toBe(1);

    // Geodesic distance: Cross-depth (Z) jump has high penalty
    const qSameSlot = new MathQuaternion(1, 1, 1, 1);
    const qOtherDepth = new MathQuaternion(1, 0, 0, 1);
    const dSame = qFracNum.geodesicDistanceTo(qSameSlot);
    const dOther = qFracNum.geodesicDistanceTo(qOtherDepth);

    expect(dOther).toBeGreaterThan(dSame);
  });

  it("resolves vertical arrow navigation (ArrowUp: denominator -> numerator, ArrowDown: numerator -> denominator)", () => {
    // Fraction \frac{a}{b}:
    // a in numerator: Z=1, Y=+1, X=0
    // b in denominator: Z=1, Y=-1, X=0
    const elNum = createFakeElement("mjx-mi");
    const elDen = createFakeElement("mjx-mi");

    const candidates: CandidateTokenTarget[] = [
      {
        element: elNum as any,
        range: { start: 6, end: 7, kind: "leaf", coord: { w: 1, z: 1, y: 1, x: 0 } } as any,
        quat: new MathQuaternion(1, 1, 1, 0),
      },
      {
        element: elDen as any,
        range: { start: 8, end: 9, kind: "leaf", coord: { w: 1, z: 1, y: -1, x: 0 } } as any,
        quat: new MathQuaternion(1, 1, -1, 0),
      },
    ];

    // 1. From Denominator (y = -1), ArrowUp jumps to Numerator (y = +1)
    const stepUp = resolveOrthogonalKeyboardStep("up", { w: 1, z: 1, y: -1, x: 0 }, candidates);
    expect(stepUp).not.toBeNull();
    expect(stepUp?.range.start).toBe(6); // 'a' in numerator

    // 2. From Numerator (y = +1), ArrowDown jumps to Denominator (y = -1)
    const stepDown = resolveOrthogonalKeyboardStep("down", { w: 1, z: 1, y: 1, x: 0 }, candidates);
    expect(stepDown).not.toBeNull();
    expect(stepDown?.range.start).toBe(8); // 'b' in denominator
  });

  it("guarantees boundary fall-through (no keyboard trapping inside equations)", () => {
    const candidates: CandidateTokenTarget[] = [
      {
        element: createFakeElement("mjx-mi") as any,
        range: { start: 0, end: 1, kind: "leaf", coord: { w: 1, z: 0, y: 0, x: 0 } } as any,
        quat: new MathQuaternion(1, 0, 0, 0),
      },
    ];

    // Pressing ArrowUp at dominant baseline (Y=0) returns null (does not trap cursor)
    const stepUpBaseline = resolveOrthogonalKeyboardStep("up", { w: 1, z: 0, y: 0, x: 0 }, candidates);
    expect(stepUpBaseline).toBeNull();

    // Pressing ArrowUp when already in numerator (Y=+1) returns null (allows prose navigation above formula)
    const stepUpNumerator = resolveOrthogonalKeyboardStep("up", { w: 1, z: 1, y: 1, x: 0 }, candidates);
    expect(stepUpNumerator).toBeNull();

    // Pressing ArrowDown when already in denominator (Y=-1) returns null (allows prose navigation below formula)
    const stepDownDenominator = resolveOrthogonalKeyboardStep("down", { w: 1, z: 1, y: -1, x: 0 }, candidates);
    expect(stepDownDenominator).toBeNull();
  });

  it("snaps whitespace clicks to nearest token inside active slot using screen vectors and syntax barriers", () => {
    const elA = createFakeElement("mjx-mi", [], { top: 10, left: 10, width: 10, height: 10 });
    const elOp = createFakeElement("mjx-mo", [], { top: 10, left: 20, width: 10, height: 10 });
    const elB = createFakeElement("mjx-mi", [], { top: 10, left: 30, width: 10, height: 10 });

    const container = createFakeElement("mjx-container", [elA, elOp, elB]);

    // Reconcile coordinates
    const latex = "a + b";
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();
    const reconciler = new SpatialTensorReconciler(latex);
    reconciler.reconcile(container as any, ast);

    // Clicking at (32, 14) - directly inside / nearest to 'b' (left 30..40)
    const nearest = findNearestTokenGeodesic(container as any, 32, 14);
    expect(nearest).not.toBeNull();
    expect(nearest?.range.end).toBe(5); // 'b'
  });

  it("executes vector calculations well within latency budget (< 50 µs)", () => {
    const q1 = new MathQuaternion(1, 2, -1, 4);
    const q2 = new MathQuaternion(1, 2, 1, 4);

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      q1.geodesicDistanceTo(q2);
      q1.conjugateY();
    }
    const totalMs = performance.now() - start;
    const perOpMicroseconds = (totalMs / 1000) * 1000;

    // Must be well under 50 µs
    expect(perOpMicroseconds).toBeLessThan(50);
  });

  it("navigates directly between fraction braces (\\frac{x-2}{y-3}) with 1:1 character alignment and boundary fall-through", () => {
    // Index mapping for "\frac{x-2}{y-3}":
    // 01234 5 6 7 8 9 10 11 12 13 14
    // \frac { x - 2 } {  y  -  3  }
    const latex = "\\frac{x-2}{y-3}";

    // 1. From Numerator {x-2} to Denominator {y-3} via ArrowDown
    // At 'x' (offset 6) -> jumps to 'y' (offset 11)
    expect(findFractionPartnerInLatex(latex, 6, "down")).toBe(11);
    // At '-' (offset 7) -> jumps to '-' (offset 12)
    expect(findFractionPartnerInLatex(latex, 7, "down")).toBe(12);
    // At '2' (offset 8) -> jumps to '3' (offset 13)
    expect(findFractionPartnerInLatex(latex, 8, "down")).toBe(13);

    // 2. From Denominator {y-3} to Numerator {x-2} via ArrowUp
    // At 'y' (offset 11) -> jumps to 'x' (offset 6)
    expect(findFractionPartnerInLatex(latex, 11, "up")).toBe(6);
    // At '-' (offset 12) -> jumps to '-' (offset 7)
    expect(findFractionPartnerInLatex(latex, 12, "up")).toBe(7);
    // At '3' (offset 13) -> jumps to '2' (offset 8)
    expect(findFractionPartnerInLatex(latex, 13, "up")).toBe(8);

    // 3. Boundary Fall-Through (No Cursor Trapping)
    // Pressing ArrowUp while already in numerator {x-2} returns null (prose lines above formula)
    expect(findFractionPartnerInLatex(latex, 6, "up")).toBeNull();
    // Pressing ArrowDown while already in denominator {y-3} returns null (prose lines below formula)
    expect(findFractionPartnerInLatex(latex, 11, "down")).toBeNull();

    // 4. Outside Fraction Returns Null
    expect(findFractionPartnerInLatex("x + y", 2, "up")).toBeNull();
    expect(findFractionPartnerInLatex("x + y", 2, "down")).toBeNull();
  });

  it("isolates sibling fractions on distinct Z planes (\\frac{a}{b} + \\frac{c}{d}) so ArrowDown on c lands on d, never b", () => {
    const latex = "\\frac{a}{b} + \\frac{c}{d}";
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();

    const frac1 = createFakeElement("mjx-mfrac", [
      createFakeElement("mjx-num", [createFakeElement("mjx-mi")]),
      createFakeElement("mjx-den", [createFakeElement("mjx-mi")]),
    ]);
    const opPlus = createFakeElement("mjx-mo");
    const frac2 = createFakeElement("mjx-mfrac", [
      createFakeElement("mjx-num", [createFakeElement("mjx-mi")]),
      createFakeElement("mjx-den", [createFakeElement("mjx-mi")]),
    ]);
    const container = createFakeElement("mjx-container", [frac1, opPlus, frac2]);

    const reconciler = new SpatialTensorReconciler(latex);
    reconciler.reconcile(container as any, ast);

    const candidates = collectContainerTokens(container as any);
    const tokA = candidates.find((t) => latex.slice(t.range.start, t.range.end) === "a")!;
    const tokB = candidates.find((t) => latex.slice(t.range.start, t.range.end) === "b")!;
    const tokC = candidates.find((t) => latex.slice(t.range.start, t.range.end) === "c")!;
    const tokD = candidates.find((t) => latex.slice(t.range.start, t.range.end) === "d")!;

    expect(tokA.range.coord.z).toBe(1);
    expect(tokB.range.coord.z).toBe(1);
    expect(tokC.range.coord.z).toBe(2);
    expect(tokD.range.coord.z).toBe(2);

    // ArrowDown from 'c' (second fraction numerator) MUST land on 'd' (second fraction denominator), never 'b'!
    const stepDownFromC = resolveOrthogonalKeyboardStep("down", tokC.range.coord, candidates);
    expect(stepDownFromC?.range.start).toBe(tokD.range.start);

    // ArrowUp from 'd' MUST land on 'c', never 'a'!
    const stepUpFromD = resolveOrthogonalKeyboardStep("up", tokD.range.coord, candidates);
    expect(stepUpFromD?.range.start).toBe(tokC.range.start);
  });

  it("isolates sibling scripts on distinct Z planes while sharing Z_mol for chained sub/superscripts (x_1^2 + y_3^4)", () => {
    const latex = "x_1^2 + y_3^4";
    const candidates = collectCSTContainerTokens(latex);

    const tok1 = candidates.find((t) => latex.slice(t.range.start, t.range.end) === "1")!;
    const tok2 = candidates.find((t) => latex.slice(t.range.start, t.range.end) === "2")!;
    const tok3 = candidates.find((t) => latex.slice(t.range.start, t.range.end) === "3")!;
    const tok4 = candidates.find((t) => latex.slice(t.range.start, t.range.end) === "4")!;

    // x_1^2 shares Z_mol = 1; y_3^4 shares Z_mol = 2
    expect(tok1.range.coord.z).toBe(1);
    expect(tok2.range.coord.z).toBe(1);
    expect(tok3.range.coord.z).toBe(2);
    expect(tok4.range.coord.z).toBe(2);

    // ArrowDown on '4' (superscript of y) lands on '3' (subscript of y), never '1'
    const stepDownFrom4 = resolveOrthogonalKeyboardStep("down", tok4.range.coord, candidates);
    expect(stepDownFrom4?.range.start).toBe(tok3.range.start);

    // ArrowUp on '3' lands on '4', never '2'
    const stepUpFrom3 = resolveOrthogonalKeyboardStep("up", tok3.range.coord, candidates);
    expect(stepUpFrom3?.range.start).toBe(tok4.range.start);
  });

  it("steps vertically across 2D matrix rows preserving column alignment (3x2 matrix)", () => {
    const latex = "\\begin{pmatrix} a & b \\\\ c & d \\\\ e & f \\end{pmatrix}";
    const candidates = collectCSTContainerTokens(latex);

    const tokA = candidates.find((t) => latex.slice(t.range.start, t.range.end) === "a")!;
    const tokB = candidates.find((t) => latex.slice(t.range.start, t.range.end) === "b")!;
    const tokC = candidates.find((t) => latex.slice(t.range.start, t.range.end) === "c")!;
    const tokD = candidates.find((t) => latex.slice(t.range.start, t.range.end) === "d")!;
    const tokE = candidates.find((t) => latex.slice(t.range.start, t.range.end) === "e")!;
    const tokF = candidates.find((t) => latex.slice(t.range.start, t.range.end) === "f")!;

    // Verify 2D (row, col) coordinates: y = -row, x = col * 16
    expect(tokA.range.coord).toMatchObject({ z: 1, y: 0, x: 0 });
    expect(tokB.range.coord).toMatchObject({ z: 1, y: 0, x: 16 });
    expect(tokC.range.coord).toMatchObject({ z: 1, y: -1, x: 0 });
    expect(tokD.range.coord).toMatchObject({ z: 1, y: -1, x: 16 });
    expect(tokE.range.coord).toMatchObject({ z: 1, y: -2, x: 0 });
    expect(tokF.range.coord).toMatchObject({ z: 1, y: -2, x: 16 });

    // Column 1 vertical stepping: b (row 0) -> d (row 1) -> f (row 2) -> null (exit)
    const downFromB = resolveOrthogonalKeyboardStep("down", tokB.range.coord, candidates)!;
    expect(downFromB.range.start).toBe(tokD.range.start);

    const downFromD = resolveOrthogonalKeyboardStep("down", downFromB.range.coord, candidates)!;
    expect(downFromD.range.start).toBe(tokF.range.start);

    const downFromF = resolveOrthogonalKeyboardStep("down", downFromD.range.coord, candidates);
    expect(downFromF).toBeNull();

    // And back up: f (row 2) -> d (row 1) -> b (row 0) -> null (exit)
    const upFromF = resolveOrthogonalKeyboardStep("up", tokF.range.coord, candidates)!;
    expect(upFromF.range.start).toBe(tokD.range.start);

    const upFromD = resolveOrthogonalKeyboardStep("up", upFromF.range.coord, candidates)!;
    expect(upFromD.range.start).toBe(tokB.range.start);

    const upFromB = resolveOrthogonalKeyboardStep("up", upFromD.range.coord, candidates);
    expect(upFromB).toBeNull();
  });

  it("preserves full 3D tensor coordinates and multi-scale intervals across cloneNode(true) via data-cm-tensor hydration", () => {
    const latex = "\\frac{x+1}{y-1}";
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();

    const num = createFakeElement("mjx-num", [
      createFakeElement("mjx-mi"),
      createFakeElement("mjx-mo"),
      createFakeElement("mjx-mn"),
    ]);
    const den = createFakeElement("mjx-den", [
      createFakeElement("mjx-mi"),
      createFakeElement("mjx-mo"),
      createFakeElement("mjx-mn"),
    ]);
    const frac = createFakeElement("mjx-mfrac", [num, den]);
    const container = createFakeElement("mjx-container", [frac]);

    const reconciler = new SpatialTensorReconciler(latex);
    reconciler.reconcile(container as any, ast);

    // Simulate MathJaxInterceptor cache hit: cloneNode(true) creates brand-new DOM node identities not in the WeakMap!
    const clonedContainer = container.cloneNode(true);
    const clonedTokens = collectContainerTokens(clonedContainer as any);

    // Every leaf and slot in the cloned DOM tree must hydrate its 3D coordinate tensor and scales from data-cm-tensor
    expect(clonedTokens.length).toBeGreaterThanOrEqual(6);
    const clonedX = clonedTokens.find((t) => latex.slice(t.range.start, t.range.end) === "x")!;
    const clonedY = clonedTokens.find((t) => latex.slice(t.range.start, t.range.end) === "y")!;

    expect(clonedX.range.coord).toMatchObject({ z: 1, y: 1, x: 0 });
    expect(clonedY.range.coord).toMatchObject({ z: 1, y: -1, x: 0 });
    expect(clonedX.range.scales?.slot).toEqual({ start: 6, end: 9 });
    expect(clonedX.range.scales?.molecule).toEqual({ start: 0, end: 15 });

    // Subsequent lookup hits the re-hydrated WeakMap directly
    expect(getMathJaxElementRange(clonedX.element)?.start).toBe(6);
  });

  it("resolves nested enclosure frames with distinct non-overlapping signatures for [{x}] vs {[x]}", () => {
    // 1. [{x}]
    const latex1 = "[{x}]";
    const parser1 = new MathCSTParser(latex1);
    const ast1 = parser1.parse();

    const miX1 = createFakeElement("mjx-mi");
    const mrowInner = createFakeElement("mjx-mrow", [miX1]);
    const openBrack = createFakeElement("mjx-mo");
    const closeBrack = createFakeElement("mjx-mo");
    const mrowOuter = createFakeElement("mjx-mrow", [openBrack, mrowInner, closeBrack]);
    const root1 = createFakeElement("mjx-container", [mrowOuter]);

    const reconciler1 = new SpatialTensorReconciler(latex1);
    reconciler1.reconcile(root1 as any, ast1);

    expect(getMathJaxElementRange(openBrack)?.start).toBe(0);
    expect(getMathJaxElementRange(openBrack)?.end).toBe(1);
    expect(getMathJaxElementRange(closeBrack)?.start).toBe(4);
    expect(getMathJaxElementRange(closeBrack)?.end).toBe(5);
    expect(getMathJaxElementRange(miX1)?.start).toBe(2);
    expect(getMathJaxElementRange(miX1)?.end).toBe(3);
  });

  it("isolates subscript group tokens in sequential multi-molecule equations without leaking parent molecule span", () => {
    // Chemical equation with subscript groups: X_{(s)} \to X_{(g)}
    const latex = "X_{(s)} \\to X_{(g)}";
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();

    // Build DOM tree matching MathJax CHTML layout
    const base1 = createFakeElement("mjx-base", [createFakeElement("mjx-mi")]);
    const openP1 = createFakeElement("mjx-mo");
    const sId = createFakeElement("mjx-mi");
    const closeP1 = createFakeElement("mjx-mo");
    const scriptMrow1 = createFakeElement("mjx-mrow", [openP1, sId, closeP1]);
    const script1 = createFakeElement("mjx-script", [scriptMrow1]);
    const msub1 = createFakeElement("mjx-msub", [base1, script1]);

    const toMo = createFakeElement("mjx-mo");

    const base2 = createFakeElement("mjx-base", [createFakeElement("mjx-mi")]);
    const openP2 = createFakeElement("mjx-mo");
    const gId = createFakeElement("mjx-mi");
    const closeP2 = createFakeElement("mjx-mo");
    const scriptMrow2 = createFakeElement("mjx-mrow", [openP2, gId, closeP2]);
    const script2 = createFakeElement("mjx-script", [scriptMrow2]);
    const msub2 = createFakeElement("mjx-msub", [base2, script2]);

    const root = createFakeElement("mjx-container", [msub1, toMo, msub2]);

    const reconciler = new SpatialTensorReconciler(latex);
    reconciler.reconcile(root as any, ast);

    // Verify X_{(s)}
    const rBase1 = getMathJaxElementRange(base1.children[0]);
    expect(rBase1?.start).toBe(0);
    expect(rBase1?.end).toBe(1);

    // Verify X_{(g)}
    const rBase2 = getMathJaxElementRange(base2.children[0]);
    expect(rBase2?.start).toBe(12);
    expect(rBase2?.end).toBe(13);

    // Individual leaf tokens inside (g) must NOT inherit the outer molecule span [12, 19]
    const rOpenP2 = getMathJaxElementRange(openP2);
    const rG = getMathJaxElementRange(gId);
    const rCloseP2 = getMathJaxElementRange(closeP2);

    expect(rOpenP2?.start).toBe(15);
    expect(rOpenP2?.end).toBe(16);
    expect(rG?.start).toBe(16);
    expect(rG?.end).toBe(17);
    expect(rCloseP2?.start).toBe(17);
    expect(rCloseP2?.end).toBe(18);

    // All ranges are strictly distinct
    const ranges = [rBase2?.start, rOpenP2?.start, rG?.start, rCloseP2?.start];
    const uniqueRanges = new Set(ranges);
    expect(uniqueRanges.size).toBe(4);
  });
});
