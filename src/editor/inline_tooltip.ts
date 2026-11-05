// src/editor/inline_tooltip.ts
//! Floating Live Preview Tooltip for Active Inline Math ($...$).
//! Provides a real-time rendered MathJax preview directly above the cursor while editing inline LaTeX.

import { StateField, Extension } from "@codemirror/state";
import { EditorView, showTooltip, Tooltip, TooltipView, tooltips } from "@codemirror/view";
import { ColorPalette, ColorMathOptions } from "../config";
import { colorLatexBody } from "../converters/generic";
import { scanMarkdown } from "../parsers/markdown_scanner";
import { stampMathJaxDOM } from "./dom_stamper";
import { getMathJaxElementRange } from "./weakmap_index";

/**
 * Highlights the rendered MathJax sub-expression(s) inside `container` that correspond
 * to the active LaTeX source selection or caret range `[relFrom, relTo]`.
 */
export function highlightSelectionInMathContainer(
  container: ParentNode,
  relFrom: number,
  relTo: number
): void {
  if (!container || typeof container.querySelectorAll !== "function") return;

  const prevSelected = container.querySelectorAll(
    ".color-math-selected-target, .color-math-caret-before, .color-math-caret-after"
  );
  for (const el of Array.from(prevSelected)) {
    el.classList.remove(
      "color-math-selected-target",
      "color-math-caret-before",
      "color-math-caret-after"
    );
  }

  if (relFrom < 0 || relTo < relFrom) return;

  const readRange = (el: Element): { start: number; end: number } | null => {
    const r = getMathJaxElementRange(el);
    if (r) return { start: r.start, end: r.end };
    const m = el.className && typeof el.className === "string"
      ? el.className.match(/cm-src-(\d+)-(\d+)/)
      : null;
    if (m) {
      return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
    }
    return null;
  };

  const leafSelector = "mjx-mi, mjx-mn, mjx-mo, mjx-mtext";
  const structuralSelector =
    "mjx-num, mjx-den, mjx-sqrt, mjx-mroot, mjx-mtd, mjx-frac, mjx-mfrac, mjx-msub, mjx-msup, mjx-msubsup, mjx-munder, mjx-mover, mjx-munderover, mjx-script";

  if (relTo > relFrom) {
    // 1. Check if there is an exact structural or leaf element matching [relFrom, relTo]
    const allCandidates = Array.from(
      container.querySelectorAll<HTMLElement>(`${structuralSelector}, ${leafSelector}`)
    );
    const exactMatches = allCandidates.filter((el) => {
      const r = readRange(el);
      return r !== null && r.start === relFrom && r.end === relTo;
    });

    if (exactMatches.length > 0) {
      // Highlight outermost exact matches (avoid double-outlining nested children with identical range)
      for (const el of exactMatches) {
        if (!exactMatches.some((other) => other !== el && other.contains(el))) {
          el.classList.add("color-math-selected-target");
        }
      }
      return;
    }

    // 2. Otherwise highlight all atomic leaf tokens whose source span overlaps [relFrom, relTo]
    const leaves = Array.from(container.querySelectorAll<HTMLElement>(leafSelector));
    for (const leaf of leaves) {
      const r = readRange(leaf);
      if (r && Math.max(r.start, relFrom) < Math.min(r.end, relTo)) {
        leaf.classList.add("color-math-selected-target");
      }
    }
  } else {
    // Cursor caret (relFrom === relTo): render a blinking vertical caret line at the insertion boundary
    const leaves = Array.from(container.querySelectorAll<HTMLElement>(leafSelector));
    let bestLeaf: HTMLElement | null = null;
    let bestPriority = Infinity;
    let bestSpanLen = Infinity;

    for (const leaf of leaves) {
      const r = readRange(leaf);
      if (!r || r.end <= r.start) continue;
      if (relFrom >= r.start && relFrom <= r.end) {
        // Priority 0: strictly inside [start, end); Priority 1: at right boundary (relFrom === end)
        const priority = relFrom < r.end ? 0 : 1;
        const spanLen = r.end - r.start;
        if (
          priority < bestPriority ||
          (priority === bestPriority && spanLen < bestSpanLen)
        ) {
          bestLeaf = leaf;
          bestPriority = priority;
          bestSpanLen = spanLen;
        }
      }
    }

    if (bestLeaf) {
      const r = readRange(bestLeaf);
      if (r) {
        const mid = (r.start + r.end) / 2;
        if (relFrom <= mid) {
          bestLeaf.classList.add("color-math-caret-before");
        } else {
          bestLeaf.classList.add("color-math-caret-after");
        }
      } else {
        bestLeaf.classList.add("color-math-caret-before");
      }
    }
  }
}

let activeTooltipHost: HTMLElement | null = null;

/**
 * Registers a tooltip host element as the single active tooltip.
 * Immediately removes any previous or competing tooltip from the DOM.
 */
export function registerSingleTooltipHost(host: HTMLElement | null): void {
  if (host && activeTooltipHost && activeTooltipHost !== host) {
    activeTooltipHost.remove();
  }
  if (host) {
    activeTooltipHost = host;
  }
}

/**
 * Synchronizes floating inline math tooltip opacity and opaque-background CSS variables
 * on both `document.body` and any active `.cm-tooltip` host element.
 */
export function syncTooltipAppearance(
  opacity?: number,
  isOpaque?: boolean,
  hostEl?: HTMLElement | null
): void {
  const clamped = Math.max(0, Math.min(100, opacity ?? 100));
  const alpha = clamped / 100;
  const bgPct = isOpaque ? 100 : Math.round(clamped * 0.85);

  if (typeof document !== "undefined" && document.body) {
    document.body.style.setProperty("--color-math-tooltip-opacity", `${alpha}`);
    document.body.style.setProperty("--color-math-tooltip-bg-pct", `${bgPct}%`);
  }

  if (hostEl) {
    hostEl.classList.add("color-math-tooltip-host");
    hostEl.style.opacity = `${alpha}`;
    hostEl.style.setProperty("--color-math-tooltip-opacity", `${alpha}`);
    hostEl.style.setProperty("--color-math-tooltip-bg-pct", `${bgPct}%`);
    if (isOpaque) {
      hostEl.classList.add("color-math-tooltip-opaque");
    } else {
      hostEl.classList.remove("color-math-tooltip-opaque");
    }
  }
}

export function createInlineMathTooltipExtension(
  getPalette: () => ColorPalette,
  getOptions?: () => ColorMathOptions,
  onNavigate?: (view: EditorView, anchor: number, head: number) => void,
  onHoverHighlight?: (view: EditorView, range: { from: number; to: number } | null) => void
): Extension {
  const tooltipField = StateField.define<Tooltip | null>({
    create() {
      return null;
    },
    update(val, tr) {
      const options = getOptions ? getOptions() : undefined;
      if (options?.inlineMathFloatingTooltip === false) return null;

      const sel = tr.state.selection.main;
      // Bail out if selection spans multiple lines
      if (tr.state.doc.lineAt(sel.from).number !== tr.state.doc.lineAt(sel.to).number) {
        return null;
      }

      const line = tr.state.doc.lineAt(sel.head);
      if (!line.text.includes("$")) return null;

      // In Obsidian Live Preview, raw markdown table rows (`| $...$ |`) exist in the outer EditorView
      // while the active table cell mounts its own nested EditorView inside `.table-cell-wrapper`.
      // Never spawn a floating tooltip on a raw pipe-delimited Markdown table row in the outer editor!
      if (/^\s*\|.*\|\s*$/.test(line.text) || /^\s*\|/.test(line.text)) {
        return null;
      }

      const scan = scanMarkdown(line.text);
      for (const math of scan.mathInlines) {
        const absStart = line.from + math.start;
        const absEnd = line.from + math.end;
        if (sel.from >= absStart && sel.to <= absEnd) {
          const initialBody = line.text.slice(math.contentStart, math.contentEnd);
          if (!initialBody.trim()) return null;
          const initialAbsContentStart = line.from + math.contentStart;

          return {
            pos: sel.head,
            above: true,
            arrow: true,
            clip: false,
            create(view: EditorView): TooltipView {
              let body = initialBody;
              let absContentStart = initialAbsContentStart;
              let hoveredEl: HTMLElement | null = null;

              const dom = createDiv({ cls: "color-math-inline-tooltip" });
              dom.setAttribute("data-math-content-start", String(absContentStart));
              dom.setAttribute("data-math-latex", body);

              const getHost = (): HTMLElement | null => {
                return (
                  dom.closest<HTMLElement>(".cm-tooltip") ||
                  (dom.parentElement?.classList.contains("cm-tooltip") ? dom.parentElement : null) ||
                  dom.parentElement
                );
              };

              const readElRange = (el: Element): { start: number; end: number; scales?: any } | null => {
                const r = getMathJaxElementRange(el);
                if (r) return r;
                const m = el.closest('[class*="cm-src-"]')?.className.match(/cm-src-(\d+)-(\d+)/);
                if (m) {
                  return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
                }
                return null;
              };

              dom.addEventListener("pointerover", (event: PointerEvent) => {
                const curOptions = getOptions ? getOptions() : options;
                if (curOptions?.targetedMathNavigation === false) return;
                const target = event.target as HTMLElement | null;
                if (!target) return;
                const targetEl = target.closest<HTMLElement>(
                  "mjx-num, mjx-den, mjx-script, mjx-sqrt, mjx-box, mjx-mtd, mjx-mi, mjx-mn, mjx-mo, mjx-mtext, mjx-c"
                );
                if (targetEl && targetEl !== hoveredEl) {
                  if (hoveredEl) hoveredEl.classList.remove("color-math-hover-target");
                  hoveredEl = targetEl;
                  targetEl.classList.add("color-math-hover-target");
                  const r = readElRange(targetEl);
                  if (r && onHoverHighlight) {
                    onHoverHighlight(view, {
                      from: absContentStart + r.start,
                      to: absContentStart + r.end,
                    });
                  }
                }
              });

              dom.addEventListener("pointerout", (event: PointerEvent) => {
                if (hoveredEl) {
                  const related = event.relatedTarget as Node | null;
                  if (!related || !hoveredEl.contains(related)) {
                    hoveredEl.classList.remove("color-math-hover-target");
                    hoveredEl = null;
                    if (onHoverHighlight) {
                      onHoverHighlight(view, null);
                    }
                  }
                }
              });

              dom.addEventListener("mousedown", (event: MouseEvent) => {
                if (event.button !== 0 || event.defaultPrevented || event.ctrlKey || event.metaKey) return;
                const curOptions = getOptions ? getOptions() : options;
                if (curOptions?.targetedMathNavigation === false) return;
                const target = event.target as HTMLElement | null;
                if (!target) return;
                const r = readElRange(target);
                if (r) {
                  let startRel = r.start;
                  let endRel = r.end;
                  if (r.scales) {
                    if (event.detail >= 3) {
                      startRel = r.scales.molecule.start;
                      endRel = r.scales.molecule.end;
                    } else if (event.detail === 2 || event.altKey) {
                      startRel = r.scales.slot.start;
                      endRel = r.scales.slot.end;
                    }
                  }
                  const targetAnchor = absContentStart + startRel;
                  const targetHead = absContentStart + endRel;
                  event.preventDefault();
                  event.stopPropagation();
                  if (onNavigate) {
                    onNavigate(view, targetAnchor, targetHead);
                  } else {
                    view.dispatch({
                      selection: { anchor: targetAnchor, head: targetHead },
                      scrollIntoView: true,
                      userEvent: "select",
                    });
                    view.focus();
                  }
                }
              });

              function syncTooltipSelection(state = view.state) {
                const curSel = state.selection.main;
                const relFrom = Math.max(0, Math.min(body.length, curSel.from - absContentStart));
                const relTo = Math.max(relFrom, Math.min(body.length, curSel.to - absContentStart));
                highlightSelectionInMathContainer(dom, relFrom, relTo);
              }

              function renderContent(state = view.state) {
                dom.empty();
                dom.setAttribute("data-math-content-start", String(absContentStart));
                dom.setAttribute("data-math-latex", body);
                const curOptions = getOptions ? getOptions() : options;
                const mathJax = (window as unknown as {
                  MathJax?: {
                    tex2chtml?: ((tex: string, opts?: unknown) => HTMLElement) & {
                      __colorMathActive?: () => boolean;
                    };
                  };
                }).MathJax;
                if (mathJax && typeof mathJax.tex2chtml === "function") {
                  try {
                    const isInterceptorActive =
                      typeof mathJax.tex2chtml.__colorMathActive === "function" &&
                      mathJax.tex2chtml.__colorMathActive();
                    let el: HTMLElement;
                    if (isInterceptorActive) {
                      el = mathJax.tex2chtml(body, { display: true });
                    } else {
                      const palette = getPalette();
                      const colored = colorLatexBody(body, palette, curOptions);
                      el = mathJax.tex2chtml(colored);
                      if (el && typeof el.setAttribute === "function") {
                        el.setAttribute("data-math-latex", body);
                      }
                      if (
                        curOptions?.targetedMathNavigation !== false &&
                        el &&
                        typeof el.querySelectorAll === "function"
                      ) {
                        stampMathJaxDOM(el, body);
                      }
                    }
                    if (el && typeof el.setAttribute === "function") {
                      el.setAttribute("data-math-content-start", String(absContentStart));
                      el.setAttribute("data-math-latex", body);
                    }
                    dom.appendChild(el);
                  } catch {
                    dom.textContent = body;
                  }
                } else {
                  dom.textContent = body;
                }
                syncTooltipSelection(state);
              }

              renderContent(view.state);

              function applyHostStyles() {
                const curOptions = getOptions ? getOptions() : options;
                const host = getHost();
                registerSingleTooltipHost(host);
                syncTooltipAppearance(
                  curOptions?.inlineMathFloatingTooltipOpacity ?? 100,
                  curOptions?.inlineMathFloatingTooltipOpaque === true,
                  host
                );
              }

              return {
                dom,
                resize: false,
                mount() {
                  const host = getHost();
                  registerSingleTooltipHost(host);
                  applyHostStyles();
                  syncTooltipSelection(view.state);
                  if (typeof requestAnimationFrame === "function") {
                    requestAnimationFrame(() => {
                      registerSingleTooltipHost(getHost());
                      applyHostStyles();
                      syncTooltipSelection(view.state);
                    });
                  }
                },
                destroy() {
                  const host = getHost();
                  if (activeTooltipHost === host) {
                    activeTooltipHost = null;
                  }
                  if (hoveredEl && onHoverHighlight) {
                    onHoverHighlight(view, null);
                  }
                  syncTooltipAppearance(
                    (getOptions ? getOptions() : options)?.inlineMathFloatingTooltipOpacity ?? 100,
                    (getOptions ? getOptions() : options)?.inlineMathFloatingTooltipOpaque === true
                  );
                },
                update(update) {
                  if (update.docChanged || update.selectionSet || update.focusChanged) {
                    const curSel = update.state.selection.main;
                    const curLine = update.state.doc.lineAt(curSel.head);
                    if (curLine.text.includes("$")) {
                      const curScan = scanMarkdown(curLine.text);
                      for (const m of curScan.mathInlines) {
                        const aStart = curLine.from + m.start;
                        const aEnd = curLine.from + m.end;
                        if (curSel.from >= aStart && curSel.to <= aEnd) {
                          const nextBody = curLine.text.slice(m.contentStart, m.contentEnd);
                          const nextAbsStart = curLine.from + m.contentStart;
                          const bodyChanged = nextBody !== body;
                          body = nextBody;
                          absContentStart = nextAbsStart;
                          if (bodyChanged) {
                            renderContent(update.state);
                          } else {
                            dom.setAttribute("data-math-content-start", String(absContentStart));
                            syncTooltipSelection(update.state);
                          }
                          break;
                        }
                      }
                    }
                    registerSingleTooltipHost(getHost());
                    applyHostStyles();
                  }
                },
              };
            },
          };
        }
      }
      return null;
    },
    provide: (f) => showTooltip.from(f),
  });

  // Portal tooltips to `document.body` with `position: "fixed"` so they are NEVER clipped
  // by Markdown table cells (`<td>`, `.table-wrapper`, `.cm-table-widget`) or callout `overflow: hidden`!
  const bodyTooltipPortal =
    typeof document !== "undefined" && document.body
      ? tooltips({ position: "fixed", parent: document.body })
      : [];

  return [tooltipField, bodyTooltipPortal];
}
