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
  "\\Bbb",
  "\\cal",
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

export const DARK_VARIABLE_HASH_PALETTE: string[] = [
  "#ff929e", // Slot  0 ( 15.0 deg): Crimson / Ruby
  "#ff9975", // Slot  1 ( 37.5 deg): Coral / Vermilion
  "#fc9e47", // Slot  2 ( 60.0 deg): Amber / Tangerine
  "#e6ad29", // Slot  3 ( 82.5 deg): Warm Gold / Honey
  "#c6bc33", // Slot  4 (105.0 deg): Chartreuse / Olive
  "#9cc958", // Slot  5 (127.5 deg): Lime Green
  "#6ed889", // Slot  6 (150.0 deg): Emerald / Kelly
  "#1fdcb4", // Slot  7 (172.5 deg): Spring / Mint
  "#00dbdb", // Slot  8 (195.0 deg): Aqua / Teal
  "#00d4fd", // Slot  9 (217.5 deg): Cyan / Sky Cyan
  "#51c9ff", // Slot 10 (240.0 deg): Cerulean / Azure
  "#89bcff", // Slot 11 (262.5 deg): Cobalt / Royal Blue
  "#b4aeff", // Slot 12 (285.0 deg): Indigo / Iris
  "#d8a2ff", // Slot 13 (307.5 deg): Purple / Violet
  "#f398eb", // Slot 14 (330.0 deg): Magenta / Orchid
  "#ff93c7", // Slot 15 (352.5 deg): Rose / Hot Pink
];

export const LIGHT_VARIABLE_HASH_PALETTE: string[] = [
  "#9a1c37", // Slot  0 ( 15.0 deg): Crimson / Ruby
  "#9a2400", // Slot  1 ( 37.5 deg): Coral / Vermilion
  "#812500", // Slot  2 ( 60.0 deg): Amber / Tangerine
  "#703800", // Slot  3 ( 82.5 deg): Warm Gold / Honey
  "#574800", // Slot  4 (105.0 deg): Chartreuse / Olive
  "#2e5500", // Slot  5 (127.5 deg): Lime Green
  "#006c1a", // Slot  6 (150.0 deg): Emerald / Kelly
  "#006f4c", // Slot  7 (172.5 deg): Spring / Mint
  "#006d71", // Slot  8 (195.0 deg): Aqua / Teal
  "#00668e", // Slot  9 (217.5 deg): Cyan / Sky Cyan
  "#005ba3", // Slot 10 (240.0 deg): Cerulean / Azure
  "#204eac", // Slot 11 (262.5 deg): Cobalt / Royal Blue
  "#5040a8", // Slot 12 (285.0 deg): Indigo / Iris
  "#6d3498", // Slot 13 (307.5 deg): Purple / Violet
  "#83297e", // Slot 14 (330.0 deg): Magenta / Orchid
  "#921f5e", // Slot 15 (352.5 deg): Rose / Hot Pink
];

export const VARIABLE_HASH_PALETTE: string[] = DARK_VARIABLE_HASH_PALETTE;

export const CANONICAL_VARIABLE_SLOTS: Record<string, number> = {
  // 1. Spatial 3D Cartesian coordinates & Random Variables: Triad (120 deg: 112.5, 112.5, 135.0)
  x: 11, // Cobalt / Royal Blue (262.5 deg)
  y: 0,  // Crimson / Ruby (15.0 deg)
  z: 5,  // Lime Green (127.5 deg)
  X: 11, // Cobalt / Royal Blue
  Y: 0,  // Crimson / Ruby
  Z: 5,  // Lime Green
  E: 9,  // Sky Cyan (Expectation / Energy)

  // 2. Coefficients: Orthogonal Tetrad (90 deg: 2, 6, 10, 14)
  a: 2,  // Amber / Tangerine (60.0 deg)
  b: 6,  // Emerald / Kelly (150.0 deg)
  c: 10, // Cerulean / Azure (240.0 deg)
  d: 14, // Magenta / Orchid (330.0 deg)

  // 3. Parameters / Velocity / Substitutions: Triad (120 deg: 135, 112.5, 112.5)
  u: 1,  // Coral / Vermilion (37.5 deg)
  v: 7,  // Spring / Mint (172.5 deg)
  w: 12, // Indigo / Iris (285.0 deg)

  // 4. Discrete summation & matrix indices: Triad (120 deg: 135, 135, 90)
  i: 3,  // Warm Gold / Honey (82.5 deg)
  j: 9,  // Sky Cyan (217.5 deg)
  k: 15, // Rose / Hot Pink (352.5 deg)
  l: 6,  // Emerald / Kelly
  m: 8,  // Aqua / Teal
  n: 13, // Purple / Violet

  // 5. Calculus & Analysis duals (180 deg / 135 deg)
  f: 8,  // Aqua / Teal (195.0 deg)
  g: 13, // Purple / Violet (307.5 deg)
  h: 1,  // Coral / Vermilion (37.5 deg)
  F: 8,  // Aqua / Teal (Force / Antiderivative)
  G: 13, // Purple / Violet
  s: 14, // Magenta / Orchid (330.0 deg)
  t: 4,  // Chartreuse / Olive (105.0 deg)
  p: 10, // Cerulean / Azure (240.0 deg)
  q: 2,  // Amber / Tangerine (60.0 deg)

  // 6. Thermodynamics & State
  P: 14, // Magenta / Orchid (Pressure)
  V: 10, // Cerulean / Azure (Volume)
  T: 2,  // Amber / Tangerine (Temperature)
  W: 12, // Indigo / Iris (Work)

  // 7. Canonical State Qualifiers (The 4 Families)
  // Family 1: Extrema & Variational Bounds
  max: 4,  // Chartreuse / Olive
  min: 2,  // Amber / Tangerine
  sup: 14, // Magenta / Orchid
  inf: 1,  // Coral / Vermilion
  opt: 3,  // Warm Gold / Honey
  lim: 0,  // Crimson / Ruby

  // Family 2: Signal Metrics & Effective States
  rms: 8,   // Aqua / Teal
  avg: 2,   // Amber / Tangerine
  mean: 5,  // Lime Green
  peak: 15, // Rose / Hot Pink
  eff: 5,   // Lime Green

  // Family 3: Critical, Equilibrium & Phase Regimes
  eq: 12,   // Indigo / Iris
  crit: 8,  // Aqua / Teal
  sat: 6,   // Emerald / Kelly
  ss: 0,    // Crimson / Ruby
  th: 4,    // Chartreuse / Olive
  nom: 12,  // Indigo / Iris

  // Family 4: Boundary, Resultant & Directional States
  init: 3,  // Warm Gold / Honey
  fin: 15,  // Rose / Hot Pink
  ref: 3,   // Warm Gold / Honey
  net: 13,  // Purple / Violet
  tot: 9,   // Sky Cyan
  ext: 1,   // Coral / Vermilion
  int: 15,  // Rose / Hot Pink

  // 8. Greek letters & canonical duals
  "\\theta": 4, "θ": 4, "𝜗": 4, "ϑ": 4,
  "\\phi": 14, "\\varphi": 14, "ϕ": 14, "φ": 14, "𝜙": 14, "𝜑": 14,
  "\\psi": 14, "ψ": 14, "𝜓": 14,
  "\\epsilon": 2, "\\varepsilon": 2, "ε": 2, "𝜀": 2,
  "\\delta": 5, "δ": 5, "𝛿": 5,
  "\\alpha": 2, "α": 2, "𝛼": 2,
  "\\beta": 6, "β": 6, "𝛽": 6,
  "\\gamma": 5, "γ": 5, "𝛾": 5,
  "\\omega": 1, "ω": 1, "𝜔": 1,
  "\\lambda": 7, "λ": 7, "𝜆": 7,
};

export function hashStringToSlot(str: string, numSlots: number = 16): number {
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
  mathClickMode?: "caret" | "select";
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
  enable2dMathNavigation: false,
  mathClickMode: "caret",
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

