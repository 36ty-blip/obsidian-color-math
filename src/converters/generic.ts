// src/converters/generic.ts

import { COLORS, ColorPalette, ColorMathOptions } from "../config";
import { collectDelimiterSpans } from "../parsers/delimiters";
import { collectDifferentialSpans, findDifferentialSpans } from "../parsers/differentials";
import { findSemanticSpans } from "../parsers/math_parser";
import { collectScannerSpans } from "../parsers/scanner";
import { collectTaxonomySpans } from "../parsers/taxonomy";
import { collectUnitSpans, findUnitSpans } from "../parsers/units";
import { collectVariableSpans } from "../parsers/variable_hash";
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

export function colorLatexBody(
  body: string,
  palette: ColorPalette = COLORS,
  options?: ColorMathOptions
): string {
  if (containsColorWrapper(body)) {
    return body;
  }

  const unitSpans = findUnitSpans(body);
  const diffSpans = findDifferentialSpans(body);

  const spans: ColorSpan[] = [
    ...collectFunctionSpans(body, palette),
    ...collectScannerSpans(body, palette),
  ];

  if (options?.colorUnits !== false) {
    spans.push(...collectUnitSpans(body, palette, unitSpans));
  }

  if (options?.colorDifferentials !== false) {
    spans.push(...collectDifferentialSpans(body, palette, diffSpans));
  }

  if (options?.rainbowDelimiters) {
    spans.push(...collectDelimiterSpans(body, { forLatexWrap: true }));
  }

  if (options?.enableTaxonomy) {
    spans.push(...collectTaxonomySpans(body, palette, unitSpans, diffSpans));
  }

  if (options?.variableDataFlow) {
    spans.push(...collectVariableSpans(body, undefined, unitSpans, diffSpans));
  }

  return applyColorSpans(body, spans);
}

export function colorGenericMathLine(
  line: string,
  palette: ColorPalette = COLORS,
  options?: ColorMathOptions
): string {
  const match = line.match(/^(\s*#+\s*)?\$\$(.*)\$\$([\s]*)$/s);
  if (!match) {
    return line;
  }
  const prefix = match[1] || "";
  const body = match[2];
  const suffix = match[3];
  return `${prefix}$$${colorLatexBody(body, palette, options)}$$${suffix}`;
}
