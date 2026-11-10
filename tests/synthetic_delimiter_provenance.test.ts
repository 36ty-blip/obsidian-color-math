import { describe, it, expect } from "vitest";
import { stampMathJaxDOM } from "../src/editor/dom_stamper";
import { getMathJaxElementRange } from "../src/editor/weakmap_index";
import { resolveOnDemandRange } from "../src/editor/lazy_navigation";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_OPTIONS } from "../src/config";
import { createFakeElement, FakeElement } from "./tri_engine_harness";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

describe("Synthetic Delimiter & Macro Provenance Invariant Suite", () => {
  const baseRequire = createRequire(path.resolve(__dirname, "../package.json"));
  const mj = baseRequire("@mathjax/src/cjs/mathjax.js");
  const { TeX } = baseRequire("@mathjax/src/cjs/input/tex.js");
  const { CHTML } = baseRequire("@mathjax/src/cjs/output/chtml.js");
  const { liteAdaptor } = baseRequire("@mathjax/src/cjs/adaptors/liteAdaptor.js");
  const { RegisterHTMLHandler } = baseRequire("@mathjax/src/cjs/handlers/html.js");
  baseRequire("@mathjax/src/cjs/input/tex/ams/AmsConfiguration.js");

  const mathjax = mj.mathjax;
  mathjax.asyncLoad = (name: string) => import(pathToFileURL(baseRequire.resolve(name)).href);

  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const tex = new TeX({ packages: ["base", "ams"] });
  const chtml = new CHTML({});
  const htmlDoc = mathjax.document("", { InputJax: tex, OutputJax: chtml });

  function liteToFakeDOM(liteNode: any): FakeElement | null {
    const kind = adaptor.kind(liteNode);
    if (kind === "#text") return createFakeElement("text", [], adaptor.value(liteNode));
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
        if (attr.name === "class") el.className = attr.value;
      }
    }
    for (const ch of el.children) {
      ch.parentElement = el;
    }
    return el;
  }

  it("1. Binomial Delimiters: \\binom{n}{k} maps synthetic ( and ) to \\binom", async () => {
    const latex = "\\binom{n}{k}";
    const mathNode = await mathjax.handleRetriesFor(() => htmlDoc.convert(latex, { display: true }));
    const fakeDom = liteToFakeDOM(mathNode)!;

    stampMathJaxDOM(fakeDom as unknown as Element, latex);

    const leaves = fakeDom.querySelectorAll("mjx-mi, mjx-mo");
    const openParen = leaves.find((l) => (l.textContent || "").trim() === "(")!;
    const closeParen = leaves.find((l) => (l.textContent || "").trim() === ")")!;

    expect(openParen).toBeDefined();
    expect(closeParen).toBeDefined();

    // Method 1: DOM Class
    const m1Open = openParen.closest('[class*="cm-src-"]');
    expect(m1Open).toBeDefined();
    expect(m1Open?.className).toContain("cm-src-0-6"); // \binom is 0..6

    // Method 2: WeakMap
    const m2Open = getMathJaxElementRange(openParen as unknown as Element);
    expect(m2Open).toBeDefined();
    expect(m2Open?.start).toBe(0);
    expect(m2Open?.end).toBe(6);

    // Method 3: On-Demand CST Resolver
    const m3Open = resolveOnDemandRange(openParen as unknown as Element, fakeDom as unknown as Element, latex, true);
    expect(m3Open).toBeDefined();
    expect(m3Open?.start).toBe(0);
    expect(m3Open?.end).toBe(6);
  });

  it("2. Combinatorics Chain: C(n, k) = \\binom{n}{k} does NOT skip into denominator", async () => {
    const latex = "C(n, k) = \\binom{n}{k} = \\frac{n!}{k!(n - k)!}";
    const mathNode = await mathjax.handleRetriesFor(() => htmlDoc.convert(latex, { display: true }));
    const fakeDom = liteToFakeDOM(mathNode)!;

    stampMathJaxDOM(fakeDom as unknown as Element, latex);

    // Locate the binomial left parenthesis
    const allParens = fakeDom.querySelectorAll("mjx-mo").filter((l) => (l.textContent || "").trim() === "(");
    expect(allParens.length).toBeGreaterThanOrEqual(2);

    const binomParen = allParens[1]; // Second '(' is from \binom{n}{k}
    const binomIdx = latex.indexOf("\\binom");

    const m1 = binomParen.closest('[class*="cm-src-"]');
    const m2 = getMathJaxElementRange(binomParen as unknown as Element);
    const m3 = resolveOnDemandRange(binomParen as unknown as Element, fakeDom as unknown as Element, latex, true);

    expect(m2).toBeDefined();
    expect(m2?.start).toBe(binomIdx);
    expect(m2?.end).toBe(binomIdx + 6);

    expect(m3).toBeDefined();
    expect(m3?.start).toBe(binomIdx);
    expect(m3?.end).toBe(binomIdx + 6);
  });

  it("3. Radical Sub-Leaf Traversal: \\sqrt[m \\cdot n]{a} resolves \\cdot to exact operator", async () => {
    const latex = "\\sqrt[m \\cdot n]{a}";
    const mathNode = await mathjax.handleRetriesFor(() => htmlDoc.convert(latex, { display: true }));
    const fakeDom = liteToFakeDOM(mathNode)!;

    stampMathJaxDOM(fakeDom as unknown as Element, latex);

    const dotEl = fakeDom.querySelectorAll("mjx-mo").find((l) => (l.textContent || "").trim() === "⋅")!;
    expect(dotEl).toBeDefined();

    const dotIdx = latex.indexOf("\\cdot");
    const m3 = resolveOnDemandRange(dotEl as unknown as Element, fakeDom as unknown as Element, latex, true);

    expect(m3).toBeDefined();
    expect(m3?.start).toBe(dotIdx);
    expect(m3?.end).toBe(dotIdx + 5);
  });

  it("4. Accent Provenance: \\vec{F} separates accent arrow from base variable", async () => {
    const latex = "\\vec{F}";
    const mathNode = await mathjax.handleRetriesFor(() => htmlDoc.convert(latex, { display: true }));
    const fakeDom = liteToFakeDOM(mathNode)!;

    stampMathJaxDOM(fakeDom as unknown as Element, latex);

    const arrowEl = fakeDom.querySelectorAll("mjx-mo").find((l) => {
      const t = (l.textContent || "").trim();
      return t === "⃗" || t === "→" || t === "\u20D7";
    })!;
    const fEl = fakeDom.querySelectorAll("mjx-mi").find((l) => (l.textContent || "").normalize("NFKD").trim() === "F")!;

    expect(arrowEl).toBeDefined();
    expect(fEl).toBeDefined();

    const m2Arrow = getMathJaxElementRange(arrowEl as unknown as Element);
    const m2F = getMathJaxElementRange(fEl as unknown as Element);

    expect(m2Arrow).toBeDefined();
    expect(m2Arrow?.start).toBe(0);
    expect(m2Arrow?.end).toBe(4); // \vec

    expect(m2F).toBeDefined();
    expect(m2F?.start).toBe(5);
    expect(m2F?.end).toBe(6); // F
  });
});
