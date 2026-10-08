// src/parsers/cst/tokenizer.ts
//! Fast character codes, constant sets, and patterns for the CST parser and discipline rules.

export const CHAR_BACKSLASH = 92; // '\'
export const CHAR_LBRACE = 123;   // '{'
export const CHAR_RBRACE = 125;   // '}'
export const CHAR_LPAREN = 40;    // '('
export const CHAR_RPAREN = 41;    // ')'
export const CHAR_LBRACKET = 91;  // '['
export const CHAR_RBRACKET = 93;  // ']'
export const CHAR_UNDERSCORE = 95;// '_'
export const CHAR_CARET = 94;     // '^'
export const CHAR_PERCENT = 37;   // '%'
export const CHAR_PRIME = 39;     // '\''
export const CHAR_COLON = 58;     // ':'
export const CHAR_HASH = 35;      // '#'
export const CHAR_PIPE = 124;     // '|'

import { lookupCatalog } from "../catalog";

export const GREEK_COMMANDS = new Set([
  "\\alpha", "\\beta", "\\gamma", "\\delta", "\\epsilon", "\\varepsilon",
  "\\zeta", "\\eta", "\\theta", "\\vartheta", "\\iota", "\\kappa",
  "\\lambda", "\\mu", "\\nu", "\\xi", "\\pi", "\\varpi",
  "\\rho", "\\varrho", "\\sigma", "\\varsigma", "\\tau", "\\upsilon",
  "\\phi", "\\varphi", "\\chi", "\\psi", "\\omega",
  "\\Gamma", "\\Delta", "\\Theta", "\\Lambda", "\\Xi", "\\Pi",
  "\\Sigma", "\\Upsilon", "\\Phi", "\\Psi", "\\Omega",
]);

export function isGreekCommand(cmd: string): boolean {
  return lookupCatalog(cmd)?.role === "parameter" || GREEK_COMMANDS.has(cmd);
}

export function isQuantifier(cmd: string): boolean {
  return lookupCatalog(cmd)?.role === "relation" || QUANTIFIER_COMMANDS.has(cmd);
}

export function isSubgroupOrMorphism(cmd: string): boolean {
  const role = lookupCatalog(cmd)?.role;
  return role === "relation" || SUBGROUP_COMMANDS.has(cmd) || MORPHISM_COMMANDS.has(cmd);
}

export const OPTIONAL_BRACKET_COMMANDS = new Set([
  "\\sqrt", "\\\\", "\\tag", "\\xleftarrow", "\\xrightarrow",
  "\\rule", "\\makebox", "\\framebox", "\\parbox",
]);

export const COMMON_DIMENSIONLESS_SET = new Set([
  "Re", "Ma", "Pr", "Nu", "Kn", "Sc", "Pe", "Gr", "Ra", "We", "Fr", "St", "Bi", "Fo", "Ek", "Ro", "Eu",
]);

export const TENSOR_BASE_SYMBOLS = new Set([
  "T", "g", "R", "G", "F", "V", "W", "A", "h", "u", "v",
  "\\Gamma", "\\eta", "\\Lambda", "\\sigma", "\\boldsymbol{\\sigma}",
  "\\varepsilon", "\\boldsymbol{\\varepsilon}", "\\Omega"
]);

export const TENSOR_INDEX_GREEK = new Set([
  "\\mu", "\\nu", "\\alpha", "\\beta", "\\gamma", "\\delta",
  "\\rho", "\\sigma", "\\lambda", "\\kappa", "\\tau", "\\eta",
  "\\theta", "\\phi", "\\psi", "\\omega", "\\xi", "\\zeta",
  "μ", "ν", "α", "β", "γ", "δ", "ρ", "σ", "λ", "κ", "τ", "η"
]);

export const FLOW_MAP_SYMBOLS = new Set(["\\Phi", "\\varphi", "\\psi", "Phi", "phi", "psi"]);
export const INVARIANT_MANIFOLD_BASES = new Set(["W", "E"]);
export const CONVEX_FUNCTION_SYMBOLS = new Set(["f", "g", "h", "\\ell", "\\phi", "\\psi"]);
export const OPTIMIZER_VARIABLE_SYMBOLS = new Set(["x", "p", "d", "y", "u", "v", "\\mathbf{w}", "\\mathbf{x}", "\\lambda", "\\nu"]);
export const KKT_MULTIPLIER_SYMBOLS = new Set(["\\lambda", "\\nu"]);

export const MATRIX_TRANSFORMATION_SYMBOLS = new Set([
  "T", "\\top", "\\intercal", "*", "\\ast", "\\dagger", "-1", "+", "H", "\\perp"
]);

export const MATRIX_BASE_PATTERN =
  /^(?:\\mathbf\{[A-Z][a-zA-Z]*\}|\\boldsymbol\{[A-Z][a-zA-Z]*\}|\\Sigma|\\mathbf\{\\Sigma\}|[A-Z])(?![a-z])/;

export const LADDER_BASE_SYMBOLS = new Set([
  "a", "b", "c", "\\hat{a}", "\\hat{b}", "\\hat{c}", "\\hat{A}", "\\hat{B}", "\\hat{C}"
]);

export const PAULI_INDICES = new Set(["x", "y", "z", "1", "2", "3", "0"]);

export const PROBABILITY_NAMES = new Set([
  "\\mathbb{P}", "\\mathbb{E}", "P", "E", "\\operatorname{Var}", "\\operatorname{Cov}",
  "\\mathrm{Var}", "\\mathrm{Cov}", "\\mathrm{Pois}", "\\mathrm{Bin}", "\\mathrm{Beta}",
  "\\operatorname{bias}", "\\operatorname{corr}", "\\mathrm{bias}", "\\mathrm{corr}"
]);

export const MODULUS_COMMANDS = new Set(["\\pmod", "\\pod", "\\mod"]);
export const QUANTIFIER_COMMANDS = new Set(["\\forall", "\\exists", "\\nexists"]);
export const TURNSTILE_COMMANDS = new Set(["\\vdash", "\\dashv", "\\models", "\\Vdash", "\\vDash"]);
export const SUBGROUP_COMMANDS = new Set(["\\triangleleft", "\\triangleright", "\\trianglelefteq", "\\trianglerighteq"]);
export const MORPHISM_COMMANDS = new Set(["\\hookrightarrow", "\\twoheadrightarrow"]);
export const ARITHMETIC_FUNCTION_COMMANDS = new Set(["\\phi", "\\varphi", "\\mu"]);

export const TENSOR_IDENTIFIER_PATTERN =
  /^(?:\\sigma|\\boldsymbol\{\\sigma\}|\\varepsilon|\\boldsymbol\{\\varepsilon\}|\\mathbf\{[A-Za-z]+\}|\\mathbb\{C\}|\\mathcal\{C\}|[CSFT])(?![a-z])/;

export const TENSOR_INDEX_PATTERN =
  /^(?:\\(?:mu|nu|alpha|beta|gamma|delta|rho|sigma|lambda|kappa|tau|eta|theta|phi|psi|omega|xi|zeta)|[ijklmnμναβγδρσλκτηθφψωξζ]){1,4}$/;

export const HIGHER_ORDER_DERIV_PATTERN =
  /^(?:\d+|[nkm\alpha\beta\mu\nu]|\w\s*[+\-]\s*\d+)$/;

export const PRIME_PATTERN = /^'+$/;
export const BACKSLASH_PRIME_PATTERN = /^\\prime+$/;
export const POISSON_CHARS_PATTERN = /[qpuvHA-Z]/;
export const CONVECTIVE_ADVECTION_PATTERN =
  /\\mathbf\{[uvw]\}\s*\\cdot\s*\\nabla|\\vec\{[uvw]\}\s*\\cdot\s*\\nabla|[uvw]\s*\\cdot\s*\\nabla/;
export const BOUNDARY_SURFACE_INNER_PATTERN =
  /^(?:\\Omega|\\mathcal\{[A-Za-z]+\}|\\Sigma|\\Gamma|[VDMBUKS]|Ω|Σ|Γ)$/;
export const BOUNDARY_SURFACE_DIRECT_PATTERN =
  /^(?:\\Omega|\\mathcal\{[A-Za-z]+\}|\\Sigma|\\Gamma|[VDMBUKS]|Ω|Σ|Γ)(?![a-z])/;
export const WIRTINGER_DEN_HOLOMORPHIC =
  /\\partial\s*z(?![a-zA-Z])|∂\s*z(?![a-zA-Z])/;
export const WIRTINGER_DEN_ANTIHOLOMORPHIC =
  /\\partial\s*(?:\\bar\{z\}|\\bar\s*z|\\overline\{z\}|z\^[*\\ast])|∂\s*(?:\\bar\{z\}|\\bar\s*z|\\overline\{z\}|z\^[*\\ast])/;
