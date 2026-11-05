// tests/tri_engine_navigation.test.ts
//! Master Tri-Engine Navigation Invariant Testing & Grid Disagreement Benchmark.
//! Exhaustively validates Method 1 (DOM classes), Method 2 (WeakMap), and Method 3 (On-Demand CST)
//! across the full mathematical taxonomy with the Mathematical Invariant Oracle and Bijective Isomorphism assertions.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { stampMathJaxDOM } from "../src/editor/dom_stamper";
import { getMathJaxElementRange } from "../src/editor/weakmap_index";
import { resolveOnDemandRange } from "../src/editor/lazy_navigation";
import {
  createFakeElement,
  FakeElement,
  assertMathematicalInvariant,
  assertSemanticOracle,
  GridDisagreementTelemetry,
} from "./tri_engine_harness";

describe("Tri-Engine Navigation Invariant Testing & Grid Disagreement Benchmarking (Roadmap Pillar 0 & 3)", () => {
  const telemetry = new GridDisagreementTelemetry();

  afterAll(() => {
    const summary = telemetry.summary();
    console.log("\n=======================================================");
    console.log("📊 TRI-ENGINE NAVIGATION GRID DISAGREEMENT BENCHMARK");
    console.log("=======================================================");
    console.log(`Total Elements Tested      : ${summary.totalElementsTested}`);
    console.log(`Tri-Parity Exact Consensus : ${summary.triParityConsensusCount}`);
    console.log(`Consensus Rate             : ${summary.consensusRate}`);
    console.log(`Disagreements / Conflicts  : ${summary.disagreementCount}`);
    console.log(`Disagreement Rate          : ${summary.disagreementRate}`);
    console.log(`Semantic Oracle Pass Rate  : ${summary.oraclePassRate}`);
    console.log("=======================================================\n");

    expect(telemetry.disagreementCount).toBe(0);
    expect(telemetry.disagreementRate).toBe(0);
    expect(telemetry.consensusRate).toBe(100);
  });

  /**
   * Helper that executes the Tri-Engine test on a target element,
   * querying Method 1, Method 2, and pure Method 3 (skipWeakMap: true),
   * and verifying through the Mathematical Invariant Oracle.
   */
  function verifyTriEngineTarget(
    target: FakeElement,
    root: FakeElement,
    latex: string,
    expectedToken: string,
    isLeaf: boolean = true
  ) {
    const el = target as unknown as Element;
    const rootEl = root as unknown as Element;

    // 1. Method 2: High-Speed WeakMap Pointer Index (~20 ns)
    const t0_m2 = performance.now();
    const m2 = getMathJaxElementRange(el);
    const lat_m2 = (performance.now() - t0_m2) * 1e6; // ns
    telemetry.latenciesM2.push(lat_m2);
    expect(m2).toBeDefined();

    // 2. Method 1: DOM Class Provenance (cm-src-<start>-<end>) (~1.5 µs)
    const t0_m1 = performance.now();
    const m1El = target.closest('[class*="cm-src-"]');
    const m1Match = m1El?.className.match(/cm-src-(\d+)-(\d+)/);
    const lat_m1 = (performance.now() - t0_m1) * 1e3; // µs
    telemetry.latenciesM1.push(lat_m1);
    expect(m1Match).not.toBeNull();
    const m1 = { start: parseInt(m1Match![1], 10), end: parseInt(m1Match![2], 10) };

    // 3. Method 3: Pure On-Demand CST Resolution (skipWeakMap = true to test pure engine independence) (~35 µs)
    const t0_m3 = performance.now();
    const m3 = resolveOnDemandRange(el, rootEl, latex, true);
    const lat_m3 = (performance.now() - t0_m3) * 1e3; // µs
    telemetry.latenciesM3.push(lat_m3);
    expect(m3).not.toBeNull();

    // TRI-PARITY CONSENSUS ASSERTION
    telemetry.recordMatch(m1, m2, m3, isLeaf);
    expect(m1.start).toBe(m2!.start);
    expect(m2!.start).toBe(m3!.start);
    expect(m1.end).toBe(m2!.end);
    expect(m2!.end).toBe(m3!.end);

    // MATHEMATICAL INVARIANT ORACLE
    assertMathematicalInvariant(latex, m1, expectedToken);

    // GROUND-TRUTH SEMANTIC ORACLE (Prevents Common-Mode Hallucination)
    assertSemanticOracle(target, m1, latex, expectedToken);
    telemetry.recordOraclePass();
  }

  // --------------------------------------------------------------------------
  // TAXONOMY CATEGORY 1: Linear Expressions & Multi-Character Identifiers
  // --------------------------------------------------------------------------
  it("Taxonomy 1: validates Tri-Parity on linear arithmetic equations (a + b = c)", () => {
    const latex = "a + b = c";
    const elA = createFakeElement("mjx-mi", [], "a");
    const elPlus = createFakeElement("mjx-mo", [], "+");
    const elB = createFakeElement("mjx-mi", [], "b");
    const elEq = createFakeElement("mjx-mo", [], "=");
    const elC = createFakeElement("mjx-mi", [], "c");
    const root = createFakeElement("mjx-container", [
      createFakeElement("mjx-math", [elA, elPlus, elB, elEq, elC]),
    ]);

    stampMathJaxDOM(root as unknown as Element, latex);

    verifyTriEngineTarget(elA, root, latex, "a");
    verifyTriEngineTarget(elPlus, root, latex, "+");
    verifyTriEngineTarget(elB, root, latex, "b");
    verifyTriEngineTarget(elEq, root, latex, "=");
    verifyTriEngineTarget(elC, root, latex, "c");
  });

  it("Taxonomy 2: validates Tri-Parity on numbers and Greek symbols (42 \\times \\alpha + 3.14)", () => {
    const latex = "42 \\times \\alpha + 3.14";
    const el42 = createFakeElement("mjx-mn", [], "42");
    const elTimes = createFakeElement("mjx-mo", [], "\\times");
    const elAlpha = createFakeElement("mjx-mi", [], "\\alpha");
    const elPlus = createFakeElement("mjx-mo", [], "+");
    const elPi = createFakeElement("mjx-mn", [], "3.14");
    const root = createFakeElement("mjx-container", [
      createFakeElement("mjx-math", [el42, elTimes, elAlpha, elPlus, elPi]),
    ]);

    stampMathJaxDOM(root as unknown as Element, latex);

    verifyTriEngineTarget(el42, root, latex, "42");
    verifyTriEngineTarget(elTimes, root, latex, "\\times");
    verifyTriEngineTarget(elAlpha, root, latex, "\\alpha");
    verifyTriEngineTarget(elPlus, root, latex, "+");
    verifyTriEngineTarget(elPi, root, latex, "3.14");
  });

  // --------------------------------------------------------------------------
  // TAXONOMY CATEGORY 2: Vertical Fractions & Nested Fractions
  // --------------------------------------------------------------------------
  it("Taxonomy 3: validates Tri-Parity on simple vertical fractions (\\frac{a + b}{c + d})", () => {
    const latex = "\\frac{a + b}{c + d}";

    const elA = createFakeElement("mjx-mi", [], "a");
    const elPlus = createFakeElement("mjx-mo", [], "+");
    const elB = createFakeElement("mjx-mi", [], "b");
    const num = createFakeElement("mjx-num", [elA, elPlus, elB]);

    const elC = createFakeElement("mjx-mi", [], "c");
    const elPlus2 = createFakeElement("mjx-mo", [], "+");
    const elD = createFakeElement("mjx-mi", [], "d");
    const den = createFakeElement("mjx-den", [elC, elPlus2, elD]);

    const frac = createFakeElement("mjx-frac", [num, den]);
    const root = createFakeElement("mjx-container", [createFakeElement("mjx-math", [frac])]);

    stampMathJaxDOM(root as unknown as Element, latex);

    // Leaf tokens inside numerator
    verifyTriEngineTarget(elA, root, latex, "a");
    verifyTriEngineTarget(elPlus, root, latex, "+");
    verifyTriEngineTarget(elB, root, latex, "b");

    // Leaf tokens inside denominator
    verifyTriEngineTarget(elC, root, latex, "c");
    verifyTriEngineTarget(elPlus2, root, latex, "+");
    verifyTriEngineTarget(elD, root, latex, "d");
  });

  // --------------------------------------------------------------------------
  // TAXONOMY CATEGORY 3: Radicals & Square Roots
  // --------------------------------------------------------------------------
  it("Taxonomy 4: validates Tri-Parity on square roots (\\sqrt{x^2 + 1})", () => {
    const latex = "\\sqrt{x^2 + 1}";

    const surd = createFakeElement("mjx-surd");
    const elX = createFakeElement("mjx-mi", [], "x");
    const el2 = createFakeElement("mjx-mn", [], "2");
    const script = createFakeElement("mjx-script", [el2]);
    const msup = createFakeElement("mjx-msup", [elX, script]);
    const elPlus = createFakeElement("mjx-mo", [], "+");
    const el1 = createFakeElement("mjx-mn", [], "1");
    const box = createFakeElement("mjx-box", [msup, elPlus, el1]);
    const sqrt = createFakeElement("mjx-sqrt", [surd, box]);
    const root = createFakeElement("mjx-container", [createFakeElement("mjx-math", [sqrt])]);

    stampMathJaxDOM(root as unknown as Element, latex);

    verifyTriEngineTarget(elX, root, latex, "x");
    verifyTriEngineTarget(el2, root, latex, "2");
    verifyTriEngineTarget(elPlus, root, latex, "+");
    verifyTriEngineTarget(el1, root, latex, "1");
  });

  // --------------------------------------------------------------------------
  // TAXONOMY CATEGORY 4: Subscripts, Superscripts & Big Operators
  // --------------------------------------------------------------------------
  it("Taxonomy 5: validates Tri-Parity on indexed summations (\\sum_{i=0}^n x_i)", () => {
    const latex = "\\sum_{i=0}^n x_i";

    const elSum = createFakeElement("mjx-mo", [], "\\sum");
    const elI = createFakeElement("mjx-mi", [], "i");
    const elEq = createFakeElement("mjx-mo", [], "=");
    const el0 = createFakeElement("mjx-mn", [], "0");
    const under = createFakeElement("mjx-under", [elI, elEq, el0]);

    const elN = createFakeElement("mjx-mi", [], "n");
    const over = createFakeElement("mjx-over", [elN]);

    const baseMo = createFakeElement("mjx-base", [elSum]);
    const munder = createFakeElement("mjx-munder", [baseMo, under]);
    const box = createFakeElement("mjx-box", [munder]);
    const munderover = createFakeElement("mjx-munderover", [over, box]);

    const elX = createFakeElement("mjx-mi", [], "x");
    const elSubI = createFakeElement("mjx-mi", [], "i");
    const subScript = createFakeElement("mjx-script", [elSubI]);
    const msub = createFakeElement("mjx-msub", [elX, subScript]);

    const root = createFakeElement("mjx-container", [
      createFakeElement("mjx-math", [munderover, msub]),
    ]);

    stampMathJaxDOM(root as unknown as Element, latex);

    verifyTriEngineTarget(elSum, root, latex, "\\sum");
    verifyTriEngineTarget(elI, root, latex, "i");
    verifyTriEngineTarget(elEq, root, latex, "=");
    verifyTriEngineTarget(el0, root, latex, "0");
    verifyTriEngineTarget(elN, root, latex, "n");
    verifyTriEngineTarget(elX, root, latex, "x");
    verifyTriEngineTarget(elSubI, root, latex, "i");
  });

  // --------------------------------------------------------------------------
  // TAXONOMY CATEGORY 5: 2D Matrices & Grid Layouts
  // --------------------------------------------------------------------------
  it("Taxonomy 6: validates Tri-Parity on 2D matrices (\\begin{matrix} a & b \\\\ c & d \\end{matrix})", () => {
    const latex = "\\begin{matrix} a & b \\\\ c & d \\end{matrix}";

    const elA = createFakeElement("mjx-mi", [], "a");
    const mtdA = createFakeElement("mjx-mtd", [elA]);

    const elB = createFakeElement("mjx-mi", [], "b");
    const mtdB = createFakeElement("mjx-mtd", [elB]);

    const mtr1 = createFakeElement("mjx-mtr", [mtdA, mtdB]);

    const elC = createFakeElement("mjx-mi", [], "c");
    const mtdC = createFakeElement("mjx-mtd", [elC]);

    const elD = createFakeElement("mjx-mi", [], "d");
    const mtdD = createFakeElement("mjx-mtd", [elD]);

    const mtr2 = createFakeElement("mjx-mtr", [mtdC, mtdD]);

    const table = createFakeElement("mjx-mtable", [mtr1, mtr2]);
    const root = createFakeElement("mjx-container", [createFakeElement("mjx-math", [table])]);

    stampMathJaxDOM(root as unknown as Element, latex);

    verifyTriEngineTarget(elA, root, latex, "a");
    verifyTriEngineTarget(elB, root, latex, "b");
    verifyTriEngineTarget(elC, root, latex, "c");
    verifyTriEngineTarget(elD, root, latex, "d");
  });

  // --------------------------------------------------------------------------
  // TAXONOMY CATEGORY 6: Extensible Under/Over Braces & Stretchy Glyph Isolation
  // --------------------------------------------------------------------------
  it("Taxonomy 7: validates Tri-Parity on extensible under/over braces with zero phase shift", () => {
    const latex = "\\underbrace{a+b+c}_{\\text{ three terms }}\\qquad\\overbrace{x_{1}+x_{2}+\\cdots+x_{n}}^{\\text{sum}}";

    // Underbrace components:
    const elA = createFakeElement("mjx-mi", [], "a");
    const elPlus1 = createFakeElement("mjx-mo", [], "+");
    const elB = createFakeElement("mjx-mi", [], "b");
    const elPlus2 = createFakeElement("mjx-mo", [], "+");
    const elC = createFakeElement("mjx-mi", [], "c");
    const baseUnder = createFakeElement("mjx-base", [elA, elPlus1, elB, elPlus2, elC]);

    // THE STRETCHY GLYPH TRAP: mjx-c must be ignored
    const braceGlyphUnder = createFakeElement("mjx-c");
    const scriptMtextUnder = createFakeElement("mjx-mtext", [], "\\text{ three terms }");
    const scriptElUnder = createFakeElement("mjx-script", [scriptMtextUnder]);
    const scriptContainerUnder = createFakeElement("mjx-under", [braceGlyphUnder, scriptElUnder]);
    const munderEl = createFakeElement("mjx-munder", [baseUnder, scriptContainerUnder]);

    const mspaceEl = createFakeElement("mjx-mspace");

    // Overbrace components:
    const elX1_base = createFakeElement("mjx-mi", [], "x");
    const elX1_sub = createFakeElement("mjx-mn", [], "1");
    const elX1 = createFakeElement("mjx-msub", [elX1_base, elX1_sub]);

    const elPlusOver1 = createFakeElement("mjx-mo", [], "+");

    const elX2_base = createFakeElement("mjx-mi", [], "x");
    const elX2_sub = createFakeElement("mjx-mn", [], "2");
    const elX2 = createFakeElement("mjx-msub", [elX2_base, elX2_sub]);

    const elPlusOver2 = createFakeElement("mjx-mo", [], "+");
    const elCdots = createFakeElement("mjx-mo", [], "\\cdots");
    const elPlusOver3 = createFakeElement("mjx-mo", [], "+");

    const elXn_base = createFakeElement("mjx-mi", [], "x");
    const elXn_sub = createFakeElement("mjx-mi", [], "n");
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
    const scriptMtextOver = createFakeElement("mjx-mtext", [], "\\text{sum}");
    const scriptElOver = createFakeElement("mjx-script", [scriptMtextOver]);
    const scriptContainerOver = createFakeElement("mjx-over", [braceGlyphOver, scriptElOver]);
    const moverEl = createFakeElement("mjx-mover", [baseOver, scriptContainerOver]);

    const root = createFakeElement("mjx-container", [
      createFakeElement("mjx-math", [munderEl, mspaceEl, moverEl]),
    ]);

    stampMathJaxDOM(root as unknown as Element, latex);

    // Verify underbrace base items
    verifyTriEngineTarget(elA, root, latex, "a");
    verifyTriEngineTarget(elPlus1, root, latex, "+");
    verifyTriEngineTarget(elB, root, latex, "b");
    verifyTriEngineTarget(elPlus2, root, latex, "+");
    verifyTriEngineTarget(elC, root, latex, "c");

    // Verify underbrace script text: \text{ three terms }
    verifyTriEngineTarget(scriptMtextUnder, root, latex, "\\text{ three terms }");

    // CRITICAL PHASE-SHIFT VERIFICATION:
    // Verify x_1 resolves to 'x', NOT to '+'!
    verifyTriEngineTarget(elX1_base, root, latex, "x");
    verifyTriEngineTarget(elX1_sub, root, latex, "1");

    // Verify the '+' beside x_1 resolves strictly to '+'
    verifyTriEngineTarget(elPlusOver1, root, latex, "+");

    // Verify x_2
    verifyTriEngineTarget(elX2_base, root, latex, "x");
    verifyTriEngineTarget(elX2_sub, root, latex, "2");

    // Verify overbrace script text: \text{sum}
    verifyTriEngineTarget(scriptMtextOver, root, latex, "\\text{sum}");
  });

  // --------------------------------------------------------------------------
  // DOM LIFECYCLE & RECYCLING INVARIANCE
  // --------------------------------------------------------------------------
  it("Lifecycle Invariance: verifies Tri-Engine consistency on cloned / recycled DOM nodes", () => {
    const latex = "\\frac{x + 1}{y - 1}";

    const elX = createFakeElement("mjx-mi", [], "x");
    const elPlus = createFakeElement("mjx-mo", [], "+");
    const el1 = createFakeElement("mjx-mn", [], "1");
    const num = createFakeElement("mjx-num", [elX, elPlus, el1]);

    const elY = createFakeElement("mjx-mi", [], "y");
    const elMinus = createFakeElement("mjx-mo", [], "-");
    const el1Den = createFakeElement("mjx-mn", [], "1");
    const den = createFakeElement("mjx-den", [elY, elMinus, el1Den]);

    const frac = createFakeElement("mjx-frac", [num, den]);
    const root = createFakeElement("mjx-container", [createFakeElement("mjx-math", [frac])]);

    // Initial stamping
    stampMathJaxDOM(root as unknown as Element, latex);

    // Clone the entire rendered tree (simulates Obsidian Live Preview recycling DOM leaves)
    const clonedRoot = root.cloneNode(true);
    const clonedElX = clonedRoot.querySelector("mjx-mi")!;

    // 1. Method 1 (DOM Classes) must survive cloning unconditionally!
    const m1Match = clonedElX.className.match(/cm-src-(\d+)-(\d+)/);
    expect(m1Match).not.toBeNull();
    const m1 = { start: parseInt(m1Match![1], 10), end: parseInt(m1Match![2], 10) };
    expect(latex.slice(m1.start, m1.end)).toBe("x");

    // 2. Method 3 (Pure On-Demand) must compute identical range on cloned tree without WeakMap!
    const m3 = resolveOnDemandRange(
      clonedElX as unknown as Element,
      clonedRoot as unknown as Element,
      latex,
      true
    );
    expect(m3).not.toBeNull();
    expect(m3?.start).toBe(m1.start);
    expect(m3?.end).toBe(m1.end);

    // 3. Re-stamping cloned root restores Method 2 WeakMap index with 100% fidelity
    clonedRoot.querySelectorAll(".cm-tensor-reconciled").forEach((e) => e.classList.remove("cm-tensor-reconciled"));
    clonedRoot.classList.remove("cm-tensor-reconciled");
    stampMathJaxDOM(clonedRoot as unknown as Element, latex);
    const m2Cloned = getMathJaxElementRange(clonedElX as unknown as Element);
    expect(m2Cloned).toBeDefined();
    expect(m2Cloned?.start).toBe(m1.start);
    expect(m2Cloned?.end).toBe(m1.end);
  });

  // --------------------------------------------------------------------------
  // MULTI-TIER FALLBACK ARCHITECTURE & FAULT INJECTION TESTS
  // --------------------------------------------------------------------------
  it("Fallback Tier 1 -> Tier 2: verifies transparent fallback to Method 1 DOM classes upon WeakMap eviction", () => {
    const latex = "\\frac{a}{b}";
    const elA = createFakeElement("mjx-mi", [], "a");
    const elB = createFakeElement("mjx-mi", [], "b");
    const num = createFakeElement("mjx-num", [elA]);
    const den = createFakeElement("mjx-den", [elB]);
    const frac = createFakeElement("mjx-frac", [num, den]);
    const root = createFakeElement("mjx-container", [createFakeElement("mjx-math", [frac])]);

    stampMathJaxDOM(root as unknown as Element, latex);

    // Verify initial WeakMap hit
    expect(getMathJaxElementRange(elA as unknown as Element)).toBeDefined();

    // Simulate complete WeakMap cache eviction by testing an isolated element detached from indexed hierarchy
    const evictedEl = createFakeElement("mjx-mi", [], "a");
    evictedEl.className = elA.className; // preserves cm-src-6-7

    // Method 2 (WeakMap) misses
    expect(getMathJaxElementRange(evictedEl as unknown as Element)).toBeUndefined();

    // Fallback Tier 1 (Method 1 DOM classes) succeeds unconditionally
    const m1Match = evictedEl.closest('[class*="cm-src-"]')?.className.match(/cm-src-(\d+)-(\d+)/);
    expect(m1Match).not.toBeNull();
    const m1 = { start: parseInt(m1Match![1], 10), end: parseInt(m1Match![2], 10) };
    expect(latex.slice(m1.start, m1.end)).toBe("a");
    expect(m1.start).toBe(6);
    expect(m1.end).toBe(7);
  });

  it("Fallback Tier 2 -> Tier 3: verifies pure Method 3 On-Demand CST resolution when DOM classes are stripped", () => {
    const latex = "\\frac{x + 1}{y - 1}";
    const elX = createFakeElement("mjx-mi", [], "x");
    const elPlus = createFakeElement("mjx-mo", [], "+");
    const el1 = createFakeElement("mjx-mn", [], "1");
    const num = createFakeElement("mjx-num", [elX, elPlus, el1]);

    const elY = createFakeElement("mjx-mi", [], "y");
    const elMinus = createFakeElement("mjx-mo", [], "-");
    const el1Den = createFakeElement("mjx-mn", [], "1");
    const den = createFakeElement("mjx-den", [elY, elMinus, el1Den]);

    const frac = createFakeElement("mjx-frac", [num, den]);
    const root = createFakeElement("mjx-container", [createFakeElement("mjx-math", [frac])]);

    // Headless state without running stampMathJaxDOM (no DOM classes, no WeakMap index)
    expect(elX.className).toBe("");
    expect(getMathJaxElementRange(elX as unknown as Element)).toBeUndefined();

    // Method 3 (Pure On-Demand) must resolve the exact range from CST structure alone
    const m3X = resolveOnDemandRange(elX as unknown as Element, root as unknown as Element, latex, true);
    expect(m3X).not.toBeNull();
    expect(latex.slice(m3X!.start, m3X!.end)).toBe("x");
    expect(m3X!.start).toBe(6);
    expect(m3X!.end).toBe(7);

    const m3Plus = resolveOnDemandRange(elPlus as unknown as Element, root as unknown as Element, latex, true);
    expect(m3Plus).not.toBeNull();
    expect(latex.slice(m3Plus!.start, m3Plus!.end)).toBe("+");

    const m3Y = resolveOnDemandRange(elY as unknown as Element, root as unknown as Element, latex, true);
    expect(m3Y).not.toBeNull();
    expect(latex.slice(m3Y!.start, m3Y!.end)).toBe("y");
  });

  it("Structural Container Cascade: verifies fallback when clicking non-leaf structural elements", () => {
    const latex = "\\sqrt{x + 1}";
    const surd = createFakeElement("mjx-surd");
    const elX = createFakeElement("mjx-mi", [], "x");
    const elPlus = createFakeElement("mjx-mo", [], "+");
    const el1 = createFakeElement("mjx-mn", [], "1");
    const box = createFakeElement("mjx-box", [elX, elPlus, el1]);
    const sqrt = createFakeElement("mjx-sqrt", [surd, box]);
    const root = createFakeElement("mjx-container", [createFakeElement("mjx-math", [sqrt])]);

    stampMathJaxDOM(root as unknown as Element, latex);

    // 1. Clicking on radical checkmark (mjx-surd) falls back to selecting the entire radical molecule
    const surdRange = resolveOnDemandRange(surd as unknown as Element, root as unknown as Element, latex, true);
    expect(surdRange).not.toBeNull();
    expect(surdRange?.kind).toBe("root");
    expect(surdRange?.start).toBe(0);
    expect(surdRange?.end).toBe(latex.length);

    // 2. Clicking inside radicand content box (mjx-box background) selects radicand slot
    const boxRange = resolveOnDemandRange(box as unknown as Element, root as unknown as Element, latex, true);
    expect(boxRange).not.toBeNull();
    expect(boxRange?.kind).toBe("root");
    expect(latex.slice(boxRange!.start, boxRange!.end)).toBe("{x + 1}");
  });

  // --------------------------------------------------------------------------
  // LEMIRE MPHF SYMBOL BOUNDARY & BARE FUNCTION VERIFICATION
  // --------------------------------------------------------------------------
  it("Lemire MPHF Integration: verifies exact macro boundaries on bare mathematical functions and Greek symbols", () => {
    const latex = "\\sin \\alpha + \\cos \\beta";
    const elSin = createFakeElement("mjx-mo", [], "\\sin");
    const elAlpha = createFakeElement("mjx-mi", [], "\\alpha");
    const elPlus = createFakeElement("mjx-mo", [], "+");
    const elCos = createFakeElement("mjx-mo", [], "\\cos");
    const elBeta = createFakeElement("mjx-mi", [], "\\beta");

    const root = createFakeElement("mjx-container", [
      createFakeElement("mjx-math", [
        elSin, elAlpha, elPlus, elCos, elBeta
      ])
    ]);

    stampMathJaxDOM(root as unknown as Element, latex);

    // 1. \sin (0 to 4) - verify full macro name including backslash
    verifyTriEngineTarget(elSin, root, latex, "\\sin");

    // 2. \alpha (5 to 11) - Greek symbol boundary
    verifyTriEngineTarget(elAlpha, root, latex, "\\alpha");

    // 3. \cos (14 to 18) - Bare trig function via MPHF
    verifyTriEngineTarget(elCos, root, latex, "\\cos");

    // 4. \beta (19 to 24) - Greek symbol boundary
    verifyTriEngineTarget(elBeta, root, latex, "\\beta");
  });

  // --------------------------------------------------------------------------
  // LATENCY SLA VERIFICATION (144Hz Frame Budget: 6.94 ms / 6,944 µs)
  // --------------------------------------------------------------------------
  it("Latency SLA: verifies sub-144Hz performance budgets for all three resolution methods", () => {
    // Assert WeakMap lookup operates in sub-microsecond/nanosecond time (target < 10000 ns on Windows)
    const avgM2 = telemetry.latenciesM2.reduce((a, b) => a + b, 0) / telemetry.latenciesM2.length;
    expect(avgM2).toBeLessThan(10000); // < 10 µs (< 10000 ns, far below 6,944 µs 144Hz SLA)

    // Assert Method 1 DOM class resolution operates in < 150 µs (46x below 144Hz 6,944 µs SLA)
    const avgM1 = telemetry.latenciesM1.reduce((a, b) => a + b, 0) / telemetry.latenciesM1.length;
    expect(avgM1).toBeLessThan(150); // < 150 µs

    // Assert Method 3 pure on-demand CST computation operates in < 1,000 µs (7x below 144Hz 6,944 µs SLA)
    const avgM3 = telemetry.latenciesM3.reduce((a, b) => a + b, 0) / telemetry.latenciesM3.length;
    expect(avgM3).toBeLessThan(1000); // < 1,000 µs

    // Total input-to-cursor budget is well within the 6,944 µs (144Hz) frame ceiling
    const totalLatency = (avgM1 + avgM3) / 1000; // ms
    expect(totalLatency).toBeLessThan(1.0); // < 1.0 ms
  });
});
