// src/parsers/constants.ts

import { ColorPalette, COLORS } from "../config";
import { ColorSpan } from "../utils/spans";

function isPartOfCommand(body: string, index: number): boolean {
  let b = index;
  while (b >= 0 && /[a-zA-Z]/.test(body[b])) {
    b--;
  }
  return b >= 0 && body[b] === "\\";
}

/**
 * Determines whether the character 'e' at `index` is Euler's mathematical constant
 * (e.g. e^x, e^{-t}, e^{i\pi}), rather than an indexed basis vector (e_1, e_x) or variable.
 */
export function isEulerConstant(body: string, index: number): boolean {
  if (body[index] !== "e") return false;
  if (isPartOfCommand(body, index)) return false;
  // Must not be preceded by letter
  if (index > 0 && /[a-zA-Z]/.test(body[index - 1])) return false;
  // Must not be followed by letter
  if (index + 1 < body.length && /[a-zA-Z]/.test(body[index + 1])) return false;

  let next = index + 1;
  while (next < body.length && /\s/.test(body[next])) next++;
  // Subscript e_1, e_x is a basis vector or indexed variable, not Euler's constant
  if (next < body.length && body[next] === "_") return false;
  // Followed by exponent e^x, e^{-t}, e^{...}
  if (next < body.length && body[next] === "^") return true;

  return false;
}

/**
 * Determines whether the character 'i' or 'j' at `index` is the imaginary unit (sqrt(-1)),
 * rather than a summation or matrix index (x_i, a_i, \sum_{i=1}).
 */
export function isImaginaryUnit(body: string, index: number): boolean {
  const ch = body[index];
  if (ch !== "i" && ch !== "j") return false;
  if (isPartOfCommand(body, index)) return false;

  // If preceded by multiple letters, it's part of a word like 'sin', 'dim', 'min'
  if (index > 0 && /[a-zA-Z]/.test(body[index - 1])) {
    if (index > 1 && /[a-zA-Z]/.test(body[index - 2])) return false;
  }
  // If preceded by backslash, it's a command
  if (index > 0 && body[index - 1] === "\\") return false;

  let next = index + 1;
  // If part of longer word: e.g. 'in', 'if', 'int'
  if (next < body.length && /[a-zA-Z]/.test(body[next])) {
    if (next + 1 < body.length && /[a-zA-Z]/.test(body[next + 1])) return false;
  }

  while (next < body.length && /\s/.test(body[next])) next++;
  // Subscript is an index, not imaginary unit (e.g. x_i, A_{ij})
  if (next < body.length && body[next] === "_") return false;

  // Preceded by digit: 2i, 3j, 0.5i
  if (index > 0 && /[0-9]/.test(body[index - 1])) return true;

  // Followed by ^2 or ^{2}: i^2 = -1
  if (body.slice(next).startsWith("^2") || body.slice(next).startsWith("^{2}")) return true;

  // Followed by constant or greek: \pi, \theta, \omega, \hbar
  if (body.slice(next).match(/^\\(?:pi|theta|omega|hbar|phi|psi)/)) return true;

  // Followed by variable like y in x + iy, or in exponent
  if (next < body.length && /[xyz\\]/.test(body[next])) {
    let p = index - 1;
    while (p >= 0 && /\s/.test(body[p])) p--;
    if (p >= 0 && (body[p] === "+" || body[p] === "-" || body[p] === "=" || body[p] === "{" || body[p] === "(")) {
      return true;
    }
  }

  // Inside exponent: look back for ^
  let back = index - 1;
  let depth = 0;
  while (back >= 0) {
    if (body[back] === "}") depth++;
    else if (body[back] === "{") {
      depth--;
      if (depth < 0) {
        let b2 = back - 1;
        while (b2 >= 0 && /\s/.test(body[b2])) b2--;
        if (b2 >= 0 && body[b2] === "^") return true;
        if (b2 >= 0 && body[b2] === "_") return false;
        break;
      }
    } else if (depth === 0 && (body[back] === "=" || body[back] === "+" || body[back] === "-")) {
      break;
    }
    back--;
  }

  return false;
}

/**
 * Collects spans for single-character constants 'e' and 'i'/'j'.
 */
export function collectSingleConstantSpans(
  body: string,
  palette: ColorPalette = COLORS
): ColorSpan[] {
  const spans: ColorSpan[] = [];
  for (let i = 0; i < body.length; i++) {
    if (isEulerConstant(body, i) || isImaginaryUnit(body, i)) {
      spans.push({
        start: i,
        end: i + 1,
        color: palette.orange,
        priority: 22,
      });
    }
  }
  return spans;
}
