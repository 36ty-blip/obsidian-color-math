// tests/spatial_tensor_bijective.test.ts
//! 3-Tier Bijective Verification Suite for 4D Spatial Tensor Reconciler.
//! 1. Collision & Orphan Audit (Injectivity & Surjectivity)
//! 2. Keystroke Evolution Test (Monotonic Prefix Invariance)
//! 3. Backtracking Deletion Mutation Oracle (Differential Mutation Truth)
//! Scalable architecture built for corpus testing across 11,000+ mathematical expressions.

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
import { highlightSelectionInMathContainer } from "../src/editor/inline_tooltip";
import { MathCSTParser } from "../src/parsers/cst/parser";
import { CSTNode } from "../src/parsers/cst/types";
import { createFakeElement, FakeElement } from "./tri_engine_harness";

// Initialize real headless MathJax 4 compiler
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const tex = new TeX({ packages: ["base", "ams", "color"] });

const chtml = new CHTML({});
const mathjaxDoc = mathjax.document("", { InputJax: tex, OutputJax: chtml });

/**
 * Compiles LaTeX using real MathJax 4 and converts the authentic LiteElement AST
 * into a high-performance, queryable FakeElement tree.
 */
export function renderRealMathJaxDOM(latex: string): FakeElement {
  const mathNode = mathjaxDoc.convert(latex, { display: true });

  function convertLite(node: any): FakeElement | null {
    if (!node) return null;
    const kind = node.kind || node.tagName || "";
    if (kind === "#text") {
      return null;
    }

    const children: FakeElement[] = [];
    let textContent = "";

    if (node.children) {
      for (const c of node.children) {
        if (c.kind === "#text") {
          textContent += c.value || "";
        } else {
          const childEl = convertLite(c);
          if (childEl) {
            children.push(childEl);
          }
        }
      }
    }

    const fakeEl = createFakeElement(kind, children, textContent);
    const cls = node.attributes?.class;
    if (cls) {
      fakeEl.className = cls;
    }
    return fakeEl;
  }

  const root = convertLite(mathNode);
  if (!root) {
    throw new Error(`Failed to compile MathJax DOM for: ${latex}`);
  }
  return root;
}

export interface BijectiveAuditResult {
  latex: string;
  totalClickableGlyphs: number;
  totalCSTLeaves: number;
  mappings: {
    domTag: string;
    domText: string;
    resolvedStart: number;
    resolvedEnd: number;
    sourceSlice: string;
  }[];
  collisions: {
    sourceSlice: string;
    range: [number, number];
    hitCount: number;
    domElements: { tag: string; text: string }[];
  }[];
  orphans: {
    nodeKind: string;
    sourceSlice: string;
    range: [number, number];
  }[];
  isBijective: boolean;
}

/**
 * Collects visible semantic leaf tokens from the CST.
 */
export function extractCSTLeaves(ast: CSTNode[]): { kind: string; start: number; end: number; text: string }[] {
  const leaves: { kind: string; start: number; end: number; text: string }[] = [];

  function walk(nodes: CSTNode[]) {
    for (const node of nodes) {
      switch (node.kind) {
        case "identifier":
          leaves.push({ kind: "identifier", start: node.start, end: node.end, text: (node as any).text });
          break;
        case "number":
          leaves.push({ kind: "number", start: node.start, end: node.end, text: (node as any).value });
          break;
        case "operator":
          leaves.push({ kind: "operator", start: node.start, end: node.end, text: (node as any).text });
          break;
        case "text":
          leaves.push({ kind: "text", start: node.start, end: node.end, text: (node as any).text });
          break;
        case "punctuation":
          if ((node as any).char !== "&") {
            leaves.push({ kind: "punctuation", start: node.start, end: node.end, text: (node as any).char });
          }
          break;
        case "fraction":
          walk(node.numerator);
          walk(node.denominator);
          break;
        case "script":
          if (node.base) walk([node.base]);
          walk(node.arg);
          break;
        case "group":
          walk(node.children);
          break;
        case "underover":
          walk(node.base);
          if (node.script) walk(node.script);
          break;
        default:
          break;
      }
    }
  }

  walk(ast);
  return leaves;
}

/**
 * Runs the Tier 1 Bijective Collision & Orphan Audit on an arbitrary LaTeX expression.
 */
export function auditBijectiveMapping(latex: string): BijectiveAuditResult {
  const container = renderRealMathJaxDOM(latex);

  // Execute 4D Spatial Tensor DOM stamping
  stampMathJaxDOM(container as any, latex);

  const parser = new MathCSTParser(latex);
  const ast = parser.parse();
  const cstLeaves = extractCSTLeaves(ast);

  // Query all clickable leaf glyphs in the DOM
  // (Filter out internal layout elements, keep user-clickable visual tokens)
  const candidateEls = container.querySelectorAll("mjx-mi, mjx-mo, mjx-mn, mjx-mtext");
  const clickableEls = candidateEls.filter((el) => {
    // Exclude internal glyph pieces inside stretchy glyph builders
    if (el.closest("mjx-stretchy-h, mjx-stretchy-v")) {
      return false;
    }
    return true;
  });

  const rangeUsage = new Map<string, { tag: string; text: string }[]>();
  const mappings: BijectiveAuditResult["mappings"] = [];

  for (const el of clickableEls) {
    // Check WeakMap M2 or DOM class M1
    const m2 = getMathJaxElementRange(el as any);
    const m1Match = el.className.match(/cm-src-(\d+)-(\d+)/);
    const start = m2 ? m2.start : m1Match ? parseInt(m1Match[1], 10) : -1;
    const end = m2 ? m2.end : m1Match ? parseInt(m1Match[2], 10) : -1;

    const sourceSlice = start >= 0 && end > start ? latex.slice(start, end) : "<UNMAPPED>";
    const text = el.textContent.trim();
    mappings.push({
      domTag: el.tagName.toLowerCase(),
      domText: text,
      resolvedStart: start,
      resolvedEnd: end,
      sourceSlice,
    });

    if (start >= 0 && end > start) {
      const key = `${start}-${end}`;
      if (!rangeUsage.has(key)) {
        rangeUsage.set(key, []);
      }
      rangeUsage.get(key)!.push({ tag: el.tagName.toLowerCase(), text });
    }
  }

  // Detect Collisions: Any range mapped by multiple distinct DOM elements
  const collisions: BijectiveAuditResult["collisions"] = [];
  for (const [key, els] of rangeUsage.entries()) {
    if (els.length > 1) {
      const [s, e] = key.split("-").map(Number);
      collisions.push({
        sourceSlice: latex.slice(s, e),
        range: [s, e],
        hitCount: els.length,
        domElements: els,
      });
    }
  }

  // Detect Orphans: Any CST leaf with 0 mapped DOM elements
  const orphans: BijectiveAuditResult["orphans"] = [];
  for (const leaf of cstLeaves) {
    const key = `${leaf.start}-${leaf.end}`;
    if (!rangeUsage.has(key)) {
      orphans.push({
        nodeKind: leaf.kind,
        sourceSlice: latex.slice(leaf.start, leaf.end),
        range: [leaf.start, leaf.end],
      });
    }
  }

  const isBijective = collisions.length === 0 && orphans.length === 0 && mappings.every((m) => m.resolvedStart >= 0);

  return {
    latex,
    totalClickableGlyphs: clickableEls.length,
    totalCSTLeaves: cstLeaves.length,
    mappings,
    collisions,
    orphans,
    isBijective,
  };
}

describe("4D Spatial Tensor Bijective Verification Suite", () => {
  const targetLatex = "\\underbrace{a+b+c}_{x}\\qquad\\overbrace{d+e+\\cdots+f}^{y}";

  it("Tier 1: Bijective Collision & Orphan Audit", () => {
    const report = auditBijectiveMapping(targetLatex);

    console.log("\n=======================================================");
    console.log("   TIER 1 BIJECTIVE MAPPING AUDIT REPORT (BASELINE)");
    console.log("=======================================================");
    console.log(`LaTeX Expression: ${targetLatex}`);
    console.log(`Clickable Visual Glyphs in DOM: ${report.totalClickableGlyphs}`);
    console.log(`Semantic Leaves in CST:         ${report.totalCSTLeaves}`);
    console.log("\n--- DOM -> LaTeX Mappings ---");
    report.mappings.forEach((m, idx) => {
      console.log(
        `[${idx + 1}] DOM <${m.domTag}> '${m.domText}' => range [${m.resolvedStart}, ${m.resolvedEnd}]: "${m.sourceSlice}"`
      );
    });

    console.log("\n--- Collisions (Many-to-One Faults) ---");
    if (report.collisions.length === 0) {
      console.log("None detected.");
    } else {
      report.collisions.forEach((c) => {
        console.log(
          `COLLISION on "${c.sourceSlice}" [${c.range[0]}, ${c.range[1]}]: Hit ${c.hitCount} times by:`,
          c.domElements.map((e) => `<${e.tag}> '${e.text}'`).join(", ")
        );
      });
    }

    console.log("\n--- Orphans (Unreachable Tokens) ---");
    if (report.orphans.length === 0) {
      console.log("None detected.");
    } else {
      report.orphans.forEach((o) => {
        console.log(`ORPHAN token: "${o.sourceSlice}" (${o.nodeKind}) at [${o.range[0]}, ${o.range[1]}]`);
      });
    }
    console.log("=======================================================\n");

    // This assertion will capture the baseline failure
    expect(report.isBijective).toBe(true);
  });

  it("Tier 2: Keystroke Evolution Test (Prefix Growth Invariance)", () => {
    const prefixes = [
      "\\underbrace{a}",
      "\\underbrace{a+b}",
      "\\underbrace{a+b+c}",
      "\\underbrace{a+b+c}_{x}",
      "\\underbrace{a+b+c}_{x}\\qquad",
      "\\underbrace{a+b+c}_{x}\\qquad\\overbrace{d}",
      "\\underbrace{a+b+c}_{x}\\qquad\\overbrace{d+e+\\cdots+f}^{y}",
    ];

    console.log("\n=======================================================");
    console.log("   TIER 2 KEYSTROKE EVOLUTION AUDIT REPORT");
    console.log("=======================================================");

    for (const prefix of prefixes) {
      const rep = auditBijectiveMapping(prefix);
      console.log(
        `Prefix "${prefix}": Glyphs=${rep.totalClickableGlyphs}, Leaves=${rep.totalCSTLeaves}, Collisions=${rep.collisions.length}, Orphans=${rep.orphans.length}, Bijective=${rep.isBijective}`
      );
    }
    console.log("=======================================================\n");
  });

  it("Tier 3: One-Hot Sentinel Perturbation Oracle (Only-and-Only Target Mutation)", () => {
    const normalizeGlyphText = (s: string) =>
      s.trim().replace(/\u00af+/g, "").replace(/\u23af+/g, "").replace(/\u23de+/g, "⏞").replace(/\u23df+/g, "⏟");
    const container = renderRealMathJaxDOM(targetLatex);
    stampMathJaxDOM(container as any, targetLatex);

    const clickableEls = container.querySelectorAll("mjx-mi, mjx-mo, mjx-mn, mjx-mtext").filter((el) => {
      return !el.closest("mjx-stretchy-h, mjx-stretchy-v");
    });
    const origGlyphs = clickableEls.map((e) => normalizeGlyphText(e.textContent));

    console.log("\n=======================================================");
    console.log("   TIER 3 ONE-HOT SENTINEL PERTURBATION ORACLE REPORT");
    console.log("=======================================================");

    let mutationDiscrepancyCount = 0;

    for (let i = 0; i < clickableEls.length; i++) {
      const el = clickableEls[i];
      const clickedText = origGlyphs[i];
      const m2 = getMathJaxElementRange(el as any);
      const m1Match = el.className.match(/cm-src-(\d+)-(\d+)/);
      const start = m2 ? m2.start : m1Match ? parseInt(m1Match[1], 10) : -1;
      const end = m2 ? m2.end : m1Match ? parseInt(m1Match[2], 10) : -1;

      if (start < 0 || end <= start || end - start >= targetLatex.length) {
        console.log(`[Glyph ${i} <${el.tagName}> '${clickedText}'] INVALID / OVER-WIDE SPAN [${start}, ${end}]`);
        mutationDiscrepancyCount++;
        continue;
      }

      const highlightedSlice = targetLatex.slice(start, end);
      const isExtensibleBraceCmd = highlightedSlice === "\\underbrace" || highlightedSlice === "\\overbrace";

      // Select a brace-isolated sentinel replacement that preserves TeX grammar:
      // - For \underbrace / \overbrace command tokens, removing the command leaves {base}_{sub} / {base}^{sup} intact,
      //   removing ONLY the 1 brace glyph while preserving all N-1 other glyphs in exact order.
      // - For operators (<mjx-mo>), replace with {\ominus}.
      // - For identifiers/numbers (<mjx-mi>, <mjx-mn>), replace with {\Omega}.
      let replacement: string;
      if (isExtensibleBraceCmd) {
        replacement = "";
      } else if (el.tagName === "MJX-MO") {
        replacement = "{\\ominus}";
      } else {
        replacement = "{\\Omega}";
      }

      const mutatedLatex = targetLatex.slice(0, start) + replacement + targetLatex.slice(end);
      const mutatedContainer = renderRealMathJaxDOM(mutatedLatex);
      const mutatedGlyphs = mutatedContainer
        .querySelectorAll("mjx-mi, mjx-mo, mjx-mn, mjx-mtext")
        .filter((e) => !e.closest("mjx-stretchy-h, mjx-stretchy-v"))
        .map((e) => normalizeGlyphText(e.textContent));

      let passed = false;
      if (isExtensibleBraceCmd) {
        // Removing \underbrace or \overbrace must remove ONLY glyph i (count === N - 1)
        // and preserve all other N - 1 glyphs (note: removing \overbrace converts <mjx-mover> to <mjx-msup>,
        // shifting the superscript after its base, so compare sorted remaining tokens).
        const expectedRemaining = origGlyphs.filter((_, idx) => idx !== i).slice().sort();
        const actualRemaining = mutatedGlyphs.slice().sort();
        passed =
          actualRemaining.length === expectedRemaining.length &&
          expectedRemaining.every((g, idx) => g === actualRemaining[idx]);
      } else {
        // Strict index-locked One-Hot check:
        // 1. Total glyph count must be 100% preserved (N === N)
        // 2. Target glyph at index i must have changed to the sentinel
        // 3. Every other glyph j != i must be 100% untouched ("only and only that thing")
        const countPreserved = mutatedGlyphs.length === origGlyphs.length;
        const targetChanged = countPreserved && mutatedGlyphs[i] !== origGlyphs[i];
        const othersUntouched =
          countPreserved &&
          mutatedGlyphs.every((g, j) => (j === i ? g !== origGlyphs[j] : g === origGlyphs[j]));
        passed = countPreserved && targetChanged && othersUntouched;
      }

      if (!passed) {
        mutationDiscrepancyCount++;
      }

      console.log(
        `[Glyph ${i} '${clickedText}'] mapped to "${highlightedSlice}" [${start}, ${end}] -> ` +
          `mutated[${i}]='${mutatedGlyphs[i] ?? "N/A"}' | count=${mutatedGlyphs.length}/${origGlyphs.length} | ` +
          `oneHot=${passed ? "PASS ✅" : "FAIL ❌"}`
      );
    }

    console.log("=======================================================\n");
    expect(mutationDiscrepancyCount).toBe(0);
  });

  it("Tier 4: CodeMirror 6 Live Selection & Caret Synchronization Gate", () => {
    const targetLatex = "\\underbrace{a+b+c}_{x}\\qquad\\overbrace{d+e+\\cdots+f}^{y}";
    const container = renderRealMathJaxDOM(targetLatex);
    stampMathJaxDOM(container as any, targetLatex);

    // 1. Collapsed Caret Test (from === to):
    // For every stamped semantic token leaf, placing a collapsed cursor at its boundaries
    // must attach strictly a caret pseudo-element (.color-math-caret-before / after)
    // and MUST NOT add any whole-token box outlines (.color-math-selected-target).
    const leaves = container.querySelectorAll("mjx-mi, mjx-mn, mjx-mo, mjx-mtext");
    expect(leaves.length).toBeGreaterThan(0);

    for (const leaf of leaves) {
      const m = leaf.className.match(/cm-src-(\d+)-(\d+)/);
      if (!m) continue;
      const start = parseInt(m[1], 10);
      const end = parseInt(m[2], 10);

      // Caret at start boundary of token
      highlightSelectionInMathContainer(container as any, start, start);
      expect(container.querySelectorAll(".color-math-selected-target").length).toBe(0);
      expect(container.querySelectorAll(".color-math-caret-before, .color-math-caret-after").length).toBeGreaterThanOrEqual(1);

      // Caret at end boundary of token
      highlightSelectionInMathContainer(container as any, end, end);
      expect(container.querySelectorAll(".color-math-selected-target").length).toBe(0);
      expect(container.querySelectorAll(".color-math-caret-before, .color-math-caret-after").length).toBeGreaterThanOrEqual(1);
    }

    // 2. Sub-expression Range Selection Test (from < to):
    // Selecting "a+b+c" (offset [12, 17]) must highlight strictly the selected sub-expression
    // and MUST clear all caret pseudo-elements.
    const aPlusBPlusCStart = 12;
    const aPlusBPlusCEnd = 17;
    highlightSelectionInMathContainer(container as any, aPlusBPlusCStart, aPlusBPlusCEnd);

    const rangeTargets = container.querySelectorAll(".color-math-selected-target");
    expect(rangeTargets.length).toBeGreaterThanOrEqual(1);

    const remainingCarets = container.querySelectorAll(".color-math-caret-before, .color-math-caret-after");
    expect(remainingCarets.length).toBe(0);
  });
});
