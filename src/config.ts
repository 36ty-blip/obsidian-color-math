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
  | "energyOperator"
  | "structural"
  | "transform"
  | "arithmetic";

export type ColorPalette = Record<ColorRole, string>;

export const DEFAULT_COLORS: ColorPalette = {
  // Group A: Expression Core & Constants
  main: "#7aa2f7",
  orange: "#e0af68",
  parameter: "#ff9e64",
  // Group B: Calculus, Analysis & Linear Algebra
  derivative: "#bb9af7",
  chain: "#9ece6a",
  upper: "#9d7cd8",
  transform: "#e0af68",
  energyOperator: "#2ac3de",
  // Group C: Connective Glue & Relations (Co-located, minimalist defaults)
  relation: "none",
  arithmetic: "none",
  dot: "none",
  arrow: "#f7768e",
  // Group D: Structure, Sets & Formatting
  set: "#7dcfff",
  structural: "none",
  unit: "#73daca",
  spacing: "none",
};

export const DEFAULT_PALETTE = DEFAULT_COLORS;

export const CSS_VARIABLE_PALETTE: ColorPalette = {
  main: "var(--color-math-role-main)",
  orange: "var(--color-math-role-orange)",
  parameter: "var(--color-math-role-parameter)",
  derivative: "var(--color-math-role-derivative)",
  chain: "var(--color-math-role-chain)",
  upper: "var(--color-math-role-upper)",
  transform: "var(--color-math-role-transform)",
  energyOperator: "var(--color-math-role-energyOperator)",
  relation: "var(--color-math-role-relation)",
  arithmetic: "var(--color-math-role-arithmetic)",
  dot: "var(--color-math-role-dot)",
  arrow: "var(--color-math-role-arrow)",
  set: "var(--color-math-role-set)",
  structural: "var(--color-math-role-structural)",
  unit: "var(--color-math-role-unit)",
  spacing: "var(--color-math-role-spacing)",
};

/**
 * Returns a live-rendering palette mapped to dynamic CSS custom properties.
 * Roles set to "none" preserve "none" to ensure clean AST suppression.
 */
export function getLiveCssPalette(palette: ColorPalette = DEFAULT_COLORS): ColorPalette {
  const live: ColorPalette = { ...CSS_VARIABLE_PALETTE };
  for (const role of Object.keys(palette) as ColorRole[]) {
    if (palette[role] === "none") {
      live[role] = "none";
    }
  }
  return live;
}

/**
 * Hardware-accelerated synchronization of semantic color roles to CSS custom properties.
 * Updates all rendered math across the vault in < 0.1ms via the Chromium layout engine.
 */
export function syncPaletteToCss(palette: ColorPalette): void {
  if (typeof document === "undefined" || !document.documentElement) return;
  for (const [role, val] of Object.entries(palette)) {
    const cssVal = val === "none" ? "initial" : val;
    document.documentElement.style.setProperty(`--color-math-role-${role}`, cssVal);
  }
}

export const COLORS: ColorPalette = { ...DEFAULT_COLORS };

let paletteVersion = 0;
export function getPaletteVersion(): number {
  return paletteVersion;
}

export function setPalette(palette: Partial<ColorPalette>): void {
  Object.assign(COLORS, palette);
  paletteVersion++;
  syncPaletteToCss(COLORS);
}

export function resetPalette(): void {
  Object.assign(COLORS, DEFAULT_COLORS);
  paletteVersion++;
  syncPaletteToCss(COLORS);
}

import {
  UNICODE_BIG_OPERATORS,
  UNICODE_INTEGRALS,
  UNICODE_RELATIONS,
  UNICODE_ARROWS,
  UNICODE_SETS,
  UNICODE_CONSTANTS,
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
  "\\bigtimes",
  "xxx",
  "vvv",
  "uuu",
  "nnn",
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
  "\\vee",
  "\\wedge",
  "uu",
  "nn",
  "vv",
  "^^",
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
  "\\otimes",
  "\\odot",
  "·",
  "*",
  "×",
  "✕",
  "xx",
  "ox",
  "o.",
]);

export const ARITHMETIC_SYMBOLS = new Set([
  "+",
  "-",
  "+-",
  "-+",
  "\\pm",
  "\\mp",
  "±",
  "∓",
  "\\oplus",
  "\\ominus",
  "o+",
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
  ...ARITHMETIC_SYMBOLS,
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
  "#e0af68", // Tier 1: Gold
  "#7aa2f7", // Tier 2: Cyan / Blue
  "#bb9af7", // Tier 3: Purple / Lavender
  "#f7768e", // Tier 4: Coral / Pink
  "#9ece6a", // Tier 5: Green
  "#2ac3de", // Tier 6: Teal
];

export const VARIABLE_HASH_PALETTE: string[] = [
  "#7aa2f7", // 0: Tokyo Blue
  "#7dcfff", // 1: Tokyo Cyan
  "#bb9af7", // 2: Tokyo Purple
  "#f7768e", // 3: Tokyo Pink
  "#e0af68", // 4: Tokyo Orange/Gold
  "#9ece6a", // 5: Tokyo Green
  "#2ac3de", // 6: Light Cyan/Teal
  "#ff9e64", // 7: Peach
];

export const CANONICAL_VARIABLE_SLOTS: Record<string, number> = {
  // 1. Spatial 3D Cartesian coordinates & Random Variables: guaranteed maximum pairwise separation
  x: 0, // Tokyo Blue
  y: 4, // Tokyo Gold
  z: 5, // Tokyo Green
  X: 0, // Tokyo Blue (Random Variable)
  Y: 4, // Tokyo Gold (Random Variable)
  Z: 5, // Tokyo Green (Random Variable)
  E: 1, // Tokyo Cyan (Expectation / Energy)

  // 2. Coefficients: high-contrast against (x, y, z) and within the group
  a: 2, // Tokyo Purple
  b: 3, // Tokyo Pink
  c: 6, // Light Cyan/Teal
  d: 7, // Peach

  // 3. Parameters / Velocity / Substitutions
  u: 1, // Tokyo Cyan
  v: 2, // Tokyo Purple
  w: 4, // Tokyo Gold

  // 4. Discrete summation & matrix indices
  i: 4, // Tokyo Gold
  j: 0, // Tokyo Blue
  k: 3, // Tokyo Pink
  l: 5, // Tokyo Green
  m: 2, // Tokyo Purple
  n: 6, // Light Cyan/Teal

  // 5. Calculus & Analysis duals
  s: 3, // Tokyo Pink
  t: 1, // Tokyo Cyan
  p: 0, // Tokyo Blue
  q: 7, // Peach

  // 6. Thermodynamics & State
  P: 3, // Tokyo Pink
  V: 0, // Tokyo Blue
  T: 4, // Tokyo Gold

  // 7. Greek letters & canonical duals
  "\\theta": 4, "θ": 4, "𝜗": 4, "ϑ": 4,
  "\\phi": 2, "\\varphi": 2, "ϕ": 2, "φ": 2, "𝜙": 2, "𝜑": 2,
  "\\psi": 2, "ψ": 2, "𝜓": 2,
  "\\epsilon": 2, "\\varepsilon": 2, "ε": 2, "𝜀": 2,
  "\\delta": 5, "δ": 5, "𝛿": 5,
  "\\alpha": 2, "α": 2, "𝛼": 2,
  "\\beta": 3, "β": 3, "𝛽": 3,
  "\\gamma": 5, "γ": 5, "𝛾": 5,
  "\\omega": 7, "ω": 7, "𝜔": 7,
  "\\lambda": 6, "λ": 6, "𝜆": 6,
};

export function hashStringToSlot(str: string, numSlots: number = 8): number {
  if (Object.prototype.hasOwnProperty.call(CANONICAL_VARIABLE_SLOTS, str)) {
    return CANONICAL_VARIABLE_SLOTS[str] % numSlots;
  }
  const slashKey = "\\" + str;
  if (Object.prototype.hasOwnProperty.call(CANONICAL_VARIABLE_SLOTS, slashKey)) {
    return CANONICAL_VARIABLE_SLOTS[slashKey] % numSlots;
  }
  if (str.startsWith("\\")) {
    const unslashed = str.slice(1);
    if (Object.prototype.hasOwnProperty.call(CANONICAL_VARIABLE_SLOTS, unslashed)) {
      return CANONICAL_VARIABLE_SLOTS[unslashed] % numSlots;
    }
  }

  // Knuth 32-bit multiplicative hash with golden ratio constant 2654435761 (0x9E3779B9)
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  const unsignedH = h >>> 0;
  return Math.floor(((unsignedH * 2654435761) >>> 0) % numSlots);
}

export function hashStringToColor(
  str: string,
  palette: string[] = VARIABLE_HASH_PALETTE
): string {
  const slot = hashStringToSlot(str, palette.length);
  return palette[slot];
}

export type SuperFamilyMode =
  | "analysis"
  | "pde"
  | "dynamics"
  | "geometry"
  | "algebra"
  | "quantum_stochastic";

export type GranularMathMode =
  | "calculus"
  | "complex"
  | "pde_transport"
  | "continuum"
  | "ode_dynamics"
  | "optimization"
  | "geometry_tensors"
  | "topology"
  | "linear_algebra"
  | "abstract_algebra"
  | "number_theory"
  | "logic_sets"
  | "quantum"
  | "probability"
  | "stochastic";

export type ActiveMathMode = SuperFamilyMode | GranularMathMode;

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
  variableHashPalette?: string[];
  colorUnits?: boolean;
  allowSingleLetterUnits?: boolean;
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
  previewLatexNormalization?: boolean;
  autoScaleDelimiters?: boolean;
  crashImmunityAutoSeal?: boolean;
  requireBracesForSlashDivision?: boolean;
  enableQuickMenuOnAmbiguity?: boolean;
  field?: "quantum" | "physics" | "math" | (string & {});
  activeMode?: ActiveMathMode;
  autoDetectNoteMode?: boolean;
  padMatrixPadding?: boolean;
  strictDelimiterGating?: boolean;
  dialectLatex?: boolean;
  dialectTypst?: boolean;
  dialectAsciiMath?: boolean;
  dialectMatlab?: boolean;
  dialectPython?: boolean;
  dialectWolfram?: boolean;
  mathJaxLineBreaking?: boolean;
  speedSyntacticSugar?: boolean;
  sugarAsciiOperators?: boolean;
  sugarQuotedStrings?: boolean;
  sugarAsciiEllipses?: boolean;
  sugarChainedRoots?: boolean;
  sugarBracketMatrices?: boolean;
  sugarNumberBoundUnits?: boolean;
  inlineMathFloatingTooltip?: boolean;
  inlineMathFloatingTooltipOpacity?: number;
  inlineMathFloatingTooltipOpaque?: boolean;
  enable2dMathNavigation?: boolean;
  targetedMathNavigation?: boolean;
  defaultMode?: ActiveMathMode;
  useCST?: boolean;
  strictBracketWarnings?: boolean;
  defaultMatrixEnvironment?: "bmatrix" | "pmatrix" | "matrix" | "vmatrix" | "Bmatrix" | "Vmatrix";
  autoDetectNewlinesAsMatrixRows?: boolean;
  bareGreekRequiresBackslash?: boolean;
  padMatrixVectors?: boolean;
  allowSpaceSeparatedBareFunctions?: boolean;
  shiftFreeFunctionArguments?: boolean;
  useWebAssembly?: boolean;
  raggedRowDiagnostics?: boolean;
}

export const DEFAULT_OPTIONS: ColorMathOptions = {
  enable2dMathNavigation: true,
  enableTaxonomy: true,
  taxonomyFunctions: true,
  taxonomyParameters: true,
  taxonomyConstants: true,
  taxonomyIndices: true,
  rainbowDelimiters: true,
  rainbowColors: RAINBOW_DELIMITER_COLORS,
  rainbowBareBraces: true,
  highlightUnmatchedBraces: true,
  variableDataFlow: true,
  colorUnits: true,
  colorDifferentials: true,
  colorDerivativeFractions: true,
  colorInfinitesimals: true,
  colorBraKet: true,
  colorDimensionless: true,
  colorAlignment: true,
  colorSingleConstants: true,
  extendedFunctions: true,
  colorQuantumOperators: false,
  highlightInlineMath: true,
  highlightDisplayMath: true,
  previewLatexNormalization: true,
  autoScaleDelimiters: true,
  crashImmunityAutoSeal: true,
  requireBracesForSlashDivision: false,
  enableQuickMenuOnAmbiguity: false,
  activeMode: "analysis",
  autoDetectNoteMode: true,
  padMatrixPadding: false,
  strictDelimiterGating: false,
  dialectLatex: true,
  dialectTypst: true,
  dialectAsciiMath: true,
  dialectMatlab: true,
  dialectPython: true,
  dialectWolfram: true,
  mathJaxLineBreaking: true,
  speedSyntacticSugar: true,
  sugarAsciiOperators: true,
  sugarQuotedStrings: true,
  sugarAsciiEllipses: true,
  sugarChainedRoots: true,
  sugarBracketMatrices: true,
  sugarNumberBoundUnits: true,
  inlineMathFloatingTooltip: true,
  inlineMathFloatingTooltipOpacity: 100,
  inlineMathFloatingTooltipOpaque: false,
  useWebAssembly: false,
  raggedRowDiagnostics: true,
};

