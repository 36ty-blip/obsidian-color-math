// src/utils/coloring.ts

import {
  COLORS,
  BIG_OPERATORS,
  INTEGRALS,
  LIMIT_OPERATORS,
  ARROWS,
  SET_SYMBOLS,
  SPACING_COMMANDS,
  MULTIPLICATION_SYMBOLS,
  ColorPalette,
} from "../config";

export function latexColor(color: string, value: string): string {
  return `\\textcolor{${color}}{${value}}`;
}

export function commandColor(command: string, palette: ColorPalette = COLORS): string {
  if (
    BIG_OPERATORS.has(command) ||
    INTEGRALS.has(command) ||
    LIMIT_OPERATORS.has(command)
  ) {
    return palette.orange;
  }
  if (ARROWS.has(command)) {
    return palette.arrow;
  }
  if (SET_SYMBOLS.has(command)) {
    return palette.set;
  }
  if (SPACING_COMMANDS.has(command)) {
    return palette.spacing;
  }
  if (MULTIPLICATION_SYMBOLS.has(command)) {
    return palette.dot;
  }
  return palette.relation;
}
