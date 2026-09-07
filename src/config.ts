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
  | "spacing"
  | "parameter"
  | "unit";

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
  parameter: "#bb9af7",
  unit: "#73daca",
};

export const DEFAULT_PALETTE = DEFAULT_COLORS;

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

export const MATH_CONSTANTS = new Set([
  "\\pi",
  "\\varpi",
  "\\hbar",
  "\\infty",
  "\\ell",
  "\\aleph",
  "\\Re",
  "\\Im",
  "\\top",
  "\\bot",
]);

export const MATH_ACCENTS = new Set([
  "\\dot",
  "\\ddot",
  "\\dddot",
  "\\ddddot",
  "\\hat",
  "\\widehat",
  "\\tilde",
  "\\widetilde",
  "\\bar",
  "\\vec",
  "\\check",
  "\\breve",
  "\\acute",
  "\\grave",
  "\\mathring",
]);

export const MATH_PARAMETERS = new Set([
  "\\alpha",
  "\\beta",
  "\\gamma",
  "\\delta",
  "\\epsilon",
  "\\varepsilon",
  "\\zeta",
  "\\eta",
  "\\theta",
  "\\vartheta",
  "\\iota",
  "\\kappa",
  "\\lambda",
  "\\mu",
  "\\nu",
  "\\xi",
  "\\rho",
  "\\varrho",
  "\\sigma",
  "\\varsigma",
  "\\tau",
  "\\upsilon",
  "\\phi",
  "\\varphi",
  "\\chi",
  "\\psi",
  "\\omega",
  "\\Gamma",
  "\\Delta",
  "\\Theta",
  "\\Lambda",
  "\\Xi",
  "\\Pi",
  "\\Sigma",
  "\\Upsilon",
  "\\Phi",
  "\\Psi",
  "\\Omega",
]);

export const MATH_FUNCTIONS = new Set([
  "\\sin",
  "\\cos",
  "\\tan",
  "\\csc",
  "\\sec",
  "\\cot",
  "\\arcsin",
  "\\arccos",
  "\\arctan",
  "\\sinh",
  "\\cosh",
  "\\tanh",
  "\\coth",
  "\\ln",
  "\\log",
  "\\exp",
  "\\det",
  "\\gcd",
  "\\max",
  "\\min",
  "\\dim",
  "\\ker",
  "\\hom",
  "\\deg",
  "\\arg",
  "\\Pr",
  "\\sup",
  "\\inf",
]);

export const RAINBOW_DELIMITER_COLORS: string[] = [
  "#e0af68", // Tier 0: Gold
  "#7aa2f7", // Tier 1: Cyan / Blue
  "#bb9af7", // Tier 2: Purple / Lavender
  "#f7768e", // Tier 3: Coral / Pink
];

export const VARIABLE_HASH_PALETTE: string[] = [
  "#7aa2f7", // Tokyo Blue
  "#7dcfff", // Tokyo Cyan
  "#bb9af7", // Tokyo Purple
  "#f7768e", // Tokyo Pink
  "#e0af68", // Tokyo Orange/Gold
  "#9ece6a", // Tokyo Green
  "#2ac3de", // Light Cyan
  "#ff9e64", // Peach
];

export function hashStringToColor(
  str: string,
  palette: string[] = VARIABLE_HASH_PALETTE
): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % palette.length;
  return palette[index];
}

export interface ColorMathOptions {
  enableTaxonomy?: boolean;
  rainbowDelimiters?: boolean;
  variableDataFlow?: boolean;
  colorUnits?: boolean;
}

