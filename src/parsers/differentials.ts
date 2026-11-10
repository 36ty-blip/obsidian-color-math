import { COLORS, ColorPalette, ColorMathOptions, VARIABLE_HASH_PALETTE, hashStringToColor } from "../config";
import { ColorSpan } from "../utils/spans";
import { maskComments } from "../utils/latex_helpers";
import { lookupCatalog } from "./catalog";

export interface DifferentialSpan {
  start: number;
  end: number;
  text: string;
  kind: "differential" | "derivative_fraction";
}

const DIFF_FONT_COMMANDS =
  "mathbf|boldsymbol|pmb|vec|hat|bar|tilde|dot|ddot|mathit|mathrm|mathbb|mathcal|mathfrak|msf|Bbb|check|acute|grave|breve|overline|underline|widetilde|widehat";

const DIFF_GREEK_COMMANDS =
  "alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|varkappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|ell";

const DIFF_VAR_PATTERN =
  "(?:\\\\(?:" +
  DIFF_FONT_COMMANDS +
  ")(?:\\{[^{}]+\\}|\\s+[a-zA-Z])|\\\\(?:" +
  DIFF_GREEK_COMMANDS +
  ")(?![a-zA-Z])|[a-zA-Z]|[\\u0370-\\u03FF]|\\uD835[\\uDC00-\\uDFFF])";

const DERIV_FRAC_REGEX = new RegExp(
  "\\\\(?:dfrac|tfrac|frac)\\s*\\{\\s*(?:d|\\\\partial|\\\\mathrm\\{d\\}|∂)(?:\\^\\{?\\d+\\}?)?\\s*(?:" +
    DIFF_VAR_PATTERN +
    ")?\\s*\\}\\s*\\{\\s*(?:d|\\\\partial|\\\\mathrm\\{d\\}|∂)\\s*" +
    DIFF_VAR_PATTERN +
    "(?:\\^\\{?\\d+\\}?)?(?:\\s*(?:\\\\dd(?![a-zA-Z])|d|\\\\partial|\\\\mathrm\\{d\\}|∂)\\s*" +
    DIFF_VAR_PATTERN +
    ")*\\s*\\}",
  "g"
);

const DIFF_REGEX = new RegExp(
  "(?:^|[\\s+\\-=*(){}\\]|]|\\[|\\\\,|\\\\:|\\\\;|\\\\quad|\\\\qquad|~|_[a-zA-Z]|\\\\[a-zA-Z]+(?=\\\\dd)|\\\\right[\\s\\]})|.>])(\\s*(?:\\\\dd(?![a-zA-Z])|d|\\\\partial|\\\\mathrm\\{d\\}|\\\\delta|δ|delta(?![a-zA-Z])|∂)\\s*" +
    DIFF_VAR_PATTERN +
    "(?![a-zA-Z0-9_])(?:\\^\\{?\\d+\\}?)?)",
  "g"
);

const D_OPERATOR_REGEX = /(?:\\dd(?![a-zA-Z])|d|\\partial|\\mathrm\{d\}|\\delta|δ|delta(?![a-zA-Z])|∂)/;

export interface BoundarySpan {
  start: number;
  end: number;
  text: string;
}

export const BOUNDARY_DOMAIN_PATTERN =
  /^(?:\\partial|∂)\s*(?:\\{[^{}]+\\}|\\Omega|\\mathcal\{[A-Za-z]+\}|\\Sigma|\\Gamma|[VDMBUKS]|Ω|Σ|Γ)(?![a-z])/;

export const SUBDIFFERENTIAL_PATTERN =
  /^(?:\\partial|∂)\s*(?:[fgh]|\\ell|\\phi|\\psi)(?![a-zA-Z])/;

const BOUNDARY_DOMAIN_SCANNER = new RegExp(
  "(?:^|[\\s+\\-=*(){}\\]]|[\\[,;]|\\\\,|\\\\:|\\\\;|\\\\quad|\\\\qquad|~)(\\s*(?:\\\\partial|∂)\\s*(?:\\{[^{}]+\\}|\\\\Omega|\\\\mathcal\\{[A-Za-z]+\\}|\\\\Sigma|\\\\Gamma|[VDMBUKS]|Ω|Σ|Γ)(?:_[a-zA-Z0-9]+|_\\{[^{}]+\\})?(?![a-z]))",
  "g"
);


export function findBoundarySpans(rawBody: string): BoundarySpan[] {
  if (!rawBody.includes("\\partial") && !rawBody.includes("∂")) {
    return [];
  }
  const body = rawBody.includes("%") ? maskComments(rawBody) : rawBody;
  const spans: BoundarySpan[] = [];
  BOUNDARY_DOMAIN_SCANNER.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BOUNDARY_DOMAIN_SCANNER.exec(body)) !== null) {
    const fullMatch = match[0];
    const boundaryGroup = match[1];
    const bStart = match.index + (fullMatch.length - boundaryGroup.length);
    const dOffset = boundaryGroup.search(/(?:\\partial|∂)/);
    const actualStart = bStart + dOffset;
    const bText = boundaryGroup.slice(dOffset);
    const opLen = bText.startsWith("\\partial") ? 8 : 1;
    const opEnd = actualStart + opLen;
    if (!spans.some((s) => actualStart < s.end && opEnd > s.start)) {
      spans.push({ start: actualStart, end: opEnd, text: bText.slice(0, opLen) });
    }
  }
  return spans;
}

/**
 * Scans a LaTeX math body to identify differential spans and derivative fractions.
 * Handles:
 * - Derivative fractions: \frac{d}{dx}, \frac{df}{dx}, \frac{\partial \psi}{\partial t}, \frac{d^2 y}{dx^2}
 * - Infinitesimal differentials: dx, dt, dy, dz, dr, d\theta, d\phi, \partial x, \partial t
 * Protects standalone $d$ (e.g. $W = Fd$, $d = vt$) from being treated as differentials.
 * Protects boundary surface manifolds (\partial\Omega, \partial V, \partial D, \partial M) from being treated as differentials.
 */
export function findDifferentialSpans(rawBody: string): DifferentialSpan[] {
  if (
    !rawBody.includes("d") &&
    !rawBody.includes("\\partial") &&
    !rawBody.includes("∂") &&
    !rawBody.includes("\\delta") &&
    !rawBody.includes("δ") &&
    !rawBody.includes("delta") &&
    !rawBody.includes("partial")
  ) {
    return [];
  }
  const body = rawBody.includes("%") ? maskComments(rawBody) : rawBody;
  const spans: DifferentialSpan[] = [];

  function addSpan(start: number, end: number, text: string, kind: "differential" | "derivative_fraction") {
    if (start >= end) return;
    if (!spans.some((s) => start < s.end && end > s.start)) {
      spans.push({ start, end, text, kind });
    }
  }

  // 1. Derivative fractions: \frac{d}{dx}, \frac{df}{dx}, \frac{\partial \psi}{\partial t}, \frac{d^2 y}{dx^2}
  DERIV_FRAC_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DERIV_FRAC_REGEX.exec(body)) !== null) {
    addSpan(match.index, match.index + match[0].length, match[0], "derivative_fraction");
  }

  // 2. Infinitesimal differentials: dx, dt, dy, dz, dr, d\theta, d\phi, \partial x, \partial t, \delta x, δx
  DIFF_REGEX.lastIndex = 0;
  while ((match = DIFF_REGEX.exec(body)) !== null) {
    const fullMatch = match[0];
    const diffGroup = match[1];
    const diffStart = match.index + (fullMatch.length - diffGroup.length);
    const dOffset = diffGroup.search(D_OPERATOR_REGEX);
    const actualStart = diffStart + dOffset;
    const diffText = diffGroup.slice(dOffset);
    const diffEnd = actualStart + diffText.length;

    // Protect boundary surface manifolds (\partial\Omega, \partial V, \partial D, etc.)
    // Protect subdifferential set operators (\partial f, \partial g, \partial\phi)
    const trimmed = diffText.trim();
    if (BOUNDARY_DOMAIN_PATTERN.test(trimmed) || SUBDIFFERENTIAL_PATTERN.test(trimmed)) {
      continue;
    }

    addSpan(actualStart, diffEnd, diffText, "differential");
  }

  // 3. Standalone derivative operators: \partial, bare partial, and Unicode ∂
  const STANDALONE_PARTIAL_REGEX = /(?:^|[^\\])(\\partial(?![a-zA-Z])|∂|partial(?![a-zA-Z]))/g;
  STANDALONE_PARTIAL_REGEX.lastIndex = 0;
  while ((match = STANDALONE_PARTIAL_REGEX.exec(body)) !== null) {
    const full = match[0];
    const group = match[1];
    const start = match.index + (full.length - group.length);
    const end = start + group.length;

    if (BOUNDARY_DOMAIN_PATTERN.test(body.slice(start)) || SUBDIFFERENTIAL_PATTERN.test(body.slice(start))) {
      continue;
    }

    addSpan(start, end, group, "differential");
  }

  return spans.sort((a, b) => a.start - b.start);
}

/**
 * Returns color spans for differentials and derivative operators using palette.derivative.
 */
export function collectDifferentialSpans(
  body: string,
  palette: ColorPalette = COLORS,
  diffSpans?: DifferentialSpan[],
  options?: ColorMathOptions,
  hashPalette: string[] = VARIABLE_HASH_PALETTE
): ColorSpan[] {
  const diffs = diffSpans || findDifferentialSpans(body);
  const filtered = diffs.filter((d) => {
    if (d.kind === "derivative_fraction" && options?.colorDerivativeFractions === false) {
      return false;
    }
    if (d.kind === "differential" && options?.colorInfinitesimals === false) {
      return false;
    }
    return true;
  });

  const spans: ColorSpan[] = [];
  for (const d of filtered) {
    if (d.kind === "differential") {
      const opMatch = d.text.match(
        /^(?:\\dd(?![a-zA-Z])|\\partial|\\mathrm\{d\}|\\delta|δ|delta(?![a-zA-Z])|d|∂)(?:\^\{?\d+\}?)?\s*/
      );
      if (opMatch) {
        const opSymbol = opMatch[0].trimEnd();
        const opLen = opSymbol.length;
        const trailingVar = d.text.slice(opMatch[0].length).trim();

        if (trailingVar.length > 0) {
          if (options?.variableDataFlow) {
            // Operator in derivative purple
            spans.push({
              start: d.start,
              end: d.start + opLen,
              color: palette.derivative || "#bb9af7",
              priority: 24,
              role: "derivative",
            });
            // Coordinate variable in its unique variable hash color
            const rawVar = trailingVar.replace(/^[{]|[}]$/g, "");
            const canonicalVar = lookupCatalog(rawVar)?.canonical || rawVar;
            const varColor = hashStringToColor(canonicalVar, hashPalette);
            spans.push({
              start: d.start + opMatch[0].length,
              end: d.end,
              color: varColor,
              priority: 26,
              role: "variable",
            });
            continue;
          } else {
            // Monolithic differential styling when variableDataFlow is inactive
            spans.push({
              start: d.start,
              end: d.end,
              color: palette.derivative || "#bb9af7",
              priority: 24,
              role: "derivative",
            });
            continue;
          }
        } else {
          // Standalone operator (e.g. \partial, ∂, bare partial)
          spans.push({
            start: d.start,
            end: d.end,
            color: palette.derivative || "#bb9af7",
            priority: 24,
            role: "derivative",
          });
          continue;
        }
      }
    }

    // Default (e.g. derivative fractions \frac{df}{dx})
    spans.push({
      start: d.start,
      end: d.end,
      color: palette.derivative || "#bb9af7",
      priority: 24,
      role: "derivative",
    });
  }

  return spans;
}
