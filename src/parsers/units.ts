// src/parsers/units.ts

import { COLORS, ColorPalette } from "../config";
import { ColorSpan } from "../utils/spans";

export interface UnitSpan {
  start: number;
  end: number;
  text: string;
}

export interface UnitOptions {
  allowSingleLetterUnits?: boolean;
  activeMode?: string;
  colorUnits?: boolean;
}

/**
 * Built-in static registry of unambiguous physical units.
 * Strictly excludes single letters by default to prevent algebraic collision ($12m + 5n$).
 */
export const WELL_KNOWN_UNITS = new Set<string>([
  // Metric prefixes + base/derived
  "kg", "mg", "ug", "µg", "km", "cm", "mm", "um", "µm", "nm", "pm",
  "ms", "ns", "ps", "us", "µs", "min", "hr",
  "Hz", "kHz", "MHz", "GHz", "THz",
  "kN", "MN", "kPa", "MPa", "GPa", "bar", "mbar", "atm", "torr",
  "kJ", "MJ", "GJ", "kW", "MW", "GW", "cal", "kcal", "eV", "keV", "MeV", "GeV",
  "mV", "kV", "mA", "uA", "µA", "pF", "nF", "uF", "µF", "mH", "uH", "µH",
  "kΩ", "MΩ", "ohm", "kohm", "Mohm", "\\Omega", "Ω", "Å", "\\AA",
  "mol", "mmol", "kmol", "deg", "rad", "mrad",
  "dB", "bps", "kbps", "Mbps", "Gbps", "kB", "MB", "GB",
  // Common Area & Volume & Exponent Units
  "m^2", "m^3", "cm^2", "cm^3", "mm^2", "mm^3", "km^2", "km^3",
  "s^2", "s^-1", "s^-2", "s^-3", "m^-1", "m^-2", "m^-3",
  // Common Compound Units
  "m/s", "m/s^2", "m/s^3", "km/h", "km/s", "cm/s", "ft/s", "mph", "knot",
  "kg/m^3", "g/cm^3", "g/mL", "g/L", "kg/L", "mol/L", "mmol/L", "mol/m^3",
  "rad/s", "rad/s^2", "deg/s",
  "N/m", "N/m^2", "N/mm^2", "J/mol", "kJ/mol", "J/kg", "kJ/kg", "W/m^2", "kW/m^2",
  "kWh", "MWh", "V/m", "A/m", "C/m^2", "A/m^2", "m^3/s", "L/s",
  // SI derived ratios & optical/electrical units
  "A/W", "W/A", "V/A", "C/V", "J/K", "W/K", "F/m", "H/m", "S/m", "cd/m^2", "lm/W"
]);

export const SINGLE_LETTER_UNITS = new Set<string>([
  "m", "s", "g", "N", "J", "W", "Pa", "V", "A", "C", "F", "T", "H", "K", "L", "l", "B"
]);

// SI units that are ALWAYS micro units when attached to \mu (even without preceding number)
const SAFE_MICRO_UNITS = "m|s|g|mol|Hz|Pa|bar|rad|\\\\Omega|L|l";
const AMBIGUOUS_MICRO_UNITS = "N|A|V|F|H|W|J|C";

const MICRO_TEXT_REGEX =
  /\\mu\s*(?:\\(?:text|mathrm)\s*\{\s*([A-Za-z°℃%ΩμÅ/^0-9\s.\\-]+?)\s*\})(?:\^\{?-?\d+\}?)?/g;

const SAFE_MICRO_REGEX = new RegExp(
  `\\\\mu\\s*(${SAFE_MICRO_UNITS})(?![A-Za-z0-9_])(?:\\^\\{?-?\\d+\\}?)?`,
  "g"
);

const DEG_REGEX =
  /\^\s*\\circ\s*(?:\\(?:text|mathrm)\s*\{[A-Za-z]+\}|[A-Za-z]+)/g;

const TEXT_UNIT_REGEX =
  /\\(?:text|mathrm)\s*\{\s*([A-Za-z°℃%ΩμÅ/^0-9\s.\\-]+?)\s*\}(?:\^\{?-?\\d+\}?)?/g;

const NUMBER_LEADER_REGEX =
  /(?:^|[^A-Za-z0-9_+\-*/=<>])((?:\d+(?:\.\d+)?|\.\d+)(?:\s*(?:\\times|\\cdot|·|\*)\s*10\^\{?[+-]?\d+\}?|\s*[eE][+-]?\d+)?)/g;

/**
 * Scans a LaTeX math body to identify physical unit spans.
 * Features:
 * - Deterministic, ReDoS-free O(1) matching using WELL_KNOWN_UNITS.
 * - Whitespace affinity: <= 1 space matches units; >= 2 spaces or operators treat tokens as algebra.
 * - Single-letter safety: single letters (m, s, g, etc.) are protected unless allowSingleLetterUnits is active.
 * - Explicit \text{...} and \mathrm{...} units.
 */
export function findUnitSpans(body: string, options?: UnitOptions): UnitSpan[] {
  const spans: UnitSpan[] = [];

  function addSpan(start: number, end: number, text: string) {
    if (start >= end) return;
    if (!spans.some((s) => start < s.end && end > s.start)) {
      spans.push({ start, end, text });
    }
  }

  const allowSingle = Boolean(options?.allowSingleLetterUnits || options?.activeMode === "physics");

  // 1. Micro units with \text or bare
  MICRO_TEXT_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MICRO_TEXT_REGEX.exec(body)) !== null) {
    addSpan(match.index, match.index + match[0].length, match[0]);
  }

  SAFE_MICRO_REGEX.lastIndex = 0;
  while ((match = SAFE_MICRO_REGEX.exec(body)) !== null) {
    addSpan(match.index, match.index + match[0].length, match[0]);
  }

  // 2. Degree units: ^\circ C, ^\circ\text{C}, ^\circ F
  DEG_REGEX.lastIndex = 0;
  while ((match = DEG_REGEX.exec(body)) !== null) {
    addSpan(match.index, match.index + match[0].length, match[0]);
  }

  // 3. Units preceded by a number (Whitespace Affinity Scan)
  NUMBER_LEADER_REGEX.lastIndex = 0;
  while ((match = NUMBER_LEADER_REGEX.exec(body)) !== null) {
    const fullMatch = match[0];
    const numPart = match[1];
    const numOffset = fullMatch.lastIndexOf(numPart);
    const numEnd = match.index + numOffset + numPart.length;

    const rest = body.slice(numEnd);
    if (!rest || rest.length === 0) continue;

    // Check whitespace:
    // If >= 2 raw spaces: LOOSE SPACING -> user spaced tokens out as algebra. Skip immediately!
    if (rest.startsWith("  ")) continue;

    // If followed by an operator: + - * / = < >
    const firstChar = rest[0];
    if (firstChar === "+" || firstChar === "-" || firstChar === "*" || firstChar === "/" || firstChar === "=" || firstChar === "<" || firstChar === ">") {
      continue;
    }

    let spacerLen = 0;
    if (rest.startsWith(" ")) {
      spacerLen = 1;
    } else if (rest.startsWith("~")) {
      spacerLen = 1;
    } else if (rest.startsWith("\\,")) {
      spacerLen = 2;
      if (rest.slice(2).startsWith(" ")) spacerLen++;
    } else if (rest.startsWith("\\;")) {
      spacerLen = 2;
      if (rest.slice(2).startsWith(" ")) spacerLen++;
    } else if (rest.startsWith("\\:")) {
      spacerLen = 2;
      if (rest.slice(2).startsWith(" ")) spacerLen++;
    }

    const unitStart = numEnd + spacerLen;
    const candidateRest = body.slice(unitStart);
    if (!candidateRest) continue;

    // Case A: Explicit \text{...} or \mathrm{...}
    if (candidateRest.startsWith("\\text") || candidateRest.startsWith("\\mathrm")) {
      const bracedMatch = /^\\(?:text|mathrm)\s*\{([^}]+)\}(?:\^\{?-?\d+\}?)?/.exec(candidateRest);
      if (bracedMatch) {
        const inner = bracedMatch[1].trim().replace(/\^{(-?\d+)}/g, "^$1");
        if (WELL_KNOWN_UNITS.has(inner) || (allowSingle && SINGLE_LETTER_UNITS.has(inner))) {
          addSpan(unitStart, unitStart + bracedMatch[0].length, bracedMatch[0]);
          continue;
        }
      }
    }

    // Case B: \mu followed by safe or ambiguous unit (e.g. 5 \mu N, 1.064 \mu m)
    if (candidateRest.startsWith("\\mu")) {
      const muMatch = /^\\mu\s*(?:([A-Za-z°℃%ΩμÅ]+))(?:\^\{?-?\d+\}?)?/.exec(candidateRest);
      if (muMatch) {
        const u = muMatch[1];
        if (SAFE_MICRO_UNITS.includes(u) || AMBIGUOUS_MICRO_UNITS.includes(u)) {
          addSpan(unitStart, unitStart + muMatch[0].length, muMatch[0]);
          continue;
        }
      }
    }

    // Case C: Raw unit token
    // Must start with a letter or unit symbol
    const tokenMatch = /^[A-Za-z°℃%ΩμÅ](?:[A-Za-z°℃%ΩμÅ0-9\-\^/{}])*/.exec(candidateRest);
    if (!tokenMatch) continue;

    let candidate = tokenMatch[0];
    // Strip trailing slashes or carets
    while (candidate.endsWith("/") || candidate.endsWith("^")) {
      candidate = candidate.slice(0, -1);
    }
    if (!candidate) continue;

    // Normalized token (e.g. m/s^{2} -> m/s^2)
    const normalized = candidate.replace(/\^{(-?\d+)}/g, "^$1");

    if (WELL_KNOWN_UNITS.has(normalized) || (allowSingle && SINGLE_LETTER_UNITS.has(normalized))) {
      addSpan(unitStart, unitStart + candidate.length, candidate);
    }
  }

  // 4. Standalone \text{...} or \mathrm{...} units
  TEXT_UNIT_REGEX.lastIndex = 0;
  while ((match = TEXT_UNIT_REGEX.exec(body)) !== null) {
    const inner = match[1].trim().replace(/\^{(-?\d+)}/g, "^$1");
    if (WELL_KNOWN_UNITS.has(inner) || (allowSingle && SINGLE_LETTER_UNITS.has(inner))) {
      addSpan(match.index, match.index + match[0].length, match[0]);
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}

/**
 * Returns color spans for units.
 * Supports nested exponent coloring (e.g. m/s^2 -> unit color for base, upper color for exponent).
 */
export function collectUnitSpans(
  body: string,
  palette: ColorPalette = COLORS,
  unitSpans?: UnitSpan[]
): ColorSpan[] {
  const units = unitSpans || findUnitSpans(body);
  const spans: ColorSpan[] = [];

  for (const u of units) {
    // Base unit span
    spans.push({
      start: u.start,
      end: u.end,
      color: palette.unit || "#73daca",
      priority: 25,
    });

    // Check for nested exponent (e.g., ^2, ^3, ^{2}, ^{-1})
    const expMatch = /\^(\{?-?\d+\}?)/.exec(u.text);
    if (expMatch) {
      const expOffset = expMatch.index + 1; // start after '^'
      let expText = expMatch[1];
      let expStart = u.start + expOffset;
      let expEnd = expStart + expText.length;

      // If braced ^{...}, color the inner number
      if (expText.startsWith("{") && expText.endsWith("}")) {
        expStart += 1;
        expEnd -= 1;
      }

      if (expEnd > expStart) {
        spans.push({
          start: expStart,
          end: expEnd,
          color: palette.upper || "#9d7cd8",
          priority: 26, // higher priority nests inside unit span
        });
      }
    }
  }

  return spans;
}
