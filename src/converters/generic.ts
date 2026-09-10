// src/converters/generic.ts

import { COLORS, ColorPalette, ColorMathOptions } from "../config";
import { collectBraKetDelimiterSpans } from "../parsers/braket";
import { collectDelimiterSpans } from "../parsers/delimiters";
import { collectDifferentialSpans, findDifferentialSpans } from "../parsers/differentials";
import { collectDimensionlessSpans, findDimensionlessSpans } from "../parsers/dimensionless";
import { findSemanticSpans } from "../parsers/math_parser";
import { collectScannerSpans } from "../parsers/scanner";
import { collectTaxonomySpans } from "../parsers/taxonomy";
import { collectUnitSpans, findUnitSpans } from "../parsers/units";
import { collectVariableSpans } from "../parsers/variable_hash";
import { containsColorWrapper, normalizeLatexBraces } from "../utils/latex_helpers";
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

  const normalized = normalizeLatexBraces(body);

  const unitSpans = findUnitSpans(normalized);
  const diffSpans = findDifferentialSpans(normalized);
  const dimSpans = findDimensionlessSpans(normalized);

  const spans: ColorSpan[] = [
    ...collectFunctionSpans(normalized, palette),
    ...collectScannerSpans(normalized, palette),
  ];

  if (options?.colorUnits !== false) {
    spans.push(...collectUnitSpans(normalized, palette, unitSpans));
  }

  if (options?.colorDifferentials !== false) {
    spans.push(...collectDifferentialSpans(normalized, palette, diffSpans));
  }

  if (options?.colorDimensionless !== false) {
    spans.push(...collectDimensionlessSpans(normalized, palette, dimSpans));
  }

  if (options?.colorBraKet !== false) {
    spans.push(...collectBraKetDelimiterSpans(normalized, palette));
  }

  if (options?.rainbowDelimiters) {
    spans.push(...collectDelimiterSpans(normalized, { forLatexWrap: true }));
  }

  if (options?.enableTaxonomy) {
    spans.push(...collectTaxonomySpans(normalized, palette, unitSpans, diffSpans, dimSpans));
  }

  if (options?.variableDataFlow) {
    spans.push(...collectVariableSpans(normalized, undefined, unitSpans, diffSpans, dimSpans));
  }

  return applyColorSpans(normalized, spans);
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
