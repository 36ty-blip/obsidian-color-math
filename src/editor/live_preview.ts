// src/editor/live_preview.ts

import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { ColorPalette, ColorMathOptions, getBareFunctions } from "../config";
import { collectAlignmentSpans } from "../parsers/alignment";
import { collectSingleConstantSpans } from "../parsers/constants";
import { collectBraKetDelimiterSpans } from "../parsers/braket";
import { collectDelimiterSpans } from "../parsers/delimiters";
import { collectDifferentialSpans, findDifferentialSpans } from "../parsers/differentials";
import { collectDimensionlessSpans, findDimensionlessSpans } from "../parsers/dimensionless";
import { collectFunctionSpans } from "../converters/generic";
import { scanMarkdown } from "../parsers/markdown_scanner";
import { collectScannerSpans } from "../parsers/scanner";
import { collectTaxonomySpans } from "../parsers/taxonomy";
import { collectUnitSpans, findUnitSpans } from "../parsers/units";
import { collectVariableSpans } from "../parsers/variable_hash";
import { containsColorWrapper } from "../utils/latex_helpers";
import { ColorSpan, selectColorSpans } from "../utils/spans";

export function createColorMathLivePlugin(
  getPalette: () => ColorPalette,
  isEnabled: () => boolean,
  getOptions?: () => ColorMathOptions
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
        const palette = getPalette();
        const options = getOptions ? getOptions() : undefined;
        const bareFunctions = getBareFunctions(options);

        // When document is large and visible ranges exist, constrain markdown scanning
        // to visible range extended by a margin to prevent unnecessary full-document scans
        let text: string;
        let offset = 0;

        if (doc.length > 20000 && view.visibleRanges.length > 0) {
          let minFrom = Infinity;
          let maxTo = -Infinity;
          for (const r of view.visibleRanges) {
            if (r.from < minFrom) minFrom = r.from;
            if (r.to > maxTo) maxTo = r.to;
          }
          const rawStart = Math.max(0, minFrom - 3000);
          const rawEnd = Math.min(doc.length, maxTo + 3000);
          const lineStart = doc.lineAt(rawStart).from;
          const lineEnd = doc.lineAt(rawEnd).to;
          text = doc.sliceString(lineStart, lineEnd);
          offset = lineStart;
        } else {
          text = doc.toString();
        }

        const scan = scanMarkdown(text);
        const allMath = [...scan.mathBlocks, ...scan.mathInlines];

        for (const block of allMath) {
          const blockStart = offset + block.contentStart;
          const blockEnd = offset + block.contentEnd;

          // Check if block intersects any visible range
          const isVisible = view.visibleRanges.some(
            (r) => Math.max(r.from, blockStart) <= Math.min(r.to, blockEnd)
          );
          if (!isVisible) continue;

          const body = text.slice(block.contentStart, block.contentEnd);
          if (containsColorWrapper(body)) continue;

          const needUnits = options?.colorUnits !== false || Boolean(options?.enableTaxonomy) || Boolean(options?.variableDataFlow);
          const needDiffs = options?.colorDifferentials !== false || Boolean(options?.enableTaxonomy) || Boolean(options?.variableDataFlow);
          const needDims = options?.colorDimensionless !== false || Boolean(options?.enableTaxonomy) || Boolean(options?.variableDataFlow);

          const unitSpans = needUnits ? findUnitSpans(body) : [];
          const diffSpans = needDiffs ? findDifferentialSpans(body) : [];
          const dimSpans = needDims ? findDimensionlessSpans(body) : [];

          const allSpans: ColorSpan[] = [
            ...collectFunctionSpans(body, palette, bareFunctions),
            ...collectScannerSpans(body, palette),
          ];

          if (options?.colorUnits !== false) {
            allSpans.push(...collectUnitSpans(body, palette, unitSpans));
          }

          if (options?.colorDifferentials !== false) {
            allSpans.push(...collectDifferentialSpans(body, palette, diffSpans));
          }

          if (options?.colorDimensionless !== false) {
            allSpans.push(...collectDimensionlessSpans(body, palette, dimSpans));
          }

          if (options?.colorBraKet !== false) {
            allSpans.push(...collectBraKetDelimiterSpans(body, palette));
          }

          if (options?.colorSingleConstants !== false) {
            allSpans.push(...collectSingleConstantSpans(body, palette));
          }

          if (options?.colorAlignment !== false) {
            allSpans.push(...collectAlignmentSpans(body, palette));
          }

          if (options?.rainbowDelimiters) {
            allSpans.push(...collectDelimiterSpans(body, { forLatexWrap: false }));
          }

          if (options?.enableTaxonomy) {
            allSpans.push(...collectTaxonomySpans(body, palette, unitSpans, diffSpans, dimSpans));
          }

          if (options?.variableDataFlow) {
            allSpans.push(...collectVariableSpans(body, undefined, unitSpans, diffSpans, dimSpans, bareFunctions));
          }

          const selected = selectColorSpans(body, allSpans);

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
