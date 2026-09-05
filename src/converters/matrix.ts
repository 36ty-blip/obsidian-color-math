// src/converters/matrix.ts

import { COLORS, ColorPalette } from "../config";
import {
  OperandSpan,
  findOperandSpans,
  operandText,
  readOperand,
} from "../parsers/latex_spans";
import { collectOperatorSpans } from "../parsers/scanner";
import { containsColorWrapper } from "../utils/latex_helpers";
import { ColorSpan, applyColorSpans } from "../utils/spans";
import { firstEquality, parseMathBlock, relationSpans } from "./semantic";

const MATRIX_COMMAND_RE =
  /\\(?:mathbf|mathcal|nabla|det|tr|Tr|trace|Vert|lVert)(?![A-Za-z])|\\\|(?![A-Za-z])|\\operatorname\s*\{\s*tr\s*\}/;
const MATRIX_ENV_RE =
  /\\begin\s*\{\s*(?:Bmatrix|Vmatrix|array|bmatrix|matrix|pmatrix|smallmatrix|vmatrix)\s*\}/;
const NUMBER_RE = /^[+-]?\d+(?:\.\d+)?$/;

function structuralSource(body: string): string {
  const visible = body.split("");
  let index = 0;
  while (index < body.length) {
    if (body[index] === "%") {
      let end = index + 1;
      while (end < body.length && body[end] !== "\r" && body[end] !== "\n") {
        visible[end] = " ";
        end++;
      }
      visible[index] = " ";
      index = end;
      continue;
    }
    const operand = readOperand(body, index);
    if (operand !== null && operand.kind === "opaque") {
      for (let position = operand.start; position < operand.end; position++) {
        if (visible[position] !== "\r" && visible[position] !== "\n") {
          visible[position] = " ";
        }
      }
      index = operand.end;
      continue;
    }
    index++;
  }
  return visible.join("");
}

function isMatrixExpression(body: string): boolean {
  const structural = structuralSource(body);
  const operands = findOperandSpans(structural);
  return (
    MATRIX_COMMAND_RE.test(structural) ||
    MATRIX_ENV_RE.test(structural) ||
    operands.some(
      (operand) =>
        operand.kind === "matrix" ||
        (operand.kind === "symbol" && operandText(structural, operand).includes("_"))
    )
  );
}

function operandColorSpans(
  body: string,
  operands: OperandSpan[],
  names: (keyof ColorPalette)[],
  palette: ColorPalette = COLORS
): ColorSpan[] {
  const spans: ColorSpan[] = [];
  let semanticIndex = 0;
  for (const operand of operands) {
    const value = operandText(body, operand).replace(/\s+/g, "");
    let name: keyof ColorPalette;
    if (NUMBER_RE.test(value)) {
      name = "orange";
    } else {
      name = names[Math.min(semanticIndex, names.length - 1)];
      semanticIndex++;
    }
    spans.push({
      start: operand.start,
      end: operand.end,
      color: palette[name],
      priority: 20,
    });
  }
  return spans;
}

export function convertMatrixBlock(
  source: string,
  palette: ColorPalette = COLORS
): string | null {
  const block = parseMathBlock(source);
  if (block === null || !isMatrixExpression(block.body)) {
    return null;
  }
  if (containsColorWrapper(block.body)) {
    return source;
  }

  const equality = firstEquality(block.body);
  if (equality === null) {
    return null;
  }

  const lhs = findOperandSpans(block.body, 0, equality[0]);
  const rhs = findOperandSpans(block.body, equality[1]);
  if (lhs.length === 0 || rhs.length === 0) {
    return null;
  }

  const lhsFirst = lhs[0].start < block.body.length
    ? operandText(block.body, lhs[0]).replace(/\s+/g, "")
    : "";

  let lhsColors: (keyof ColorPalette)[];
  if (lhs.length === 1) {
    lhsColors =
      lhsFirst.startsWith("\\det") || lhsFirst.startsWith("\\operatorname{tr}")
        ? ["upper"]
        : ["main"];
  } else if (
    lhsFirst.startsWith("\\frac{\\partial}") ||
    lhsFirst.startsWith("\\nabla")
  ) {
    lhsColors = ["upper", "main"];
  } else {
    lhsColors = ["upper", "chain", "orange"];
  }

  const lhsText = block.body.slice(0, equality[0]).replace(/\s+/g, "");
  let rhsColors: (keyof ColorPalette)[];
  if (lhsFirst.startsWith("\\frac{\\partial}")) {
    rhsColors = ["chain", "main"];
  } else if (lhs.length > 1 && rhs.length === 1) {
    rhsColors = ["main"];
  } else if (
    lhsText.startsWith("\\det") ||
    lhsText.startsWith("\\operatorname{tr}")
  ) {
    rhsColors = ["main", "chain"];
  } else if (block.body.includes("\\otimes")) {
    rhsColors = ["upper", "chain", "orange"];
  } else {
    rhsColors = ["upper", "chain"];
  }

  const spans = relationSpans(block.body, 0, undefined, palette);
  spans.push(...operandColorSpans(block.body, lhs, lhsColors, palette));
  spans.push(...operandColorSpans(block.body, rhs, rhsColors, palette));
  spans.push(...collectOperatorSpans(block.body, 0, undefined, palette));

  return block.render(applyColorSpans(block.body, spans));
}
