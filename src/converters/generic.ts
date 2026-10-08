// src/converters/generic.ts

import { COLORS, ColorPalette, ColorMathOptions, getBareFunctions } from "../config";
import { collectSingleConstantSpans } from "../parsers/constants";
import { collectBraKetDelimiterSpans } from "../parsers/braket";
import { collectDelimiterSpans } from "../parsers/delimiters";
import { collectDifferentialSpans, findDifferentialSpans, findBoundarySpans } from "../parsers/differentials";
import { collectDimensionlessSpans, findDimensionlessSpans } from "../parsers/dimensionless";
import { findSemanticSpans } from "../parsers/math_parser";
import { collectScannerSpans } from "../parsers/scanner";
import { collectTaxonomySpans } from "../parsers/taxonomy";
import { collectQuantumOperatorSpans } from "../parsers/physics";
import { collectDomainOperatorSpans, generateModeAwareDerivativeSpans } from "../parsers/modes";
import { collectUnitSpans, findUnitSpans } from "../parsers/units";
import { collectVariableSpans } from "../parsers/variable_hash";
import { parseMathWithCST } from "../parsers/cst/index";
import { containsColorWrapper, normalizeLatexBraces, normalizeMathSyntax, autoSealUnclosedDelimiters } from "../utils/latex_helpers";
import { ColorSpan, applyColorSpans } from "../utils/spans";
import { uncolorFragment } from "../undo";
import { LruCache } from "../utils/lru_cache";

// Mode-aware LRU cache for full LaTeX string colorization
const latexBodyCache = new LruCache<string, string>(1000);

export function clearLatexBodyCache(): void {
  latexBodyCache.clear();
}

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

function getOptionsHash(palette: ColorPalette, options?: ColorMathOptions): string {
  const pId = Object.values(palette).join(",");
  if (!options) return pId;
  return [
    pId,
    options.activeMode || "",
    options.previewLatexNormalization !== false ? "1" : "0",
    options.colorUnits !== false ? "1" : "0",
    options.colorDifferentials !== false ? "1" : "0",
    options.colorDimensionless !== false ? "1" : "0",
    options.colorBraKet !== false ? "1" : "0",
    options.colorSingleConstants !== false ? "1" : "0",
    options.colorAlignment !== false ? "1" : "0",
    options.rainbowDelimiters ? "1" : "0",
    options.enableTaxonomy ? "1" : "0",
    options.taxonomyFunctions !== false ? "1" : "0",
    options.taxonomyParameters !== false ? "1" : "0",
    options.taxonomyConstants !== false ? "1" : "0",
    options.taxonomyIndices !== false ? "1" : "0",
    options.variableDataFlow ? "1" : "0",
    options.colorQuantumOperators ? "1" : "0",
    options.extendedFunctions !== false ? "1" : "0",
    options.field || "",
    options.useCST ? "1" : "0",
  ].join(";");
}

export function computeSemanticMathSpans(
  body: string,
  palette: ColorPalette = COLORS,
  options?: ColorMathOptions,
  forLatexWrap: boolean = false
): ColorSpan[] {
  const needUnits = options?.colorUnits !== false || Boolean(options?.enableTaxonomy) || Boolean(options?.variableDataFlow);
  const needDiffs = options?.colorDifferentials !== false || Boolean(options?.enableTaxonomy) || Boolean(options?.variableDataFlow);
  const needDims = options?.colorDimensionless !== false || Boolean(options?.enableTaxonomy) || Boolean(options?.variableDataFlow);

  const unitSpans = needUnits ? findUnitSpans(body, {
    allowSingleLetterUnits: options?.allowSingleLetterUnits,
    activeMode: options?.activeMode,
    colorUnits: options?.colorUnits,
  }) : [];
  const diffSpans = needDiffs ? findDifferentialSpans(body) : [];
  const dimSpans = needDims ? findDimensionlessSpans(body) : [];
  const boundarySpans = findBoundarySpans(body);

  const bareFunctions = getBareFunctions(options);

  const spans: ColorSpan[] = [
    ...collectFunctionSpans(body, palette, bareFunctions, options),
    ...collectScannerSpans(body, palette, forLatexWrap),
  ];

  // Domain boundary surfaces (\partial\Omega, \partial V, ∂D, etc.) -> operator in palette.chain (#9ece6a)
  for (const b of boundarySpans) {
    spans.push({
      start: b.start,
      end: b.end,
      color: palette.chain || "#9ece6a",
      priority: 25,
    });
  }

  if (options?.colorUnits !== false) {
    spans.push(...collectUnitSpans(body, palette, unitSpans));
  }

  if (options?.colorDifferentials !== false) {
    if (options?.activeMode) {
      spans.push(
        ...generateModeAwareDerivativeSpans(body, palette, diffSpans, options.activeMode, options)
      );
    } else {
      spans.push(...collectDifferentialSpans(body, palette, diffSpans, options));
    }
  }

  if (options?.colorDimensionless !== false) {
    spans.push(...collectDimensionlessSpans(body, palette, dimSpans));
  }

  if (options?.colorBraKet !== false) {
    spans.push(...collectBraKetDelimiterSpans(body, palette));
  }

  if (options?.colorSingleConstants !== false) {
    spans.push(...collectSingleConstantSpans(body, palette));
  }

  if (options?.rainbowDelimiters) {
    spans.push(
      ...collectDelimiterSpans(body, {
        forLatexWrap,
        palette: options?.rainbowColors,
        includeBareBraces: !forLatexWrap && options?.rainbowBareBraces !== false,
        highlightUnmatched: options?.highlightUnmatchedBraces !== false,
        strictBracketWarnings: options?.strictBracketWarnings === true,
      })
    );
  } else if (!forLatexWrap && options?.highlightUnmatchedBraces !== false) {
    spans.push(
      ...collectDelimiterSpans(body, {
        forLatexWrap: false,
        includeBareBraces: true,
        onlyUnmatched: true,
        highlightUnmatched: true,
        strictBracketWarnings: options?.strictBracketWarnings === true,
      })
    );
  }

  if (options?.enableTaxonomy) {
    spans.push(
      ...collectTaxonomySpans(body, palette, unitSpans, diffSpans, dimSpans, options)
    );
  }

  if (options?.variableDataFlow) {
    spans.push(
      ...collectVariableSpans(
        body,
        undefined,
        unitSpans,
        diffSpans,
        dimSpans,
        bareFunctions,
        boundarySpans
      )
    );
  }

  if (options?.activeMode) {
    const domainSpans = collectDomainOperatorSpans(body, palette, options.activeMode);
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
    const quantumSpans = collectQuantumOperatorSpans(body, palette, options);
    if (quantumSpans.length > 0) {
      const filtered = spans.filter(
        (s) => !quantumSpans.some((q) => q.start <= s.start && s.end <= q.end)
      );
      spans.length = 0;
      spans.push(...filtered, ...quantumSpans);
    }
  }

  if (options?.useCST) {
    try {
      const cstSpans = parseMathWithCST(body, {
        palette,
        rainbowColors: options?.rainbowColors,
        highlightUnmatched: options?.highlightUnmatchedBraces !== false,
        strictBracketWarnings: options?.strictBracketWarnings === true,
        activeMode: options?.activeMode,
        forLatexWrap,
      });
      if (cstSpans.length > 0) {
        spans.push(...cstSpans);
      }
    } catch {
      // Graceful fallback to legacy spans
    }
  }

  return spans;
}

export function colorLatexBody(
  body: string,
  palette: ColorPalette = COLORS,
  options?: ColorMathOptions
): string {
  const cleanBody = containsColorWrapper(body) ? uncolorFragment(body) : body;
  const optHash = getOptionsHash(palette, options);
  const cacheKey = `${optHash}::${cleanBody}`;

  const cached = latexBodyCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let normalized = cleanBody;
  if (options?.previewLatexNormalization !== false) {
    normalized = normalizeMathSyntax(cleanBody, options);
  } else if (options?.crashImmunityAutoSeal === true) {
    normalized = autoSealUnclosedDelimiters(cleanBody);
  }

  const spans = computeSemanticMathSpans(normalized, palette, options, true);
  const result = applyColorSpans(normalized, spans);
  latexBodyCache.set(cacheKey, result);
  return result;
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
