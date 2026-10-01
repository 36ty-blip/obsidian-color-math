// src/parsers/unified_pipeline.ts
// Unified Mathematical Span Extraction Pipeline (Single Source of Truth)
// Guarantees 100% synchronization between Live Preview (CodeMirror 6) and MathJax / Bake.

import { COLORS, ColorPalette, ColorMathOptions, getBareFunctions } from "../config";
import { collectAlignmentSpans } from "./alignment";
import { collectSingleConstantSpans } from "./constants";
import { collectBraKetDelimiterSpans } from "./braket";
import { collectDelimiterSpans } from "./delimiters";
import { collectDifferentialSpans, findDifferentialSpans, findBoundarySpans } from "./differentials";
import { collectDimensionlessSpans, findDimensionlessSpans } from "./dimensionless";
import { findSemanticSpans } from "./math_parser";
import { collectScannerSpans } from "./scanner";
import { collectTaxonomySpans } from "./taxonomy";
import { collectQuantumOperatorSpans } from "./physics";
import { collectDomainOperatorSpans, generateModeAwareDerivativeSpans } from "./modes";
import { collectUnitSpans, findUnitSpans } from "./units";
import { collectVariableSpans } from "./variable_hash";
import { ColorSpan, selectColorSpans } from "../utils/spans";

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


export interface OpaqueRange {
  start: number;
  end: number;
}

/**
 * Identifies ranges in the raw mathematical text that MUST NOT be colored as mathematical variables:
 * 1. TeX comments (% to newline)
 * 2. Typst-style string literals ("..." - cannot cross $$ or unescaped newline)
 * 3. Explicit LaTeX text macros (\text{...}, \mathrm{...}, \textbf{...}, \textit{...})
 */
export function findOpaqueRanges(text: string): OpaqueRange[] {
  const ranges: OpaqueRange[] = [];

  // 1. TeX Comments
  let i = 0;
  while (i < text.length) {
    if (text[i] === "%" && (i === 0 || text[i - 1] !== "\\")) {
      const start = i;
      while (i < text.length && text[i] !== "\n" && text[i] !== "\r") {
        i++;
      }
      ranges.push({ start, end: i });
    } else {
      i++;
    }
  }

  // 2. Typst String Literals ("...")
  i = 0;
  while (i < text.length) {
    if (text[i] === '"' && (i === 0 || text[i - 1] !== "\\")) {
      const start = i;
      i++;
      while (i < text.length) {
        if (text[i] === '"' && text[i - 1] !== "\\") {
          i++; // include closing quote
          break;
        }
        if (text.startsWith("$$", i)) {
          // Hard boundary: quote cannot cross $$
          break;
        }
        i++;
      }
      ranges.push({ start, end: i });
    } else {
      i++;
    }
  }

  // 3. Explicit Text Macros: \text{...}, \textrm{...}, \textbf{...}, \textit{...}
  const textMacroRegex = /\\(?:text|textrm|textbf|textit|textsf|texttt)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = textMacroRegex.exec(text)) !== null) {
    const start = match.index;
    const braceStart = match.index + match[0].length - 1;
    let depth = 1;
    let j = braceStart + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === "{" && text[j - 1] !== "\\") depth++;
      else if (text[j] === "}" && text[j - 1] !== "\\") depth--;
      j++;
    }
    ranges.push({ start, end: j });
  }

  return ranges;
}

/**
 * Extracts all semantic and delimiter color spans for a raw mathematical expression.
 * Strictly operates on the raw character coordinates without mutating the string.
 * Used identically by Live Preview (CodeMirror 6) and MathJax / Bake.
 */
export function extractMathColorSpans(
  body: string,
  palette: ColorPalette = COLORS,
  options?: ColorMathOptions,
  forLatexWrap: boolean = false
): ColorSpan[] {
  if (!body) return [];

  const needUnits = options?.colorUnits !== false || Boolean(options?.enableTaxonomy) || Boolean(options?.variableDataFlow);
  const needDiffs = options?.colorDifferentials !== false || Boolean(options?.enableTaxonomy) || Boolean(options?.variableDataFlow);
  const needDims = options?.colorDimensionless !== false || Boolean(options?.enableTaxonomy) || Boolean(options?.variableDataFlow);

  const unitSpans = needUnits ? findUnitSpans(body) : [];
  const diffSpans = needDiffs ? findDifferentialSpans(body) : [];
  const dimSpans = needDims ? findDimensionlessSpans(body) : [];
  const boundarySpans = findBoundarySpans(body);
  const bareFunctions = getBareFunctions(options);

  const allSpans: ColorSpan[] = [
    ...collectFunctionSpans(body, palette, bareFunctions, options),
    ...collectScannerSpans(body, palette),
  ];

  // Domain boundary surfaces (\partial\Omega, \partial V, ∂D, etc.) -> operator in palette.chain (#9ece6a)
  for (const b of boundarySpans) {
    allSpans.push({
      start: b.start,
      end: b.end,
      color: palette.chain || "#9ece6a",
      priority: 25,
    });
  }

  if (options?.colorUnits !== false) {
    allSpans.push(...collectUnitSpans(body, palette, unitSpans));
  }

  if (options?.colorDifferentials !== false) {
    if (options?.activeMode) {
      allSpans.push(
        ...generateModeAwareDerivativeSpans(body, palette, diffSpans, options.activeMode, options)
      );
    } else {
      allSpans.push(...collectDifferentialSpans(body, palette, diffSpans, options));
    }
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

  if (!forLatexWrap && options?.colorAlignment !== false) {
    allSpans.push(...collectAlignmentSpans(body, palette));
  }

  if (options?.rainbowDelimiters) {
    allSpans.push(
      ...collectDelimiterSpans(body, {
        forLatexWrap,
        palette: options?.rainbowColors,
        includeBareBraces: !forLatexWrap && options?.rainbowBareBraces !== false,
        highlightUnmatched: !forLatexWrap && options?.highlightUnmatchedBraces !== false,
      })
    );
  } else if (!forLatexWrap && options?.highlightUnmatchedBraces !== false) {
    allSpans.push(
      ...collectDelimiterSpans(body, {
        forLatexWrap: false,
        includeBareBraces: true,
        onlyUnmatched: true,
        highlightUnmatched: true,
      })
    );
  }

  if (options?.enableTaxonomy) {
    allSpans.push(
      ...collectTaxonomySpans(body, palette, unitSpans, diffSpans, dimSpans, options)
    );
  }

  if (options?.variableDataFlow) {
    allSpans.push(
      ...collectVariableSpans(body, undefined, unitSpans, diffSpans, dimSpans, bareFunctions, boundarySpans)
    );
  }

  if (options?.activeMode) {
    const domainSpans = collectDomainOperatorSpans(body, palette, options.activeMode);
    if (domainSpans.length > 0) {
      const filtered = allSpans.filter(
        (s) => !domainSpans.some((d) => d.start <= s.start && s.end <= d.end)
      );
      allSpans.length = 0;
      allSpans.push(...filtered, ...domainSpans);
    }
  }

  const isQuantumMode =
    options?.activeMode === "quantum" ||
    options?.activeMode === "quantum_stochastic" ||
    options?.colorQuantumOperators ||
    options?.field === "quantum" ||
    options?.field === "physics";

  if (isQuantumMode) {
    const quantumSpans = collectQuantumOperatorSpans(body, palette, options);
    if (quantumSpans.length > 0) {
      const filtered = allSpans.filter(
        (s) => !quantumSpans.some((q) => q.start <= s.start && s.end <= q.end)
      );
      allSpans.length = 0;
      allSpans.push(...filtered, ...quantumSpans);
    }
  }

  // Filter out any spans strictly inside opaque ranges (comments, strings, \text),
  // EXCEPT unit spans (e.g. \text{A/W}, \text{m/s}) which are recognized physical units
  const opaqueRanges = findOpaqueRanges(body);
  const cleanSpans = allSpans.filter((s) => {
    if (s.color === palette.unit) return true;
    return !opaqueRanges.some((o) => o.start <= s.start && s.end <= o.end);
  });

  // Return strictly monotonic, non-overlapping spans
  return selectColorSpans(body, cleanSpans);
}
