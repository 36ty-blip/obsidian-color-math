// src/config.ts

export type ColorRole =
  | "main"
  | "orange"
  | "dot"
  | "derivative"
  | "chain"
  | "upper"
  | "relation"
  | "arrow"
  | "set"
  | "spacing";

export type ColorPalette = Record<ColorRole, string>;

export const DEFAULT_COLORS: ColorPalette = {
  main: "#7aa2f7",
  orange: "#e0af68",
  dot: "white",
  derivative: "#bb9af7",
  chain: "#9ece6a",
  upper: "#bb9af7",
  relation: "white",
  arrow: "#f7768e",
  set: "#bb9af7",
  spacing: "white",
};

export const COLORS: ColorPalette = { ...DEFAULT_COLORS };

export function setPalette(palette: Partial<ColorPalette>): void {
  Object.assign(COLORS, palette);
}

export function resetPalette(): void {
  Object.assign(COLORS, DEFAULT_COLORS);
}

export const BIG_OPERATORS = new Set([
  "\\sum",
  "\\prod",
  "\\coprod",
  "\\bigcup",
  "\\bigcap",
  "\\bigsqcup",
  "\\bigvee",
  "\\bigwedge",
  "\\bigoplus",
  "\\bigotimes",
]);

export const INTEGRALS = new Set([
  "\\int",
  "\\iint",
  "\\iiint",
  "\\oint",
]);

export const LIMIT_OPERATORS = new Set([
  "\\lim",
  "\\sup",
  "\\inf",
  "\\max",
  "\\min",
]);

export const RELATIONS = new Set([
  "\\neq",
  "\\leq",
  "\\geq",
  "\\approx",
  "\\sim",
  "\\equiv",
  "\\propto",
  "=",
  "<",
  ">",
]);

export const ARROWS = new Set([
  "\\longrightarrow",
  "\\longleftarrow",
  "\\leftrightarrow",
  "\\rightarrow",
  "\\leftarrow",
  "\\Rightarrow",
  "\\Leftarrow",
  "\\Leftrightarrow",
  "\\mapsto",
  "\\to",
]);

export const SET_SYMBOLS = new Set([
  "\\notin",
  "\\subseteq",
  "\\supseteq",
  "\\subset",
  "\\supset",
  "\\setminus",
  "\\emptyset",
  "\\in",
  "\\cup",
  "\\cap",
]);

export const SPACING_COMMANDS = new Set([
  "\\,",
  "\\:",
  "\\;",
  "\\quad",
  "\\qquad",
]);

export const MULTIPLICATION_SYMBOLS = new Set([
  "\\cdot",
  "\\times",
  "·",
  "*",
]);

export const COLOR_COMMANDS = new Set([
  ...BIG_OPERATORS,
  ...INTEGRALS,
  ...LIMIT_OPERATORS,
  ...RELATIONS,
  ...ARROWS,
  ...SET_SYMBOLS,
  ...SPACING_COMMANDS,
  ...MULTIPLICATION_SYMBOLS,
]);

export const SORTED_COLOR_COMMANDS: string[] = Array.from(COLOR_COMMANDS).sort(
  (a, b) => b.length - a.length
);
