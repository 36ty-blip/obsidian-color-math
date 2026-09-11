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
  /\\langle\s*([^<|>]+?)\s*\|\s*([^<|>]+?)(?:\s*\|\s*([^<|>]+?))?\s*\\rangle/g;

const KET_MACRO_REGEX =
  /(?:\||\\vert)\s*([^<|>]+?)\s*\\rangle|\\ket\s*\{([^}]+)\}/g;

const BRA_MACRO_REGEX =
  /\\langle\s*([^<|>]+?)\s*(?:\||\\vert)|\\bra\s*\{([^}]+)\}/g;

const KET_DELIM_REGEX = /(?:\||\\vert)\s*([^<|>]+?)\s*\\rangle/g;

const BRA_DELIM_REGEX = /\\langle\s*([^<|>]+?)\s*(?:\||\\vert)/g;

const VERT_BAR_REGEX = /(?:\||\\vert)/;

/**
 * Scans a LaTeX math body to identify Dirac bra-ket spans:
 * - <psi|A|phi> or \langle \psi | A | \phi \rangle
 * - |psi> or \ket{\psi}
 * - <phi| or \bra{\phi}
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

  return spans.sort((a, b) => a.start - b.start);
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

  // 1. \langle ... | ... \rangle
  BRAKET_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BRAKET_REGEX.exec(body)) !== null) {
    const full = match[0];
    const langleIdx = match.index;
    const langleEnd = langleIdx + "\\langle".length;
    const rangleIdx = match.index + full.lastIndexOf("\\rangle");
    const rangleEnd = rangleIdx + "\\rangle".length;

    spans.push({ start: langleIdx, end: langleEnd, color: delimColor, priority: 25 });
    spans.push({ start: rangleIdx, end: rangleEnd, color: delimColor, priority: 25 });

    let barSearch = match.index;
    while ((barSearch = body.indexOf("|", barSearch)) !== -1 && barSearch < rangleIdx) {
      spans.push({ start: barSearch, end: barSearch + 1, color: delimColor, priority: 25 });
      barSearch++;
    }
  }

  // 2. Ket: | ... \rangle or \vert ... \rangle
  KET_DELIM_REGEX.lastIndex = 0;
  while ((match = KET_DELIM_REGEX.exec(body)) !== null) {
    const full = match[0];
    const barIdx = match.index;
    const barEnd = barIdx + (full.startsWith("\\vert") ? 5 : 1);
    const rangleIdx = match.index + full.lastIndexOf("\\rangle");
    const rangleEnd = rangleIdx + 7;

    if (!spans.some((s) => s.start === barIdx)) {
      spans.push({ start: barIdx, end: barEnd, color: delimColor, priority: 25 });
      spans.push({ start: rangleIdx, end: rangleEnd, color: delimColor, priority: 25 });
    }
  }

  // 3. Bra: \langle ... | or \langle ... \vert
  BRA_DELIM_REGEX.lastIndex = 0;
  while ((match = BRA_DELIM_REGEX.exec(body)) !== null) {
    const full = match[0];
    const langleIdx = match.index;
    const langleEnd = langleIdx + 7;
    const barIdx = match.index + full.search(VERT_BAR_REGEX);
    const barEnd = barIdx + (full.endsWith("\\vert") ? 5 : 1);

    if (!spans.some((s) => s.start === langleIdx)) {
      spans.push({ start: langleIdx, end: langleEnd, color: delimColor, priority: 25 });
      spans.push({ start: barIdx, end: barEnd, color: delimColor, priority: 25 });
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}
