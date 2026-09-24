// src/parsers/modes.ts

import { ColorPalette, ActiveMathMode, ColorMathOptions, hashStringToColor } from "../config";
import { ColorSpan } from "../utils/spans";
import { findDifferentialSpans, DifferentialSpan } from "./differentials";

/**
 * Domain-specific operators, tensors, and notation collections across the 14 modes.
 */

// Geometry & Tensors
const GEOMETRY_MACROS = [
  "\\Gamma", // Christoffel
  "\\wedge", "\\bigwedge", // Exterior wedge
  "\\star", // Hodge star
  "\\mathcal{L}", "\\pounds", // Lie derivative
];

const COVARIANT_DERIV_REGEX = /\\nabla_\{?[a-zA-Z\\]+\}?/g;
const METRIC_TENSOR_REGEX = /(?:g|\\eta)_\{?[a-zA-Z\\]+\}?/g;
const RIEMANN_CURVATURE_REGEX = /R\^\{?[a-zA-Z\\]+\}?_\{?[a-zA-Z\\]+\}?|R_\{?[a-zA-Z\\]+\}?|G_\{?[a-zA-Z\\]+\}?/g;

// Transport & PDEs
const PDE_MACROS = [
  "\\nabla", "\\vec{\\nabla}",
  "\\div", "\\curl", "\\rot",
  "\\Delta", "\\Box",
];

const MATERIAL_DERIV_REGEX = /\\(?:d|t)?frac\{\s*(?:D|\\mathrm\{D\})\s*(?:\\[a-zA-Z]+|\{[^{}]*\}|[a-zA-Z])*\s*\}\{\s*(?:D|\\mathrm\{D\})\s*t\s*\}/g;
const BOUNDARY_DOMAIN_REGEX = /\\partial\s*(?:\\Omega|\\mathcal\{D\}|V|\Omega)/g;

// Dynamics & ODEs
const POISSON_BRACKET_REGEX = /\\\{\s*[a-zA-Z]\s*,\s*[a-zA-Z]\s*\\\}(?:_\{?[a-zA-Z, ]*\}?)?/g;
const JACOBIAN_REGEX = /(?:\\mathbf\{J\}|\bJ\b)(?:\s*\([a-zA-Z0-9_, ]*\))?/g;

// Stochastic & Probability
const STOCHASTIC_DIFF_REGEX = /\bd[WXB](?:_\{?[a-zA-Z0-9]+\}?|\([a-zA-Z0-9]+\))?/g;
const PROBABILITY_MACROS = [
  "\\mathbb{E}", "\\operatorname{Var}", "\\operatorname{Cov}", "\\mathbb{P}",
];

// Complex Analysis
const WIRTINGER_REGEX = /\\(?:d|t)?frac\{\s*(?:\\partial|∂)\s*([a-zA-Z\\]*)\s*\}\{\s*(?:\\partial|∂)\s*(?:z|\\bar\{z\}|\\bar\s*z)\s*\}|\\partial_\{?z\}?|\\partial_\{?\\bar\{z\}\}?/g;
const RESIDUE_REGEX = /(?:\\operatorname\{Res\}|\\mathrm\{Res\}|\bRes\b)/g;

// Linear & Abstract Algebra
const ALGEBRA_MACROS = [
  "\\det", "\\ker", "\\operatorname{im}", "\\operatorname{rank}",
  "\\otimes", "\\oplus", "\\cong", "\\triangleleft", "\\rtimes",
  "\\operatorname{Hom}", "\\operatorname{Aut}",
];

/**
 * Finds macro occurrences with strict LaTeX command boundary (?![a-zA-Z])
 * so prefixes never collide with longer command names (e.g. \tr inside \triangleleft, \le inside \left).
 */
function findMacroSpans(
  body: string,
  macros: string[],
  color: string | ((macro: string) => string),
  priority: number
): ColorSpan[] {
  const spans: ColorSpan[] = [];
  const sorted = [...macros].sort((a, b) => b.length - a.length);
  for (const macro of sorted) {
    const escaped = macro.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const boundary = /[a-zA-Z]$/.test(macro) ? "(?![a-zA-Z])" : "";
    const regex = new RegExp(escaped + boundary, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(body)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (!spans.some((s) => Math.max(s.start, start) < Math.min(s.end, end))) {
        const assignedColor = typeof color === "function" ? color(macro) : color;
        spans.push({ start, end, color: assignedColor, priority });
      }
    }
  }
  return spans;
}

/**
 * Returns the effective Super-Family or Granular Mode.
 */
export function resolveModeCategory(mode?: ActiveMathMode): string {
  if (!mode) return "analysis";
  if (mode === "geometry" || mode === "geometry_tensors" || mode === "topology") return "geometry";
  if (mode === "pde" || mode === "pde_transport" || mode === "continuum") return "pde";
  if (mode === "dynamics" || mode === "ode_dynamics" || mode === "optimization") return "dynamics";
  if (mode === "quantum_stochastic" || mode === "quantum" || mode === "stochastic" || mode === "probability") return "quantum_stochastic";
  if (mode === "algebra" || mode === "linear_algebra" || mode === "abstract_algebra" || mode === "number_theory" || mode === "logic_sets") return "algebra";
  return "analysis";
}

/**
 * Collects domain-specific symbols, tensors, and operators depending on the active mathematical mode.
 */
export function collectDomainOperatorSpans(
  body: string,
  palette: ColorPalette,
  mode: ActiveMathMode = "analysis"
): ColorSpan[] {
  const spans: ColorSpan[] = [];
  const category = resolveModeCategory(mode);

  // 1. Geometry & Tensors
  if (category === "geometry") {
    const geoColor = palette.arrow || "#f7768e"; // High-visibility geometric accent
    const connColor = palette.orange || "#e0af68"; // Connection / Christoffel

    spans.push(
      ...findMacroSpans(
        body,
        GEOMETRY_MACROS,
        (macro) => (macro === "\\Gamma" ? connColor : geoColor),
        25
      )
    );

    let match: RegExpExecArray | null;
    COVARIANT_DERIV_REGEX.lastIndex = 0;
    while ((match = COVARIANT_DERIV_REGEX.exec(body)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        color: connColor,
        priority: 26,
      });
    }

    RIEMANN_CURVATURE_REGEX.lastIndex = 0;
    while ((match = RIEMANN_CURVATURE_REGEX.exec(body)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        color: palette.main || "#7aa2f7",
        priority: 25,
      });
    }
  }

  // 2. Transport & PDEs
  if (category === "pde") {
    const pdeColor = palette.energyOperator || "#2ac3de";
    spans.push(...findMacroSpans(body, PDE_MACROS, pdeColor, 25));

    let match: RegExpExecArray | null;
    MATERIAL_DERIV_REGEX.lastIndex = 0;
    while ((match = MATERIAL_DERIV_REGEX.exec(body)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        color: palette.orange || "#ff9e64",
        priority: 28,
      });
    }

    BOUNDARY_DOMAIN_REGEX.lastIndex = 0;
    while ((match = BOUNDARY_DOMAIN_REGEX.exec(body)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        color: palette.chain || "#9ece6a",
        priority: 25,
      });
    }
  }

  // 3. Dynamics & ODEs
  if (category === "dynamics") {
    let match: RegExpExecArray | null;
    POISSON_BRACKET_REGEX.lastIndex = 0;
    while ((match = POISSON_BRACKET_REGEX.exec(body)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        color: palette.orange || "#e0af68",
        priority: 25,
      });
    }
  }

  // 4. Stochastic & Probability
  if (category === "quantum_stochastic" && (mode === "stochastic" || mode === "probability" || mode === "quantum_stochastic")) {
    let match: RegExpExecArray | null;
    STOCHASTIC_DIFF_REGEX.lastIndex = 0;
    while ((match = STOCHASTIC_DIFF_REGEX.exec(body)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        color: palette.unit || "#73daca",
        priority: 26,
      });
    }

    const probColor = palette.orange || "#e0af68";
    spans.push(...findMacroSpans(body, PROBABILITY_MACROS, probColor, 25));
  }

  // 5. Complex Analysis
  if (mode === "complex" || (category === "analysis" && body.includes("\\partial") && body.includes("z"))) {
    let match: RegExpExecArray | null;
    WIRTINGER_REGEX.lastIndex = 0;
    while ((match = WIRTINGER_REGEX.exec(body)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        color: palette.main || "#7aa2f7",
        priority: 28,
      });
    }

    RESIDUE_REGEX.lastIndex = 0;
    while ((match = RESIDUE_REGEX.exec(body)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        color: palette.orange || "#e0af68",
        priority: 25,
      });
    }
  }

  // 6. Algebra & Discrete
  if (category === "algebra") {
    const algColor = palette.orange || "#e0af68";
    spans.push(...findMacroSpans(body, ALGEBRA_MACROS, algColor, 22));
  }

  return spans;
}

/**
 * Parses a derivative fraction string (e.g. \frac{\partial x}{\partial t}) into its constituent parts:
 * - numeratorVar (e.g. "x" or undefined)
 * - denominatorVar (e.g. "t" or "x")
 * - isPartial (true if \partial, false if d)
 */
function parseDerivativeFractionDetails(fracText: string): {
  numeratorVar?: string;
  denominatorVar?: string;
  isPartial: boolean;
  numStartOffset: number;
  numEndOffset: number;
  denomStartOffset: number;
  denomEndOffset: number;
} | null {
  const match = fracText.match(
    /^\\(?:dfrac|tfrac|frac)\s*\{(\s*(?:d|\\partial|\\mathrm\{d\}|∂)(?:\^\{?\d+\}?)?\s*([a-zA-Z\\]*)\s*)\}\s*\{(\s*(?:d|\\partial|\\mathrm\{d\}|∂)\s*([a-zA-Z\\]+)(?:\^\{?\d+\}?)?\s*)\}$/
  );
  if (!match) return null;

  const isPartial = match[0].includes("partial") || match[0].includes("∂");
  const numInner = match[1];
  const rawNumVar = match[2].trim();
  const denomInner = match[3];
  const rawDenomVar = match[4].trim();

  const numStartOffset = fracText.indexOf("{") + 1;
  const numEndOffset = numStartOffset + numInner.length;
  const denomStartOffset = fracText.indexOf("{", numEndOffset) + 1;
  const denomEndOffset = denomStartOffset + denomInner.length;

  return {
    numeratorVar: rawNumVar || undefined,
    denominatorVar: rawDenomVar || undefined,
    isPartial,
    numStartOffset,
    numEndOffset,
    denomStartOffset,
    denomEndOffset,
  };
}

/**
 * Generates mode-aware color spans for derivative fractions according to the active discipline.
 */
export function generateModeAwareDerivativeSpans(
  body: string,
  palette: ColorPalette,
  diffSpans: DifferentialSpan[],
  mode: ActiveMathMode = "analysis",
  options?: ColorMathOptions
): ColorSpan[] {
  const spans: ColorSpan[] = [];
  const category = resolveModeCategory(mode);

  for (const span of diffSpans) {
    if (span.kind !== "derivative_fraction") {
      // Infinitesimals (e.g. dx, dt)
      spans.push({
        start: span.start,
        end: span.end,
        color: palette.derivative || "#bb9af7",
        priority: 24,
      });
      continue;
    }

    const details = parseDerivativeFractionDetails(span.text);
    if (!details) {
      // Fallback: standard derivative fraction
      spans.push({
        start: span.start,
        end: span.end,
        color: palette.derivative || "#bb9af7",
        priority: 24,
      });
      continue;
    }

    const { numeratorVar, denominatorVar, numStartOffset, numEndOffset, denomStartOffset, denomEndOffset } = details;

    // --- MODE 1: GEOMETRIC & TANGENT VECTORS ---
    // Entire operator colored by coordinate direction (t -> Cyan, x -> Blue, etc.)
    if (category === "geometry") {
      const coordColor = denominatorVar ? hashStringToColor(denominatorVar) : (palette.derivative || "#bb9af7");

      if (!numeratorVar) {
        // Pure tangent vector \frac{\partial}{\partial t}: entire fraction gets coordinate color!
        spans.push({
          start: span.start,
          end: span.end,
          color: coordColor,
          priority: 25,
        });
      } else {
        // \frac{\partial x}{\partial t}: operator frame is coordColor, target variable x retains its own color!
        const numAbsStart = span.start + numStartOffset;
        const numAbsEnd = span.start + numEndOffset;
        const denomAbsStart = span.start + denomStartOffset;
        const denomAbsEnd = span.start + denomEndOffset;

        // Operator frame
        spans.push({
          start: span.start,
          end: span.end,
          color: coordColor,
          priority: 24,
        });

        // Independent numerator variable
        const numVarColor = hashStringToColor(numeratorVar);
        const varIdx = span.text.indexOf(numeratorVar, numStartOffset);
        if (varIdx !== -1) {
          spans.push({
            start: span.start + varIdx,
            end: span.start + varIdx + numeratorVar.length,
            color: numVarColor,
            priority: 27,
          });
        }
      }
      continue;
    }

    // --- MODE 2: TRANSPORT & PDES ---
    // Distinguishes Time derivatives from Spatial derivatives
    if (category === "pde") {
      const isTimeDeriv = denominatorVar === "t" || denominatorVar === "\\tau";
      const frameColor = isTimeDeriv
        ? (palette.energyOperator || "#7dcfff") // Temporal Cyan
        : (palette.derivative || "#bb9af7"); // Spatial / standard

      if (!numeratorVar) {
        spans.push({
          start: span.start,
          end: span.end,
          color: frameColor,
          priority: 25,
        });
      } else {
        spans.push({
          start: span.start,
          end: span.end,
          color: frameColor,
          priority: 24,
        });

        // Differentiated field (e.g. u, \rho) pops with its own variable color
        const varIdx = span.text.indexOf(numeratorVar, numStartOffset);
        if (varIdx !== -1) {
          spans.push({
            start: span.start + varIdx,
            end: span.start + varIdx + numeratorVar.length,
            color: hashStringToColor(numeratorVar),
            priority: 27,
          });
        }
      }
      continue;
    }

    // --- MODE 3: DYNAMICS & ODES ---
    // Numerator Target Tracking: \frac{d}{dt} frame stays quiet/uniform; numerator state variable pops
    if (category === "dynamics") {
      const baseFrameColor = palette.derivative || "#bb9af7";
      spans.push({
        start: span.start,
        end: span.end,
        color: baseFrameColor,
        priority: 24,
      });

      if (numeratorVar) {
        const varIdx = span.text.indexOf(numeratorVar, numStartOffset);
        if (varIdx !== -1) {
          spans.push({
            start: span.start + varIdx,
            end: span.start + varIdx + numeratorVar.length,
            color: hashStringToColor(numeratorVar),
            priority: 27,
          });
        }
      }
      continue;
    }

    // --- MODE 4: ANALYSIS & CALCULUS (OR DEFAULT) ---
    if (mode === "complex" && (span.text.includes("z") || span.text.includes("\\bar"))) {
      // Wirtinger derivative \frac{\partial f}{\partial z}
      spans.push({
        start: span.start,
        end: span.end,
        color: palette.main || "#7aa2f7",
        priority: 28,
      });
      continue;
    }

    // Differential 1-Form Quotient: symmetric 2-part split
    if (category === "analysis") {
      const numAbsStart = span.start + numStartOffset;
      const numAbsEnd = span.start + numEndOffset;
      const denomAbsStart = span.start + denomStartOffset;
      const denomAbsEnd = span.start + denomEndOffset;

      const numColor = numeratorVar ? hashStringToColor(numeratorVar) : (palette.main || "#7aa2f7");
      const denomColor = denominatorVar ? hashStringToColor(denominatorVar) : (palette.derivative || "#bb9af7");

      // Numerator half
      spans.push({
        start: numAbsStart,
        end: numEndOffset <= denomStartOffset ? numAbsEnd : denomAbsStart - 1,
        color: numColor,
        priority: 25,
      });

      // Denominator half
      spans.push({
        start: denomAbsStart,
        end: denomAbsEnd,
        color: denomColor,
        priority: 25,
      });
      continue;
    }

    // Fallback: standard derivative fraction
    spans.push({
      start: span.start,
      end: span.end,
      color: palette.derivative || "#bb9af7",
      priority: 24,
    });
  }

  return spans;
}
