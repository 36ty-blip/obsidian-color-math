// src/parsers/math_parser.ts

import { BARE_FUNCTIONS, MATH_FUNCTIONS } from "../config";
import { readBraced } from "../utils/latex_helpers";
import { readOperand, OPAQUE_MACROS } from "./latex_spans";
import { scanMarkdown } from "./markdown_scanner";

// OPAQUE_MACROS imported from latex_spans

export interface SemanticSpan {
  kind: string;
  value: string;
  start: number;
  end: number;
  depth: number;
}

export interface ParsedMath {
  source: string;
  normalized: string;
  expression: SemanticSpan[];
  error?: string | null;
  ok: boolean;
}

function readCommand(text: string, start: number, end: number): [string, number] | null {
  if (start >= end || text[start] !== "\\") return null;
  const match = text.slice(start, end).match(/^(\\[A-Za-z]+|\\.)/);
  if (!match) return null;
  return [match[0], start + match[0].length];
}

function skipWhitespace(text: string, start: number, end: number): number {
  while (start < end && /\s/.test(text[start])) {
    start++;
  }
  return start;
}

function skipComment(text: string, start: number, end: number): number {
  let index = start + 1;
  while (index < end && text[index] !== "\r" && text[index] !== "\n") {
    index++;
  }
  if (index < end && text[index] === "\r" && index + 1 < end && text[index + 1] === "\n") {
    return index + 2;
  }
  return Math.min(index + 1, end);
}

function readDelimiter(text: string, start: number, end: number): [string, number] | null {
  if (start >= end) return null;
  if (text[start] !== "\\") {
    return [text[start], start + 1];
  }
  return readCommand(text, start, end);
}

function skipOpaqueArgument(text: string, start: number, end: number): number {
  start = skipWhitespace(text, start, end);
  const group = readBraced(text, start);
  return group !== null && group[1] <= end ? group[1] : start;
}

function readLeftRightGroup(
  text: string,
  start: number,
  end: number
): [string, number, number, number] | null {
  const command = readCommand(text, start, end);
  if (command === null || command[0] !== "\\left") {
    return null;
  }

  const delimiterData = readDelimiter(
    text,
    skipWhitespace(text, command[1], end),
    end
  );
  if (delimiterData === null) {
    return null;
  }

  const [opening, contentStart] = delimiterData;
  let depth = 1;
  let index = contentStart;

  while (index < end) {
    if (text[index] === "%") {
      index = skipComment(text, index, end);
      continue;
    }
    if (text[index] === "{") {
      const group = readBraced(text, index);
      if (group === null || group[1] > end) {
        return null;
      }
      index = group[1];
      continue;
    }

    if (text[index] !== "\\") {
      index++;
      continue;
    }

    const nestedCommand = readCommand(text, index, end);
    if (nestedCommand === null) {
      index++;
      continue;
    }

    const [name, commandEnd] = nestedCommand;
    if (name === "\\left") {
      const delimiter = readDelimiter(
        text,
        skipWhitespace(text, commandEnd, end),
        end
      );
      if (delimiter !== null) {
        depth++;
        index = delimiter[1];
        continue;
      }
    } else if (name === "\\right") {
      const delimiter = readDelimiter(
        text,
        skipWhitespace(text, commandEnd, end),
        end
      );
      if (delimiter !== null) {
        depth--;
        if (depth === 0) {
          return [opening, contentStart, index, delimiter[1]];
        }
        index = delimiter[1];
        continue;
      }
    } else {
      const operand = readOperand(text, index, end);
      if (operand !== null && operand.kind === "opaque") {
        index = operand.end;
        continue;
      }
    }

    if (OPAQUE_MACROS.has(name.slice(1))) {
      const opaqueEnd = skipOpaqueArgument(text, commandEnd, end);
      if (opaqueEnd !== commandEnd) {
        index = opaqueEnd;
        continue;
      }
    }

    index = commandEnd;
  }

  return null;
}

function readPlainParentheses(
  text: string,
  start: number,
  end: number
): [number, number, number] | null {
  let depth = 1;
  let index = start + 1;

  while (index < end) {
    if (text[index] === "%") {
      index = skipComment(text, index, end);
      continue;
    }
    if (text[index] === "{") {
      const group = readBraced(text, index);
      if (group === null || group[1] > end) {
        return null;
      }
      index = group[1];
      continue;
    }

    if (text[index] === "\\") {
      const operand = readOperand(text, index, end);
      if (operand !== null && operand.kind === "opaque") {
        index = operand.end;
        continue;
      }
      const command = readCommand(text, index, end);
      if (command === null) {
        index++;
        continue;
      }

      const [name, commandEnd] = command;
      if (name === "\\left") {
        const group = readLeftRightGroup(text, index, end);
        if (group !== null) {
          index = group[3];
          continue;
        }
      } else if (OPAQUE_MACROS.has(name.slice(1))) {
        const opaqueEnd = skipOpaqueArgument(text, commandEnd, end);
        if (opaqueEnd !== commandEnd) {
          index = opaqueEnd;
          continue;
        }
      }

      index = commandEnd;
      continue;
    }

    if (text[index] === "(") {
      depth++;
    } else if (text[index] === ")") {
      depth--;
      if (depth === 0) {
        return [start + 1, index, index + 1];
      }
    }

    index++;
  }

  return null;
}

function readFunctionArguments(
  text: string,
  start: number,
  end: number
): [number, number, number] | null {
  if (start >= end) return null;
  if (text[start] === "(") {
    return readPlainParentheses(text, start, end);
  }

  const group = readLeftRightGroup(text, start, end);
  if (group === null || (group[0] !== "(" && group[0] !== "\\(")) {
    return null;
  }
  return [group[1], group[2], group[3]];
}

function collectSemanticSpansInternal(
  text: string,
  start: number,
  end: number,
  depth: number,
  spans: SemanticSpan[],
  errors: string[]
): void {
  let index = start;
  while (index < end) {
    if (text[index] === "%") {
      index = skipComment(text, index, end);
      continue;
    }
    if (text[index] === "\\") {
      const operand = readOperand(text, index, end);
      if (operand !== null && operand.kind === "opaque") {
        index = operand.end;
        continue;
      }
      const command = readCommand(text, index, end);
      if (command !== null) {
        const [name, commandEnd] = command;
        if (OPAQUE_MACROS.has(name.slice(1))) {
          const opaqueEnd = skipOpaqueArgument(text, commandEnd, end);
          if (opaqueEnd !== commandEnd) {
            index = opaqueEnd;
            continue;
          }
        }
        if (MATH_FUNCTIONS.has(name)) {
          const args = readFunctionArguments(text, commandEnd, end);
          if (args !== null) {
            const [argumentStart, argumentEnd, callEnd] = args;
            spans.push({
              kind: "function",
              value: name,
              start: index,
              end: commandEnd,
              depth,
            });
            collectSemanticSpansInternal(
              text,
              argumentStart,
              argumentEnd,
              depth + 1,
              spans,
              errors
            );
            index = callEnd;
            continue;
          } else {
            spans.push({
              kind: "function",
              value: name,
              start: index,
              end: commandEnd,
              depth,
            });
            index = commandEnd;
            continue;
          }
        }
        index = commandEnd;
        continue;
      }
    }

    const nameMatch = text.slice(index, end).match(/^[A-Za-z][A-Za-z0-9]*(?:')*/);
    if (nameMatch) {
      const name = nameMatch[0];
      const nameEnd = index + name.length;
      const args = readFunctionArguments(text, nameEnd, end);
      if (args !== null) {
        const [argumentStart, argumentEnd, callEnd] = args;
        spans.push({
          kind: "function",
          value: name,
          start: index,
          end: nameEnd,
          depth,
        });
        collectSemanticSpansInternal(
          text,
          argumentStart,
          argumentEnd,
          depth + 1,
          spans,
          errors
        );
        index = callEnd;
        continue;
      }

      if (nameEnd < end && text[nameEnd] === "(") {
        errors.push(`unclosed function call after '${name}'`);
      } else if (BARE_FUNCTIONS.has(name.toLowerCase())) {
        spans.push({
          kind: "function",
          value: name,
          start: index,
          end: nameEnd,
          depth,
        });
        index = nameEnd;
        continue;
      }
      index = nameEnd;
      continue;
    }

    if (depth) {
      const numberMatch = text.slice(index, end).match(/^\d+(?:\.\d+)?/);
      if (numberMatch) {
        const num = numberMatch[0];
        spans.push({
          kind: "constant",
          value: num,
          start: index,
          end: index + num.length,
          depth,
        });
        index = index + num.length;
        continue;
      }
    }

    index++;
  }
}

export function findSemanticSpans(source: string): [SemanticSpan[], string | null] {
  const spans: SemanticSpan[] = [];
  const errors: string[] = [];
  collectSemanticSpansInternal(source, 0, source.length, 0, spans, errors);
  return [spans, errors.length > 0 ? errors[0] : null];
}

export function formatMathStructure(parsed: ParsedMath): string {
  if (!parsed.expression || parsed.expression.length === 0) {
    return "No nested function calls found.";
  }
  return parsed.expression
    .map((span) => {
      const indent = "  ".repeat(span.depth);
      const kindTitle = span.kind.charAt(0).toUpperCase() + span.kind.slice(1);
      return `${indent}${kindTitle} ${span.value}`;
    })
    .join("\n");
}

export function parserAvailable(): boolean {
  return true;
}

export function parseMathBody(body: string): ParsedMath {
  const [spans, error] = findSemanticSpans(body);
  return {
    source: body,
    normalized: body,
    expression: spans,
    error,
    ok: error === null,
  };
}

export function parseMathBlocks(text: string): ParsedMath[] {
  return scanMarkdown(text).mathBlocks.map((span) =>
    parseMathBody(text.slice(span.contentStart, span.contentEnd))
  );
}

export function describeMathBlocks(text: string): string {
  const blocks = parseMathBlocks(text);
  if (blocks.length === 0) {
    return "No $$...$$ math blocks found.";
  }

  const lines: string[] = [];
  blocks.forEach((parsed, index) => {
    lines.push(`Block ${index + 1}: ${parsed.ok ? "OK" : "FAIL"}`);
    lines.push(
      parsed.ok ? formatMathStructure(parsed) : parsed.error || "unknown parse error"
    );
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

