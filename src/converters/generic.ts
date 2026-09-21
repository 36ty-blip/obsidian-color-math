// src/converters/generic.ts

import { COLORS, ColorPalette, ColorMathOptions, getBareFunctions } from "../config";
import { collectSingleConstantSpans } from "../parsers/constants";
import { collectBraKetDelimiterSpans } from "../parsers/braket";
import { collectDelimiterSpans } from "../parsers/delimiters";
import { collectDifferentialSpans, findDifferentialSpans } from "../parsers/differentials";
import { collectDimensionlessSpans, findDimensionlessSpans } from "../parsers/dimensionless";
import { findSemanticSpans } from "../parsers/math_parser";
import { collectScannerSpans } from "../parsers/scanner";
import { collectTaxonomySpans } from "../parsers/taxonomy";
import { collectQuantumOperatorSpans } from "../parsers/physics";
import { collectDomainOperatorSpans, generateModeAwareDerivativeSpans } from "../parsers/modes";
import { collectUnitSpans, findUnitSpans } from "../parsers/units";
import { collectVariableSpans } from "../parsers/variable_hash";
import { containsColorWrapper, normalizeLatexBraces } from "../utils/latex_helpers";
import { ColorSpan, applyColorSpans } from "../utils/spans";
import { uncolorFragment } from "../undo";

const FUNCTION_COLOR_NAMES: ("main" | "derivative" | "chain")[] = [
  "main",
  "derivative",
  "chain",
];

export function collectFunctionSpans(
  body: string,
  palette: ColorPalette = COLORS,
  bareFunctions?: Set<string>,
  options?: ColorMathOptions
): ColorSpan[] {
  const [semantic] = findSemanticSpans(body, bareFunctions);
  const spans: ColorSpan[] = [];
  for (const item of semantic) {
    let colorName: keyof ColorPalette;
    if (item.kind === "function") {
      if (options?.taxonomyFunctions === false) continue;
      colorName = FUNCTION_COLOR_NAMES[Math.min(item.depth, 2)];
    } else if (item.kind === "constant") {
      if (options?.taxonomyConstants === false) continue;
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
  const cleanBody = containsColorWrapper(body) ? uncolorFragment(body) : body;
  const normalized =
    options?.previewLatexNormalization !== false
      ? normalizeLatexBraces(cleanBody)
      : cleanBody;

  const needUnits = options?.colorUnits !== false || Boolean(options?.enableTaxonomy) || Boolean(options?.variableDataFlow);
  const needDiffs = options?.colorDifferentials !== false || Boolean(options?.enableTaxonomy) || Boolean(options?.variableDataFlow);
  const needDims = options?.colorDimensionless !== false || Boolean(options?.enableTaxonomy) || Boolean(options?.variableDataFlow);

  const unitSpans = needUnits ? findUnitSpans(normalized) : [];
  const diffSpans = needDiffs ? findDifferentialSpans(normalized) : [];
  const dimSpans = needDims ? findDimensionlessSpans(normalized) : [];

  const bareFunctions = getBareFunctions(options);

  const spans: ColorSpan[] = [
    ...collectFunctionSpans(normalized, palette, bareFunctions, options),
    ...collectScannerSpans(normalized, palette),
  ];

  if (options?.colorUnits !== false) {
    spans.push(...collectUnitSpans(normalized, palette, unitSpans));
  }

  if (options?.colorDifferentials !== false) {
    if (options?.activeMode) {
      spans.push(
        ...generateModeAwareDerivativeSpans(normalized, palette, diffSpans, options.activeMode, options)
      );
    } else {
      spans.push(...collectDifferentialSpans(normalized, palette, diffSpans, options));
    }
  }

  if (options?.colorDimensionless !== false) {
    spans.push(...collectDimensionlessSpans(normalized, palette, dimSpans));
  }

  if (options?.colorBraKet !== false) {
    spans.push(...collectBraKetDelimiterSpans(normalized, palette));
  }

  if (options?.colorSingleConstants !== false) {
    spans.push(...collectSingleConstantSpans(normalized, palette));
  }

  if (options?.rainbowDelimiters) {
    spans.push(
      ...collectDelimiterSpans(normalized, {
        forLatexWrap: true,
        palette: options?.rainbowColors,
      })
    );
  }

  if (options?.enableTaxonomy) {
    spans.push(
      ...collectTaxonomySpans(normalized, palette, unitSpans, diffSpans, dimSpans, options)
    );
  }

  if (options?.variableDataFlow) {
    spans.push(...collectVariableSpans(normalized, undefined, unitSpans, diffSpans, dimSpans, bareFunctions));
  }

  if (options?.activeMode) {
    const domainSpans = collectDomainOperatorSpans(normalized, palette, options.activeMode);
    if (domainSpans.length > 0) {
      const filtered = spans.filter(
        (s) => !domainSpans.some((d) => d.start <= s.start && s.end <= d.end)
      );
      spans.length = 0;
      spans.push(...filtered, ...domainSpans);
    }
  }

  const isQuantumMode = options?.activeMode === "quantum" || options?.activeMode === "quantum_stochastic";
  if (options?.colorQuantumOperators || options?.field === "quantum" || options?.field === "physics" || isQuantumMode) {
    const quantumSpans = collectQuantumOperatorSpans(normalized, palette, options);
    if (quantumSpans.length > 0) {
      // Filter out any other spans strictly contained within quantum operators
      const filtered = spans.filter(
        (s) => !quantumSpans.some((q) => q.start <= s.start && s.end <= q.end)
      );
      spans.length = 0;
      spans.push(...filtered, ...quantumSpans);
    }
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
