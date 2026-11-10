// tests/mathjax_node_adapter.ts
//! Reusable Node.js MathJax CHTML Adapter and DOM construction harness.
//! Provides headless MathJax compilation, liteAdaptor conversion to FakeElement DOM,
//! and provenance stamping for decoupled tests and CLI visualization tools.

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_OPTIONS } from "../src/config";
import { stampMathJaxDOM } from "../src/editor/dom_stamper";
import { createFakeElement, FakeElement } from "./tri_engine_harness";

const baseRequire = createRequire(path.resolve(__dirname, "../package.json"));

let mathjaxInstance: any = null;
let htmlDocInstance: any = null;
let adaptorInstance: any = null;

/**
 * Initializes headless MathJax engine with AMS and Color packages.
 * Safe to call multiple times (cached singleton).
 */
export function getHeadlessMathJax(): { mathjax: any; htmlDoc: any; adaptor: any } {
  if (mathjaxInstance && htmlDocInstance && adaptorInstance) {
    return { mathjax: mathjaxInstance, htmlDoc: htmlDocInstance, adaptor: adaptorInstance };
  }

  const mj = baseRequire("@mathjax/src/cjs/mathjax.js");
  const { TeX } = baseRequire("@mathjax/src/cjs/input/tex.js");
  const { CHTML } = baseRequire("@mathjax/src/cjs/output/chtml.js");
  const { liteAdaptor } = baseRequire("@mathjax/src/cjs/adaptors/liteAdaptor.js");
  const { RegisterHTMLHandler } = baseRequire("@mathjax/src/cjs/handlers/html.js");
  baseRequire("@mathjax/src/cjs/input/tex/ams/AmsConfiguration.js");
  baseRequire("@mathjax/src/cjs/input/tex/color/ColorConfiguration.js");

  mathjaxInstance = mj.mathjax;
  mathjaxInstance.asyncLoad = (name: string) => import(pathToFileURL(baseRequire.resolve(name)).href);

  adaptorInstance = liteAdaptor();
  RegisterHTMLHandler(adaptorInstance);

  const tex = new TeX({
    packages: ["base", "ams", "color"],
    inlineMath: [["$", "$"]],
    displayMath: [["$$", "$$"]],
  });
  const chtml = new CHTML({});
  htmlDocInstance = mathjaxInstance.document("", { InputJax: tex, OutputJax: chtml });

  return { mathjax: mathjaxInstance, htmlDoc: htmlDocInstance, adaptor: adaptorInstance };
}

/**
 * Converts a MathJax liteAdaptor node tree into our rich FakeElement DOM structure,
 * fully preserving attributes, class names, and parent-child navigation.
 */
export function liteToFakeDOM(liteNode: any, adaptor = adaptorInstance): FakeElement | null {
  if (!adaptor) {
    getHeadlessMathJax();
    adaptor = adaptorInstance;
  }
  const kind = adaptor.kind(liteNode);
  if (kind === "#text") {
    return createFakeElement("text", [], adaptor.value(liteNode));
  }
  if (kind === "#comment") return null;

  const children: FakeElement[] = [];
  for (const c of adaptor.childNodes(liteNode)) {
    const childEl = liteToFakeDOM(c, adaptor);
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

/**
 * End-to-end headless compilation and stamping pipeline:
 * 1. Desugars and colorizes raw math input via colorLatexBody
 * 2. Compiles via real MathJax CHTML engine
 * 3. Builds DOM element tree
 * 4. Stamped by stampMathJaxDOM(root, rawSnippet)
 */
export async function compileAndStampRealMathJax(rawSnippet: string, verbose = false): Promise<FakeElement> {
  const { mathjax, htmlDoc, adaptor } = getHeadlessMathJax();
  const colored = colorLatexBody(rawSnippet, undefined, DEFAULT_OPTIONS);
  if (verbose) {
    console.log("\n[MathJax Transformed Input]:\n", colored);
  }
  const mathNode = await mathjax.handleRetriesFor(() =>
    htmlDoc.convert(colored, { display: true })
  );
  const fakeDom = liteToFakeDOM(mathNode, adaptor);
  if (!fakeDom) {
    throw new Error("Failed to construct DOM from MathJax output");
  }

  // Stamp using current reconciliation engine
  stampMathJaxDOM(fakeDom as unknown as Element, rawSnippet);
  return fakeDom;
}

/**
 * Pure MathJax compilation without color-math stamping.
 * Used for Tier 2 Oracle verification.
 */
export async function compilePureMathJax(rawSnippet: string): Promise<FakeElement> {
  const { mathjax, htmlDoc, adaptor } = getHeadlessMathJax();
  const mathNode = await mathjax.handleRetriesFor(() =>
    htmlDoc.convert(rawSnippet, { display: true })
  );
  const fakeDom = liteToFakeDOM(mathNode, adaptor);
  if (!fakeDom) {
    throw new Error("Failed to construct DOM from MathJax output");
  }
  return fakeDom;
}
