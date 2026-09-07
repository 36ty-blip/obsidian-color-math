// src/parsers/taxonomy.ts

import {
  COLORS,
  ColorPalette,
  MATH_CONSTANTS,
  MATH_FUNCTIONS,
  MATH_PARAMETERS,
} from "../config";
import { readCommand, readOperand, OPAQUE_MACROS } from "./latex_spans";
import { readBraced, readColorCommand } from "../utils/latex_helpers";
import { ColorSpan } from "../utils/spans";
import { findDifferentialSpans, DifferentialSpan } from "./differentials";
import { findUnitSpans, UnitSpan } from "./units";

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
 * Collects semantic spans for mathematical symbols:
 * - Constants (\pi, \hbar, \infty, etc.) -> orange
 * - Parameters (\alpha, \beta, \theta, etc.) -> parameter / derivative
 * - Standard functions (\sin, \cos, \ln, etc.) -> main
 * - Bound iteration indices (\sum_{i=1}, \lim_{x \to 0}) -> chain / teal
 */
export function collectTaxonomySpans(
  body: string,
  palette: ColorPalette = COLORS,
  unitSpans?: UnitSpan[],
  diffSpans?: DifferentialSpan[]
): ColorSpan[] {
  const units = unitSpans || findUnitSpans(body);
  const diffs = diffSpans || findDifferentialSpans(body);
  const spans: ColorSpan[] = [];
  let index = 0;

  // 1. Scan for bound index variables in sums, products, limits
  const indexPattern = /(\\(?:sum|prod|coprod|bigcup|bigcap|lim|inf|sup))_\{?\s*([A-Za-z])\s*(?:=|\to|\\to)/g;
  let match: RegExpExecArray | null;
  while ((match = indexPattern.exec(body)) !== null) {
    const operatorStr = match[1];
    const varName = match[2];
    const varOffset = match[0].indexOf(varName, operatorStr.length);
    if (varOffset !== -1) {
      const varStart = match.index + varOffset;
      spans.push({
        start: varStart,
        end: varStart + varName.length,
        color: palette.chain, // Bound index color
        priority: 23,
      });
    }
  }

  // 2. Scan LaTeX commands for constants, functions, and parameters
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

    if (body[index] === "\\") {
      const match = body.slice(index).match(/^(\\[A-Za-z]+|\\.)/);
      if (match) {
        const name = match[0];
        const cmdEnd = index + name.length;

        if (OPAQUE_MACROS.has(name.slice(1))) {
          const braced = readBraced(body, cmdEnd);
          if (braced !== null) {
            index = braced[1];
            continue;
          }
        }

        if (name === "\\dot" || name === "\\ddot" || name === "\\dddot") {
          let targetStart = cmdEnd;
          while (targetStart < body.length && /\s/.test(body[targetStart])) {
            targetStart++;
          }
          if (targetStart < body.length) {
            let targetEnd = targetStart + 1;
            if (body[targetStart] === "{") {
              const braced = readBraced(body, targetStart);
              if (braced) targetEnd = braced[1];
            } else {
              const letMatch = body.slice(targetStart).match(/^[a-zA-Z](')*/);
              if (letMatch) targetEnd = targetStart + letMatch[0].length;
            }
            spans.push({
              start: index,
              end: targetEnd,
              color: palette.derivative,
              priority: 22,
            });
            index = targetEnd;
            continue;
          }
        }

        if (MATH_CONSTANTS.has(name)) {
          spans.push({
            start: index,
            end: cmdEnd,
            color: palette.orange,
            priority: 22,
          });
          index = cmdEnd;
          continue;
        }

        if (MATH_FUNCTIONS.has(name)) {
          spans.push({
            start: index,
            end: cmdEnd,
            color: palette.main,
            priority: 22,
          });
          index = cmdEnd;
          continue;
        }

        if (MATH_PARAMETERS.has(name)) {
          spans.push({
            start: index,
            end: cmdEnd,
            color: palette.parameter || palette.derivative,
            priority: 20,
          });
          index = cmdEnd;
          continue;
        }

        index = cmdEnd;
        continue;
      }
    }

    index++;
  }

  return spans;
}
