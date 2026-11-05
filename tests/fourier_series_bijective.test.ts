// tests/fourier_series_bijective.test.ts
import { describe, it, expect } from "vitest";
import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { CHTML } from "@mathjax/src/js/output/chtml.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";

import { MathCSTParser } from "../src/parsers/cst/parser";
import { stampMathJaxDOM } from "../src/editor/dom_stamper";
import { getMathJaxElementRange } from "../src/editor/weakmap_index";
import { highlightSelectionInMathContainer } from "../src/editor/inline_tooltip";
import { createFakeElement, FakeElement } from "./tri_engine_harness";
import { QuaternionSpatialReconciler } from "../src/editor/quaternion_reconciler";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_COLORS } from "../src/config";
import "@mathjax/src/js/input/tex/color/ColorConfiguration.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const tex = new TeX({ packages: ["base", "ams", "color"] });
const chtml = new CHTML({ fontURL: "https://cdn.jsdelivr.net/npm/mathjax-newcm-font/chtml/dynamic" });
const htmlDoc = mathjax.document("", { InputJax: tex, OutputJax: chtml });

describe("Fourier Series Bijective Layout Reconciliation Suite", () => {
  it("reconciles Fourier series expression without orphans or collisions", () => {
    const raw = "f(x) \\sim \\frac{a_0}{2} + \\sum_{n=1}^\\infty \\left( a_n \\cos(nx) + b_n \\sin(nx) \\right)";
    const parser = new MathCSTParser(raw);
    const ast = parser.parse();

    const mathNode = htmlDoc.convert(raw, { display: true });
    function convert(node: any): any {
      if (!node) return null;
      const kind = node.kind || node.tagName || "";
      if (kind === "#text") return null;
      const children: any[] = [];
      let textContent = "";
      if (node.children) {
        for (const c of node.children) {
          if (c.kind === "#text") {
            textContent += c.value || "";
          } else {
            const childEl = convert(c);
            if (childEl) children.push(childEl);
          }
        }
      }
      const fakeEl = createFakeElement(kind, children, textContent);
      if (node.attributes?.class) {
        fakeEl.className = node.attributes.class;
      }
      return fakeEl;
    }
    const container = convert(mathNode);

    const reconciler = new QuaternionSpatialReconciler(raw);
    reconciler.reconcile(container, ast);

    // Verify key tokens are mapped with exact bijective ranges
    const anMi = container.querySelectorAll("mjx-mi").find((el: any) => el.textContent === "𝑎" && el.parentElement?.tagName === "MJX-MSUB" && el.parentElement?.parentElement?.tagName === "MJX-MROW");
    expect(anMi).toBeDefined();
    const anRange = getMathJaxElementRange(anMi as any);
    expect(anRange).toBeDefined();
    expect(anRange?.start).toBe(51);
    expect(anRange?.end).toBe(52);

    const bnMi = container.querySelectorAll("mjx-mi").find((el: any) => el.textContent === "𝑏" && el.parentElement?.tagName === "MJX-MSUB" && el.parentElement?.parentElement?.tagName === "MJX-MROW");
    expect(bnMi).toBeDefined();
    const bnRange = getMathJaxElementRange(bnMi as any);
    expect(bnRange).toBeDefined();
    expect(bnRange?.start).toBe(66);
    expect(bnRange?.end).toBe(67);
  });

  it("reconciles inline Dirac delta cases expression with outer line break and quoted strings", () => {
    const raw =
      'δ[n]=\\begin{cases}\\ \\ \\delta[0]=1  & n=0  \\\\ \\\\\\ \\ \\delta[n]=0  & "Other wise"\\end{cases} \\\\ "some times " => \\delta[t]" or "\\delta(t)';
    const transformed = colorLatexBody(raw, DEFAULT_COLORS);

    const mathNode = htmlDoc.convert(transformed, { display: false });
    function convert(node: any): any {
      if (!node) return null;
      const kind = node.kind || node.tagName || "";
      if (kind === "#text") return null;
      const children: any[] = [];
      let textContent = "";
      if (node.children) {
        for (const c of node.children) {
          if (c.kind === "#text") {
            textContent += c.value || "";
          } else {
            const childEl = convert(c);
            if (childEl) children.push(childEl);
          }
        }
      }
      const fakeEl = createFakeElement(kind, children, textContent);
      if (node.attributes?.class) {
        fakeEl.className = node.attributes.class;
      }
      return fakeEl;
    }
    const container = convert(mathNode);
    stampMathJaxDOM(container, raw);

    const leaves = container.querySelectorAll("mjx-mi, mjx-mn, mjx-mo, mjx-mtext");
    const unstamped: string[] = [];
    for (const leaf of leaves) {
      const text = (leaf.textContent || "").trim();
      if (!text) continue;
      const r = getMathJaxElementRange(leaf);
      if (!r) {
        unstamped.push(`${leaf.tagName}(${text})`);
      }
    }
    expect(unstamped).toEqual([]);

    // Verify source selection -> rendered MathJax & tooltip highlighting
    // Selecting "Other wise" (offsets 64..76) highlights the corresponding <mjx-mtext>
    const quoteStart = raw.indexOf('"Other wise"');
    const quoteEnd = quoteStart + '"Other wise"'.length;
    highlightSelectionInMathContainer(container as any, quoteStart, quoteEnd);
    const selectedEls = container.querySelectorAll(".color-math-selected-target");
    expect(selectedEls.length).toBeGreaterThan(0);
    expect(selectedEls.some((el: any) => (el.textContent || "").includes("Other wise"))).toBe(true);

    // Caret inside \delta (offset quoteStart - 12) places a blinking caret at the atomic leaf
    const secondDeltaIdx = raw.indexOf("\\delta[n]=0");
    highlightSelectionInMathContainer(container as any, secondDeltaIdx + 2, secondDeltaIdx + 2);
    const caretEls = container.querySelectorAll(".color-math-caret-before, .color-math-caret-after");
    expect(caretEls.length).toBe(1);
    expect(caretEls[0].textContent).toBe("𝛿");
  });
});
