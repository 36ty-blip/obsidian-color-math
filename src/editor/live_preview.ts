// src/editor/live_preview.ts

import { RangeSetBuilder, Text } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  keymap,
} from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";
import { ColorPalette, ColorMathOptions } from "../config";
import { computeSemanticMathSpans } from "../converters/generic";
import { scanMarkdown } from "../parsers/markdown_scanner";
import { containsColorWrapper } from "../utils/latex_helpers";
import { ColorSpan, selectColorSpans, flattenColorSpans } from "../utils/spans";
import { getCachedOrComputedSpans } from "../parsers/engine_bridge";
import { resolveOnDemandRange, ResolvedRange } from "./lazy_navigation";
import { getMathJaxElementRange, indexMathJaxElement } from "./weakmap_index";
import { highlightSelectionInMathContainer } from "./inline_tooltip";
import {
  findNearestTokenGeodesic,
  collectContainerTokens,
  collectCSTContainerTokens,
  resolveOrthogonalKeyboardStep,
  findFractionPartnerInLatex,
} from "./quaternion";

function findSafeBlockBoundaryStart(doc: Text, initialStart: number): number {
  const line = doc.lineAt(initialStart);
  const startOffset = line.from;
  if (startOffset === 0) return 0;

  let inFence = false;
  let fenceStart = -1;
  let inMath = false;
  let mathStart = -1;

  const cur = line.number;
  const lookbackLimit = Math.max(1, cur - 60);

  for (let l = lookbackLimit; l <= cur; l++) {
    const text = doc.line(l).text.trim();
    if (text.startsWith("```") || text.startsWith("~~~")) {
      inFence = !inFence;
      if (inFence) fenceStart = doc.line(l).from;
      else fenceStart = -1;
    } else if (!inFence && text.includes("$$")) {
      const count = (text.match(/\$\$/g) || []).length;
      if (count % 2 !== 0) {
        inMath = !inMath;
        if (inMath) mathStart = doc.line(l).from;
        else mathStart = -1;
      }
    }
  }

  if (inFence && fenceStart !== -1) return fenceStart;
  if (inMath && mathStart !== -1) return mathStart;
  return startOffset;
}

function findSafeBlockBoundaryEnd(doc: Text, initialEnd: number): number {
  const line = doc.lineAt(initialEnd);
  let endOffset = line.to;
  if (endOffset >= doc.length) return doc.length;

  const cur = line.number;
  const lookaheadLimit = Math.min(doc.lines, cur + 60);

  for (let l = cur; l <= lookaheadLimit; l++) {
    const text = doc.line(l).text.trim();
    if (text.startsWith("```") || text.startsWith("~~~")) {
      endOffset = doc.line(l).to;
      break;
    }
    if (text.includes("$$")) {
      endOffset = doc.line(l).to;
      break;
    }
  }

  return endOffset;
}

/**
 * Window-scoped O(1) math block lookup around a document position.
 * Uses findSafeBlockBoundaryStart and findSafeBlockBoundaryEnd (+/- 60 lines)
 * to avoid full-document doc.toString() allocations and O(N) markdown scans on 144Hz pointer hovers.
 */
function findMathBlockAtPos(
  doc: Text,
  targetPos: number,
  useContentBounds = false,
  expectedLatex?: string | null
): { start: number; end: number; contentStart: number; contentEnd: number; bodyText: string } | null {
  if (targetPos < 0 || targetPos > doc.length) return null;
  const safeStart = doc.length > 4000 ? findSafeBlockBoundaryStart(doc, targetPos) : 0;
  const safeEnd = doc.length > 4000 ? findSafeBlockBoundaryEnd(doc, targetPos) : doc.length;
  const sliceText = doc.sliceString(safeStart, safeEnd);
  const relPos = targetPos - safeStart;

  const scan = scanMarkdown(sliceText);
  const allMath = [...scan.mathBlocks, ...scan.mathInlines];

  const distToSpan = (m: { start: number; end: number }) => {
    if (relPos >= m.start && relPos <= m.end) return 0;
    return Math.min(Math.abs(relPos - m.start), Math.abs(relPos - m.end));
  };

  let match: (typeof allMath)[number] | undefined;

  if (expectedLatex && expectedLatex.trim()) {
    const trimmedExpected = expectedLatex.trim();
    const latexCandidates = allMath.filter(
      (m) => sliceText.slice(m.contentStart, m.contentEnd).trim() === trimmedExpected
    );
    if (latexCandidates.length === 1) {
      match = latexCandidates[0];
    } else if (latexCandidates.length > 1) {
      match =
        latexCandidates.find((m) => relPos >= m.start && relPos < m.end) ||
        latexCandidates.find((m) => relPos >= m.start && relPos <= m.end) ||
        latexCandidates.reduce((best, cur) => (distToSpan(cur) < distToSpan(best) ? cur : best));
    }
  }

  if (!match) {
    if (useContentBounds) {
      match =
        allMath.find((m) => relPos >= m.contentStart && relPos < m.contentEnd) ||
        allMath.find((m) => relPos >= m.contentStart && relPos <= m.contentEnd);
    } else {
      match =
        allMath.find((m) => relPos >= m.start && relPos < m.end) ||
        allMath.find((m) => relPos >= m.start && relPos <= m.end);
      if (!match) {
        const nearby = allMath.filter((m) => distToSpan(m) <= 15);
        if (nearby.length > 0) {
          match = nearby.reduce((best, cur) => (distToSpan(cur) < distToSpan(best) ? cur : best));
        }
      }
    }
  }

  if (!match) return null;
  return {
    start: safeStart + match.start,
    end: safeStart + match.end,
    contentStart: safeStart + match.contentStart,
    contentEnd: safeStart + match.contentEnd,
    bodyText: sliceText.slice(match.contentStart, match.contentEnd),
  };
}

export function createColorMathLivePlugin(
  getPalette: () => ColorPalette,
  isEnabled: () => boolean,
  getOptions?: () => ColorMathOptions
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      hoverDecorations: DecorationSet = Decoration.none;
      lastScrollTime: number = 0;
      lastScrollPos: number = 0;
      view: EditorView;
      handleMouseDown: (event: MouseEvent) => void;
      handleMouseMove: (event: MouseEvent) => void;
      handleMouseUp: (event: MouseEvent) => void;
      handleClick: (event: MouseEvent) => void;
      handlePointerOver: (event: PointerEvent) => void;
      handlePointerOut: (event: PointerEvent) => void;
      hoveredTarget: HTMLElement | null = null;
      hoverCodeDecoration: { from: number; to: number } | null = null;
      pendingNavigationSelection: { anchor: number; head: number } | null = null;
      lastNavigationSelection: { anchor: number; head: number } | null = null;
      suppressNextClick: boolean = false;

      constructor(view: EditorView) {
        this.view = view;
        this.decorations = this.buildDecorations(view);

        this.handleMouseDown = (event: MouseEvent) => {
          this.onMouseDown(event);
        };
        this.handleMouseMove = (event: MouseEvent) => {
          this.onMouseMove(event);
        };
        this.handleMouseUp = (event: MouseEvent) => {
          this.onMouseUp(event);
        };
        this.handleClick = (event: MouseEvent) => {
          this.onClick(event);
        };
        this.handlePointerOver = (event: PointerEvent) => {
          this.onPointerOver(event);
        };
        this.handlePointerOut = (event: PointerEvent) => {
          this.onPointerOut(event);
        };

        view.dom.addEventListener("mousedown", this.handleMouseDown, { capture: true });
        view.dom.addEventListener("mousemove", this.handleMouseMove, { capture: true });
        view.dom.addEventListener("mouseup", this.handleMouseUp, { capture: true });
        view.dom.addEventListener("click", this.handleClick, { capture: true });
        view.dom.addEventListener("pointerover", this.handlePointerOver, { capture: true });
        view.dom.addEventListener("pointerout", this.handlePointerOut, { capture: true });

        this.syncSelectionToRenderedMath(view);
      }

      destroy() {
        this.view.dom.removeEventListener("mousedown", this.handleMouseDown, { capture: true });
        this.view.dom.removeEventListener("mousemove", this.handleMouseMove, { capture: true });
        this.view.dom.removeEventListener("mouseup", this.handleMouseUp, { capture: true });
        this.view.dom.removeEventListener("click", this.handleClick, { capture: true });
        this.view.dom.removeEventListener("pointerover", this.handlePointerOver, { capture: true });
        this.view.dom.removeEventListener("pointerout", this.handlePointerOut, { capture: true });
        if (this.hoveredTarget) {
          this.hoveredTarget.classList.remove("color-math-hover-target");
          this.hoveredTarget = null;
        }
        if (this.hoverCodeDecoration) {
          this.hoverCodeDecoration = null;
          this.hoverDecorations = Decoration.none;
        }
      }

      private onPointerOver(event: PointerEvent) {
        const options = getOptions ? getOptions() : undefined;
        if (options?.targetedMathNavigation === false) return;
        const target = event.target as HTMLElement | null;
        if (!target) return;

        // Pure Method 3: Resolve any native MathJax CHTML element directly
        const targetEl = target.closest<HTMLElement>(
          "mjx-num, mjx-den, mjx-script, mjx-sqrt, mjx-box, mjx-mtd, mjx-mi, mjx-mn, mjx-mo, mjx-mtext, mjx-c"
        );
        if (targetEl && targetEl !== this.hoveredTarget) {
          if (this.hoveredTarget) {
            this.hoveredTarget.classList.remove("color-math-hover-target");
          }
          this.hoveredTarget = targetEl;
          targetEl.classList.add("color-math-hover-target");

          // Live Hover -> Code Highlighting
          const container = targetEl.closest<HTMLElement>(".MathJax, mjx-container");
          if (container) {
            const tooltipHost = container.closest<HTMLElement>(".color-math-inline-tooltip");
            const contentStartAttr =
              container.getAttribute("data-math-content-start") ||
              tooltipHost?.getAttribute("data-math-content-start");
            const expectedLatex =
              container.getAttribute("data-math-latex") ||
              tooltipHost?.getAttribute("data-math-latex");

            let clickPos: number | null = null;
            let useContentBounds = false;
            if (contentStartAttr !== null && contentStartAttr !== undefined) {
              const parsed = parseInt(contentStartAttr, 10);
              if (!Number.isNaN(parsed)) {
                clickPos = parsed;
                useContentBounds = true;
              }
            }
            if (clickPos === null) {
              try {
                clickPos = this.view.posAtDOM(container);
              } catch {
                clickPos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
              }
            }
            if (clickPos !== null && clickPos >= 0) {
              const block = findMathBlockAtPos(
                this.view.state.doc,
                clickPos,
                useContentBounds,
                expectedLatex
              );
              if (block) {
                const bodyText = block.bodyText;
                const debugParity = Boolean((options as any)?.debugNavigationParity);

                // Method 2: In-Memory WeakMap / Clone-Proof Attribute Lookup (~20-180 ns)
                const m2Range = getMathJaxElementRange(targetEl);

                // Short-circuit Method 1 & Method 3 unless M2 missed or debugNavigationParity is active
                let m1Range: { start: number; end: number } | null = null;
                if (!m2Range || debugParity) {
                  const m1Match = targetEl.closest<HTMLElement>('[class*="cm-src-"]')?.className.match(/cm-src-(\d+)-(\d+)/);
                  m1Range = m1Match ? { start: parseInt(m1Match[1], 10), end: parseInt(m1Match[2], 10) } : null;
                }

                const m3Range = (!m2Range && !m1Range) || debugParity
                  ? resolveOnDemandRange(targetEl, container, bodyText)
                  : null;

                // Tri-Parity Shadow Verification Log (when debugNavigationParity is active)
                if (debugParity && m1Range && m2Range && m3Range) {
                  const parity = m1Range.start === m2Range.start && m2Range.start === m3Range.start &&
                                 m1Range.end === m2Range.end && m2Range.end === m3Range.end;
                  console.debug(
                    `[Color Math Tri-Engine Parity] M2: [${m2Range.start}, ${m2Range.end}] | M1: [${m1Range.start}, ${m1Range.end}] | M3: [${m3Range.start}, ${m3Range.end}] => PARITY: ${parity ? "MATCH ✅" : "DIFF ⚠️"}`
                  );
                }

                // Resolution Cascade: Tier 1 (M2) -> Tier 2 (M1) -> Tier 3 (M3)
                const res = m2Range || m1Range || m3Range;
                if (res) {
                  // If M2 was a miss, backfill WeakMap and DOM attribute for future nanosecond hits
                  if (!m2Range) {
                    const kind: ResolvedRange["kind"] = "kind" in res && typeof res.kind === "string" ? (res.kind as ResolvedRange["kind"]) : "leaf";
                    indexMathJaxElement(targetEl, { start: res.start, end: res.end, kind });
                  }

                  const nextFrom = block.contentStart + res.start;
                  const nextTo = block.contentStart + res.end;
                  if (
                    !this.hoverCodeDecoration ||
                    this.hoverCodeDecoration.from !== nextFrom ||
                    this.hoverCodeDecoration.to !== nextTo
                  ) {
                    this.hoverCodeDecoration = { from: nextFrom, to: nextTo };
                    this.hoverDecorations = Decoration.set([
                      Decoration.mark({
                        class: "color-math-code-hover-highlight",
                      }).range(nextFrom, nextTo),
                    ]);
                    this.view.dispatch({});
                  }
                }
              }
            }
          }
        }
      }

      private onPointerOut(event: PointerEvent) {
        if (this.hoveredTarget) {
          const related = event.relatedTarget as Node | null;
          if (!related || !this.hoveredTarget.contains(related)) {
            this.hoveredTarget.classList.remove("color-math-hover-target");
            this.hoveredTarget = null;
            if (this.hoverCodeDecoration) {
              this.hoverCodeDecoration = null;
              this.hoverDecorations = Decoration.none;
              this.view.dispatch({});
            }
          }
        }
      }

      private applyNavigationSelection(anchor: number, head: number) {
        const sel = { anchor, head };
        this.pendingNavigationSelection = sel;
        this.lastNavigationSelection = sel;
        this.suppressNextClick = true;

        this.view.dispatch({
          selection: sel,
          scrollIntoView: true,
          userEvent: "select",
        });
        this.view.focus();

        // Guard against Obsidian inline-math widget unfold resetting selection on the next frame
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => {
            if (this.lastNavigationSelection === sel) {
              const cur = this.view.state.selection.main;
              if (cur.anchor !== sel.anchor || cur.head !== sel.head) {
                this.view.dispatch({
                  selection: sel,
                  scrollIntoView: true,
                });
              }
            }
          });
        }
      }

      private onMouseDown(event: MouseEvent) {
        if (event.button !== 0) return; // Primary left click only

        // Guardrail: Yield immediately to Obsidian if event was already handled or if user is Ctrl/Cmd-clicking (link opening)
        if (event.defaultPrevented || event.ctrlKey || event.metaKey) {
          return;
        }

        const options = getOptions ? getOptions() : undefined;
        if (options?.targetedMathNavigation === false) return;

        const target = event.target as HTMLElement | null;
        if (!target) return;

        const container = target.closest<HTMLElement>(".MathJax, mjx-container");
        if (!container) return;

        // 1. Check if user clicked on or inside a stamped token
        const sourceEl = target.closest<HTMLElement>('[class*="cm-src-"]');
        const match = sourceEl?.className.match(/cm-src-(\d+)-(\d+)/);

        // 2. Find the document position of this math container in CodeMirror
        const tooltipHost = container.closest<HTMLElement>(".color-math-inline-tooltip");
        const contentStartAttr =
          container.getAttribute("data-math-content-start") ||
          tooltipHost?.getAttribute("data-math-content-start");
        const expectedLatex =
          container.getAttribute("data-math-latex") ||
          tooltipHost?.getAttribute("data-math-latex");

        let clickPos: number | null = null;
        let useContentBounds = false;
        if (contentStartAttr !== null && contentStartAttr !== undefined) {
          const parsed = parseInt(contentStartAttr, 10);
          if (!Number.isNaN(parsed)) {
            clickPos = parsed;
            useContentBounds = true;
          }
        }
        if (clickPos === null) {
          try {
            clickPos = this.view.posAtDOM(container);
          } catch {
            clickPos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
          }
        }
        if (clickPos === null || clickPos < 0) return;

        // Find the math block at clickPos in the document via O(1) window-scoped scan
        const block = findMathBlockAtPos(
          this.view.state.doc,
          clickPos,
          useContentBounds,
          expectedLatex
        );
        if (!block) return;

        const bodyStart = block.contentStart;
        const bodyText = block.bodyText;
        const debugParity = Boolean((options as any)?.debugNavigationParity);

        // Method 2: In-Memory WeakMap / Clone-Proof Attribute Lookup (~20-180 ns)
        const m2Range = getMathJaxElementRange(target);

        // Method 1: DOM Class Provenance (~1.5 µs) - short-circuited when M2 hits unless debugParity is active
        const m1Range = (!m2Range || debugParity) && match
          ? { start: parseInt(match[1], 10), end: parseInt(match[2], 10) }
          : null;

        // Method 3: On-Demand CST Resolution (~35 µs) - short-circuited when M2 or M1 hits unless debugParity is active
        const m3Range = (!m2Range && !m1Range) || debugParity
          ? resolveOnDemandRange(target, container, bodyText)
          : null;

        // Tri-Parity Shadow Verification Log (when debugNavigationParity is active)
        if (debugParity && m1Range && m2Range && m3Range) {
          const parity = m1Range.start === m2Range.start && m2Range.start === m3Range.start &&
                         m1Range.end === m2Range.end && m2Range.end === m3Range.end;
          console.debug(
            `[Color Math Tri-Engine Parity] M2: [${m2Range.start}, ${m2Range.end}] | M1: [${m1Range.start}, ${m1Range.end}] | M3: [${m3Range.start}, ${m3Range.end}] => PARITY: ${parity ? "MATCH ✅" : "DIFF ⚠️"}`
          );
        }

        // Resolution Cascade: Tier 1 (M2) -> Tier 2 (M1) -> Tier 3 (M3)
        let resolved = m2Range || m1Range || m3Range;

        // Tier 4: Quaternion Geodesic Whitespace Snapping (< 50 µs)
        if (!resolved) {
          const geodesicCandidate = findNearestTokenGeodesic(container, event.clientX, event.clientY, target);
          if (geodesicCandidate) {
            resolved = geodesicCandidate.range;
          }
        }

        if (resolved) {
          if (!m2Range) {
            const kind: ResolvedRange["kind"] = "kind" in resolved && typeof resolved.kind === "string" ? (resolved.kind as ResolvedRange["kind"]) : "leaf";
            indexMathJaxElement(target, { start: resolved.start, end: resolved.end, kind });
          }

          let startRel = resolved.start;
          let endRel = resolved.end;

          // Multi-Scale W-Plane Expansion:
          // If Alt is held or repeated click (double-click / triple-click), expand scale hierarchy
          const scales = (resolved as any).scales;
          if (scales) {
            if (event.detail >= 3) {
              // W=3: Structural Molecule (e.g. entire fraction or root)
              startRel = scales.molecule.start;
              endRel = scales.molecule.end;
            } else if (event.detail === 2 || event.altKey) {
              // W=2: Baseline Slot (e.g. whole numerator or whole denominator)
              startRel = scales.slot.start;
              endRel = scales.slot.end;
            }
          }

          const targetAnchor = bodyStart + startRel;
          const targetHead = bodyStart + endRel;

          // Prevent Obsidian's default full-block / inline-widget collapse
          event.preventDefault();
          event.stopPropagation();

          this.applyNavigationSelection(targetAnchor, targetHead);
          return;
        }

        // 3. Fallback: User clicked in an empty space, divider, or gap inside the math container
        const allTokens = Array.from(container.querySelectorAll('[class*="cm-src-"]'));
        if (allTokens.length > 0) {
          const clientX = event.clientX;
          let bestPredecessor: { end: number; rect: DOMRect } | null = null;
          let bestSuccessor: { start: number; rect: DOMRect } | null = null;

          for (const el of allTokens) {
            const m = el.className.match(/cm-src-(\d+)-(\d+)/);
            if (!m) continue;
            const s = parseInt(m[1], 10);
            const e = parseInt(m[2], 10);
            const r = el.getBoundingClientRect();
            if (r.right <= clientX) {
              if (!bestPredecessor || r.right > bestPredecessor.rect.right) {
                bestPredecessor = { end: e, rect: r };
              }
            }
            if (r.left >= clientX) {
              if (!bestSuccessor || r.left < bestSuccessor.rect.left) {
                bestSuccessor = { start: s, rect: r };
              }
            }
          }

          let gapOffset = 0;
          if (bestPredecessor && bestSuccessor) {
            gapOffset = Math.round((bestPredecessor.end + bestSuccessor.start) / 2);
          } else if (bestPredecessor) {
            gapOffset = bestPredecessor.end;
          } else if (bestSuccessor) {
            gapOffset = bestSuccessor.start;
          }

          if (gapOffset >= 0) {
            const targetPos = bodyStart + gapOffset;
            event.preventDefault();
            event.stopPropagation();

            this.applyNavigationSelection(targetPos, targetPos);
            return;
          }
        }
      }

      private onMouseMove(event: MouseEvent) {
        if (this.pendingNavigationSelection) {
          // Suppress CodeMirror drag-selection over newly unfolded inline math raw text
          event.preventDefault();
          event.stopPropagation();
        }
      }

      private onMouseUp(event: MouseEvent) {
        if (this.pendingNavigationSelection) {
          const sel = this.pendingNavigationSelection;
          this.pendingNavigationSelection = null;
          event.preventDefault();
          event.stopPropagation();

          this.view.dispatch({
            selection: sel,
            scrollIntoView: true,
          });
          this.view.focus();

          if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => {
              if (this.lastNavigationSelection === sel) {
                const cur = this.view.state.selection.main;
                if (cur.anchor !== sel.anchor || cur.head !== sel.head) {
                  this.view.dispatch({
                    selection: sel,
                    scrollIntoView: true,
                  });
                }
              }
            });
          }
        }
      }

      private onClick(event: MouseEvent) {
        const target = event.target as HTMLElement | null;
        const isMath = target?.closest<HTMLElement>(".MathJax, mjx-container, .color-math-hover-target");
        if (this.suppressNextClick || isMath) {
          this.suppressNextClick = false;
          // Suppress Obsidian widget's default click handler from resetting selection
          event.preventDefault();
          event.stopPropagation();
          if (this.lastNavigationSelection) {
            const sel = this.lastNavigationSelection;
            this.lastNavigationSelection = null;
            const cur = this.view.state.selection.main;
            if (cur.anchor !== sel.anchor || cur.head !== sel.head) {
              this.view.dispatch({
                selection: sel,
                scrollIntoView: true,
              });
            }
          }
        }
      }

      private syncSelectionToRenderedMath(view: EditorView) {
        const options = getOptions ? getOptions() : undefined;
        if (options?.targetedMathNavigation === false || !view.dom) return;

        // Clear any previous selection highlights outside of the floating inline tooltip
        // (the inline tooltip manages its own highlight lifecycle)
        const prevSelected = view.dom.querySelectorAll(
          ".color-math-selected-target, .color-math-caret-before, .color-math-caret-after"
        );
        for (const el of Array.from(prevSelected)) {
          if (!el.closest(".color-math-inline-tooltip")) {
            el.classList.remove(
              "color-math-selected-target",
              "color-math-caret-before",
              "color-math-caret-after"
            );
          }
        }

        const sel = view.state.selection.main;
        const block = findMathBlockAtPos(view.state.doc, sel.head, false);
        if (!block) return;

        // Check if cursor / selection is actually inside this math block or inline math
        if (sel.from < block.start || sel.to > block.end) return;

        const relFrom = Math.max(0, Math.min(block.bodyText.length, sel.from - block.contentStart));
        const relTo = Math.max(relFrom, Math.min(block.bodyText.length, sel.to - block.contentStart));

        const containers = Array.from(
          view.dom.querySelectorAll<HTMLElement>(".MathJax, mjx-container")
        ).filter((c) => !c.closest(".color-math-inline-tooltip"));

        if (containers.length === 0) return;

        const trimmedBody = block.bodyText.trim();
        let targetContainer: HTMLElement | null = null;
        let bestDist = Infinity;

        // 1. Prefer container with matching `data-math-latex` closest to the block in the document
        for (const c of containers) {
          const attrLatex = c.getAttribute("data-math-latex")?.trim();
          if (attrLatex && attrLatex === trimmedBody) {
            try {
              const pos = view.posAtDOM(c);
              const dist =
                pos >= block.start && pos <= block.end
                  ? 0
                  : Math.min(Math.abs(pos - block.start), Math.abs(pos - block.end));
              if (dist < bestDist) {
                bestDist = dist;
                targetContainer = c;
              }
            } catch {
              if (!targetContainer) targetContainer = c;
            }
          }
        }

        // 2. Fallback: find container whose DOM position falls within or immediately adjacent to [block.start, block.end]
        if (!targetContainer) {
          for (const c of containers) {
            try {
              const pos = view.posAtDOM(c);
              const dist =
                pos >= block.start && pos <= block.end
                  ? 0
                  : Math.min(Math.abs(pos - block.start), Math.abs(pos - block.end));
              if (dist <= 5 && dist < bestDist) {
                bestDist = dist;
                targetContainer = c;
              }
            } catch {
              // Ignore detached
            }
          }
        }

        if (targetContainer) {
          highlightSelectionInMathContainer(targetContainer, relFrom, relTo);
        }
      }

      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = this.decorations.map(update.changes);
        }
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = this.buildDecorations(update.view);
          this.syncSelectionToRenderedMath(update.view);
          if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => {
              this.syncSelectionToRenderedMath(update.view);
            });
          }
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        if (!isEnabled()) {
          return Decoration.none;
        }

        try {
          const builder = new RangeSetBuilder<Decoration>();
          const doc = view.state.doc;
          const palette = getPalette();
          const options = getOptions ? getOptions() : undefined;

          const isLivePreview = (() => {
            try {
              return typeof editorLivePreviewField !== "undefined" && Boolean(view.state.field(editorLivePreviewField, false));
            } catch {
              return false;
            }
          })();

          // When document is larger than 1 screen and visible ranges exist,
          // use velocity-adaptive overscanning with airtight delimiter/fence expansion
          let text: string;
          let offset = 0;

          if (doc.length > 4000 && view.visibleRanges.length > 0) {
            let minFrom = Infinity;
            let maxTo = -Infinity;
            for (const r of view.visibleRanges) {
              if (r.from < minFrom) minFrom = r.from;
              if (r.to > maxTo) maxTo = r.to;
            }

            const now = Date.now();
            let isFastScrolling = false;
            if (this.lastScrollTime > 0) {
              const dt = now - this.lastScrollTime;
              const dp = Math.abs(minFrom - this.lastScrollPos);
              if (dt < 200 && dp > 2000) {
                isFastScrolling = true;
              }
            }
            this.lastScrollTime = now;
            this.lastScrollPos = minFrom;

            const screenLength = Math.max(1500, maxTo - minFrom);
            // Normal typing: 1 screen buffer above & below (total 3 screens)
            // Fast scrolling: 2.5 screens buffer above & below (total 6 screens)
            const bufferMultiplier = isFastScrolling ? 2.5 : 1.0;
            const buffer = Math.max(2500, Math.round(screenLength * bufferMultiplier));

            const rawStart = Math.max(0, minFrom - buffer);
            const rawEnd = Math.min(doc.length, maxTo + buffer);

            const safeStart = findSafeBlockBoundaryStart(doc, rawStart);
            const safeEnd = findSafeBlockBoundaryEnd(doc, rawEnd);

            text = doc.sliceString(safeStart, safeEnd);
            offset = safeStart;
          } else {
            text = doc.toString();
          }

          const scan = scanMarkdown(text);
          const mathBlocks = options?.highlightDisplayMath !== false ? scan.mathBlocks : [];
          const mathInlines = options?.highlightInlineMath !== false ? scan.mathInlines : [];
          const allMath = [...mathBlocks, ...mathInlines].sort((a, b) => a.start - b.start);

          const visibleMath: typeof allMath = [];
          for (const block of allMath) {
            const blockStart = offset + block.start;
            const blockEnd = offset + block.end;
            const isVisible =
              view.visibleRanges.length === 0 ||
              view.visibleRanges.some(
                (r) => Math.max(r.from, blockStart) <= Math.min(r.to, blockEnd)
              );
            if (isVisible) {
              visibleMath.push(block);
            }
          }

          let targetMath: typeof allMath = visibleMath;
          if (isLivePreview && visibleMath.length > 3) {
            const cursor = view.state.selection.main.head;
            let activeVisibleIdx = -1;
            for (let i = 0; i < visibleMath.length; i++) {
              const bStart = offset + visibleMath[i].start;
              const bEnd = offset + visibleMath[i].end;
              if (cursor >= bStart && cursor <= bEnd) {
                activeVisibleIdx = i;
                break;
              }
            }

            if (activeVisibleIdx !== -1) {
              const startIdx = Math.max(0, activeVisibleIdx - 1);
              const endIdx = Math.min(visibleMath.length, activeVisibleIdx + 2);
              targetMath = visibleMath.slice(startIdx, endIdx);
            } else {
              let closestIdx = 0;
              let minDistance = Infinity;
              for (let i = 0; i < visibleMath.length; i++) {
                const bCenter = offset + (visibleMath[i].start + visibleMath[i].end) / 2;
                const dist = Math.abs(cursor - bCenter);
                if (dist < minDistance) {
                  minDistance = dist;
                  closestIdx = i;
                }
              }
              const startIdx = Math.max(0, closestIdx - 1);
              const endIdx = Math.min(visibleMath.length, closestIdx + 2);
              targetMath = visibleMath.slice(startIdx, endIdx);
            }
          }

          const pendingDecorations: { from: number; to: number; decoration: Decoration }[] = [];

          for (const block of targetMath) {
            try {
              const blockStart = offset + block.contentStart;

              const body = text.slice(block.contentStart, block.contentEnd);
              if (containsColorWrapper(body)) continue;

          const selected = getCachedOrComputedSpans(body, palette, options, () => {
            const allSpans = computeSemanticMathSpans(body, palette, options, false);

            // Exclude internal spans falling strictly within double-quoted string literals ("...")
            // while preserving script spans (priority: 10) covering the entire quoted string (e.g. x^"exp" or x_"label")
            // and ALWAYS preserving unmatched delimiter warnings & syntax errors (priority >= 90)
            let activeSpans = allSpans;
            if (body.includes('"')) {
              const quoteSpans: { start: number; end: number }[] = [];
              let qi = 0;
              while (qi < body.length) {
                if (body.charCodeAt(qi) === 34) {
                  let qj = qi + 1;
                  let depth = 0;
                  let closed = false;
                  while (qj < body.length) {
                    if (body.startsWith("$$", qj)) break;
                    if (body[qj] === "\\") {
                      qj += 2;
                      continue;
                    }
                    if (body.charCodeAt(qj) === 34) {
                      qj++;
                      closed = true;
                      break;
                    }
                    if (body[qj] === "{") {
                      depth++;
                    } else if (body[qj] === "}") {
                      if (depth > 0) {
                        depth--;
                      } else {
                        break;
                      }
                    }
                    qj++;
                  }
                  if (closed) {
                    quoteSpans.push({ start: qi, end: qj });
                  }
                  qi = qj;
                  continue;
                }
                qi++;
              }
              if (quoteSpans.length > 0) {
                activeSpans = allSpans.filter((s) => {
                  // Always preserve unmatched delimiter warnings & syntax errors (priority >= 90)
                  if ((s.priority ?? 0) >= 90) {
                    return true;
                  }
                  // If span precisely covers or encloses the quoted literal and is a script span, preserve it!
                  if (s.priority === 10 && quoteSpans.some((q) => s.start <= q.start && s.end >= q.end)) {
                    return true;
                  }
                  // Otherwise, drop any span overlapping with the quote
                  return !quoteSpans.some((q) => s.start < q.end && s.end > q.start);
                });
              }
            }

            const selected = selectColorSpans(body, activeSpans);
            return flattenColorSpans(selected);
          });

          // Spans are now strictly non-overlapping and sorted for CodeMirror RangeSetBuilder
          const nonOverlapping = selected;

          let unmatchedCount = 0;
          for (const span of nonOverlapping) {
            const from = blockStart + span.start;
            const to = blockStart + span.end;
            if (from < to && to <= doc.length) {
              const isUnmatched = (span.priority ?? 0) >= 90;
              if (isUnmatched) {
                unmatchedCount++;
                if (unmatchedCount > 15) continue;
              }
              const colorVal = span.color ? span.color.trim().toLowerCase() : "";
              const isNone =
                !colorVal ||
                colorVal === "none" ||
                colorVal === "off" ||
                colorVal === "transparent" ||
                colorVal === "default";

              const tokenText = body.slice(span.start, span.end);
              const isRawAmbiguousLetterOp =
                tokenText === "xxx" ||
                tokenText === "vvv" ||
                tokenText === "uuu" ||
                tokenText === "nnn" ||
                tokenText === "xx" ||
                tokenText === "vv" ||
                tokenText === "uu" ||
                tokenText === "nn";

              if (isNone && !isUnmatched) {
                // If it's a raw ambiguous letter shorthand (xx, xxx, vv, vvv, uu, uuu, nn, nnn) when set to "none",
                // apply upright contrast style so Obsidian does not render it as italic single variables.
                // Operators with explicit punctuation (o+, ox, o., +-, -+) step aside completely to inherit natural theme styling.
                if (isRawAmbiguousLetterOp) {
                  const cls = "color-math-live-token color-math-operator-contrast";
                  pendingDecorations.push({
                    from,
                    to,
                    decoration: Decoration.mark({
                      class: cls,
                    }),
                  });
                }
                // For functions (\sin, \cos, etc.) or any category set to "none":
                // STEP ASIDE COMPLETELY: emit zero decoration so Obsidian's natural theme highlighting remains untouched!
                continue;
              }
              const isStringLiteral =
                span.end - span.start > 1 &&
                body.slice(span.start, span.end).startsWith('"') &&
                body.slice(span.start, span.end).endsWith('"');
              let cls = "color-math-live-token";
              if (isUnmatched) cls += " color-math-unmatched-delimiter";
              if (isStringLiteral) cls += " color-math-string-literal";
              const roleVar = (span as any).role
                ? `var(--color-math-role-${(span as any).role}, ${span.color})`
                : span.color;
              pendingDecorations.push({
                from,
                to,
                decoration: Decoration.mark({
                  attributes: {
                    style: `color: ${roleVar};`,
                  },
                  class: cls,
                }),
              });
            }
          }
        } catch (blockErr) {
          console.warn("Color Math block processing error:", blockErr);
        }
      }

      // Add all decorations strictly in sorted order with no overlaps
      pendingDecorations.sort((a, b) => a.from - b.from || a.to - b.to);
      let lastEnd = -1;
      for (const item of pendingDecorations) {
        if (item.from >= lastEnd && item.from < item.to && item.to <= doc.length) {
          builder.add(item.from, item.to, item.decoration);
          lastEnd = item.to;
        }
      }

      return builder.finish();
    } catch (err) {
      console.error("Color Math Live Preview decoration error:", err);
      return Decoration.none;
    }
  }
    },
    {
      decorations: (v) => v.decorations,
      provide: (plugin) =>
        EditorView.decorations.of((view) => view.plugin(plugin)?.hoverDecorations ?? Decoration.none),
    }
  );
}

/**
 * CodeMirror 6 Keymap extension implementing 2D/3D Orthogonal Vector Navigation.
 * Intercepts ArrowUp / ArrowDown inside vertical slots (such as fractions and scripts)
 * to hop between numerators and denominators without cursor trapping.
 */
export function createMathSpatialKeymapExtension(
  getOptions?: () => ColorMathOptions | undefined
) {
  return keymap.of([
    {
      key: "ArrowUp",
      run(view: EditorView) {
        const options = getOptions ? getOptions() : undefined;
        if (options?.enable2dMathNavigation === false) return false;

        const cursor = view.state.selection.main.head;
        const block = findMathBlockAtPos(view.state.doc, cursor, true);
        if (!block) return false;

        const bodyRel = cursor - block.contentStart;
        const bodyText = block.bodyText;

        // Fast Path 1: Direct LaTeX fraction brace jump {x-2} <-> {y-3}
        const directPartner = findFractionPartnerInLatex(bodyText, bodyRel, "up");
        if (directPartner !== null) {
          const nextPos = block.contentStart + directPartner;
          view.dispatch({
            selection: { anchor: nextPos, head: nextPos },
            scrollIntoView: true,
            userEvent: "select",
          });
          return true;
        }

        // Fast Path 2: Rendered DOM MathJax container spatial resolution, with pure-CST fallback for unmounted inline math
        const cmDom = view.dom;
        const containers = Array.from(cmDom.querySelectorAll(".MathJax, mjx-container"));
        let targetContainer: Element | null = null;
        for (const c of containers) {
          try {
            const pos = view.posAtDOM(c);
            if (pos >= block.start && pos <= block.end) {
              targetContainer = c;
              break;
            }
          } catch {
            // Ignore detached elements
          }
        }

        let candidates = targetContainer ? collectContainerTokens(targetContainer) : [];
        if (candidates.length === 0) {
          candidates = collectCSTContainerTokens(bodyText);
        }
        const currentCandidate = candidates.find(
          (c) => bodyRel >= c.range.start && bodyRel <= c.range.end
        );
        if (!currentCandidate || !currentCandidate.range.coord) return false;

        const next = resolveOrthogonalKeyboardStep("up", currentCandidate.range.coord, candidates);
        if (next) {
          const nextPos = block.contentStart + next.range.start;
          view.dispatch({
            selection: { anchor: nextPos, head: nextPos },
            scrollIntoView: true,
            userEvent: "select",
          });
          return true;
        }
        return false;
      },
    },
    {
      key: "ArrowDown",
      run(view: EditorView) {
        const options = getOptions ? getOptions() : undefined;
        if (options?.enable2dMathNavigation === false) return false;

        const cursor = view.state.selection.main.head;
        const block = findMathBlockAtPos(view.state.doc, cursor, true);
        if (!block) return false;

        const bodyRel = cursor - block.contentStart;
        const bodyText = block.bodyText;

        // Fast Path 1: Direct LaTeX fraction brace jump {x-2} <-> {y-3}
        const directPartner = findFractionPartnerInLatex(bodyText, bodyRel, "down");
        if (directPartner !== null) {
          const nextPos = block.contentStart + directPartner;
          view.dispatch({
            selection: { anchor: nextPos, head: nextPos },
            scrollIntoView: true,
            userEvent: "select",
          });
          return true;
        }

        const cmDom = view.dom;
        const containers = Array.from(cmDom.querySelectorAll(".MathJax, mjx-container"));
        let targetContainer: Element | null = null;
        for (const c of containers) {
          try {
            const pos = view.posAtDOM(c);
            if (pos >= block.start && pos <= block.end) {
              targetContainer = c;
              break;
            }
          } catch {
            // Ignore detached
          }
        }

        let candidates = targetContainer ? collectContainerTokens(targetContainer) : [];
        if (candidates.length === 0) {
          candidates = collectCSTContainerTokens(bodyText);
        }
        const currentCandidate = candidates.find(
          (c) => bodyRel >= c.range.start && bodyRel <= c.range.end
        );
        if (!currentCandidate || !currentCandidate.range.coord) return false;

        const next = resolveOrthogonalKeyboardStep("down", currentCandidate.range.coord, candidates);
        if (next) {
          const nextPos = block.contentStart + next.range.start;
          view.dispatch({
            selection: { anchor: nextPos, head: nextPos },
            scrollIntoView: true,
            userEvent: "select",
          });
          return true;
        }
        return false;
      },
    },
    {
      key: "Alt-ArrowUp",
      run(view: EditorView) {
        const options = getOptions ? getOptions() : undefined;
        if (options?.targetedMathNavigation === false) return false;

        const sel = view.state.selection.main;
        const cursor = sel.head;
        const block = findMathBlockAtPos(view.state.doc, cursor, true);
        if (!block) return false;

        const bodyRel = cursor - block.contentStart;
        const cmDom = view.dom;
        const containers = Array.from(cmDom.querySelectorAll(".MathJax, mjx-container"));
        let targetContainer: Element | null = null;
        for (const c of containers) {
          try {
            const pos = view.posAtDOM(c);
            if (pos >= block.start && pos <= block.end) {
              targetContainer = c;
              break;
            }
          } catch {
            // Ignore
          }
        }

        let candidates = targetContainer ? collectContainerTokens(targetContainer) : [];
        if (candidates.length === 0) {
          candidates = collectCSTContainerTokens(block.bodyText);
        }
        const currentCandidate = candidates.find(
          (c) => bodyRel >= c.range.start && bodyRel <= c.range.end
        );
        if (!currentCandidate || !currentCandidate.range.scales) return false;

        const scales = currentCandidate.range.scales;
        const currentSpanLen = sel.to - sel.from;
        const atomLen = scales.atom.end - scales.atom.start;
        const slotLen = scales.slot.end - scales.slot.start;

        let targetScale = scales.atom;
        if (currentSpanLen >= slotLen) {
          targetScale = scales.molecule;
        } else if (currentSpanLen >= atomLen) {
          targetScale = scales.slot;
        } else {
          targetScale = scales.atom;
        }

        const targetAnchor = block.contentStart + targetScale.start;
        const targetHead = block.contentStart + targetScale.end;

        view.dispatch({
          selection: { anchor: targetAnchor, head: targetHead },
          scrollIntoView: true,
          userEvent: "select",
        });
        return true;
      },
    },
  ]);
}
