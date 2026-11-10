// tests/real_mathjax_navigation.test.ts
//! Ground-Truth Live Navigation Verification Suite powered by Real MathJax CHTML.
//! Replaces tautological synthetic DOM mocks with authentic MathJax CHTML compiler output.
//! Directly asserts click hit-testing, source-to-DOM provenance, and multi-scale resolution
//! on live note snippets from Fourier.md and Dirac delta δ(t).md.

import { describe, it, expect } from "vitest";

import { colorLatexBody } from "../src/converters/generic";
import { normalizeMathSyntax, desugarMathForStamping } from "../src/utils/latex_helpers";
import { DesugarSourceMap } from "../src/parsers/sugar/source_map";
import { DEFAULT_OPTIONS } from "../src/config";
import { stampMathJaxDOM } from "../src/editor/dom_stamper";
import { getMathJaxElementRange } from "../src/editor/weakmap_index";
import { resolveOnDemandRange } from "../src/editor/lazy_navigation";
import { MathCSTParser } from "../src/parsers/cst/parser";
import { createFakeElement, FakeElement } from "./tri_engine_harness";
import { compileAndStampRealMathJax, getHeadlessMathJax } from "./mathjax_node_adapter";

/**
 * Simulates real Obsidian Live Preview mouse hit-testing (live_preview.ts onMouseDown):
 * Starts at the clicked DOM element, checks Method 2 (WeakMap), bubbles via Method 1 (closest cm-src),
 * and falls back to Method 3 (On-Demand CST).
 */
function simulateLivePreviewClick(
  target: FakeElement,
  root: FakeElement,
  rawSnippet: string
): { start: number; end: number; resolvedSlice: string; method: "M2" | "M1" | "M3" | "NONE" } {
  // In real browser hit-testing, clicking on an element (like a table cell)
  // resolves to the deepest targeted leaf glyph.
  const deepestLeaf = target.tagName === "MJX-MTD"
    ? ((target.querySelector("mjx-c, mjx-mi, mjx-mn, mjx-mo, mjx-mtext") || target) as FakeElement)
    : target;
  const targetEl = deepestLeaf as unknown as Element;
  const rootEl = root as unknown as Element;

  let cellConstraint: { start: number; end: number } | undefined;

  // 1. Method 2: In-Memory WeakMap (~20 ns)
  const m2 = getMathJaxElementRange(targetEl);
  if (m2 && m2.end >= m2.start) {
    const slice = rawSnippet.slice(m2.start, m2.end);
    // Anti-pollution check: if span spans linebreaks or is marked as a line container, quarantine as constraint
    if (m2.kind === "line" || slice.includes("\\\\") || slice.includes("\n")) {
      cellConstraint = { start: m2.start, end: m2.end };
    } else {
      return {
        start: m2.start,
        end: m2.end,
        resolvedSlice: slice,
        method: "M2",
      };
    }
  }

  // 2. Method 1: DOM Class Provenance closest() (~1.5 µs)
  const sourceEl = deepestLeaf.closest('[class*="cm-src-"]');
  const match = sourceEl?.className.match(/cm-src-(\d+)-(\d+)/);
  if (match) {
    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);
    const slice = rawSnippet.slice(start, end);
    const isContainer = sourceEl && typeof (sourceEl as any).matches === "function" &&
      (sourceEl as any).matches("mjx-linebox, mjx-linestack, mjx-mtable, mjx-table");
    if (end > start && (isContainer || slice.includes("\\\\") || slice.includes("\n"))) {
      if (!cellConstraint) cellConstraint = { start, end };
    } else if (end >= start) {
      return {
        start,
        end,
        resolvedSlice: slice,
        method: "M1",
      };
    }
  }

  // Check cm-cell- bounds from linebox/cell containers
  if (!cellConstraint) {
    const cellEl = deepestLeaf.closest('[class*="cm-cell-"]');
    const cellMatch = cellEl?.className.match(/cm-cell-(\d+)-(\d+)/);
    if (cellMatch) {
      const cStart = parseInt(cellMatch[1], 10);
      const cEnd = parseInt(cellMatch[2], 10);
      if (cEnd > cStart) cellConstraint = { start: cStart, end: cEnd };
    }
  }

  // 3. Method 3: Pure CST Resolution (~35 µs) with cooperative cell bounding
  const m3 = resolveOnDemandRange(targetEl, rootEl, rawSnippet, true, cellConstraint);
  if (m3 && m3.end > m3.start) {
    return {
      start: m3.start,
      end: m3.end,
      resolvedSlice: rawSnippet.slice(m3.start, m3.end),
      method: "M3",
    };
  }

  return { start: -1, end: -1, resolvedSlice: "", method: "NONE" };
}

describe("Real MathJax Live Navigation Ground-Truth Suite", () => {
  it("Bug Case 1: Clicking rendered bold(bold) in multi-line Typst sugar must resolve strictly to bold(bold)", async () => {
    const rawSnippet =
      "\\mathbb{bb} , \\mathbf{bold} , \\mathfrak{frak} , \\mathscr{F} , \\mathbf{\\mathcal{F}} \\\\\n" +
      "   bb(bb) , bold(bold) , frak(frak) , scr(F) ,";

    const root = await compileAndStampRealMathJax(rawSnippet);

    // In the real MathJax DOM, line 2 has an mjx-linebox containing the second line's elements
    console.log("\n[Snippet 1 Rendered DOM Dump]");
    console.log("Root tag:", root.tagName, "Classes:", root.className);
    console.log("All tags in root:", root.querySelectorAll("*").map(el => `<${el.tagName} class="${el.className}">${el.textContent.slice(0, 15)}</${el.tagName}>`).slice(0, 30));

    const sm = new DesugarSourceMap();
    const desugared = normalizeMathSyntax(rawSnippet, undefined, sm);
    sm.finalize();
    console.log("[Desugared Text]:\n", desugared);
    console.log("[Source Mappings]:\n", JSON.stringify(sm.getMappings(), null, 2));

    const lineboxes = root.querySelectorAll("mjx-linebox");
    console.log("Total lineboxes found:", lineboxes.length);
    expect(lineboxes.length, "MathJax should produce 2 lineboxes for \\\\").toBeGreaterThanOrEqual(2);

    const line2 = lineboxes[1];
    console.log("Line 2 textContent:", JSON.stringify(line2.textContent));
    console.log("Line 2 child tags:", line2.children.map(c => `<${c.tagName} class="${c.className}">${c.textContent}</${c.tagName}>`));
    // In line 2: bb, bold, frak, F
    const line2Mis = line2.querySelectorAll("mjx-mi");
    console.log("Line 2 mjx-mi tags:", line2Mis.map(m => m.textContent));
    const boldMi = line2Mis.find((el) => el.textContent.includes("bold") || el.textContent.includes("𝐛𝐨𝐥𝐝"));
    expect(boldMi, "Rendered line 2 must contain an mjx-mi with text 'bold'").toBeDefined();

    // Simulate clicking on the character inside bold(bold)
    const clickedChar = boldMi!.querySelector("mjx-c") || boldMi!;
    const clickResult = simulateLivePreviewClick(clickedChar, root, rawSnippet);

    console.log("\n[Bug Case 1 Real MathJax Click Telemetry]");
    console.log(`Method used    : ${clickResult.method}`);
    console.log(`Resolved range : [${clickResult.start}, ${clickResult.end}]`);
    console.log(`Resolved slice : "${clickResult.resolvedSlice}"`);

    // GROUND TRUTH ASSERTIONS:
    // 1. Must NOT resolve to the entire line
    const entireLine2 = "   bb(bb) , bold(bold) , frak(frak) , scr(F) ,";
    expect(clickResult.resolvedSlice.trim(), "Clicking bold(bold) must NOT select the entire line!").not.toBe(entireLine2.trim());

    // 2. Must strictly resolve to bold(bold) or its inner token 'bold'
    const isExactToken =
      clickResult.resolvedSlice.trim() === "bold(bold)" ||
      clickResult.resolvedSlice.trim() === "bold";
    expect(
      isExactToken,
      `Expected click to resolve to "bold(bold)" or "bold", but got "${clickResult.resolvedSlice}"`
    ).toBe(true);
  });

  it("Bug Case 2A: Clicking \\vec{b} in multi-line vector equation must not select the whole equation", async () => {
    const rawSnippet =
      "\\vec{a} \\vec{b}\n" +
      "=\\|\\vec{a}\\|\\,\\|\\vec{b}\\|\\cos\\theta \\\\ \\\\\n" +
      "mat{a , b ,c; d ,a, n ;\n" +
      "} \\mat[a,b,c;d,a,]";

    const root = await compileAndStampRealMathJax(rawSnippet);

    const sm = new DesugarSourceMap();
    const desugared = normalizeMathSyntax(rawSnippet, undefined, sm);
    sm.finalize();
    console.log("[Desugared Text]:\n", desugared);
    console.log("[Source Mappings]:\n", JSON.stringify(sm.getMappings(), null, 2));

    const lineboxes = root.querySelectorAll("mjx-linebox");
    expect(lineboxes.length).toBeGreaterThanOrEqual(3);

    const line1 = lineboxes[0];
    const line1Movers = line1.querySelectorAll("mjx-mover");
    expect(line1Movers.length).toBeGreaterThanOrEqual(2);
    const vecB = line1Movers[1];

    const clickVecB = simulateLivePreviewClick(vecB, root, rawSnippet);
    console.log("\n[Bug Case 2A Vector Click Telemetry]");
    console.log(`Method used: ${clickVecB.method}`);
    console.log(`vecB tag: ${vecB.tagName}, className: ${vecB.className}`);
    console.log(`vecB parent tag: ${vecB.parentElement?.tagName}, className: ${vecB.parentElement?.className}`);
    console.log(`Resolved slice for \\vec{b}: "${clickVecB.resolvedSlice}"`);

    expect(clickVecB.resolvedSlice.trim(), "Clicking \\vec{b} must not select equation line!").not.toContain("=\\|\\vec{a}\\|");
    expect(clickVecB.resolvedSlice.trim()).toBe("\\vec{b}");
  });

  it("Bug Case 2B: Cells in matrix 1 (mat{...}) must not be hijacked by cells in matrix 2 (\\mat[...])", async () => {
    const rawSnippet =
      "\\vec{a} \\vec{b}\n" +
      "=\\|\\vec{a}\\|\\,\\|\\vec{b}\\|\\cos\\theta \\\\ \\\\\n" +
      "mat{a , b ,c; d ,a, n ;\n" +
      "} \\mat[a,b,c;d,a,]";

    const root = await compileAndStampRealMathJax(rawSnippet);

    const sm = new DesugarSourceMap();
    const desugared = normalizeMathSyntax(rawSnippet, undefined, sm);
    sm.finalize();
    console.log("[Desugared Text]:\n", desugared);
    console.log("[Source Mappings]:\n", JSON.stringify(sm.getMappings(), null, 2));

    const lineboxes = root.querySelectorAll("mjx-linebox");
    const line3 = lineboxes[2];
    const mtables = line3.querySelectorAll("mjx-mtable");
    expect(mtables.length, "Line 3 must contain exactly 2 separate matrix tables").toBe(2);

    const matrix1 = mtables[0];
    const matrix2 = mtables[1];

    // Find cell (0, 0) 'a' in matrix 1
    const m1Cells = matrix1.querySelectorAll("mjx-mtd");
    expect(m1Cells.length).toBeGreaterThanOrEqual(6);
    const m1Cell_0_0 = m1Cells[0]; // first 'a'
    const m1Cell_0_1 = m1Cells[1]; // first 'b'

    const clickM1_a = simulateLivePreviewClick(m1Cell_0_0, root, rawSnippet);
    console.log("\n[Bug Case 2B Matrix 1 Cell (0,0) 'a' Telemetry]");
    console.log(`Resolved slice : "${clickM1_a.resolvedSlice}"`);
    console.log(`Resolved range : [${clickM1_a.start}, ${clickM1_a.end}]`);

    const mat2Index = rawSnippet.indexOf("\\mat[");
    expect(clickM1_a.resolvedSlice.trim(), "Cell (0,0) 'a' in matrix 1 must resolve to 'a'!").toBe("a");
    expect(
      clickM1_a.start,
      `Cell 'a' in matrix 1 resolved to index ${clickM1_a.start}, which is inside matrix 2 (starts at ${mat2Index})!`
    ).toBeLessThan(mat2Index);

    const clickM1_b = simulateLivePreviewClick(m1Cell_0_1, root, rawSnippet);
    console.log(`\n[Bug Case 2B Matrix 1 Cell (0,1) 'b' Telemetry]`);
    console.log(`Resolved slice : "${clickM1_b.resolvedSlice}"`);
    console.log(`Resolved range : [${clickM1_b.start}, ${clickM1_b.end}]`);

    expect(clickM1_b.resolvedSlice.trim(), "Cell (0,1) 'b' in matrix 1 must resolve to 'b'!").toBe("b");
    expect(
      clickM1_b.start,
      `Cell 'b' in matrix 1 resolved to index ${clickM1_b.start}, which is inside matrix 2!`
    ).toBeLessThan(mat2Index);
  });

  it("Vault Suite: Fourier.md - Euler's formula series navigation", async () => {
    const rawSnippet = "f(x)={a_0}/{2} + \\sum_{n=1}^{oo} a_n{cos({n pi x}/{l})}+b_n{sin({n pi x}/{l})}";
    const root = await compileAndStampRealMathJax(rawSnippet);

    // Find rendered cos and sin
    const mis = root.querySelectorAll("mjx-mi");
    const cosMi = mis.find((m) => m.textContent === "cos");
    expect(cosMi, "Rendered formula must contain 'cos'").toBeDefined();

    const clickCos = simulateLivePreviewClick(cosMi!, root, rawSnippet);
    console.log("\n[Fourier.md 'cos' Click Telemetry]");
    console.log(`Resolved slice: "${clickCos.resolvedSlice}"`);
    expect(clickCos.resolvedSlice.trim(), "Clicking rendered 'cos' must resolve to 'cos'").toBe("cos");
  });

  it("Vault Suite: Dirac delta δ(t).md - Piecewise cases environment with multi-line spacers", async () => {
    const rawSnippet = "δ(t)=\\lim_{a→0} y(t)=\\lim_{a→0} \\begin{cases}\\cfrac{1}{2a}  & -a<t<a  \\\\ \\\\\\ 0  & \"Other wise\"\\end{cases}";
    const root = await compileAndStampRealMathJax(rawSnippet);

    // Find fraction in cases
    const fracs = root.querySelectorAll("mjx-mfrac, mjx-frac");
    expect(fracs.length, "Cases environment must contain fraction").toBeGreaterThanOrEqual(1);

    const clickFrac = simulateLivePreviewClick(fracs[0], root, rawSnippet);
    console.log("\n[Dirac delta 'frac' Click Telemetry]");
    console.log(`Resolved slice: "${clickFrac.resolvedSlice}"`);
    expect(clickFrac.resolvedSlice.trim(), "Clicking rendered fraction must resolve to \\cfrac{1}{2a}").toContain("\\cfrac{1}{2a}");
  });

  it("User Suite: Multi-Line Typst Font Shortcuts line 2 navigation", async () => {
    const rawSnippet =
      "\\mathbb{bb} , \\mathbf{bold} , \\mathfrak{frak} , \\mathscr{F} , \\mathbf{\\mathcal{F}} \\\\\n" +
      "   bb(bb) , bold(bold) , frak(frak) , scr(F) ,";

    const root = await compileAndStampRealMathJax(rawSnippet);

    // Collect all mjx-mi elements in line 2
    const lineboxes = root.querySelectorAll("mjx-linebox");
    expect(lineboxes.length, "Should contain 2 lineboxes").toBe(2);
    const line2 = lineboxes[1];
    const line2Mis = line2.querySelectorAll("mjx-mi");
    expect(line2Mis.length, "Line 2 should contain 4 mi elements").toBe(4);

    // Line 2 elements: bb, bold, frak, F
    const clickBb = simulateLivePreviewClick(line2Mis[0], root, rawSnippet);
    expect(["bb(bb)", "bb"], "Clicking line 2 bb must resolve to bb(bb) or bb").toContain(clickBb.resolvedSlice.trim());

    const clickBold = simulateLivePreviewClick(line2Mis[1], root, rawSnippet);
    expect(["bold(bold)", "bold"], "Clicking line 2 bold must resolve to bold(bold) or bold").toContain(clickBold.resolvedSlice.trim());

    const clickFrak = simulateLivePreviewClick(line2Mis[2], root, rawSnippet);
    expect(["frak(frak)", "frak"], "Clicking line 2 frak must resolve to frak(frak) or frak").toContain(clickFrak.resolvedSlice.trim());

    const clickScr = simulateLivePreviewClick(line2Mis[3], root, rawSnippet);
    expect(["scr(F)", "F"], "Clicking line 2 F must resolve to scr(F) or F").toContain(clickScr.resolvedSlice.trim());
  });

  it("User Suite: Two matrices with identical characters in same line isolate cleanly", async () => {
    const rawSnippet =
      "\\vec{a} \\vec{b}\n" +
      "=\\|\\vec{a}\\|\\,\\|\\vec{b}\\|\\cos\\theta \\\\ \\\\\n" +
      "mat{a , b ,c; d ,a, n ;\n" +
      "} \\mat[a,b,c;d,a,]";

    const root = await compileAndStampRealMathJax(rawSnippet);

    const mtables = root.querySelectorAll("mjx-mtable");
    expect(mtables.length, "Should contain 2 mtables").toBe(2);

    const mat1 = mtables[0];
    const mat2 = mtables[1];
    const mat2Offset = rawSnippet.indexOf("\\mat[");

    // All cells in mat2 must resolve to offsets within mat2 (>= mat2Offset)
    const mat2Cells = mat2.querySelectorAll("mjx-mtd");
    for (const cell of mat2Cells) {
      const text = cell.textContent?.trim();
      if (!text) continue;
      const normalizedText = text.normalize("NFKD").trim();
      const leaf = cell.querySelector("mjx-mi, mjx-mn, mjx-mo, mjx-mtext") || cell;
      const click = simulateLivePreviewClick(leaf, root, rawSnippet);
      expect(click.start, `Matrix 2 leaf '${text}' must resolve inside Matrix 2 (>= ${mat2Offset})`).toBeGreaterThanOrEqual(mat2Offset);
      expect(click.resolvedSlice.trim(), `Matrix 2 leaf '${text}' slice must match '${normalizedText}'`).toBe(normalizedText);
    }
  });

  it("User Suite: Large aligned derivation must not bleed beyond its block length", async () => {
    const rawSnippet =
      "\\begin{aligned}\n" +
      "b_n &=  {2}/{pi}\\int_{0}^{pi}e^{ax}{sin({n pi x}/{pi})}dx \\\\ \n" +
      "b_n&= {2}/{pi}\\int_{0}^{pi}\\cfrac{e^{ax+inx}-e^{ax-inx}}{2i} dx \\\\\n" +
      "b_n&= {1}/{i pi}[\\cfrac{e^{ax+inx}}{a+i n}-\\cfrac{e^{ax-inx}}{a-i n}] \\\\\n" +
      "b_n&= {1}/{i pi}[ \\cfrac{(a-i n)e^{ax+inx}-(a+i n)e^{ax-inx}}{a^2+n^2} ] \\\\ \n" +
      "b_n&= {e^{ax}}/{pi(a^2+n^2)}[ a\\cfrac{(e^{+inx}-e^{-inx})}{i} -n\\cfrac{e^{+inx}+e^{-inx}}{1} ] \\\\\n" +
      "b_n&= [e^{ax}\\cfrac{a sin(nx)-n cos(nx)}{pi(a^2+n^2)}]_{0}^\\pi \\\\\n" +
      "b_n&= \\cfrac{n(1-e^{a pi +i n pi})}{pi(a^2+n^2)} \\\\ \"or\" \\\\\n" +
      "b_n&= \\cfrac{n(1-(-1)^{n}e^{a pi})}{pi (a^2+n^2)}\n" +
      "     \\end{aligned}";

    const root = await compileAndStampRealMathJax(rawSnippet);

    // Test clicking every element in the table: none must exceed rawSnippet.length
    const allLeaves = root.querySelectorAll("mjx-mi, mjx-mn, mjx-mo, mjx-mtext, mjx-mtd");
    for (const el of allLeaves) {
      const click = simulateLivePreviewClick(el, root, rawSnippet);
      if (click.method !== "NONE") {
        expect(click.start, `Click start ${click.start} must be inside block (< ${rawSnippet.length})`).toBeLessThanOrEqual(rawSnippet.length);
        expect(click.end, `Click end ${click.end} must be inside block (<= ${rawSnippet.length})`).toBeLessThanOrEqual(rawSnippet.length);
      }
    }
  });

  it("Occurrence Disambiguation: Repeated tokens in f(x) = \\cos(x) + \\cos(x) + \\cos(x) must resolve to unique distinct indices", async () => {
    const rawSnippet = "f(x) = \\cos(x) + \\cos(x) + \\cos(x)";
    const root = await compileAndStampRealMathJax(rawSnippet);

    const cosMis = root.querySelectorAll("mjx-mi").filter((m) => m.textContent === "cos");
    expect(cosMis.length, "Should render 3 separate cos elements").toBe(3);

    const click1 = simulateLivePreviewClick(cosMis[0], root, rawSnippet);
    const click2 = simulateLivePreviewClick(cosMis[1], root, rawSnippet);
    const click3 = simulateLivePreviewClick(cosMis[2], root, rawSnippet);

    expect(click1.resolvedSlice, "First cos slice").toBe("\\cos");
    expect(click2.resolvedSlice, "Second cos slice").toBe("\\cos");
    expect(click3.resolvedSlice, "Third cos slice").toBe("\\cos");

    // Must be strictly strictly monotonic and unique
    expect(click1.start).toBeLessThan(click2.start);
    expect(click2.start).toBeLessThan(click3.start);
  });

  it("Error Diagnostics (Local): Clicking rendered inline <mjx-merror> for \\unknownmacro must resolve directly to \\unknownmacro", async () => {
    const rawSnippet = "x + \\unknownmacro + y";
    const root = await compileAndStampRealMathJax(rawSnippet);

    const merrors = root.querySelectorAll("mjx-merror");
    expect(merrors.length, "Must render an inline mjx-merror for unknown macro").toBeGreaterThanOrEqual(1);

    const errorEl = merrors[0];
    const click = simulateLivePreviewClick(errorEl, root, rawSnippet);

    expect(click.resolvedSlice.trim(), "Clicking error must resolve to \\unknownmacro").toBe("\\unknownmacro");
    expect(click.start).toBe(rawSnippet.indexOf("\\unknownmacro"));
  });

  it("Error Diagnostics (Structural): Clicking mismatched \\begin{matrix} a & b \\end{align} error must pinpoint \\begin{matrix}", async () => {
    const rawSnippet = "\\begin{matrix} a & b \\end{align}";
    const root = await compileAndStampRealMathJax(rawSnippet);

    const merrors = root.querySelectorAll("mjx-merror");
    expect(merrors.length, "Must render an mjx-merror for mismatched environment").toBeGreaterThanOrEqual(1);

    const errorEl = merrors[0];
    const click = simulateLivePreviewClick(errorEl, root, rawSnippet);

    expect(click.resolvedSlice).toContain("\\begin{matrix}");
  });

  it("Stage 1 Intermediate Representation: MmlNode AST semantic rows and cells match CST GroupNode.grid isomorphic structure", async () => {
    const { htmlDoc } = getHeadlessMathJax();
    const rawSnippet = "\\begin{matrix} a & b \\\\ c & d \\end{matrix}";
    const math = new htmlDoc.options.MathItem(rawSnippet, htmlDoc.inputJax[0], true);
    math.compile(htmlDoc);
    expect(math.root).toBeDefined();

    // Verify Stage 1 MmlNode table structure
    function findMmlNode(node: any, kind: string): any {
      if (node.kind === kind) return node;
      for (const child of node.childNodes || []) {
        const found = findMmlNode(child, kind);
        if (found) return found;
      }
      return null;
    }

    const mmlTable = findMmlNode(math.root, "mtable");
    expect(mmlTable, "MmlNode must contain mtable in Stage 1").toBeDefined();
    expect(mmlTable.childNodes.length, "MmlNode mtable must have 2 rows").toBe(2);
    expect(mmlTable.childNodes[0].childNodes.length, "Row 0 must have 2 cells").toBe(2);
    expect(mmlTable.childNodes[1].childNodes.length, "Row 1 must have 2 cells").toBe(2);

    // Verify CST grid isomorphic alignment
    const parser = new MathCSTParser(rawSnippet);
    const ast = parser.parse();
    expect(ast[0].kind).toBe("group");
    expect(ast[0].grid).toBeDefined();
    expect(ast[0].grid.rowCount).toBe(2);
    expect(ast[0].grid.colCount).toBe(2);
    expect(ast[0].grid.cells[0][0].nodes[0].text).toBe("a");
    expect(ast[0].grid.cells[0][1].nodes[0].text).toBe("b");
    expect(ast[0].grid.cells[1][0].nodes[0].text).toBe("c");
    expect(ast[0].grid.cells[1][1].nodes[0].text).toBe("d");
  });

  it("Bracket click in pmat[1, 2; 3, 4] must resolve to pmat[ or pmat, not just 'p'", async () => {
    const rawSnippet = "pmat[1, 2; 3, 4]";
    const root = await compileAndStampRealMathJax(rawSnippet);

    const mos = root.querySelectorAll("mjx-mo").filter((m) => m.textContent === "(");
    expect(mos.length, "Should have 1 opening paren mjx-mo").toBe(1);
    const click = simulateLivePreviewClick(mos[0], root, rawSnippet);
    console.log("[pmat bracket click telemetry]:", click);
    expect(click.resolvedSlice).toMatch(/pmat/);
  });

  it("User Fourier series equation click diagnosis", async () => {
    const rawSnippet = "f(x)={a_0}/{2} + \\sum_{n=1}^{oo} a_n{cos({n pi x}/{l})}+b_n{sin({n pi x}/{l})}";
    const root = await compileAndStampRealMathJax(rawSnippet);

    console.log("\n--- USER FOURIER EQUATION DIAGNOSTIC DUMP ---");
    const sourceMap = new DesugarSourceMap(rawSnippet.length);
    const desugared = desugarMathForStamping(rawSnippet, sourceMap);
    sourceMap.finalize();
    console.log("[Desugared for stamping]:", desugared);
    const parser = new MathCSTParser(desugared);
    const ast = parser.parse();
    function printAst(nodes: any[], depth = 0) {
      for (const n of nodes) {
        console.log("  ".repeat(depth) + `Node kind=${n.kind} text=${JSON.stringify(n.text)} range=[${n.start}, ${n.end}]`);
        if (n.numerator || n.denominator) {
          console.log("  ".repeat(depth+1) + `NUM:`);
          printAst(n.numerator, depth + 2);
          console.log("  ".repeat(depth+1) + `DEN:`);
          printAst(n.denominator, depth + 2);
        }
        if (n.children) printAst(n.children, depth + 1);
        if (n.body) printAst(n.body, depth + 1);
      }
    }
    console.log("[AST Structure]:");
    printAst(ast);
    const allEls = root.querySelectorAll("*");
    for (const el of allEls) {
      const cls = el.className || "";
      const range = getMathJaxElementRange(el);
      if (range || cls.includes("cm-src-")) {
        const text = el.textContent || "";
        const rStart = range?.start ?? -1;
        const rEnd = range?.end ?? -1;
        const slice = rStart >= 0 && rEnd > rStart ? JSON.stringify(rawSnippet.slice(rStart, rEnd)) : "N/A";
        console.log(`Tag: <${el.tagName}> Class: "${cls}" Text: "${text}" Range: [${rStart}, ${rEnd}] -> Slice: ${slice}`);
      }
    }

    console.log("\nAll mjx-mfrac elements found:");
    const mfracs = root.querySelectorAll("mjx-mfrac");
    mfracs.forEach((mf, i) => {
      console.log(`MFRAC #${i}: class="${mf.className}" text="${mf.textContent}" range=`, getMathJaxElementRange(mf));
    });
    const mnEls = root.querySelectorAll("mjx-mn");
    console.log("\nAll mjx-mn elements found:", mnEls.map(el => ({ text: el.textContent, class: el.className })));
    const el2 = mnEls.find(el => (el.textContent || "").trim() === "2");
    expect(el2, "Rendered element '2' must exist").toBeDefined();
    const click2 = simulateLivePreviewClick(el2!, root, rawSnippet);
    console.log("\n[Click on '2' Telemetry]:", click2);
    expect(click2.resolvedSlice).toBe("2");
    expect(click2.start).toBe(12);
    expect(click2.end).toBe(13);

    // Assert '0' resolves strictly to '0' [8, 9] in a_0
    const el0 = mnEls.find((el) => (el.textContent || "").trim() === "0");
    expect(el0, "Rendered element '0' must exist").toBeDefined();
    const click0 = simulateLivePreviewClick(el0!, root, rawSnippet);
    expect(click0.resolvedSlice).toBe("0");
    expect(click0.start).toBe(8);
    expect(click0.end).toBe(9);

    // Assert both 'l' elements resolve to their respective positions
    const mis = root.querySelectorAll("mjx-mi");
    const lEls = mis.filter((el) => (el.textContent || "").trim() === "𝑙");
    expect(lEls.length, "Must find exactly 2 'l' elements").toBe(2);

    const clickL1 = simulateLivePreviewClick(lEls[0], root, rawSnippet);
    expect(clickL1.resolvedSlice).toBe("l");
    expect(clickL1.start).toBe(51);
    expect(clickL1.end).toBe(52);

    const clickL2 = simulateLivePreviewClick(lEls[1], root, rawSnippet);
    expect(clickL2.resolvedSlice).toBe("l");
    expect(clickL2.start).toBe(74);
    expect(clickL2.end).toBe(75);
  });

  it("Clicking opening fence in \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}", async () => {
    const rawSnippet = "\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}";
    const root = await compileAndStampRealMathJax(rawSnippet);

    const mos = root.querySelectorAll("mjx-mo");
    const openParen = mos.find((m) => (m.textContent || "").trim() === "(");
    expect(openParen, "Must find opening paren").toBeDefined();
    const clickOpen = simulateLivePreviewClick(openParen!, root, rawSnippet);
    console.log("[pmatrix click '(' telemetry]:", clickOpen);

    const closeParen = mos.find((m) => (m.textContent || "").trim() === ")");
    expect(closeParen, "Must find closing paren").toBeDefined();
    const clickClose = simulateLivePreviewClick(closeParen!, root, rawSnippet);
    console.log("[pmatrix click ')' telemetry]:", clickClose);
  });

  it("Clicking scaled brace in \\begin{cases} a & b \\\\ c & d \\end{cases}", async () => {
    const rawSnippet = "\\begin{cases} a & b \\\\ c & d \\end{cases}";
    const root = await compileAndStampRealMathJax(rawSnippet);

    const mos = root.querySelectorAll("mjx-mo");
    console.log("[cases all mjx-mo]:", mos.map((m) => ({ text: m.textContent, class: m.className })));
    const openBrace = mos.find((m) => (m.textContent || "").includes("{") || (m.textContent || "").includes("⎧"));
    if (openBrace) {
      const clickBrace = simulateLivePreviewClick(openBrace, root, rawSnippet);
      console.log("[cases click '{' telemetry]:", clickBrace);
    }
  });

  it("Clicking placeholder ▢ in incomplete fraction \\frac{a}", async () => {
    const rawSnippet = "\\frac{a}";
    const root = await compileAndStampRealMathJax(rawSnippet);

    const allLeaves = root.querySelectorAll("mjx-mi, mjx-mo, mjx-mn, mjx-mtext");
    const squovalEl = allLeaves.find((el) => (el.textContent || "").includes("▢") || (el.textContent || "").includes("\u25a2"));
    console.log("[frac{a} squoval element]:", squovalEl ? { tag: squovalEl.tagName, text: squovalEl.textContent, class: squovalEl.className } : "not found");
    if (squovalEl) {
      const click = simulateLivePreviewClick(squovalEl, root, rawSnippet);
      console.log("[frac{a} click ▢ telemetry]:", click);
    }
  });
});
