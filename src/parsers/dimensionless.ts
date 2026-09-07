// src/parsers/dimensionless.ts

import { COLORS, ColorPalette } from "../config";
import { ColorSpan } from "../utils/spans";

export interface DimensionlessSpan {
  start: number;
  end: number;
  text: string;
}

export const COMMON_DIMENSIONLESS_NUMBERS = [
  "Re", // Reynolds number
  "Ma", // Mach number
  "Pr", // Prandtl number
  "Nu", // Nusselt number
  "Kn", // Knudsen number
  "Sc", // Schmidt number
  "Pe", // Péclet number
  "Gr", // Grashof number
  "Ra", // Rayleigh number
  "We", // Weber number
  "Fr", // Froude number
  "St", // Strouhal number
  "Bi", // Biot number
  "Fo", // Fourier number
];

/**
 * Scans a LaTeX math body to identify physical & engineering dimensionless numbers.
 * Enforces strict contiguity:
 * - 'Re' or '\text{Re}' is recognized as Reynolds number.
 * - 'R e' or 'R \, e' (with spaces) is explicitly NOT recognized, allowing the user
 *   to write R and e as separate algebraic variables without interference.
 * - '\Re' is preserved as the standard LaTeX real-part operator.
 */
export function findDimensionlessSpans(body: string): DimensionlessSpan[] {
  const spans: DimensionlessSpan[] = [];

  function addSpan(start: number, end: number, text: string) {
    if (start >= end) return;
    if (!spans.some((s) => start < s.end && end > s.start)) {
      spans.push({ start, end, text });
    }
  }

  const list = COMMON_DIMENSIONLESS_NUMBERS.join("|");

  // 1. Text or mathrm wrapped: \text{Re}, \mathrm{Ma}, etc.
  const textRegex = new RegExp(
    `\\\\(?:text|mathrm)\\s*\\{\\s*(${list})\\s*\\}`,
    "g"
  );
  let match: RegExpExecArray | null;
  while ((match = textRegex.exec(body)) !== null) {
    addSpan(match.index, match.index + match[0].length, match[0]);
  }

  // 2. Contiguous bare symbols: Re, Ma, Pr, etc.
  // Must NOT be preceded by backslash (e.g. \Re) or any letter.
  // Must NOT be followed by any letter.
  const bareRegex = new RegExp(
    `(?:^|[^\\\\a-zA-Z])(${list})(?![a-zA-Z])`,
    "g"
  );
  while ((match = bareRegex.exec(body)) !== null) {
    const symbol = match[1];
    const symStart = match.index + (match[0].length - symbol.length);
    const symEnd = symStart + symbol.length;
    addSpan(symStart, symEnd, symbol);
  }

  return spans.sort((a, b) => a.start - b.start);
}

/**
 * Returns color spans for dimensionless numbers using palette.orange (constants/coefficients).
 */
export function collectDimensionlessSpans(
  body: string,
  palette: ColorPalette = COLORS,
  dimSpans?: DimensionlessSpan[]
): ColorSpan[] {
  const spans = dimSpans || findDimensionlessSpans(body);
  return spans.map((s) => ({
    start: s.start,
    end: s.end,
    color: palette.orange || "#e0af68",
    priority: 22,
  }));
}
