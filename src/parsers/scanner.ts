// src/parsers/scanner.ts

import { COLORS, SORTED_COLOR_COMMANDS, ColorPalette } from "../config";
import { commandColor } from "../utils/coloring";
import { readColorCommand } from "../utils/latex_helpers";
import { ColorSpan, applyColorSpans } from "../utils/spans";
import {
  findAllOperatorSpans,
  findScriptArgumentSpans,
  readOperand,
} from "./latex_spans";

export function collectOperatorSpans(
  body: string,
  start: number = 0,
  end?: number,
  palette: ColorPalette = COLORS
): ColorSpan[] {
  const spans: ColorSpan[] = [];
  for (const operator of findAllOperatorSpans(body, start, end)) {
    const match = body.slice(operator.start, operator.end).match(/^(\\[A-Za-z]+|\\.)/);
    if (match) {
      spans.push({
        start: operator.start,
        end: operator.end,
        color: commandColor(match[0], palette),
        priority: 30,
      });
    }
  }
  return spans;
}

export function collectScannerSpans(body: string, palette: ColorPalette = COLORS): ColorSpan[] {
  const scripts = findScriptArgumentSpans(body);
  const operators = findAllOperatorSpans(body);

  const spans: ColorSpan[] = scripts.map((item) => ({
    start: item.start,
    end: item.end,
    color: palette[item.kind === "subscript" ? "chain" : "upper"],
    priority: 10,
  }));

  spans.push(...collectOperatorSpans(body, 0, undefined, palette));

  const scriptRanges = scripts.map((item) => [item.start, item.end] as const);
  const operatorRanges = operators.map((item) => [item.start, item.end] as const);

  let index = 0;
  while (index < body.length) {
    if (body[index] === "%") {
      let lineEnd = index + 1;
      while (lineEnd < body.length && body[lineEnd] !== "\r" && body[lineEnd] !== "\n") {
        lineEnd++;
      }
      if (
        lineEnd < body.length &&
        body[lineEnd] === "\r" &&
        lineEnd + 1 < body.length &&
        body[lineEnd + 1] === "\n"
      ) {
        lineEnd += 2;
      } else if (lineEnd < body.length) {
        lineEnd += 1;
      }
      index = lineEnd;
      continue;
    }

    const existing = readColorCommand(body, index);
    if (existing !== null) {
      index = existing[1];
      continue;
    }

    const operand = readOperand(body, index);
    if (operand !== null && operand.kind === "opaque") {
      index = operand.end;
      continue;
    }

    const containingOperator = operatorRanges.find(
      ([start, end]) => start <= index && index < end
    );
    if (containingOperator !== undefined) {
      index = containingOperator[1];
      continue;
    }

    const containingScript = scriptRanges.find(
      ([start, end]) => start <= index && index < end
    );
    if (containingScript !== undefined) {
      index = containingScript[1];
      continue;
    }

    const cmdMatch = body.slice(index).match(/^(\\[A-Za-z]+|\\.)/);
    if (cmdMatch) {
      const command = cmdMatch[0];
      if (SORTED_COLOR_COMMANDS.includes(command)) {
        spans.push({
          start: index,
          end: index + command.length,
          color: commandColor(command, palette),
        });
      }
      index += command.length;
      if (index < body.length && body[index] === "*") {
        index += 1;
      }
      continue;
    }

    const nonSlashCommand = SORTED_COLOR_COMMANDS.find(
      (cand) => !cand.startsWith("\\") && body.startsWith(cand, index)
    );
    if (nonSlashCommand !== undefined) {
      spans.push({
        start: index,
        end: index + nonSlashCommand.length,
        color: commandColor(nonSlashCommand, palette),
      });
      index += nonSlashCommand.length;
      continue;
    }

    index += 1;
  }

  return spans;
}

export function colorLatexBodyWithScanner(
  body: string,
  palette: ColorPalette = COLORS
): string {
  return applyColorSpans(body, collectScannerSpans(body, palette));
}
