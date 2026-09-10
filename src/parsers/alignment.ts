// src/parsers/alignment.ts

import { ColorPalette, COLORS } from "../config";
import { ColorSpan } from "../utils/spans";

/**
 * Scans LaTeX text for matrix & alignment delimiters:
 * - Alignment ampersand '&' (column separator)
 * - Double backslash '\\' (row break)
 * Note: These are designed for editor / Live Preview syntax highlighting.
 * They are intentionally NOT wrapped with \textcolor in rendered LaTeX
 * because TeX tabular environments forbid macro arguments spanning alignment tabs.
 */
export function collectAlignmentSpans(
  body: string,
  palette: ColorPalette = COLORS
): ColorSpan[] {
  const spans: ColorSpan[] = [];
  let index = 0;
  while (index < body.length) {
    if (body[index] === "%") {
      let lineEnd = index + 1;
      while (lineEnd < body.length && body[lineEnd] !== "\r" && body[lineEnd] !== "\n") {
        lineEnd++;
      }
      index = lineEnd;
      continue;
    }

    if (body[index] === "&") {
      spans.push({
        start: index,
        end: index + 1,
        color: palette.arrow || "#f7768e",
        priority: 25,
      });
      index++;
      continue;
    }

    if (body.startsWith("\\\\", index)) {
      spans.push({
        start: index,
        end: index + 2,
        color: palette.arrow || "#f7768e",
        priority: 25,
      });
      index += 2;
      continue;
    }

    index++;
  }
  return spans;
}
