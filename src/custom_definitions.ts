// src/custom_definitions.ts
/**
 * =======================================================================
 * COLOR MATH - USER CUSTOM DEFINITIONS
 * =======================================================================
 *
 * This file allows you to add any custom mathematical symbols, functions,
 * constants, or operators without modifying the parser or regex internals.
 *
 * HOW TO USE:
 * 1. Add your desired names/macros to the lists below.
 * 2. You can write them WITH or WITHOUT a leading backslash:
 *    - "relu" or "\\relu"
 *    - "sinc" or "\\sinc"
 *    - "kB" or "\\kB"
 * 3. Do NOT add parentheses "()". The system matches them automatically!
 * 4. Save the file.
 *
 * =======================================================================
 */

export interface CustomMathDefinitions {
  /**
   * Functions colored with your main function theme (e.g., sinc, relu, gelu, softmax).
   * Matched both as standard LaTeX macros (\relu(x), \relu x) and bare text (relu(x)).
   */
  customFunctions?: string[];

  /**
   * Mathematical & physical constants colored with your constant theme (orange/gold).
   * Examples: kB, muB, epsZero, NA, c.
   */
  customConstants?: string[];

  /**
   * Mathematical operators colored like \sum, \int, \lim.
   * Examples: \grad, \curl, \div, \laplacian, \Box.
   */
  customOperators?: string[];

  /**
   * Quantum operators colored with quantum purple/cyan accent.
   * Examples: \hat{a}, \hat{a}^\dagger, \hat{\rho}, \hat{H}, \hat{p}, \hat{x}.
   */
  customQuantumOperators?: string[];

  /**
   * Greek or parameter symbols colored with parameter/derivative theme.
   * Examples: \varpi, custom parameter names.
   */
  customParameters?: string[];

  /**
   * Relational symbols colored with relation theme (white/contrast).
   * Examples: \coloneqq (:=), \eqqcolon (=:), \triangleq, \equiv.
   */
  customRelations?: string[];
}

/**
 * Your custom definitions registry.
 * Edit, uncomment, or add any symbols you frequently use!
 */
export const USER_CUSTOM_DEFINITIONS: CustomMathDefinitions = {
  // Machine Learning & Signal Processing Functions
  customFunctions: [
    "sinc",
    "relu",
    "gelu",
    "swish",
    "silu",
    "softmax",
    "softplus",
    "sigmoid",
    "mish",
    "loss",
  ],

  // Physical & Mathematical Constants
  customConstants: [
    "kB",        // Boltzmann constant
    "muB",       // Bohr magneton
    "epsZero",   // Vacuum permittivity \varepsilon_0
    "NA",        // Avogadro's number
  ],

  // Vector Calculus & Differential Operators
  customOperators: [
    "\\grad",
    "\\curl",
    "\\div",
    "\\laplacian",
    "\\Box",
  ],

  // Quantum Mechanics Operators
  customQuantumOperators: [
    "\\hat{a}",
    "\\hat{a}^\\dagger",
    "\\hat{a}^{\\dagger}",
    "\\hat{b}",
    "\\hat{b}^\\dagger",
    "\\hat{c}",
    "\\hat{c}^\\dagger",
    "\\hat{\\rho}",
    "\\hat{H}",
    "\\hat{p}",
    "\\hat{x}",
    "\\hat{L}",
    "\\hat{S}",
    "\\hat{J}",
  ],

  // Custom Relations and Assignment Operators
  customRelations: [
    "\\coloneqq",  // :=
    "\\eqqcolon",  // =:
    "\\triangleq",
  ],

  // Custom Parameters
  customParameters: [],
};

/**
 * Sanitizes and normalizes an input symbol definition:
 * - Trims whitespace
 * - Strips trailing "()" or "(...)"
 * - Returns both LaTeX command form ("\name") and bare word ("name")
 */
export function sanitizeDefinition(raw: string): { macro: string; bare: string } {
  let cleaned = raw.trim();
  // Strip trailing parentheses e.g. "sinc()" -> "sinc"
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/, "").trim();

  if (cleaned.startsWith("\\")) {
    const macro = cleaned;
    const bare = cleaned.slice(1).trim();
    return { macro, bare };
  } else {
    const macro = "\\" + cleaned;
    const bare = cleaned;
    return { macro, bare };
  }
}
