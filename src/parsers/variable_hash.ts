// src/parsers/variable_hash.ts

import {
  VARIABLE_HASH_PALETTE,
  hashStringToColor,
} from "../config";
import { readCommand, readOperand, OPAQUE_MACROS } from "./latex_spans";
import { readBraced, readColorCommand } from "../utils/latex_helpers";
import { ColorSpan } from "../utils/spans";

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
  palette: string[] = VARIABLE_HASH_PALETTE
): ColorSpan[] {
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

    // Skip backslash commands
    if (body[index] === "\\") {
      const cmd = readCommand(body, index);
      if (cmd !== null) {
        const [name, cmdEnd] = cmd;
        if (OPAQUE_MACROS.has(name.slice(1))) {
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
