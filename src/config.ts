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
  | "unit"
  | "energyOperator";

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
  energyOperator: "#2ac3de",
};

export const DEFAULT_PALETTE = DEFAULT_COLORS;

export const COLORS: ColorPalette = { ...DEFAULT_COLORS };

export function setPalette(palette: Partial<ColorPalette>): void {
  Object.assign(COLORS, palette);
}

export function resetPalette(): void {
  Object.assign(COLORS, DEFAULT_COLORS);
}

import {
  UNICODE_BIG_OPERATORS,
  UNICODE_INTEGRALS,
  UNICODE_RELATIONS,
  UNICODE_ARROWS,
  UNICODE_SETS,
  UNICODE_MULTIPLICATION,
  UNICODE_CONSTANTS,
  UNICODE_VECTORS,
  UNICODE_GREEK_LOWER_STANDARD,
  UNICODE_GREEK_LOWER_PLANE1,
  UNICODE_GREEK_UPPER_STANDARD,
  UNICODE_GREEK_UPPER_PLANE1,
} from "./config/unicode";
import { USER_CUSTOM_DEFINITIONS, sanitizeDefinition } from "./custom_definitions";

// Process custom definitions safely
export const CUSTOM_MACRO_FUNCTIONS = new Set<string>();
export const CUSTOM_BARE_FUNCTIONS = new Set<string>();
for (const fn of USER_CUSTOM_DEFINITIONS.customFunctions || []) {
  const { macro, bare } = sanitizeDefinition(fn);
  if (macro) CUSTOM_MACRO_FUNCTIONS.add(macro);
  if (bare) CUSTOM_BARE_FUNCTIONS.add(bare.toLowerCase());
}

export const CUSTOM_CONSTANTS = new Set<string>();
for (const c of USER_CUSTOM_DEFINITIONS.customConstants || []) {
  const { macro, bare } = sanitizeDefinition(c);
  if (macro) CUSTOM_CONSTANTS.add(macro);
  if (bare) CUSTOM_CONSTANTS.add(bare);
}

export const CUSTOM_OPERATORS = new Set<string>();
for (const op of USER_CUSTOM_DEFINITIONS.customOperators || []) {
  const { macro } = sanitizeDefinition(op);
  if (macro) CUSTOM_OPERATORS.add(macro);
}

export const CUSTOM_QUANTUM_OPERATORS = new Set<string>(
  (USER_CUSTOM_DEFINITIONS.customQuantumOperators || []).map((q) => q.trim()).filter(Boolean)
);

export const CUSTOM_RELATIONS = new Set<string>();
for (const r of USER_CUSTOM_DEFINITIONS.customRelations || []) {
  const { macro, bare } = sanitizeDefinition(r);
  if (macro) CUSTOM_RELATIONS.add(macro);
  if (bare && !bare.startsWith("\\")) CUSTOM_RELATIONS.add(bare);
}

export const CUSTOM_PARAMETERS = new Set<string>();
for (const p of USER_CUSTOM_DEFINITIONS.customParameters || []) {
  const { macro, bare } = sanitizeDefinition(p);
  if (macro) CUSTOM_PARAMETERS.add(macro);
  if (bare) CUSTOM_PARAMETERS.add(bare);
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
  ...Object.values(UNICODE_BIG_OPERATORS),
]);

export const INTEGRALS = new Set([
  "\\int",
  "\\iint",
  "\\iiint",
  "\\oint",
  ...Object.values(UNICODE_INTEGRALS),
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
  "\\ne",
  "\\leq",
  "\\le",
  "\\geq",
  "\\ge",
  "\\approx",
  "\\sim",
  "\\equiv",
  "\\propto",
  "=",
  "<",
  ">",
  ...Object.values(UNICODE_RELATIONS),
  ...CUSTOM_RELATIONS,
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
  ...Object.values(UNICODE_ARROWS),
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
  ...Object.values(UNICODE_SETS),
]);

export const SPACING_COMMANDS = new Set([
  "\\,",
  "\\:",
  "\\;",
  "\\quad",
  "\\qquad",
  "\\ ",
  "\\!",
]);

export const MULTIPLICATION_SYMBOLS = new Set([
  "\\cdot",
  "\\times",
  "·",
  "*",
  "×",
  "✕",
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
  ...CUSTOM_OPERATORS,
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
  "\\imath",
  "\\jmath",
  "\\mathrm{e}",
  "\\mathrm{i}",
  "\\mathrm{j}",
  ...Object.values(UNICODE_CONSTANTS),
  ...CUSTOM_CONSTANTS,
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

export const FONT_STYLE_MACROS = new Set([
  "\\mathbf",
  "\\mathcal",
  "\\mathbb",
  "\\mathfrak",
  "\\mathsf",
  "\\mathtt",
  "\\mathit",
  "\\boldsymbol",
  "\\pmb",
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
  ...Object.values(UNICODE_GREEK_LOWER_STANDARD),
  ...Object.values(UNICODE_GREEK_LOWER_PLANE1),
  ...Object.values(UNICODE_GREEK_UPPER_STANDARD),
  ...Object.values(UNICODE_GREEK_UPPER_PLANE1),
  "𝜓",
  "𝝍",
  ...CUSTOM_PARAMETERS,
]);

export const NON_SLASH_MATH_CONSTANTS = new Set(
  Array.from(MATH_CONSTANTS).filter((c) => !c.startsWith("\\"))
);

export const NON_SLASH_MATH_PARAMETERS = new Set(
  Array.from(MATH_PARAMETERS).filter((c) => !c.startsWith("\\"))
);

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
  "\\rank",
  "\\nullity",
  "\\tr",
  "\\trace",
  "\\span",
  "\\diag",
  "\\sgn",
  "\\adj",
  "\\col",
  "\\row",
  "\\nul",
  "\\im",
  "\\sp",
  "\\rg",
  "\\var",
  "\\cov",
  "\\std",
  "\\med",
  "\\cor",
  "\\pdf",
  "\\cdf",
  "\\pmf",
  "\\lcm",
  "\\mod",
  "\\rem",
  "\\rot",
  "\\res",
  "\\erf",
  "\\abs",
  "\\sig",
  "\\dom",
  "\\ran",
  "\\cod",
  "\\tg",
  "\\ctg",
  "\\sh",
  "\\ch",
  "\\th",
  "\\cth",
  "\\lg",
  "\\lb",
  "\\aut",
  "\\gal",
  "\\ann",
  "\\tor",
  "\\ext",
  "\\pic",
  "\\cl",
  "\\jac",
  "\\hes",
  "\\wr",
  "\\vol",
  "\\rms",
  "\\fft",
  "\\dft",
  "\\ord",
  "\\val",
  "\\num",
  "\\den",
  "\\sn",
  "\\cn",
  "\\dn",
  "\\avg",
  "\\len",
  ...CUSTOM_MACRO_FUNCTIONS,
]);

export const STANDARD_BARE_FUNCTIONS = new Set([
  "sin",
  "cos",
  "tan",
  "csc",
  "sec",
  "cot",
  "arcsin",
  "arccos",
  "arctan",
  "arccsc",
  "arcsec",
  "arccot",
  "sinh",
  "cosh",
  "tanh",
  "coth",
  "sech",
  "csch",
  "ln",
  "log",
  "exp",
  "det",
  "gcd",
  "max",
  "min",
  "dim",
  "ker",
  "hom",
  "deg",
  "arg",
  "Pr",
  "sup",
  "inf",
  "rank",
  "nullity",
  "tr",
  "trace",
  "span",
  "diag",
  "sgn",
]);

export const EXTENDED_BARE_FUNCTIONS = new Set([
  "adj",
  "col",
  "row",
  "nul",
  "im",
  "sp",
  "rg",
  "var",
  "cov",
  "std",
  "med",
  "cor",
  "pdf",
  "cdf",
  "pmf",
  "lcm",
  "mod",
  "rem",
  "div",
  "rot",
  "res",
  "erf",
  "abs",
  "sig",
  "dom",
  "ran",
  "cod",
  "tg",
  "ctg",
  "sh",
  "ch",
  "th",
  "cth",
  "lg",
  "lb",
  "aut",
  "end",
  "gal",
  "ann",
  "tor",
  "ext",
  "pic",
  "cl",
  "jac",
  "hes",
  "wr",
  "vol",
  "rms",
  "fft",
  "dft",
  "ord",
  "val",
  "num",
  "den",
  "sn",
  "cn",
  "dn",
  "avg",
  "len",
]);

export const FULL_BARE_FUNCTIONS = new Set([
  ...STANDARD_BARE_FUNCTIONS,
  ...EXTENDED_BARE_FUNCTIONS,
]);

export const ALL_BARE_FUNCTIONS = new Set([
  ...FULL_BARE_FUNCTIONS,
  ...CUSTOM_BARE_FUNCTIONS,
]);

export const BARE_FUNCTIONS = ALL_BARE_FUNCTIONS;

export function getBareFunctions(options?: ColorMathOptions): Set<string> {
  const base =
    options && options.extendedFunctions === false
      ? STANDARD_BARE_FUNCTIONS
      : FULL_BARE_FUNCTIONS;
  if (CUSTOM_BARE_FUNCTIONS.size > 0) {
    return new Set([...base, ...CUSTOM_BARE_FUNCTIONS]);
  }
  return base;
}

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
  taxonomyFunctions?: boolean;
  taxonomyParameters?: boolean;
  taxonomyConstants?: boolean;
  taxonomyIndices?: boolean;
  rainbowDelimiters?: boolean;
  rainbowColors?: string[];
  rainbowBareBraces?: boolean;
  highlightUnmatchedBraces?: boolean;
  variableDataFlow?: boolean;
  colorUnits?: boolean;
  colorDifferentials?: boolean;
  colorDerivativeFractions?: boolean;
  colorInfinitesimals?: boolean;
  colorBraKet?: boolean;
  colorDimensionless?: boolean;
  colorAlignment?: boolean;
  colorSingleConstants?: boolean;
  extendedFunctions?: boolean;
  colorQuantumOperators?: boolean;
  highlightInlineMath?: boolean;
  highlightDisplayMath?: boolean;
  field?: "quantum" | "physics" | "math" | string;
}

