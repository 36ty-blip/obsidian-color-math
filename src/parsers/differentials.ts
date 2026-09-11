// src/parsers/differentials.ts

import { COLORS, ColorPalette } from "../config";
import { ColorSpan } from "../utils/spans";

export interface DifferentialSpan {
  start: number;
  end: number;
  text: string;
  kind: "differential" | "derivative_fraction";
}

const DERIV_FRAC_REGEX =
  /\\frac\s*\{\s*(?:d|\\partial|\\mathrm\{d\})(?:\^\{?\d+\}?)?\s*(?:[a-zA-Z\\]+)?\s*\}\s*\{\s*(?:d|\\partial|\\mathrm\{d\})\s*(?:[a-zA-Z]|\\\\[a-zA-Z]+)(?:\^\{?\d+\}?)?(?:\s*(?:d|\\partial|\\mathrm\{d\})\s*(?:[a-zA-Z]|\\\\[a-zA-Z]+))*\s*\}/g;

const DIFF_REGEX =
  /(?:^|[\s+\-=*({]|\[|\\,|\\:|\\;|\\quad|\\qquad|~)(\s*(?:d|\\partial|\\mathrm\{d\}|\\delta)\s*(?:\\[a-zA-Z]+|[a-zA-Z])(?![a-zA-Z0-9_({])(?:\^\{?\d+\}?)?)/g;

const D_OPERATOR_REGEX = /(?:d|\\partial|\\mathrm\{d\}|\\delta)/;

/**
 * Scans a LaTeX math body to identify differential spans and derivative fractions.
 * Handles:
 * - Derivative fractions: \frac{d}{dx}, \frac{df}{dx}, \frac{\partial \psi}{\partial t}, \frac{d^2 y}{dx^2}
 * - Infinitesimal differentials: dx, dt, dy, dz, dr, d\theta, d\phi, \partial x, \partial t
 * Protects standalone $d$ (e.g. $W = Fd$, $d = vt$) from being treated as differentials.
 */
export function findDifferentialSpans(body: string): DifferentialSpan[] {
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

  // 2. Infinitesimal differentials: dx, dt, dy, dz, dr, d\theta, d\phi, \partial x, \partial t
  DIFF_REGEX.lastIndex = 0;
  while ((match = DIFF_REGEX.exec(body)) !== null) {
    const fullMatch = match[0];
    const diffGroup = match[1];
    const diffStart = match.index + (fullMatch.length - diffGroup.length);
    const dOffset = diffGroup.search(D_OPERATOR_REGEX);
    const actualStart = diffStart + dOffset;
    const diffText = diffGroup.slice(dOffset);
    const diffEnd = actualStart + diffText.length;
    addSpan(actualStart, diffEnd, diffText, "differential");
  }

  return spans.sort((a, b) => a.start - b.start);
}

/**
 * Returns color spans for differentials and derivative operators using palette.derivative.
 */
export function collectDifferentialSpans(
  body: string,
  palette: ColorPalette = COLORS,
  diffSpans?: DifferentialSpan[]
): ColorSpan[] {
  const diffs = diffSpans || findDifferentialSpans(body);
  return diffs.map((d) => ({
    start: d.start,
    end: d.end,
    color: palette.derivative || "#bb9af7",
    priority: 24,
  }));
}
