// tests/compound_units_and_ellipsis.test.ts
//! Verification Suite for Compound Units, ASCII Ellipsis Fusing, Greek Plane-1, and Method 3 Slot Fencing.

import { describe, it, expect, beforeAll } from "vitest";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_OPTIONS } from "../src/config";
import { stampMathJaxDOM } from "../src/editor/dom_stamper";
import { getMathJaxElementRange } from "../src/editor/weakmap_index";
import { resolveOnDemandRange } from "../src/editor/lazy_navigation";
import { createFakeElement, FakeElement } from "./tri_engine_harness";
import { getElementText } from "../src/editor/quaternion_reconciler";
import { MathCSTParser } from "../src/parsers/cst/parser";
import { collectFractions } from "../src/editor/lazy_navigation";

const baseRequire = createRequire(path.resolve(__dirname, "../package.json"));

let mathjax: any;
let htmlDoc: any;
let adaptor: any;

beforeAll(async () => {
  const mj = baseRequire("@mathjax/src/cjs/mathjax.js");
  const { TeX } = baseRequire("@mathjax/src/cjs/input/tex.js");
  const { CHTML } = baseRequire("@mathjax/src/cjs/output/chtml.js");
  const { liteAdaptor } = baseRequire("@mathjax/src/cjs/adaptors/liteAdaptor.js");
  const { RegisterHTMLHandler } = baseRequire("@mathjax/src/cjs/handlers/html.js");
  baseRequire("@mathjax/src/cjs/input/tex/ams/AmsConfiguration.js");
  baseRequire("@mathjax/src/cjs/input/tex/color/ColorConfiguration.js");

  mathjax = mj.mathjax;
  mathjax.asyncLoad = (name: string) => import(pathToFileURL(baseRequire.resolve(name)).href);

  adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);

  const tex = new TeX({
    packages: ["base", "ams", "color"],
    inlineMath: [["$", "$"]],
    displayMath: [["$$", "$$"]],
  });
  const chtml = new CHTML({});
  htmlDoc = mathjax.document("", { InputJax: tex, OutputJax: chtml });
});

function liteToFakeDOM(liteNode: any): FakeElement | null {
  const kind = adaptor.kind(liteNode);
  if (kind === "#text") {
    return createFakeElement("text", [], adaptor.value(liteNode));
  }
  if (kind === "#comment") return null;

  const children: FakeElement[] = [];
  for (const c of adaptor.childNodes(liteNode)) {
    const childEl = liteToFakeDOM(c);
    if (childEl) children.push(childEl);
  }

  const el = createFakeElement(kind, children);
  const attrs = adaptor.allAttributes(liteNode);
  if (attrs) {
    for (const attr of attrs) {
      if (attr.name === "class") {
        el.className = attr.value;
      }
    }
  }

  for (const ch of el.children) {
    ch.parentElement = el;
  }
  return el;
}

async function compileAndStampRealMathJax(rawSnippet: string): Promise<FakeElement> {
  const mathNode = await mathjax.handleRetriesFor(() =>
    htmlDoc.convert(rawSnippet, { display: true })
  );
  const fakeDom = liteToFakeDOM(mathNode);
  if (!fakeDom) {
    throw new Error("Failed to construct DOM from MathJax output");
  }

  stampMathJaxDOM(fakeDom as unknown as Element, rawSnippet);
  return fakeDom;
}

describe("Remaining Error Clusters: Compound Units, Ellipsis, Greek, and Method 3 Slot Fencing", () => {
  it("stamps compound physical unit '\\mathrm{m/s^2}' with discrete sub-token ranges", async () => {
    const latex = "\\mathrm{m/s^2}";
    const root = await compileAndStampRealMathJax(latex);

    const leaves = root.querySelectorAll("mjx-mi, mjx-mn, mjx-mo, mjx-mtext");
    expect(leaves.length).toBeGreaterThanOrEqual(4);

    const mEl = leaves.find((l) => getElementText(l) === "m");
    const slashEl = leaves.find((l) => getElementText(l) === "/");
    const sEl = leaves.find((l) => getElementText(l) === "s");
    const twoEl = leaves.find((l) => getElementText(l) === "2");

    expect(mEl).toBeDefined();
    expect(slashEl).toBeDefined();
    expect(sEl).toBeDefined();
    expect(twoEl).toBeDefined();

    const rangeM = getMathJaxElementRange(mEl as unknown as Element);
    const rangeSlash = getMathJaxElementRange(slashEl as unknown as Element);
    const rangeS = getMathJaxElementRange(sEl as unknown as Element);
    const rangeTwo = getMathJaxElementRange(twoEl as unknown as Element);

    expect(rangeM).toBeDefined();
    expect(rangeSlash).toBeDefined();
    expect(rangeS).toBeDefined();
    expect(rangeTwo).toBeDefined();

    expect(latex.slice(rangeM!.start, rangeM!.end)).toBe("m");
    expect(latex.slice(rangeSlash!.start, rangeSlash!.end)).toBe("/");
    expect(latex.slice(rangeS!.start, rangeS!.end)).toBe("s");
    expect(latex.slice(rangeTwo!.start, rangeTwo!.end)).toBe("2");
  });

  it("fuses ASCII triple dot ellipsis '...' into single leaf matching '<mjx-mo>…</mjx-mo>'", async () => {
    // 1. When LaTeX has \dots, MathJax renders <mjx-mo>…</mjx-mo>
    const latexDots = "x_1 + x_2 + \\dots + x_n";
    const rootDots = await compileAndStampRealMathJax(latexDots);
    const moLeavesDots = rootDots.querySelectorAll("mjx-mo");
    const ellipsisElDots = moLeavesDots.find((l) => getElementText(l) === "…" || getElementText(l) === "⋯");
    expect(ellipsisElDots).toBeDefined();
    const rangeDots = getMathJaxElementRange(ellipsisElDots as unknown as Element);
    expect(rangeDots).toBeDefined();
    expect(latexDots.slice(rangeDots!.start, rangeDots!.end)).toBe("\\dots");

    // 2. When MathJax CHTML collapses ASCII '...' into a single <mjx-mo>…</mjx-mo> element
    const latexAscii = "x_1 + x_2 + ... + x_n";
    const syntheticRoot = createFakeElement("mjx-container", [
      createFakeElement("mjx-math", [
        createFakeElement("mjx-msub", [createFakeElement("mjx-mi", [], "x"), createFakeElement("mjx-script", [], "1")]),
        createFakeElement("mjx-mo", [], "+"),
        createFakeElement("mjx-msub", [createFakeElement("mjx-mi", [], "x"), createFakeElement("mjx-script", [], "2")]),
        createFakeElement("mjx-mo", [], "+"),
        createFakeElement("mjx-mo", [createFakeElement("mjx-c", [], "…")], "…"),
        createFakeElement("mjx-mo", [], "+"),
        createFakeElement("mjx-msub", [createFakeElement("mjx-mi", [], "x"), createFakeElement("mjx-script", [], "n")]),
      ])
    ]);
    const linkParents = (el: FakeElement) => {
      for (const ch of el.children) {
        ch.parentElement = el;
        linkParents(ch);
      }
    };
    linkParents(syntheticRoot);
    stampMathJaxDOM(syntheticRoot as unknown as Element, latexAscii);
    const moList = syntheticRoot.querySelectorAll("mjx-mo");
    const ellipsisEl = moList.find((l) => getElementText(l) === "..." || getElementText(l) === "…" || getElementText(l) === "⋯");
    expect(ellipsisEl).toBeDefined();
    const rangeEllipsis = getMathJaxElementRange(ellipsisEl as unknown as Element);
    expect(rangeEllipsis).toBeDefined();
    expect(latexAscii.slice(rangeEllipsis!.start, rangeEllipsis!.end)).toBe("...");

    const m3 = resolveOnDemandRange(ellipsisEl as unknown as Element, syntheticRoot as unknown as Element, latexAscii, { skipWeakMap: true });
    expect(m3).toBeDefined();
    expect(latexAscii.slice(m3!.start, m3!.end)).toBe("...");
  });

  it("stamps mathematical italic Greek '\\phi' to '𝜙' / 'ϕ'", async () => {
    const latex = "\\phi = 2";
    const root = await compileAndStampRealMathJax(latex);

    const miLeaves = root.querySelectorAll("mjx-mi");
    expect(miLeaves.length).toBeGreaterThanOrEqual(1);

    const phiEl = miLeaves[0];
    const rangePhi = getMathJaxElementRange(phiEl as unknown as Element);
    expect(rangePhi).toBeDefined();
    expect(latex.slice(rangePhi!.start, rangePhi!.end)).toBe("\\phi");

    const m3 = resolveOnDemandRange(phiEl as unknown as Element, root as unknown as Element, latex, { skipWeakMap: true });
    expect(m3).toBeDefined();
    expect(latex.slice(m3!.start, m3!.end)).toBe("\\phi");
  });

  it("maintains 100% Tri-Engine parity on identical tokens across slot boundaries: C(n, k) = \\binom{n}{k} = \\frac{n!}{k!(n-k)!}", async () => {
    const latex = "C(n, k) = \\binom{n}{k} = \\frac{n!}{k!(n-k)!}";
    const root = await compileAndStampRealMathJax(latex);

    const nLeaves = root.querySelectorAll("mjx-mi").filter((l) => getElementText(l) === "n");
    // There are 4 distinct 'n' tokens in this formula:
    // 1. in C(n, k)
    // 2. in \binom{n}{k}
    // 3. in numerator n!
    // 4. in denominator (n-k)!
    expect(nLeaves.length).toBe(4);

    for (let i = 0; i < nLeaves.length; i++) {
      const el = nLeaves[i];
      const m1 = el.className.match(/cm-src-(\d+)-(\d+)/);
      const m2 = getMathJaxElementRange(el as unknown as Element);
      const m3 = resolveOnDemandRange(el as unknown as Element, root as unknown as Element, latex, { skipWeakMap: true });

      expect(m1).toBeDefined();
      expect(m2).toBeDefined();
      expect(m3).toBeDefined();

      const m1Range = { start: parseInt(m1![1], 10), end: parseInt(m1![2], 10) };
      expect(m2!.start).toBe(m1Range.start);
      expect(m2!.end).toBe(m1Range.end);
      expect(m3!.start).toBe(m1Range.start);
      expect(m3!.end).toBe(m1Range.end);

      expect(latex.slice(m3!.start, m3!.end)).toBe("n");
    }
  });
});
