// src/editor/live_preview.ts

import { RangeSetBuilder, Text } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { ColorPalette, ColorMathOptions, getBareFunctions } from "../config";
import { computeSemanticMathSpans } from "../converters/generic";
import { scanMarkdown } from "../parsers/markdown_scanner";
import { containsColorWrapper } from "../utils/latex_helpers";
import { ColorSpan, selectColorSpans } from "../utils/spans";
import { getCachedOrComputedSpans } from "../parsers/engine_bridge";

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

export function createColorMathLivePlugin(
  getPalette: () => ColorPalette,
  isEnabled: () => boolean,
  getOptions?: () => ColorMathOptions
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      lastScrollTime: number = 0;
      lastScrollPos: number = 0;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = this.decorations.map(update.changes);
        }
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
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
          const bareFunctions = getBareFunctions(options);

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

          const pendingDecorations: { from: number; to: number; decoration: Decoration }[] = [];

          for (const block of allMath) {
            try {
              const blockStart = offset + block.contentStart;
              const blockEnd = offset + block.contentEnd;

              // Check if block intersects any visible range
              const isVisible =
                view.visibleRanges.length === 0 ||
                view.visibleRanges.some(
                  (r) => Math.max(r.from, blockStart) <= Math.min(r.to, blockEnd)
                );
              if (!isVisible) continue;

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

            return selectColorSpans(body, activeSpans);
          });

          // Keep strictly non-overlapping spans in ascending order for CodeMirror RangeSetBuilder
          const nonOverlapping: ColorSpan[] = [];
          let currentEnd = -1;
          for (const span of selected) {
            if (span.start >= currentEnd) {
              nonOverlapping.push(span);
              currentEnd = span.end;
            }
          }

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
              const isStringLiteral =
                span.end - span.start > 1 &&
                body.slice(span.start, span.end).startsWith('"') &&
                body.slice(span.start, span.end).endsWith('"');
              let cls = "color-math-live-token";
              if (isUnmatched) cls += " color-math-unmatched-delimiter";
              if (isStringLiteral) cls += " color-math-string-literal";
              pendingDecorations.push({
                from,
                to,
                decoration: Decoration.mark({
                  attributes: {
                    style: `color: ${span.color};`,
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
    }
  );
}
