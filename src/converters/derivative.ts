// src/converters/derivative.ts

import { COLORS, ColorPalette } from "../config";
import {
  findOperandSpans,
  readCommand,
  readGroupEnd,
  readOperand,
  skipIgnorable,
} from "../parsers/latex_spans";
import { collectOperatorSpans } from "../parsers/scanner";
import { containsColorWrapper } from "../utils/latex_helpers";
import { ColorSpan, applyColorSpans } from "../utils/spans";
import {
  firstEquality,
  parseMathBlock,
  relationSpans,
  trimRange,
} from "./semantic";

function compact(value: string): string {
  return value.replace(/\s+/g, "");
}

function isDerivativePrefix(value: string): boolean {
  const c = compact(value);
  return (
    c.startsWith("\\frac{d}{d") ||
    c.startsWith("\\dfrac{d}{d") ||
    c.startsWith("\\tfrac{d}{d")
  );
}

function isPrime(value: string): boolean {
  return /^(?:[A-Za-z]|\\[A-Za-z]+)'/.test(value.trimStart());
}

function isNumeric(value: string): boolean {
  const c = compact(value);
  if (/^[+-]?\d+(?:\.\d+)?$/.test(c)) {
    return true;
  }
  return /^\\(?:dfrac|tfrac|frac)\{[+-]?\d+(?:\.\d+)?\}\{[+-]?\d+(?:\.\d+)?\}$/.test(c);
}

function isOuterDerivative(value: string): boolean {
  const c = compact(value);
  const prefixes = [
    "\\cos",
    "\\sin",
    "\\tan",
    "\\sec",
    "\\ln",
    "\\log",
    "\\sqrt",
    "\\frac",
    "\\dfrac",
    "\\tfrac",
    "e^",
  ];
  return prefixes.some((p) => c.startsWith(p)) || isPrime(c);
}

function hasAdditiveSeparator(value: string): boolean {
  return /[+\-=<>]|\\(?:pm|mp|leq|geq|neq|approx|sim|equiv)(?![A-Za-z])/.test(value);
}

function isMultiplicativeGap(value: string): boolean {
  return /^(?:\s|[·*]|\\(?:cdot|times|,|:|;|!|quad|qquad)(?![A-Za-z]))*$/.test(value);
}

function fractionArguments(
  body: string,
  operandStart: number,
  end: number
): [number, number][] {
  const command = readCommand(body, operandStart, end);
  if (command === null || !["frac", "dfrac", "tfrac"].includes(command[0])) {
    return [];
  }
  const ranges: [number, number][] = [];
  let index = command[1];
  for (let i = 0; i < 2; i++) {
    index = skipIgnorable(body, index, end);
    const groupEnd = readGroupEnd(body, index, end);
    if (groupEnd === null) {
      return [];
    }
    ranges.push([index + 1, groupEnd - 1]);
    index = groupEnd;
  }
  return ranges;
}

function rhsSpans(
  body: string,
  start: number,
  end?: number,
  palette: ColorPalette = COLORS
): ColorSpan[] {
  end = end === undefined ? body.length : end;
  const operands = findOperandSpans(body, start, end);
  const spans: ColorSpan[] = [];
  let primeSeen = false;
  let previousEnd = start;

  for (let index = 0; index < operands.length; index++) {
    const operand = operands[index];
    if (hasAdditiveSeparator(body.slice(previousEnd, operand.start))) {
      primeSeen = false;
    }
    const value = body.slice(operand.start, operand.end);
    const comp = compact(value);
    const nextExists = index + 1 < operands.length;

    const multiplicativeGap = nextExists
      ? body.slice(operand.end, operands[index + 1].start)
      : "";
    const isCoeff =
      isNumeric(value) ||
      (nextExists &&
        /^[A-Za-z]$/.test(comp) &&
        isMultiplicativeGap(multiplicativeGap));

    let colorName: keyof ColorPalette;
    if (isCoeff) {
      colorName = "orange";
    } else if (isPrime(value)) {
      colorName = primeSeen ? "chain" : "derivative";
      primeSeen = true;
    } else if (primeSeen) {
      colorName = operand.kind === "symbol" ? "chain" : "main";
    } else {
      colorName = isOuterDerivative(value) ? "derivative" : "main";
    }

    let spanStart = operand.start;
    if (isNumeric(value)) {
      let sign = operand.start - 1;
      while (sign >= start && /\s/.test(body[sign])) {
        sign--;
      }
      if (sign >= start && (body[sign] === "+" || body[sign] === "-")) {
        let before = sign - 1;
        while (before >= start && /\s/.test(body[before])) {
          before--;
        }
        if (before < start || "=+-(".includes(body[before])) {
          spanStart = sign;
        }
      }
    }

    const primedMatch = value.match(/^[A-Za-z]+['’]+/);
    let productGroup: [number, number] | null = null;
    if (primedMatch) {
      const groupStart = skipIgnorable(
        body,
        operand.start + primedMatch[0].length,
        operand.end
      );
      const groupEnd = readGroupEnd(body, groupStart, operand.end);
      if (
        groupEnd !== null &&
        (body.slice(groupStart + 1, groupEnd - 1).includes("+") ||
          body.slice(groupStart + 1, groupEnd - 1).includes("-"))
      ) {
        productGroup = [groupStart, operand.end];
      }
    }

    if (productGroup === null) {
      spans.push({
        start: spanStart,
        end: operand.end,
        color: palette[colorName],
        priority: 20,
      });
    } else {
      spans.push(
        {
          start: spanStart,
          end: operand.start + primedMatch![0].length,
          color: palette[colorName],
          priority: 20,
        },
        {
          start: productGroup[0],
          end: productGroup[1],
          color: palette.main,
          priority: 20,
        }
      );
    }

    if (
      !isNumeric(value) &&
      ["\\frac", "\\dfrac", "\\tfrac"].some((p) => value.trimStart().startsWith(p))
    ) {
      for (const [innerStart, innerEnd] of fractionArguments(
        body,
        operand.start,
        operand.end
      )) {
        const innerSemantic = rhsSpans(body, innerStart, innerEnd, palette);
        const innerRelations = relationSpans(body, innerStart, innerEnd, palette);
        spans.push(
          ...innerRelations.filter(
            (rel) =>
              !innerSemantic.some(
                (sem) => sem.start <= rel.start && rel.end <= sem.end
              )
          )
        );
        spans.push(...innerSemantic);
      }
    }

    previousEnd = operand.end;
  }

  return spans;
}

export function convertDerivativeLine(
  source: string,
  palette: ColorPalette = COLORS
): string | null {
  const block = parseMathBlock(source);
  if (block === null) {
    return null;
  }
  if (containsColorWrapper(block.body)) {
    return source;
  }

  const bodyStart = skipIgnorable(block.body, 0, block.body.length);
  const prefix = readOperand(block.body, bodyStart);
  if (prefix === null || !isDerivativePrefix(block.body.slice(prefix.start, prefix.end))) {
    return null;
  }

  const equality = firstEquality(block.body);
  if (equality === null || equality[0] <= prefix.end) {
    return null;
  }

  const [targetStart, targetEnd] = trimRange(block.body, prefix.end, equality[0]);
  let relations = relationSpans(block.body, 0, undefined, palette);
  const operators = collectOperatorSpans(block.body, 0, undefined, palette);

  let target: ColorSpan | null = null;
  if (targetStart < targetEnd) {
    target = {
      start: targetStart,
      end: targetEnd,
      color: palette.main,
      priority: 20,
    };
  }

  const semanticRhs = rhsSpans(block.body, equality[1], undefined, palette);
  relations = relations.filter(
    (span) =>
      !semanticRhs.some((sem) => sem.start <= span.start && span.end <= sem.end)
  );

  const spans = [...relations, ...operators, ...semanticRhs];
  if (target !== null) {
    spans.push(target);
  }

  return block.render(applyColorSpans(block.body, spans));
}
