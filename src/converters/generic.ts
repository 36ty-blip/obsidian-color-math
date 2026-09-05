// src/converters/generic.ts

import { COLORS, ColorPalette } from "../config";
import { findSemanticSpans } from "../parsers/math_parser";
import { collectScannerSpans } from "../parsers/scanner";
import { containsColorWrapper } from "../utils/latex_helpers";
import { ColorSpan, applyColorSpans } from "../utils/spans";

const FUNCTION_COLOR_NAMES: ("main" | "derivative" | "chain")[] = [
  "main",
  "derivative",
  "chain",
];

export function collectFunctionSpans(
  body: string,
  palette: ColorPalette = COLORS
): ColorSpan[] {
  const [semantic] = findSemanticSpans(body);
  const spans: ColorSpan[] = [];
  for (const item of semantic) {
    let colorName: keyof ColorPalette;
    if (item.kind === "function") {
      colorName = FUNCTION_COLOR_NAMES[Math.min(item.depth, 2)];
    } else if (item.kind === "constant") {
      colorName = "orange";
    } else {
      continue;
    }
    spans.push({
      start: item.start,
      end: item.end,
      color: palette[colorName],
      priority: 20,
    });
  }
  return spans;
}

export function colorLatexBody(body: string, palette: ColorPalette = COLORS): string {
  if (containsColorWrapper(body)) {
    return body;
  }
  return applyColorSpans(body, [
    ...collectFunctionSpans(body, palette),
    ...collectScannerSpans(body, palette),
  ]);
}

export function colorGenericMathLine(line: string, palette: ColorPalette = COLORS): string {
  const match = line.match(/^(\s*#+\s*)?\$\$(.*)\$\$([\s]*)$/s);
  if (!match) {
    return line;
  }
  const prefix = match[1] || "";
  const body = match[2];
  const suffix = match[3];
  return `${prefix}$$${colorLatexBody(body, palette)}$$${suffix}`;
}
