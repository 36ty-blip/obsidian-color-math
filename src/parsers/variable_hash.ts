// src/parsers/variable_hash.ts

import {
  VARIABLE_HASH_PALETTE,
  hashStringToColor,
  MATH_ACCENTS,
} from "../config";
import { readCommand, readOperand, OPAQUE_MACROS } from "./latex_spans";
import { readBraced, readColorCommand } from "../utils/latex_helpers";
import { ColorSpan } from "../utils/spans";
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
 * Collects spans for variable data-flow hashing.
 * Assigns a unique, deterministic color to each distinct identifier in scope.
 */
export function collectVariableSpans(
  body: string,
  palette: string[] = VARIABLE_HASH_PALETTE,
  unitSpans?: UnitSpan[]
): ColorSpan[] {
  const units = unitSpans || findUnitSpans(body);
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

    // Backslash commands
    if (body[index] === "\\") {
      const match = body.slice(index).match(/^(\\[A-Za-z]+|\\.)/);
      if (match) {
        const cmdName = match[0];
        const cmdEnd = index + cmdName.length;

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
                const inner = body.slice(braced[0], braced[1]);
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

        if (OPAQUE_MACROS.has(cmdName.slice(1))) {
          const braced = readBraced(body, cmdEnd);
          if (braced !== null) {
            index = braced[1];
            continue;
          }
        }
        index = cmdEnd;
        continue;
      }
    }

    // Single letter variables (optionally with prime): e.g. x, y, z, t, x', y''
    const varMatch = body.slice(index).match(/^[a-zA-Z](')*/);
    if (varMatch) {
      const fullVar = varMatch[0];
      const baseLetter = fullVar.replace(/'/g, "");
      const varEnd = index + fullVar.length;

      // Check if this letter is followed by '(' — if so, it is a function call like f(x)
      const afterVar = body.slice(varEnd).trimStart();
      const isFunction = afterVar.startsWith("(") || afterVar.startsWith("\\left(");

      if (!isFunction) {
        const color = hashStringToColor(baseLetter, palette);
        spans.push({
          start: index,
          end: varEnd,
          color,
          priority: 15,
        });
      }

      index = varEnd;
      continue;
    }

    index++;
  }

  return spans;
}
