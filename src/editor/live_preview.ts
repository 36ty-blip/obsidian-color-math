// src/editor/live_preview.ts

import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { ColorPalette } from "../config";
import { collectFunctionSpans } from "../converters/generic";
import { scanMarkdown } from "../parsers/markdown_scanner";
import { collectScannerSpans } from "../parsers/scanner";
import { containsColorWrapper } from "../utils/latex_helpers";
import { ColorSpan, selectColorSpans } from "../utils/spans";

export function createColorMathLivePlugin(
  getPalette: () => ColorPalette,
  isEnabled: () => boolean
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        if (!isEnabled()) {
          return Decoration.none;
        }

        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.doc;
        const text = doc.toString();
        const palette = getPalette();

        const mathBlocks = scanMarkdown(text).mathBlocks;

        for (const block of mathBlocks) {
          const blockStart = block.contentStart;
          const blockEnd = block.contentEnd;

          // Check if block intersects any visible range
          const isVisible = view.visibleRanges.some(
            (r) => Math.max(r.from, blockStart) <= Math.min(r.to, blockEnd)
          );
          if (!isVisible) continue;

          const body = text.slice(blockStart, blockEnd);
          if (containsColorWrapper(body)) continue;

          const functionSpans = collectFunctionSpans(body, palette);
          const scannerSpans = collectScannerSpans(body, palette);
          const selected = selectColorSpans(body, [
            ...functionSpans,
            ...scannerSpans,
          ]);

          // Keep strictly non-overlapping spans in ascending order for CodeMirror RangeSetBuilder
          const nonOverlapping: ColorSpan[] = [];
          let currentEnd = -1;
          for (const span of selected) {
            if (span.start >= currentEnd) {
              nonOverlapping.push(span);
              currentEnd = span.end;
            }
          }

          for (const span of nonOverlapping) {
            const from = blockStart + span.start;
            const to = blockStart + span.end;
            if (from < to && to <= doc.length) {
              builder.add(
                from,
                to,
                Decoration.mark({
                  attributes: {
                    style: `color: ${span.color}; font-weight: 500;`,
                  },
                  class: "color-math-live-token",
                })
              );
            }
          }
        }

        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}
