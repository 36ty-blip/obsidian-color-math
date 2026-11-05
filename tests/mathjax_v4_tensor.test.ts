// tests/mathjax_v4_tensor.test.ts
//! Dedicated verification suite for MathJax v4 CHTML DOM structures.
//! Asserts 4D Spatial Tensor reconciliation against MathJax v4 layout specifications:
//! 1. Single <mjx-script> with <mjx-spacer> in <mjx-msubsup>
//! 2. Multi-tier <mjx-over> + <mjx-box><mjx-munder> in <mjx-munderover>
//! 3. Closing delimiter script attachment on norms (\\|x\\|_2^2)

import { describe, it, expect } from "vitest";
import { QuaternionSpatialReconciler as SpatialTensorReconciler } from "../src/editor/quaternion_reconciler";
import { getMathJaxElementRange } from "../src/editor/weakmap_index";
import { MathCSTParser } from "../src/parsers/cst/parser";
import { createFakeElement, FakeElement } from "./tri_engine_harness";

describe("MathJax v4 4D Spatial Tensor Verification Suite", () => {
  it("reconciles MathJax v4 <mjx-msubsup> with unified <mjx-script> and <mjx-spacer>", () => {
    const latex = "x_i^n";
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();

    // Reconstruct exact MathJax v4 CHTML DOM for x_i^n
    const baseMi = createFakeElement("mjx-mi", [createFakeElement("mjx-c", [], "x")]);
    const superMi = createFakeElement("mjx-mi", [createFakeElement("mjx-c", [], "n")]);
    const spacer = createFakeElement("mjx-spacer");
    const subMi = createFakeElement("mjx-mi", [createFakeElement("mjx-c", [], "i")]);

    // MathJax v4 puts superscript BEFORE spacer, subscript AFTER spacer inside single <mjx-script>
    const scriptContainer = createFakeElement("mjx-script", [superMi, spacer, subMi]);
    const msubsup = createFakeElement("mjx-msubsup", [baseMi, scriptContainer]);
    const container = createFakeElement("mjx-container", [
      createFakeElement("mjx-math", [msubsup])
    ]);

    const reconciler = new SpatialTensorReconciler(latex);
    reconciler.reconcile(container as any, ast);

    const baseRange = getMathJaxElementRange(baseMi as any);
    const superRange = getMathJaxElementRange(superMi as any);
    const subRange = getMathJaxElementRange(subMi as any);

    expect(baseRange).toBeDefined();
    expect(baseRange?.coord?.y).toBe(0);
    expect(baseRange?.start).toBe(0);
    expect(baseRange?.end).toBe(1); // 'x'

    expect(superRange).toBeDefined();
    expect(superRange?.coord?.y).toBe(1); // Superscript is Y = +1
    expect(superRange?.start).toBe(4);
    expect(superRange?.end).toBe(5); // 'n'

    expect(subRange).toBeDefined();
    expect(subRange?.coord?.y).toBe(-1); // Subscript is Y = -1
    expect(subRange?.start).toBe(2);
    expect(subRange?.end).toBe(3); // 'i'
  });

  it("reconciles MathJax v4 <mjx-munderover> with <mjx-over> and <mjx-box><mjx-munder>", () => {
    const latex = "\\sum_{i=0}^n x_i";
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();

    // Reconstruct exact MathJax v4 CHTML DOM for \sum_{i=0}^n
    const overMi = createFakeElement("mjx-mi", [createFakeElement("mjx-c", [], "n")]);
    const overEl = createFakeElement("mjx-over", [overMi]);

    const baseMo = createFakeElement("mjx-mo", [createFakeElement("mjx-c", [], "∑")]);
    const baseContainer = createFakeElement("mjx-base", [baseMo]);

    const underText = createFakeElement("mjx-TeXAtom", [
      createFakeElement("mjx-mi", [createFakeElement("mjx-c", [], "i")]),
      createFakeElement("mjx-mo", [createFakeElement("mjx-c", [], "=")]),
      createFakeElement("mjx-mn", [createFakeElement("mjx-c", [], "0")]),
    ]);
    const underEl = createFakeElement("mjx-under", [underText]);

    const munder = createFakeElement("mjx-munder", [baseContainer, underEl]);
    const boxEl = createFakeElement("mjx-box", [munder]);

    // MathJax v4 puts <mjx-over> FIRST, followed by <mjx-box>
    const munderover = createFakeElement("mjx-munderover", [overEl, boxEl]);

    const xSub = createFakeElement("mjx-msub", [
      createFakeElement("mjx-mi", [createFakeElement("mjx-c", [], "x")]),
      createFakeElement("mjx-script", [createFakeElement("mjx-mi", [createFakeElement("mjx-c", [], "i")])])
    ]);

    const container = createFakeElement("mjx-container", [
      createFakeElement("mjx-math", [munderover, xSub])
    ]);

    const reconciler = new SpatialTensorReconciler(latex);
    reconciler.reconcile(container as any, ast);

    const overRange = getMathJaxElementRange(overEl as any);
    const underRange = getMathJaxElementRange(underEl as any);
    const baseRange = getMathJaxElementRange(baseContainer as any) || getMathJaxElementRange(baseMo as any);

    expect(overRange).toBeDefined();
    expect(overRange?.coord?.y).toBe(1); // Upper limit is Y = +1

    expect(underRange).toBeDefined();
    expect(underRange?.coord?.y).toBe(-1); // Lower limit is Y = -1

    expect(baseRange).toBeDefined();
    expect(baseRange?.coord?.y).toBe(0); // Base operator is Y = 0
  });

  it("reconciles MathJax v4 norm limits attached to closing delimiter (\\|x\\|_2^2)", () => {
    const latex = "\\|x\\|_2^2";
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();

    // In MathJax v4, \|x\|_2^2 produces:
    // 1. mjx-mo (\\|)
    // 2. mjx-mi (x)
    // 3. mjx-msubsup wrapping mjx-mo (\\|) and mjx-script (super 2, spacer, sub 2)
    const openMo = createFakeElement("mjx-mo", [createFakeElement("mjx-c", [], "‖")]);
    const miX = createFakeElement("mjx-mi", [createFakeElement("mjx-c", [], "x")]);

    const closeMo = createFakeElement("mjx-mo", [createFakeElement("mjx-c", [], "‖")]);
    const superMn = createFakeElement("mjx-mn", [createFakeElement("mjx-c", [], "2")]);
    const spacer = createFakeElement("mjx-spacer");
    const subMn = createFakeElement("mjx-mn", [createFakeElement("mjx-c", [], "2")]);
    const scriptContainer = createFakeElement("mjx-script", [superMn, spacer, subMn]);
    const closeSubsup = createFakeElement("mjx-msubsup", [closeMo, scriptContainer]);

    const container = createFakeElement("mjx-container", [
      createFakeElement("mjx-math", [openMo, miX, closeSubsup])
    ]);

    const reconciler = new SpatialTensorReconciler(latex);
    reconciler.reconcile(container as any, ast);

    const openRange = getMathJaxElementRange(openMo as any);
    const xRange = getMathJaxElementRange(miX as any);
    const closeRange = getMathJaxElementRange(closeMo as any);
    const superRange = getMathJaxElementRange(superMn as any);
    const subRange = getMathJaxElementRange(subMn as any);

    expect(openRange).toBeDefined();
    expect(openRange?.start).toBe(0);
    expect(openRange?.end).toBe(2); // '\|'

    expect(xRange).toBeDefined();
    expect(xRange?.start).toBe(2);
    expect(xRange?.end).toBe(3); // 'x'
    expect(xRange?.coord?.y).toBe(0);

    expect(closeRange).toBeDefined();
    expect(closeRange?.start).toBe(3);
    expect(closeRange?.end).toBe(5); // '\|'

    expect(subRange).toBeDefined();
    expect(subRange?.coord?.y).toBe(-1); // Subscript 2 is Y = -1

    expect(superRange).toBeDefined();
    expect(superRange?.coord?.y).toBe(1); // Superscript 2 is Y = +1
  });
});
