// src/converters/semantic.ts

import { COLORS, ColorPalette } from "../config";
import { findTopLevelTokens } from "../parsers/latex_spans";
import { ColorSpan } from "../utils/spans";

export interface MathBlock {
  prefix: string;
  body: string;
  suffix: string;
  render(coloredBody: string): string;
}

export function parseMathBlock(source: string): MathBlock | null {
  const match = source.match(/^(\s*(?:#+\s*)?)\$\$([\s\S]*)\$\$([\s]*)$/);
  if (!match) return null;
  const prefix = match[1];
  const body = match[2];
  const suffix = match[3];
  return {
    prefix,
    body,
    suffix,
    render(coloredBody: string) {
      return `${prefix}$$${coloredBody}$$${suffix}`;
    },
  };
}

export function trimRange(source: string, start: number, end: number): [number, number] {
  while (start < end && /\s/.test(source[start])) {
    start++;
  }
  while (end > start && /\s/.test(source[end - 1])) {
    end--;
  }
  return [start, end];
}

export function firstEquality(source: string): [number, number] | null {
  const matches = findTopLevelTokens(source, ["="]);
  return matches.length > 0 ? [matches[0][0], matches[0][1]] : null;
}

export function relationSpans(
  source: string,
  start: number = 0,
  end?: number,
  palette: ColorPalette = COLORS
): ColorSpan[] {
  const colorByToken: Record<string, string> = {
    "=": palette.relation,
    "+": palette.relation,
    "-": palette.relation,
    "\\cdot": palette.dot,
    "\\otimes": palette.relation,
    "·": palette.dot,
    "*": palette.dot,
  };

  const tokens = Object.keys(colorByToken);
  return findTopLevelTokens(source, tokens, start, end).map(([s, e, token]) => ({
    start: s,
    end: e,
    color: colorByToken[token],
    priority: 30,
  }));
}
