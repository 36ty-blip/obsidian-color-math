// src/parsers/variable_hash.ts

import {
  VARIABLE_HASH_PALETTE,
  hashStringToColor,
  MATH_ACCENTS,
  FONT_STYLE_MACROS,
  BARE_FUNCTIONS,
} from "../config";
import { readOperand, OPAQUE_MACROS } from "./latex_spans";
import { readBraced, readColorCommand } from "../utils/latex_helpers";
import { ColorSpan } from "../utils/spans";
import { findDifferentialSpans, DifferentialSpan } from "./differentials";
import { findDimensionlessSpans, DimensionlessSpan } from "./dimensionless";
import { findUnitSpans, UnitSpan } from "./units";
import { isEulerConstant, isImaginaryUnit } from "./constants";

const VARIABLE_OPAQUE_MACROS = new Set([
  "text",
  "textbf",
  "textit",
  "textrm",
  "texttt",
  "textsf",
  "mathrm",
  "operatorname",
  "verb",
  "color",
  "textcolor",
  "colorbox",
  "fcolorbox",
  "tag",
  "label",
  "ref",
  "eqref",
  "cite",
]);

function skipComment(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length && text[index] !== "\r" && text[index] !== "\n") {
    index++;
  }
  if (index < text.length && text[index] === "\r" && index + 1 < text.length && text[index + 1] === "\n") {
    return index + 2;
  }
  return Math.min(index + 1, text.length);
}

/**
 * Collects spans for variable data-flow hashing.
 * Assigns a unique, deterministic color to each distinct identifier in scope.
 */
export function collectVariableSpans(
  body: string,
  palette: string[] = VARIABLE_HASH_PALETTE,
  unitSpans?: UnitSpan[],
  diffSpans?: DifferentialSpan[],
  dimSpans?: DimensionlessSpan[],
  bareFunctions: Set<string> = BARE_FUNCTIONS
): ColorSpan[] {
  const units = unitSpans || findUnitSpans(body);
  const diffs = diffSpans || findDifferentialSpans(body);
  const dims = dimSpans || findDimensionlessSpans(body);
  const spans: ColorSpan[] = [];
  let index = 0;

  while (index < body.length) {
    if (body[index] === "%") {
      index = skipComment(body, index);
      continue;
    }

    const existingColor = readColorCommand(body, index);
    if (existingColor !== null) {
      index = existingColor[1];
      continue;
    }

    const operand = readOperand(body, index);
    if (operand !== null && operand.kind === "opaque") {
      index = operand.end;
      continue;
    }

    const inUnit = units.find((u) => u.start <= index && index < u.end);
    if (inUnit) {
      index = inUnit.end;
      continue;
    }

    const inDiff = diffs.find((d) => d.start <= index && index < d.end);
    if (inDiff) {
      index = inDiff.end;
      continue;
    }

    const inDim = dims.find((d) => d.start <= index && index < d.end);
    if (inDim) {
      index = inDim.end;
      continue;
    }

    // Backslash commands
    if (body[index] === "\\") {
      const match = body.slice(index).match(/^(\\[A-Za-z]+|\\.)/);
      if (match) {
        const cmdName = match[0];
        const cmdEnd = index + cmdName.length;

        // Skip environment arguments: \begin{bmatrix}, \end{bmatrix}, \begin{cases}
        if (cmdName === "\\begin" || cmdName === "\\end") {
          let afterCmd = cmdEnd;
          while (afterCmd < body.length && /\s/.test(body[afterCmd])) {
            afterCmd++;
          }
          if (afterCmd < body.length && body[afterCmd] === "{") {
            const braced = readBraced(body, afterCmd);
            if (braced !== null) {
              index = braced[1];
              continue;
            }
          }
          index = cmdEnd;
          continue;
        }

        // Skip custom operator name: \operatorname{rank}, \operatorname*{argmin}
        if (cmdName === "\\operatorname") {
          let afterCmd = cmdEnd;
          if (afterCmd < body.length && body[afterCmd] === "*") {
            afterCmd++;
          }
          while (afterCmd < body.length && /\s/.test(body[afterCmd])) {
            afterCmd++;
          }
          if (afterCmd < body.length && body[afterCmd] === "{") {
            const braced = readBraced(body, afterCmd);
            if (braced !== null) {
              index = braced[1];
              continue;
            }
          }
          index = cmdEnd;
          continue;
        }

        // Check if math accent command like \dot, \ddot, \vec, \hat, \bar
        if (MATH_ACCENTS.has(cmdName)) {
          let targetStart = cmdEnd;
          while (targetStart < body.length && /\s/.test(body[targetStart])) {
            targetStart++;
          }
          if (targetStart < body.length) {
            if (body[targetStart] === "{") {
              const braced = readBraced(body, targetStart);
              if (braced) {
                const inner = braced[0];
                const baseMatch = inner.match(/[a-zA-Z]/);
                const baseLetter = baseMatch ? baseMatch[0] : "x";
                const color = hashStringToColor(baseLetter, palette);
                spans.push({
                  start: index,
                  end: braced[1],
                  color,
                  priority: 15,
                });
                index = braced[1];
                continue;
              }
            } else {
              const letterMatch = body.slice(targetStart).match(/^[a-zA-Z](')*/);
              if (letterMatch) {
                const fullVar = letterMatch[0];
                const baseLetter = fullVar.replace(/'/g, "");
                const color = hashStringToColor(baseLetter, palette);
                spans.push({
                  start: index,
                  end: targetStart + fullVar.length,
                  color,
                  priority: 15,
                });
                index = targetStart + fullVar.length;
                continue;
              }
            }
          }
        }

        if (FONT_STYLE_MACROS.has(cmdName)) {
          let targetStart = cmdEnd;
          while (targetStart < body.length && /\s/.test(body[targetStart])) {
            targetStart++;
          }
          if (targetStart < body.length) {
            let targetEnd = targetStart + 1;
            let baseLetter = "R";
            if (body[targetStart] === "{") {
              const braced = readBraced(body, targetStart);
              if (braced) {
                targetEnd = braced[1];
                const bm = braced[0].match(/[a-zA-Z]/);
                if (bm) baseLetter = bm[0];
              }
            } else {
              const letMatch = body.slice(targetStart).match(/^[a-zA-Z](')*/);
              if (letMatch) {
                targetEnd = targetStart + letMatch[0].length;
                baseLetter = letMatch[0].replace(/'/g, "");
              }
            }
            const color = hashStringToColor(baseLetter, palette);
            spans.push({
              start: index,
              end: targetEnd,
              color,
              priority: 15,
            });
            index = targetEnd;
            continue;
          }
        }

        if (VARIABLE_OPAQUE_MACROS.has(cmdName.slice(1))) {
          let afterCmd = cmdEnd;
          while (afterCmd < body.length && /\s/.test(body[afterCmd])) {
            afterCmd++;
          }
          if (afterCmd < body.length && body[afterCmd] === "{") {
            const braced = readBraced(body, afterCmd);
            if (braced !== null) {
              index = braced[1];
              continue;
            }
          }
        }
        index = cmdEnd;
        continue;
      }
    }

    // Check bare math functions or function calls before '('
    const wordMatch = body.slice(index).match(/^([A-Za-z]+)(?![A-Za-z])/);
    if (wordMatch) {
      const word = wordMatch[1];
      const lowerWord = word.toLowerCase();

      // 1. Bare functions without parentheses: e.g. sin x, ln x, rank A, det M
      if (bareFunctions.has(lowerWord)) {
        index += word.length;
        continue;
      }

      // 2. Check if followed by parentheses: e.g. rank(A), nullity(A), f(x), ax(y + z)
      const afterWord = body.slice(index + word.length).trimStart();
      const hasArgs = afterWord.startsWith("(") || afterWord.startsWith("\\left(");
      if (hasArgs) {
        if (word.length >= 4) {
          // Multi-letter function call: skip entire word (e.g. rank, nullity, poly)
          index += word.length;
          continue;
        } else if (word.length === 1) {
          // Single-letter function call: skip function name (e.g. f(x), g(x))
          index += 1;
          continue;
        } else {
          // 2 or 3 letters not in BARE_FUNCTIONS (e.g. ax in ax(y + z), xy in xy(a + b))
          // Treat as distinct single-letter variables multiplied together!
          for (let i = 0; i < word.length; i++) {
            const letter = word[i];
            const color = hashStringToColor(letter, palette);
            spans.push({
              start: index + i,
              end: index + i + 1,
              color,
              priority: 15,
            });
          }
          index += word.length;
          continue;
        }
      }
    }

    // Single-character constants 'e' and 'i'/'j'
    if (isEulerConstant(body, index) || isImaginaryUnit(body, index)) {
      spans.push({
        start: index,
        end: index + 1,
        color: "#e0af68",
        priority: 22,
      });
      index++;
      continue;
    }

    // Single letter variables (optionally with prime): e.g. x, y, z, t, x', y''
    const varMatch = body.slice(index).match(/^[a-zA-Z](')*/);
    if (varMatch) {
      const fullVar = varMatch[0];
      const baseLetter = fullVar.replace(/'/g, "");
      const varEnd = index + fullVar.length;

      const color = hashStringToColor(baseLetter, palette);
      spans.push({
        start: index,
        end: varEnd,
        color,
        priority: 15,
      });

      index = varEnd;
      continue;
    }

    index++;
  }

  return spans;
}
