// src/parsers/differentials.ts

import { COLORS, ColorPalette } from "../config";
import { ColorSpan } from "../utils/spans";

export interface DifferentialSpan {
  start: number;
  end: number;
  text: string;
  kind: "differential" | "derivative_fraction";
}

/**
 * Scans a LaTeX math body to identify differentials and derivative operators:
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
  const derivFracRegex =
    /\\frac\s*\{\s*(?:d|\\partial|\\mathrm\{d\})(?:\^\{?\d+\}?)?\s*(?:[a-zA-Z\\]+)?\s*\}\s*\{\s*(?:d|\\partial|\\mathrm\{d\})\s*(?:[a-zA-Z]|\\\\[a-zA-Z]+)(?:\^\{?\d+\}?)?(?:\s*(?:d|\\partial|\\mathrm\{d\})\s*(?:[a-zA-Z]|\\\\[a-zA-Z]+))*\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = derivFracRegex.exec(body)) !== null) {
    addSpan(match.index, match.index + match[0].length, match[0], "derivative_fraction");
  }

  // 2. Infinitesimal differentials: dx, dt, dy, dz, dr, d\theta, d\phi, \partial x, \partial t
  const diffRegex =
    /(?:^|[\s+\-=*({]|\[|\\,|\\:|\\;|\\quad|\\qquad|~)(\s*(?:d|\\partial|\\mathrm\{d\}|\\delta)\s*(?:\\[a-zA-Z]+|[a-zA-Z])(?![a-zA-Z0-9_({])(?:\^\{?\d+\}?)?)/g;
  while ((match = diffRegex.exec(body)) !== null) {
    const fullMatch = match[0];
    const diffGroup = match[1];
    const diffStart = match.index + (fullMatch.length - diffGroup.length);
    const dOffset = diffGroup.search(/(?:d|\\partial|\\mathrm\{d\}|\\delta)/);
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
