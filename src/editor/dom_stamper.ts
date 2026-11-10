// src/editor/dom_stamper.ts
//! High-Performance In-Memory DOM Provenance Stamper for MathJax CHTML.
//! Aligns CST nodes directly with MathJax CHTML DOM elements without LaTeX \\class pollution.
//! Simultaneously populates the Method 2 WeakMap Index and Method 1 DOM Classes.

import { MathCSTParser } from "../parsers/cst/parser";
import { CSTNode } from "../parsers/cst/types";
import { collectLeaves, ResolvedRange } from "./lazy_navigation";
import { getMathJaxElementRange, getDirectMathJaxElementRange, indexMathJaxElement } from "./weakmap_index";
import {
  reconcileSpatialTensor,
  getElementText,
  getExpectedLeafNodeText,
  isLeafTextMatch,
  isSliceTextCompatible,
} from "./quaternion_reconciler";

/**
 * Attaches a cm-src-<start>-<end> class (Method 1) and indexes into WeakMap (Method 2),
 * strictly gated by the Final Verification Gate (Cell Containment + Unicode Identity + Non-Overwrite).
 * Line containers (<mjx-linebox>) receive cm-cell- rather than cm-src-.
 */
function stampElement(
  el: Element,
  start: number,
  end: number,
  kind: ResolvedRange["kind"] = "leaf",
  latex?: string,
  sourceMap?: DesugarSourceMap
): boolean {
  if (start < 0 || end < start) return false;
  // Never overwrite an element already reconciled by the 4D Spatial Tensor engine
  if (getDirectMathJaxElementRange(el)) return false;

  if (el.classList && typeof el.classList.contains === "function" && el.classList.contains("color-math-cell-padding")) {
    return false;
  }

  let finalStart = start;
  let finalEnd = end;
  if (sourceMap && !sourceMap.isEmpty()) {
    const mapped = sourceMap.projectRangeToRaw(start, end);
    finalStart = mapped.start;
    finalEnd = mapped.end;
  }
  if (finalStart < 0 || finalEnd < finalStart) return false;

  // 1. 2D Cell / Line Containment Gate (comparing in unified raw markdown space)
  const mtd = typeof el.closest === "function" ? el.closest("mjx-mtd, mjx-linebox") : null;
  const cellRange = mtd ? getMathJaxElementRange(mtd) : undefined;
  if (cellRange && (finalStart < cellRange.start || finalEnd > cellRange.end)) {
    return false;
  }

  // 2. Final Unicode Identity Gate for leaf tokens (skipping zero-width insertion sentinels)
  if (latex && start < end && (kind === "leaf" || kind === "text") && el.tagName && /^MJX-M(?:I|N|O|TEXT)$/i.test(el.tagName)) {
    const domText = getElementText(el);
    const rawSlice = latex.slice(start, end);
    if (domText && rawSlice && !isSliceTextCompatible(domText, rawSlice)) {
      return false;
    }
  }

  const isLineContainer = typeof (el as any).matches === "function" && (el as any).matches("mjx-linebox, mjx-linestack");
  if (isLineContainer) {
    el.classList.add(`cm-cell-${finalStart}-${finalEnd}`);
  } else {
    el.classList.add(`cm-src-${finalStart}-${finalEnd}`);
  }
  indexMathJaxElement(el, {
    start: finalStart,
    end: finalEnd,
    kind: isLineContainer ? "line" : kind,
    coord: { w: 1, z: 0, y: 0, x: 0 },
    scales: {
      glyph: { start: finalStart, end: finalEnd },
      atom: { start: finalStart, end: finalEnd },
      slot: { start: finalStart, end: finalEnd },
      molecule: { start: finalStart, end: finalEnd },
      enclosure: { start: finalStart, end: finalEnd },
    },
  });
  return true;
}

/**
 * Multi-Pass Anchor-Bracketed Feedback & Retry Loop:
 * Recovers any unreconciled leaf symbols in up to 3 iterative passes using already-verified
 * left and right DOM neighbor anchors to bracket and lock in missed symbols.
 */
function stampLeaves(
  container: Element,
  leafNodes: CSTNode[],
  reconciledNodes?: Set<CSTNode>,
  latex?: string,
  sourceMap?: DesugarSourceMap
): void {
  const allDomLeaves = Array.from(container.querySelectorAll("mjx-mi, mjx-mn, mjx-mo, mjx-mtext"));
  if (allDomLeaves.length === 0 || leafNodes.length === 0) return;

  const domIndexMap = new Map<Element, number>();
  for (let i = 0; i < allDomLeaves.length; i++) {
    domIndexMap.set(allDomLeaves[i], i);
  }

  const consumedNodes = reconciledNodes ?? new Set<CSTNode>();
  const getEnclosingCell = (el: Element): Element | null =>
    typeof el.closest === "function" ? el.closest("mjx-mtd, mjx-linebox") : null;

  // Run up to 3 feedback passes: each newly locked symbol in Pass k acts as a verified anchor for Pass k+1
  for (let pass = 0; pass < 3; pass++) {
    const leafEls = allDomLeaves.filter(
      (el) => !getDirectMathJaxElementRange(el) && !el.classList.contains("cm-tensor-reconciled")
    );
    if (leafEls.length === 0) break;

    let newlyStampedInPass = 0;
    let cursor = 0;

    for (const node of leafNodes) {
      if (consumedNodes.has(node)) continue;

      const expectedText = getExpectedLeafNodeText(node, latex);
      if (!expectedText) continue;

      const isCandEligible = (el: Element): boolean => {
        if (getDirectMathJaxElementRange(el)) return false;
        const mappedNode = sourceMap && !sourceMap.isEmpty()
          ? sourceMap.projectRangeToRaw(node.start, node.end)
          : { start: node.start, end: node.end };

        const mtd = getEnclosingCell(el);
        const cellRange = mtd ? getMathJaxElementRange(mtd) : undefined;
        const normText = getElementText(el);
        const rawText = String(el.textContent || "").trim();
        if (cellRange && (mappedNode.start < cellRange.start || mappedNode.end > cellRange.end)) {
          return false;
        }

        // Enclosing Table Scope Barrier: prevent tokens from Table 1 from matching inside Table 2
        const mtable = typeof el.closest === "function" ? el.closest("mjx-mtable") : null;
        const tableRange = mtable ? getMathJaxElementRange(mtable) : undefined;
        if (tableRange && (mappedNode.start < tableRange.start || mappedNode.end > tableRange.end)) {
          return false;
        }

        if (el.classList && typeof el.classList.contains === "function" && el.classList.contains("color-math-cell-padding")) {
          return false;
        }
        return (
          normText === expectedText ||
          rawText === expectedText ||
          isLeafTextMatch(normText, node, latex) ||
          isLeafTextMatch(rawText, node, latex)
        );
      };

      const scoreCandidate = (candIdx: number): number => {
        const el = leafEls[candIdx];
        let score = candIdx >= cursor ? 20 - Math.min(15, candIdx - cursor) : 5;
        const domIdx = domIndexMap.get(el) ?? -1;
        if (domIdx < 0) return score;

        const elCell = getEnclosingCell(el);

        const nodeIdx = leafNodes.indexOf(node);
        if (domIdx >= 0 && leafNodes.length > 0 && allDomLeaves.length > 0) {
          const normCst = nodeIdx / leafNodes.length;
          const normDom = domIdx / allDomLeaves.length;
          const dist = Math.abs(normCst - normDom);
          score += Math.max(0, 20 * (1 - dist * 4));
        }

        // 1. Direct Left Neighbor Verification + Locked Anchor Bonus
        if (node.prevLeaf && domIdx > 0) {
          const prevDom = allDomLeaves[domIdx - 1];
          if (isLeafTextMatch(getElementText(prevDom), node.prevLeaf, latex)) {
            score += 20;
            const prevRange = getMathJaxElementRange(prevDom);
            if (prevRange && prevRange.start === node.prevLeaf.start && prevRange.end === node.prevLeaf.end) {
              score += 50; // Locked left neighbor anchor!
            }
          }
        }

        // 2. Direct Right Neighbor Verification + Locked Anchor Bonus
        if (node.nextLeaf && domIdx + 1 < allDomLeaves.length) {
          const nextDom = allDomLeaves[domIdx + 1];
          if (isLeafTextMatch(getElementText(nextDom), node.nextLeaf, latex)) {
            score += 20;
            const nextRange = getMathJaxElementRange(nextDom);
            if (nextRange && nextRange.start === node.nextLeaf.start && nextRange.end === node.nextLeaf.end) {
              score += 50; // Locked right neighbor anchor!
            }
          }
        }

        // 3. Nearest Verified Left/Right Anchor Bracket Window [leftAnchor.end, rightAnchor.start] within same cell
        let leftAnchorRange: ResolvedRange | undefined;
        for (let l = domIdx - 1; l >= 0; l--) {
          const lEl = allDomLeaves[l];
          if (getEnclosingCell(lEl) !== elCell) break;
          const r = getMathJaxElementRange(lEl);
          if (r) {
            leftAnchorRange = r;
            break;
          }
        }
        let rightAnchorRange: ResolvedRange | undefined;
        for (let rIdx = domIdx + 1; rIdx < allDomLeaves.length; rIdx++) {
          const rEl = allDomLeaves[rIdx];
          if (getEnclosingCell(rEl) !== elCell) break;
          const r = getMathJaxElementRange(rEl);
          if (r) {
            rightAnchorRange = r;
            break;
          }
        }
        if (leftAnchorRange) {
          if (node.start >= leftAnchorRange.start) {
            score += 15;
          } else {
            score -= 50; // Anti-inversion penalty
          }
        }
        if (rightAnchorRange) {
          if (node.end <= rightAnchorRange.end) {
            score += 15;
          } else {
            score -= 50; // Anti-inversion penalty
          }
        }
        if (
          leftAnchorRange &&
          rightAnchorRange &&
          leftAnchorRange.end <= rightAnchorRange.start &&
          node.start >= leftAnchorRange.end &&
          node.end <= rightAnchorRange.start
        ) {
          score += 35; // Strictly bracketed between verified left & right anchors!
        }

        // 4. Compound differential partner (dx, dt)
        if (node.compoundPartner) {
          const prevDom = domIdx > 0 ? allDomLeaves[domIdx - 1] : null;
          const nextDom = domIdx + 1 < allDomLeaves.length ? allDomLeaves[domIdx + 1] : null;
          if (
            (prevDom && isLeafTextMatch(getElementText(prevDom), node.compoundPartner, latex)) ||
            (nextDom && isLeafTextMatch(getElementText(nextDom), node.compoundPartner, latex))
          ) {
            score += 25;
          }
        }

        return score;
      };

      const scoredCands: Array<{ idx: number; score: number }> = [];
      for (let i = 0; i < leafEls.length; i++) {
        if (isCandEligible(leafEls[i])) {
          scoredCands.push({ idx: i, score: scoreCandidate(i) });
        }
      }
      if (scoredCands.length === 0) continue;

      scoredCands.sort((a, b) => b.score - a.score);
      const kind = node.kind === "text" ? "text" : "leaf";

      // Retry across ranked candidates until one passes the Final Stamp Gate
      for (const cand of scoredCands) {
        const matchingEl = leafEls[cand.idx];
        if (stampElement(matchingEl, node.start, node.end, kind, latex, sourceMap)) {
          consumedNodes.add(node);
          newlyStampedInPass++;
          if (cand.idx >= cursor) {
            cursor = cand.idx + 1;
          }
          const childGlyphs = Array.from(matchingEl.querySelectorAll("mjx-c"));
          for (const glyph of childGlyphs) {
            stampElement(glyph, node.start, node.end, kind, latex, sourceMap);
          }
          const parentMover = typeof matchingEl.closest === "function"
            ? matchingEl.closest("mjx-mover, mjx-munder, mjx-munderover")
            : null;
          if (parentMover && container.contains(parentMover)) {
            stampElement(parentMover, node.start, node.end, kind, latex, sourceMap);
          }
          break;
        }
      }
    }

    if (newlyStampedInPass === 0) break;
  }
}

/**
 * Main Entry Point: Synchronously walks MathJax CHTML element and stamps
 * concrete source range coordinates (cm-src-<start>-<end>) using CST metadata.
 *
 * @param container The root MathJax HTMLElement (e.g. <mjx-container>)
 * @param latex The raw LaTeX math string being rendered
 */
export function stampMathJaxDOM(container: Element, latex: string): void {
  if (!container || !latex || latex.length === 0) return;

  try {
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();
    if (!ast || ast.length === 0) return;

    // 1. Primary 4D Spatial Coordinate Tensor & Structural Tree Reconciliation
    const reconciledNodes = reconcileSpatialTensor(container, ast, latex);

    // 2. Ensure all 2D cell containers carry the hover/click target class
    const rawMtdEls = Array.from(container.querySelectorAll("mjx-mtd, mjx-linebox"));
    for (const mtd of rawMtdEls) {
      mtd.classList.add("color-math-cell-target");
    }

    // 3. Verification-gated leaf recovery pass (skipping nodes already bound by the 4D Tree Engine)
    const leafNodes = collectLeaves(ast);
    stampLeaves(container, leafNodes, reconciledNodes, latex);

    // 4. Upgrade Method 1 (cm-src) & Method 2 (WeakMap) on MathJax Error Elements (<mjx-merror>)
    const errorEls = Array.from(container.querySelectorAll("mjx-merror"));
    for (const errorEl of errorEls) {
      const errText = (errorEl.textContent || "").trim();
      const macroMatch = errText.match(/\\[a-zA-Z]+(?:\{[a-zA-Z0-9*]+\})?/);
      if (macroMatch) {
        const cmd = macroMatch[0];
        const idx = latex.indexOf(cmd);
        if (idx >= 0) {
          stampElement(errorEl, idx, idx + cmd.length, "leaf", latex);
          const childTexts = Array.from(errorEl.querySelectorAll("mjx-mtext, mjx-c"));
          for (const ch of childTexts) {
            stampElement(ch, idx, idx + cmd.length, "leaf", latex);
          }
        }
      } else {
        const diags = parser.getDiagnostics();
        if (diags.length > 0) {
          stampElement(errorEl, diags[0].start, diags[0].end, "leaf", latex);
        }
      }
    }
  } catch (err) {
    // Fail-safe: Never crash rendering if CST alignment encounters unexpected syntax
    console.debug("Color Math: stampMathJaxDOM non-fatal alignment failure:", err);
  }
}
