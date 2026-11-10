import { describe, it, expect } from "vitest";
import { convertMathBlock } from "../src/converters/block";
import { colorLatexBody, computeSemanticMathSpans } from "../src/converters/generic";
import { COLORS, DEFAULT_OPTIONS } from "../src/config";
import { renderRealMathJaxDOM } from "./spatial_tensor_bijective.test";
import { stampMathJaxDOM } from "../src/editor/dom_stamper";
import { getMathJaxElementRange, getDirectMathJaxElementRange } from "../src/editor/weakmap_index";
import { MathCSTParser } from "../src/parsers/cst/parser";
import { selectColorSpans, flattenColorSpans } from "../src/utils/spans";
import { DesugarSourceMap } from "../src/parsers/sugar/source_map";
import { desugarMathForStamping } from "../src/utils/latex_helpers";

describe("Real-World Vault Acceptance Tests", () => {
  it("Fourier.md: converts informal lecture math without breaking or blob-coloring", () => {
    const raw = `$$
b_n =  {2}/{pi}\\int_{0}^{pi}e^{ax}{sin({n pi x}/{pi})}dx \\\\ 
b_n = {2}/{pi}\\int_{0}^{pi}\\cfrac{e^{ax+inx}-e^{ax-inx}}{2i} dx \\\\
b_n = {1}/{i pi}[\\cfrac{e^{ax+inx}}{a+i n}-\\cfrac{e^{ax-inx}}{a-i n}] \\\\
b_n = {1}/{i pi}[ \\cfrac{(a-i n)e^{ax+inx}-(a+i n)e^{ax-inx}}{a^2+n^2} ] \\\\ 
b_n = {e^{ax}}/{pi(a^2+n^2)}[ a\\cfrac{(e^{+inx}-e^{-inx})}{i} -n\\cfrac{e^{+inx}+e^{-inx}}{1} ] \\\\
b_n = [e^{ax}\\cfrac{a sin(nx)-n cos(nx)}{pi(a^2+n^2)}]_{0}^\\pi \\\\
b_n = \\cfrac{n(1-e^{a pi +i n pi})}{pi(a^2+n^2)} \\\\ "or" \\\\
b_n = \\cfrac{n(1-(-1)^{n}e^{a pi})}{pi(a^2+n^2)}
$$`;

    const converted = convertMathBlock(raw, COLORS, {
      speedSyntacticSugar: true,
      sugarAsciiOperators: true,
      previewLatexNormalization: true,
      enableTaxonomy: true,
      taxonomyFunctions: true,
      taxonomyConstants: true,
    });

    console.log("CONVERTED FOURIER:\n", converted);
    expect(converted).toBeDefined();
  });

  it("Fourier.md: aligned environment with fractions and differentials", () => {
    const raw = `$$\\begin{aligned} a_0 &= {2}/{2l}\\int_{C}^{C+2l}f(x)dx \\\\  \\\\      a_n &=  {2}/{2l}\\int_{C}^{C+2l}f(x){cos({n pi x}/{l})}dx \\\\ \\\\ b_n &=  {2}/{2l}\\int_{C}^{C+2l}f(x){sin({n pi x}/{l})}dx\\end{aligned}$$`;

    const converted = convertMathBlock(raw, COLORS, {
      speedSyntacticSugar: true,
      previewLatexNormalization: true,
      enableTaxonomy: true,
      taxonomyFunctions: true,
      taxonomyConstants: true,
    });

    console.log("CONVERTED ALIGNED:\n", converted);
    expect(converted).toBeDefined();
  });

  it("Fourier.md: DOM Stamping test on aligned environment with fractions and differentials", () => {
    const raw = `$$\\begin{aligned} a_0 &= {2}/{2l}\\int_{C}^{C+2l}f(x)dx \\\\  \\\\      a_n &=  {2}/{2l}\\int_{C}^{C+2l}f(x){cos({n pi x}/{l})}dx \\\\ \\\\ b_n &=  {2}/{2l}\\int_{C}^{C+2l}f(x){sin({n pi x}/{l})}dx\\end{aligned}$$`;
    const body = raw.replace(/^\$\$/s, "").replace(/\$\$$/s, "");
    const rendered = colorLatexBody(body, COLORS, DEFAULT_OPTIONS);
    const dom = renderRealMathJaxDOM(rendered);
    stampMathJaxDOM(dom as any, body);

    const leafEls = dom.querySelectorAll("mjx-mi, mjx-mo, mjx-mn");
    console.log("ALIGNED LEAF COUNT:", leafEls.length);
    const leafResults = leafEls.map(el => {
      const range = getMathJaxElementRange(el as any);
      return {
        tag: el.tagName,
        text: el.textContent,
        range: range ? `[${range.start}, ${range.end}] -> "${body.slice(range.start, range.end)}"` : "UNSTAMPED"
      };
    });
    const unstamped = leafEls.filter(el => !getMathJaxElementRange(el as any));
    console.log("ALIGNED UNSTAMPED LEAVES COUNT:", unstamped.length);
    if (unstamped.length > 0) {
      console.log("ALIGNED UNSTAMPED DETAILS:", unstamped.map(el => ({
        tag: el.tagName,
        text: el.textContent,
        classes: el.className,
        parent: el.parentElement ? `${el.parentElement.tagName} .${el.parentElement.className}` : null,
        children: el.children.map(c => `${c.tagName} "${c.textContent}"`)
      })));
    }
    // Filter out invisible MathJax spacer/placeholder leaves with empty text
    const visualUnstamped = unstamped.filter(el => (el.textContent || "").trim().length > 0);
    expect(visualUnstamped.length).toBe(0);
  });

  it("Dirac delta δ(t).md: Unicode delta, limits, and quoted strings", () => {
    const raw = `$$δ(t)=\\lim_{a→0} y(t)=\\lim_{a→0} \\begin{cases}\\cfrac{1}{2a}  & -a<t<a  \\\\ \\\\\\ \\ 0  & "Other wise"\\end{cases}\\\\ \\\\δ(t)=\\begin{cases}\\ \\ oo  & t=0  \\\\ \\\\\\ \\ 0  & "Other wise"\\end{cases}$$`;

    const converted = convertMathBlock(raw, COLORS, {
      speedSyntacticSugar: true,
      previewLatexNormalization: true,
      enableTaxonomy: true,
    });

    console.log("CONVERTED DIRAC:\n", converted);
    expect(converted).toBeDefined();
  });

  it("IDE Styler vs Renderer Parity on Fourier raw line 1", () => {
    const rawLine = `{2}/{pi}\\int_{0}^{pi}e^{ax}{sin({n pi x}/{pi})}dx`;
    const ideSpans = computeSemanticMathSpans(rawLine, COLORS, DEFAULT_OPTIONS, false);

    console.log("RAW LINE:", rawLine);
    console.log("IDE SPANS (DEFAULT_OPTIONS):", ideSpans.map(s => ({
      text: rawLine.slice(s.start, s.end),
      color: s.color,
      priority: s.priority
    })));

    const rendered = colorLatexBody(rawLine, COLORS, DEFAULT_OPTIONS);
    console.log("RENDERED (DEFAULT_OPTIONS):", rendered);
  });

  it("Full Fourier block IDE spans vs Renderer", () => {
    const rawBlock = `b_n =  {2}/{pi}\\int_{0}^{pi}e^{ax}{sin({n pi x}/{pi})}dx \\\\ 
b_n = {2}/{pi}\\int_{0}^{pi}\\cfrac{e^{ax+inx}-e^{ax-inx}}{2i} dx \\\\
b_n = {1}/{i pi}[\\cfrac{e^{ax+inx}}{a+i n}-\\cfrac{e^{ax-inx}}{a-i n}] \\\\
b_n = {1}/{i pi}[ \\cfrac{(a-i n)e^{ax+inx}-(a+i n)e^{ax-inx}}{a^2+n^2} ] \\\\ 
b_n = {e^{ax}}/{pi(a^2+n^2)}[ a\\cfrac{(e^{+inx}-e^{-inx})}{i} -n\\cfrac{e^{+inx}+e^{-inx}}{1} ] \\\\
b_n = [e^{ax}\\cfrac{a sin(nx)-n cos(nx)}{pi(a^2+n^2)}]_{0}^\\pi \\\\
b_n = \\cfrac{n(1-e^{a pi +i n pi})}{pi(a^2+n^2)} \\\\ "or" \\\\
b_n = \\cfrac{n(1-(-1)^{n}e^{a pi})}{pi(a^2+n^2)}`;

    const rawSpans = computeSemanticMathSpans(rawBlock, COLORS, DEFAULT_OPTIONS, false);
    const selected = selectColorSpans(rawBlock, rawSpans);
    const flattened = flattenColorSpans(selected);
    console.log("FULL FOURIER RAW SPANS COUNT:", rawSpans.length);
    console.log("FULL FOURIER FLATTENED SPANS COUNT:", flattened.length);
    const bigSpans = flattened.filter(s => (s.end - s.start) > 10);
    console.log("FLATTENED BIG SPANS (>10 chars):", bigSpans.map(s => ({
      text: rawBlock.slice(s.start, s.end),
      color: s.color,
      priority: s.priority
    })));
    expect(bigSpans.length).toBe(0);
  });

  it("DOM Stamping test on Fourier equation 1", () => {
    const rawLine = `{2}/{pi}\\int_{0}^{pi}e^{ax}{sin({n pi x}/{pi})}dx`;
    const rendered = colorLatexBody(rawLine, COLORS, DEFAULT_OPTIONS);
    console.log("RAW LINE:", rawLine);
    console.log("RENDERED LATEX:", rendered);

    const parser = new MathCSTParser(rawLine);
    const ast = parser.parse();

    const dom = renderRealMathJaxDOM(rendered);
    console.log("DOM ROOT TAG:", dom.tagName, "CHILDREN COUNT:", dom.children.length);
    if (dom.children.length > 0) {
      console.log("ROOT FIRST CHILD:", dom.children[0].tagName, "CHILDREN:", dom.children[0].children.map(c => c.tagName));
      const merror = dom.querySelector("mjx-merror");
      if (merror) {
        console.log("MATHJAX ERROR TEXT:", merror.textContent);
      }
    }
    stampMathJaxDOM(dom as any, rawLine);

    // Let's inspect the stamped elements
    const leafEls = dom.querySelectorAll("mjx-mi, mjx-mo, mjx-mn");
    console.log("STAMPED LEAVES COUNT:", leafEls.length);
    const leafResults = leafEls.map(el => {
      const range = getMathJaxElementRange(el as any);
      return {
        tag: el.tagName,
        text: el.textContent,
        range: range ? `[${range.start}, ${range.end}] -> "${rawLine.slice(range.start, range.end)}"` : "UNSTAMPED"
      };
    });
    console.log("LEAF RESULTS:\n", JSON.stringify(leafResults, null, 2));

    // Assert that unstamped count is 0
    const unstamped = leafResults.filter(r => r.range === "UNSTAMPED");
    expect(unstamped.length).toBe(0);
  });

  it("DOM Stamping test on full 8-line b_n Fourier derivation", () => {
    const rawBlock = `\nb_n =  {2}/{pi}\\int_{0}^{pi}e^{ax}{sin({n pi x}/{pi})}dx \\\\ \nb_n = {2}/{pi}\\int_{0}^{pi}\\cfrac{e^{ax+inx}-e^{ax-inx}}{2i} dx \\\\\nb_n = {1}/{i pi}[\\cfrac{e^{ax+inx}}{a+i n}-\\cfrac{e^{ax-inx}}{a-i n}] \\\\\nb_n = {1}/{i pi}[ \\cfrac{(a-i n)e^{ax+inx}-(a+i n)e^{ax-inx}}{a^2+n^2} ] \\\\ \nb_n = {e^{ax}}/{pi(a^2+n^2)}[ a\\cfrac{(e^{+inx}-e^{-inx})}{i} -n\\cfrac{e^{+inx}+e^{-inx}}{1} ] \\\\\nb_n = [e^{ax}\\cfrac{a sin(nx)-n cos(nx)}{pi(a^2+n^2)}]_{0}^\\pi \\\\\nb_n = \\cfrac{n(1-e^{a pi +i n pi})}{pi(a^2+n^2)} \\\\ "or" \\\\\nb_n = \\cfrac{n(1-(-1)^{n}e^{a pi})}{pi(a^2+n^2)}\n`;
    const rendered = colorLatexBody(rawBlock, COLORS, DEFAULT_OPTIONS);
    const dom = renderRealMathJaxDOM(rendered);
    stampMathJaxDOM(dom as any, rawBlock);
    const leaves = dom.querySelectorAll("mjx-mi, mjx-mo, mjx-mn, mjx-mtext");
    expect(leaves.length).toBeGreaterThanOrEqual(240);
    for (let idx = 0; idx < leaves.length; idx++) {
      const el = leaves[idx];
      const text = (el.textContent || "").trim();
      if (!text) continue;
      const r = getMathJaxElementRange(el as any);
      expect(r).toBeDefined();
      const slice = rawBlock.slice(r!.start, r!.end);
      if (slice.length > 4) {
        console.log(`[FAULTY LEAF] text="${text}" slice="${slice}" tag=<${el.tagName}> range=[${r!.start}, ${r!.end}]`);
        let p = el.parentElement;
        while (p) {
          console.log(`  parent: <${p.tagName}> class="${p.className}" range=`, getDirectMathJaxElementRange(p as any));
          p = p.parentElement;
        }
      }
      expect(slice.length).toBeLessThanOrEqual(4);
    }
  });

  it("Fractions with variables like {2}/{2l}", () => {
    const raw = `{2}/{2l}`;
    const spans = computeSemanticMathSpans(raw, COLORS, DEFAULT_OPTIONS, false);
    console.log("SPANS FOR {2}/{2l}:", spans.map(s => ({
      text: raw.slice(s.start, s.end),
      color: s.color,
      priority: s.priority
    })));
    const rendered = colorLatexBody(raw, COLORS, DEFAULT_OPTIONS);
    console.log("RENDERED {2}/{2l}:", rendered);
  });

  it("Unicode Mathematical Sans-Serif Bold Psi and LaTeX psi mapping", () => {
    const raw = `𝝍  \\psi`;
    const rendered = colorLatexBody(raw, COLORS, DEFAULT_OPTIONS);
    console.log("RAW:", raw);
    console.log("RENDERED:", rendered);

    const parser = new MathCSTParser(raw);
    const ast = parser.parse();
    console.log("AST:", ast.map(n => ({ kind: n.kind, start: n.start, end: n.end, text: (n as any).text, name: (n as any).name })));

    const dom = renderRealMathJaxDOM(rendered);
    console.log("DOM INNERHTML:", dom.innerHTML);

    stampMathJaxDOM(dom as any, raw);

    const leaves = dom.querySelectorAll("mjx-mi, mjx-mo, mjx-mn");
    console.log("LEAVES COUNT:", leaves.length);
    for (let i = 0; i < leaves.length; i++) {
      const leaf = leaves[i];
      const range = getMathJaxElementRange(leaf as any);
      console.log(`Leaf ${i} <${leaf.tagName}> text=${JSON.stringify(leaf.textContent)} range=`, range ? `[${range.start}, ${range.end}] -> "${raw.slice(range.start, range.end)}"` : "UNSTAMPED");
    }
  });
});
