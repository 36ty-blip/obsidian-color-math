// src/parsers/units.ts

import { COLORS, ColorPalette } from "../config";
import { ColorSpan } from "../utils/spans";

export interface UnitSpan {
  start: number;
  end: number;
  text: string;
}

const SI_UNITS =
  "m|s|g|Hz|N|Pa|J|W|C|V|F|T|H|mol|L|l|K|bar|atm|torr|eV|cal|rad|deg|\\\\Omega|dB|bps|B|Ω";
const PREFIXES = "k|M|G|T|c|m|n|p|f|d|da|\\\\mu|µ";

// SI units that are ALWAYS micro units when attached to \mu (even without preceding number)
const SAFE_MICRO_UNITS = "m|s|g|mol|Hz|Pa|bar|rad|\\\\Omega|L|l";
// SI units that need a preceding number or \text{} when attached to \mu to avoid colliding with variables (e.g. F = \mu N)
const AMBIGUOUS_MICRO_UNITS = "N|A|V|F|H|W|J|C";

/**
 * Scans a LaTeX math body to identify physical unit spans.
 * Handles:
 * - Metric prefix combos: \mu\text{m}, \mu m, \mu s, \mu g, \mu\Omega
 * - Magnitudes (numbers) followed by units: 1.064\, \mu m, 10 m/s, 500 nm, 300 K, 50 kg
 * - Explicit unit wrappers: \text{m/s}, \mathrm{kg}, \text{nm}
 * - Degree units: ^\circ\text{C}, ^\circ C
 * Protects standalone symbols like \mu = 0.5 or F = \mu N from being treated as units.
 */
export function findUnitSpans(body: string): UnitSpan[] {
  const spans: UnitSpan[] = [];

  function addSpan(start: number, end: number, text: string) {
    if (start >= end) return;
    if (!spans.some((s) => start < s.end && end > s.start)) {
      spans.push({ start, end, text });
    }
  }

  // 1. Micro units with \text or bare
  // 1a. \mu\text{...} or \mu\mathrm{...}
  const microTextRegex =
    /\\mu\s*(?:\\(?:text|mathrm)\s*\{\s*([A-Za-z°℃%Ωμ/\^\-0-9\s\.\\]+?)\s*\})(?:\^\{?-?\d+\}?)?/g;
  let match: RegExpExecArray | null;
  while ((match = microTextRegex.exec(body)) !== null) {
    addSpan(match.index, match.index + match[0].length, match[0]);
  }

  // 1b. Bare \mu with safe micro units: \mu m, \mu s, \mu g, \mu\Omega, etc.
  const safeMicroRegex = new RegExp(
    `\\\\mu\\s*(${SAFE_MICRO_UNITS})(?![A-Za-z0-9_])(?:\\^\\{?-?\\d+\\}?)?`,
    "g"
  );
  while ((match = safeMicroRegex.exec(body)) !== null) {
    addSpan(match.index, match.index + match[0].length, match[0]);
  }

  // 2. Degree units: ^\circ C, ^\circ\text{C}, ^\circ F
  const degRegex =
    /\^\s*\\circ\s*(?:\\(?:text|mathrm)\s*\{[A-Za-z]+\}|[A-Za-z]+)/g;
  while ((match = degRegex.exec(body)) !== null) {
    addSpan(match.index, match.index + match[0].length, match[0]);
  }

  // 3. Units preceded by a number (Magnitude + Unit)
  const numberUnitRegex = new RegExp(
    `(?<=^|[^A-Za-z0-9_])(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:\\s*(?:\\\\times|\\\\cdot|·|\\*)\\s*10\\^\\{?[+-]?\\d+\\}?|\\s*[eE][+-]?\\d+)?(?:\\s*|\\\\,|\\\\:|\\\\;|\\\\quad|\\\\qquad|~)*` +
      `(` +
      // Sub-case A: \text{...} or \mathrm{...}
      `\\\\(?:text|mathrm)\\s*\\{[^}]+\\}(?:\\^\\{?-?\\d+\\}?)?` +
      `|` +
      // Sub-case B: \mu followed by ambiguous or safe unit (e.g. 5 \mu N, 1.064 \mu m)
      `\\\\mu\\s*(?:${SAFE_MICRO_UNITS}|${AMBIGUOUS_MICRO_UNITS})(?![A-Za-z0-9_])(?:\\^\\{?-?\\d+\\}?)?` +
      `|` +
      // Sub-case C: Bare SI units (with optional prefix, compound '/', and exponents)
      `(?:(?:${PREFIXES})?(?:${SI_UNITS}))(?:\\/(?:(?:${PREFIXES})?(?:${SI_UNITS})))*(?:\\^\\{?-?\\d+\\}?)?(?![A-Za-z0-9_\\(\\{])` +
      `)`,
    "g"
  );

  while ((match = numberUnitRegex.exec(body)) !== null) {
    const fullMatch = match[0];
    const unitPart = match[1];
    const unitOffset = fullMatch.lastIndexOf(unitPart);
    const unitStart = match.index + unitOffset;
    const unitEnd = unitStart + unitPart.length;
    addSpan(unitStart, unitEnd, unitPart);
  }

  // 4. Standalone Text / mathrm units with \text{...} or \mathrm{...}
  const textUnitRegex =
    /\\(?:text|mathrm)\s*\{\s*([A-Za-z°℃%Ωμ/\^\-0-9\s\.\\]+?)\s*\}(?:\^\{?-?\d+\}?)?/g;
  while ((match = textUnitRegex.exec(body)) !== null) {
    const inner = match[1].trim();
    const isUnit = new RegExp(
      `^(?:${PREFIXES})?(?:${SI_UNITS})(?:\\/(?:${PREFIXES})?(?:${SI_UNITS}))*(?:\\^\\{?-?\\d+\\}?)?$`,
      "i"
    ).test(inner);

    if (isUnit) {
      addSpan(match.index, match.index + match[0].length, match[0]);
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}

/**
 * Returns color spans for units to be rendered with palette.unit color.
 */
export function collectUnitSpans(
  body: string,
  palette: ColorPalette = COLORS,
  unitSpans?: UnitSpan[]
): ColorSpan[] {
  const units = unitSpans || findUnitSpans(body);
  return units.map((u) => ({
    start: u.start,
    end: u.end,
    color: palette.unit || "#73daca",
    priority: 25,
  }));
}
