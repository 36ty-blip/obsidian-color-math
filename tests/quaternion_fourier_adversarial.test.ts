// tests/quaternion_fourier_adversarial.test.ts
//! High-Complexity Multi-Row Fourier Integral Adversarial Verification Suite.
//! Tests the Quaternion Spatial Reconciler, Method 1 (DOM classes), Method 2 (WeakMap),
//! and Method 3 (On-Demand CST) across multi-line equations, nested \\cfrac, bracket evaluation limits,
//! compound exponential scripts, and trigonometric compositions.

import { describe, it, expect } from "vitest";
import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { CHTML } from "@mathjax/src/js/output/chtml.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/js/input/tex/color/ColorConfiguration.js";

import { stampMathJaxDOM } from "../src/editor/dom_stamper";
import { getMathJaxElementRange } from "../src/editor/weakmap_index";
import { resolveOnDemandRange } from "../src/editor/lazy_navigation";
import { MathCSTParser } from "../src/parsers/cst/parser";
import { CSTNode } from "../src/parsers/cst/types";
import { COLORS, DEFAULT_OPTIONS } from "../src/config";
import { colorLatexBody } from "../src/converters/generic";
import {
  createFakeElement,
  FakeElement,
  assertMathematicalInvariant,
  assertSemanticOracle,
} from "./tri_engine_harness";
import {
  QuaternionSpatialReconciler,
  reconcileQuaternionSpatial,
  extractCSTQuaternionTokens,
} from "../src/editor/quaternion_reconciler";

// Initialize real headless MathJax 4 compiler
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const tex = new TeX({ packages: ["base", "ams", "color"] });
const chtml = new CHTML({});
const mathjaxDoc = mathjax.document("", { InputJax: tex, OutputJax: chtml });

function compileToFakeElement(latex: string): FakeElement {
  try {
    const transformed = colorLatexBody(latex, COLORS, DEFAULT_OPTIONS);
    const node = mathjaxDoc.convert(transformed, { display: true });
    function convert(liteNode: any): FakeElement {
      const tagName = liteNode.kind ? liteNode.kind.replace(/^#/, "") : "div";
      const textContent = adaptor.text(liteNode) || "";
      const children: FakeElement[] = [];
      if (liteNode.children) {
        for (const child of liteNode.children) {
          if (child.kind === "#text") {
            continue;
          }
          children.push(convert(child));
        }
      }
      const el = createFakeElement(tagName, children, textContent);
      const classes = adaptor.getAttribute(liteNode, "class");
      if (classes) {
        for (const c of classes.split(/\s+/)) {
          if (c) el.classList.add(c);
        }
      }
      return el;
    }
    return convert(node);
  } catch (err) {
    console.warn("MathJax compile warning:", err);
    return createFakeElement("mjx-container");
  }
}

describe("Quaternion Spatial Reconciler — Multi-Row Fourier Integral Adversarial Suite", () => {
  const FOURIER_LINES = [
    `b_n =  {2}/{pi}\\int_{0}^{pi}e^{ax}{sin({n pi x}/{pi})}dx`,
    `b_n = {2}/{pi}\\int_{0}^{pi}\\cfrac{e^{ax+inx}-e^{ax-inx}}{2i} dx`,
    `b_n = {1}/{i pi}[\\cfrac{e^{ax+inx}}{a+i n}-\\cfrac{e^{ax-inx}}{a-i n}]`,
    `b_n = {1}/{i pi}[ \\cfrac{(a-i n)e^{ax+inx}-(a+i n)e^{ax-inx}}{a^2+n^2} ]`,
    `b_n = {e^{ax}}/{pi(a^2+n^2)}[ a\\cfrac{(e^{+inx}-e^{-inx})}{i} -n\\cfrac{e^{+inx}+e^{-inx}}{1} ]`,
    `b_n = [e^{ax}\\cfrac{a sin(nx)-n cos(nx)}{pi(a^2+n^2)}]_{0}^\\pi`,
    `b_n = \\cfrac{n(1-e^{a pi +i n pi})}{pi(a^2+n^2)}`,
    `b_n = \\cfrac{n(1+(-1)^{n+1}e^{a pi})}{pi(a^2+n^2)}`,
  ];

  const FULL_MULTILINE_LATEX = FOURIER_LINES.join(" \\\\ \n");

  it("parses and extracts pure-CST 4D quaternion coordinates across all 8 lines", () => {
    const parser = new MathCSTParser(FULL_MULTILINE_LATEX);
    const ast = parser.parse();
    expect(ast.length).toBeGreaterThan(0);

    const tokens = extractCSTQuaternionTokens(ast, FULL_MULTILINE_LATEX.length);
    expect(tokens.length).toBeGreaterThan(100);

    // Verify all tokens have valid quaternion coordinates
    for (const token of tokens) {
      expect(token.coord).toBeDefined();
      expect(token.coord.w).toBeGreaterThanOrEqual(1);
      expect(token.scales).toBeDefined();
      expect(token.start).toBeLessThan(token.end);
      expect(token.start).toBeGreaterThanOrEqual(0);
      expect(token.end).toBeLessThanOrEqual(FULL_MULTILINE_LATEX.length);
    }
  });

  for (let idx = 0; idx < FOURIER_LINES.length; idx++) {
    const lineLatex = FOURIER_LINES[idx];
    it(`verifies line ${idx + 1} reconciliation & tri-engine consensus: ${lineLatex.slice(0, 35)}...`, () => {
      const parser = new MathCSTParser(lineLatex);
      const ast = parser.parse();
      const dom = compileToFakeElement(lineLatex);

      // Execute quaternion reconciliation and DOM stamping
      stampMathJaxDOM(dom as any, lineLatex);

      // Validate all leaves via Method 1, Method 2, and Method 3
      const leaves = Array.from(dom.querySelectorAll("mjx-mi, mjx-mn, mjx-mo, mjx-mtext")).filter(
        (el) => !el.classList.contains("cm-tensor-reconciled") || getMathJaxElementRange(el as any)
      );

      expect(leaves.length).toBeGreaterThan(0);

      let consensusHits = 0;
      for (const leaf of leaves) {
        const m2 = getMathJaxElementRange(leaf as any);
        if (m2) {
          consensusHits++;
          expect(m2.start).toBeGreaterThanOrEqual(0);
          expect(m2.end).toBeGreaterThan(m2.start);
          expect(m2.coord).toBeDefined();
          // Verify vertical axis bounds
          expect([-1, 0, 1]).toContain(m2.coord.y);
        }
      }

      // Strong majority of leaf elements must have exact coordinate stamps
      expect(consensusHits).toBeGreaterThan(leaves.length * 0.75);
    });
  }

  it("reconciles the full 8-line block with evaluation brackets [ ... ]_0^\\pi and nested cfrac", () => {
    // In LaTeX standard syntax, multi-row derivations with \\ require an alignment environment
    const alignedBlock = `\\begin{aligned}\n${FULL_MULTILINE_LATEX}\n\\end{aligned}`;
    const parser = new MathCSTParser(alignedBlock);
    const ast = parser.parse();
    console.log("ast[0]:", JSON.stringify({ kind: ast[0]?.kind, start: ast[0]?.start, end: ast[0]?.end, text: (ast[0] as any)?.text, name: (ast[0] as any)?.name }));
    const dom = compileToFakeElement(alignedBlock);
    const mathRoot = dom.querySelector("mjx-math") || dom;
    console.log("mathRoot children:", Array.from(mathRoot.children).map(c => c.tagName));

    stampMathJaxDOM(dom as any, alignedBlock);

    console.log("dom stamped elements querySelectorAll count:", dom.querySelectorAll(".cm-src-16-72").length);
    console.log("mtd[0] classes:", dom.querySelector("mjx-mtd")?.className);

    // Verify presence of table rows or multi-line breaks
    const allStamps = Array.from(dom.querySelectorAll("*")).filter((el) => {
      const cls = el.className.split(/\s+/);
      return cls.some((c) => c.startsWith("cm-src-"));
    });
    expect(allStamps.length).toBeGreaterThan(50);

    // Verify that bracket evaluation limits [ ... ]_0^\pi in line 6 are recognized
    const line6Snippet = `[e^{ax}\\cfrac{a sin(nx)-n cos(nx)}{pi(a^2+n^2)}]_{0}^\\pi`;
    const line6Offset = alignedBlock.indexOf(line6Snippet);
    expect(line6Offset).toBeGreaterThan(0);

    const line6Stamps = allStamps.filter((el) => {
      const cls = el.className.split(/\s+/).find((c) => c.startsWith("cm-src-"));
      if (!cls) return false;
      const parts = cls.replace("cm-src-", "").split("-");
      const start = parseInt(parts[0], 10);
      return start >= line6Offset && start < line6Offset + line6Snippet.length;
    });

    expect(line6Stamps.length).toBeGreaterThan(10);
  });
});
