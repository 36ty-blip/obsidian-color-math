// src/parsers/braket.ts

import { COLORS, ColorPalette } from "../config";
import { ColorSpan } from "../utils/spans";

export interface BraKetSpan {
  start: number;
  end: number;
  kind: "bracket" | "ket" | "bra";
}

/**
 * Scans a LaTeX math body to identify Quantum Bra-Ket (Dirac) notation:
 * - Inner product / Expectation: \langle \phi | \psi \rangle, \langle \psi | \hat{H} | \psi \rangle
 * - Ket: | \psi \rangle, \vert \psi \rangle, \ket{\psi}
 * - Bra: \langle \phi |, \langle \phi \vert, \bra{\phi}
 */
const BRAKET_REGEX =
  /(?:\\langle|⟨)\s*((?:(?!(?:\\langle|⟨|\\rangle|⟩))[^|‖<>=\n\r])+?)\s*(?:\||\\vert|\\lvert|\\rvert|\\Vert|\\lVert|\\rVert|‖)\s*((?:(?!(?:\\langle|⟨|\\rangle|⟩))[^|‖<>=\n\r])+?)(?:\s*(?:\||\\vert|\\lvert|\\rvert|\\Vert|\\lVert|\\rVert|‖)\s*((?:(?!(?:\\langle|⟨|\\rangle|⟩))[^|‖<>=\n\r])+?))?\s*(?:\\rangle|⟩)/g;

const KET_MACRO_REGEX =
  /(?:\||\\vert|\\lvert|\\lVert|‖)\s*((?:(?!(?:\\langle|⟨|\\rangle|⟩))[^|‖<>=\n\r])+?)\s*(?:\\rangle|⟩)|\\ket\s*\{([^}]+)\}/g;

const BRA_MACRO_REGEX =
  /(?:\\langle|⟨)\s*((?:(?!(?:\\langle|⟨|\\rangle|⟩))[^|‖<>=\n\r])+?)\s*(?:\||\\vert|\\rvert|\\rVert|‖)|\\bra\s*\{([^}]+)\}/g;

const KET_DELIM_REGEX =
  /(?:\||\\vert|\\lvert|\\lVert|‖)\s*((?:(?!(?:\\langle|⟨|\\rangle|⟩))[^|‖<>=\n\r])+?)\s*(?:\\rangle|⟩)/g;

const BRA_DELIM_REGEX =
  /(?:\\langle|⟨)\s*((?:(?!(?:\\langle|⟨|\\rangle|⟩))[^|‖<>=\n\r])+?)\s*(?:\||\\vert|\\rvert|\\rVert|‖)/g;

const INNER_PRODUCT_REGEX =
  /(?:\\langle|⟨)\s*((?:(?!(?:\\langle|⟨|\\rangle|⟩))[^|‖<>=\n\r])+?)\s*(?:\\rangle|⟩)/g;

const VERT_BAR_REGEX = /(?:\||\\vert|\\lvert|\\rvert|\\Vert|\\lVert|\\rVert|‖)/;

/**
 * Scans a LaTeX math body to identify Dirac bra-ket spans:
 * - <psi|A|phi> or \langle \psi | A | \phi \rangle
 * - |psi> or \ket{\psi}
 * - <phi| or \bra{\phi}
 * - \langle x, y \rangle (inner product) or \langle A \rangle (expectation value)
 */
export function findBraKetSpans(body: string): BraKetSpan[] {
  const spans: BraKetSpan[] = [];

  function addSpan(start: number, end: number, kind: "bracket" | "ket" | "bra") {
    if (start >= end) return;
    if (!spans.some((s) => start < s.end && end > s.start)) {
      spans.push({ start, end, kind });
    }
  }

  // 1. Bracket / Expectation value: \langle ... | ... \rangle
  BRAKET_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BRAKET_REGEX.exec(body)) !== null) {
    addSpan(match.index, match.index + match[0].length, "bracket");
  }

  // 2. Ket: | ... \rangle or \vert ... \rangle or \ket{...}
  KET_MACRO_REGEX.lastIndex = 0;
  while ((match = KET_MACRO_REGEX.exec(body)) !== null) {
    addSpan(match.index, match.index + match[0].length, "ket");
  }

  // 3. Bra: \langle ... | or \langle ... \vert or \bra{...}
  BRA_MACRO_REGEX.lastIndex = 0;
  while ((match = BRA_MACRO_REGEX.exec(body)) !== null) {
    addSpan(match.index, match.index + match[0].length, "bra");
  }

  // 4. Standard inner product / expectation value: \langle ... \rangle
  INNER_PRODUCT_REGEX.lastIndex = 0;
  while ((match = INNER_PRODUCT_REGEX.exec(body)) !== null) {
    addSpan(match.index, match.index + match[0].length, "bracket");
  }

  return spans.sort((a, b) => a.start - b.start);
}

const SIZED_PREFIXES = [
  "\\left",
  "\\right",
  "\\bigl",
  "\\bigr",
  "\\Bigl",
  "\\Bigr",
  "\\biggl",
  "\\biggr",
  "\\Biggl",
  "\\Biggr",
];

function hasSizedPrefix(body: string, idx: number): boolean {
  const before = body.slice(0, idx).trimEnd();
  return SIZED_PREFIXES.some((prefix) => before.endsWith(prefix));
}

/**
 * Returns color spans for the Dirac delimiters (\langle, |, \rangle)
 * using palette.orange / delimiter color so they match nicely as quantum brackets.
 */
export function collectBraKetDelimiterSpans(
  body: string,
  palette: ColorPalette = COLORS,
  delimColor: string = palette.orange || "#e0af68"
): ColorSpan[] {
  const spans: ColorSpan[] = [];

  // 1. \langle ... | ... \rangle or ⟨ ... | ... ⟩
  BRAKET_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BRAKET_REGEX.exec(body)) !== null) {
    const full = match[0];
    const langleMatch = full.match(/^(?:\\langle|⟨)/)!;
    const langleIdx = match.index;
    const langleEnd = langleIdx + langleMatch[0].length;
    const rangleMatch = full.match(/(?:\\rangle|⟩)$/)!;
    const rangleIdx = match.index + full.lastIndexOf(rangleMatch[0]);
    const rangleEnd = rangleIdx + rangleMatch[0].length;

    if (!hasSizedPrefix(body, langleIdx)) {
      spans.push({ start: langleIdx, end: langleEnd, color: delimColor, priority: 25 });
    }
    if (!hasSizedPrefix(body, rangleIdx)) {
      spans.push({ start: rangleIdx, end: rangleEnd, color: delimColor, priority: 25 });
    }

    const barRegex = new RegExp(VERT_BAR_REGEX.source, "g");
    barRegex.lastIndex = langleMatch[0].length;
    let bMatch: RegExpExecArray | null;
    while ((bMatch = barRegex.exec(full)) !== null) {
      const bIdx = match.index + bMatch.index;
      if (bIdx >= langleEnd && bIdx < rangleIdx) {
        spans.push({ start: bIdx, end: bIdx + bMatch[0].length, color: delimColor, priority: 25 });
      }
    }
  }

  // 2. Ket: | ... \rangle, | ... ⟩, \vert ... \rangle, etc.
  KET_DELIM_REGEX.lastIndex = 0;
  while ((match = KET_DELIM_REGEX.exec(body)) !== null) {
    const full = match[0];
    const barMatch = full.match(/^(?:\||\\vert|\\lvert|\\lVert|‖)/)!;
    const barIdx = match.index;
    const barEnd = barIdx + barMatch[0].length;
    const rangleMatch = full.match(/(?:\\rangle|⟩)$/)!;
    const rangleIdx = match.index + full.lastIndexOf(rangleMatch[0]);
    const rangleEnd = rangleIdx + rangleMatch[0].length;

    if (!hasSizedPrefix(body, barIdx) && !hasSizedPrefix(body, rangleIdx) && !spans.some((s) => s.start === barIdx)) {
      spans.push({ start: barIdx, end: barEnd, color: delimColor, priority: 25 });
      spans.push({ start: rangleIdx, end: rangleEnd, color: delimColor, priority: 25 });
    }
  }

  // 3. Bra: \langle ... |, ⟨ ... |, \langle ... \vert, etc.
  BRA_DELIM_REGEX.lastIndex = 0;
  while ((match = BRA_DELIM_REGEX.exec(body)) !== null) {
    const full = match[0];
    const langleMatch = full.match(/^(?:\\langle|⟨)/)!;
    const langleIdx = match.index;
    const langleEnd = langleIdx + langleMatch[0].length;
    const barMatch = full.match(/(?:\||\\vert|\\rvert|\\rVert|‖)$/)!;
    const barIdx = match.index + full.lastIndexOf(barMatch[0]);
    const barEnd = barIdx + barMatch[0].length;

    if (!hasSizedPrefix(body, langleIdx) && !hasSizedPrefix(body, barIdx) && !spans.some((s) => s.start === langleIdx)) {
      spans.push({ start: langleIdx, end: langleEnd, color: delimColor, priority: 25 });
      spans.push({ start: barIdx, end: barEnd, color: delimColor, priority: 25 });
    }
  }

  // 4. Standard inner product / expectation value: \langle ... \rangle or ⟨ ... ⟩
  INNER_PRODUCT_REGEX.lastIndex = 0;
  while ((match = INNER_PRODUCT_REGEX.exec(body)) !== null) {
    const full = match[0];
    const langleMatch = full.match(/^(?:\\langle|⟨)/)!;
    const langleIdx = match.index;
    const langleEnd = langleIdx + langleMatch[0].length;
    const rangleMatch = full.match(/(?:\\rangle|⟩)$/)!;
    const rangleIdx = match.index + full.lastIndexOf(rangleMatch[0]);
    const rangleEnd = rangleIdx + rangleMatch[0].length;

    if (!hasSizedPrefix(body, langleIdx) && !hasSizedPrefix(body, rangleIdx)) {
      if (!spans.some((s) => s.start === langleIdx)) {
        spans.push({ start: langleIdx, end: langleEnd, color: delimColor, priority: 25 });
        spans.push({ start: rangleIdx, end: rangleEnd, color: delimColor, priority: 25 });
      }
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}
