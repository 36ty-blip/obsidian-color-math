// src/parsers/taxonomy.ts

import {
  COLORS,
  ColorPalette,
  ColorMathOptions,
  getPaletteVersion,
  CUSTOM_BARE_FUNCTIONS,
  MATH_ACCENTS,
  FONT_STYLE_MACROS,
  NON_SLASH_MATH_CONSTANTS,
  NON_SLASH_MATH_PARAMETERS,
} from "../config";
import {
  lookupCatalog,
  matchBareFunction,
  matchBareSymbol,
  ROLE_FUNCTION,
  ROLE_OPERATOR,
  ROLE_RELATION,
  ROLE_CONSTANT,
  ROLE_PARAMETER,
  ROLE_DERIVATIVE,
  ROLE_DELIMITER,
  ROLE_STRUCTURAL,
  ROLE_UNIT,
  ROLE_VARIABLE,
  ROLE_ARROW,
  ROLE_SET,
  ROLE_DOT,
  ROLE_TRANSFORM,
  ROLE_SPACING,
  ROLE_ARITHMETIC,
} from "./catalog";
import { readOperand, OPAQUE_MACROS } from "./latex_spans";
import { readBraced, readColorCommand, skipEnvironmentHead, matchCommand } from "../utils/latex_helpers";
import { ColorSpan } from "../utils/spans";
import { findDifferentialSpans, DifferentialSpan } from "./differentials";
import { findDimensionlessSpans, DimensionlessSpan } from "./dimensionless";
import { findUnitSpans, UnitSpan } from "./units";
import { SUGAR_CONSTRUCTOR_STICKY_RE } from "../config/constructors.generated";

function skipComment(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length && text[index] !== "\r" && text[index] !== "\n") {
    index++;
  }
  if (index < text.length && text[index] === "\r" && index + 1 < text.length && text[index + 1] === "\n") {
    return index + 2;
  }
  return Math.min(index + 1, text.length);
}

const INDEX_PATTERN =
  /(\\(?:sum|prod|coprod|bigcup|bigcap|lim|inf|sup))_\{?\s*([A-Za-z])\s*(?:=|\to|\\to)/g;

const STRUCTURAL_LAYOUT_MACROS = new Set([
  "\\mat",
  "\\pmat",
  "\\bmat",
  "\\cmat",
  "\\dmat",
  "\\vmat",
  "\\nmat",
  "\\Bmat",
  "\\Vmat",
  "\\frac",
  "\\dfrac",
  "\\cfrac",
  "\\tfrac",
  "\\sqrt",
  "\\cases",
  "\\dcases",
  "\\rcases",
  "\\align",
  "\\aligned",
  "\\gather",
  "\\gathered",
  "\\split",
]);

const LIMIT_MODIFIER_STICKY_RE = /\s*\\(?:limits|nolimits|displaylimits)(?![a-zA-Z])/y;
const BARE_WORD_STICKY_RE = /[A-Za-z]+/y;

let lastPaletteRef: ColorPalette | null = null;
let lastVersion = -1;
let lastPaletteArray: string[] | null = null;

export function buildPaletteArray(palette: ColorPalette): string[] {
  const currentVersion = getPaletteVersion();
  if (palette === COLORS && lastPaletteRef === COLORS && lastVersion === currentVersion && lastPaletteArray !== null) {
    return lastPaletteArray;
  }
  if (palette !== COLORS && palette === lastPaletteRef && lastPaletteArray !== null) {
    return lastPaletteArray;
  }
  const arr = new Array<string>(16);
  arr[ROLE_FUNCTION]   = palette.main;
  arr[ROLE_OPERATOR]   = palette.arithmetic !== "none" ? palette.arithmetic : "none";
  arr[ROLE_RELATION]   = palette.relation || "none";
  arr[ROLE_CONSTANT]   = palette.orange;
  arr[ROLE_PARAMETER]  = palette.parameter || palette.derivative;
  arr[ROLE_DERIVATIVE] = palette.derivative;
  arr[ROLE_DELIMITER]  = "none";
  arr[ROLE_STRUCTURAL] = palette.structural || "none";
  arr[ROLE_UNIT]       = palette.unit;
  arr[ROLE_VARIABLE]   = palette.parameter || palette.main;
  arr[ROLE_ARROW]      = palette.arrow;
  arr[ROLE_SET]        = palette.set || "#7dcfff";
  arr[ROLE_DOT]        = palette.dot || "none";
  arr[ROLE_TRANSFORM]  = palette.transform;
  arr[ROLE_SPACING]    = palette.spacing || "none";
  arr[ROLE_ARITHMETIC] = palette.arithmetic || "none";
  lastPaletteRef = palette;
  lastVersion = currentVersion;
  lastPaletteArray = arr;
  return arr;
}

/**
 * Collects semantic spans for mathematical symbols:
 * - Constants (\pi, \hbar, \infty, etc.) -> orange
 * - Parameters (\alpha, \beta, \theta, etc.) -> parameter / derivative
 * - Standard functions (\sin, \cos, \ln, etc.) -> main
 * - Bound iteration indices (\sum_{i=1}, \lim_{x \to 0}) -> chain / teal
 */
export function collectTaxonomySpans(
  body: string,
  palette: ColorPalette = COLORS,
  unitSpans?: UnitSpan[],
  diffSpans?: DifferentialSpan[],
  dimSpans?: DimensionlessSpan[],
  options?: ColorMathOptions,
  forLatexWrap: boolean = false
): ColorSpan[] {
  const paletteArray = buildPaletteArray(palette);
  const units = unitSpans || findUnitSpans(body);
  const diffs = diffSpans || findDifferentialSpans(body);
  const dims = dimSpans || findDimensionlessSpans(body);
  const spans: ColorSpan[] = [];
  let index = 0;

  // 1. Scan for bound index variables in sums, products, limits
  if (options?.taxonomyIndices !== false) {
    INDEX_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INDEX_PATTERN.exec(body)) !== null) {
      const operatorStr = match[1];
      const varName = match[2];
      const varOffset = match[0].indexOf(varName, operatorStr.length);
      if (varOffset !== -1) {
        const varStart = match.index + varOffset;
        spans.push({
          start: varStart,
          end: varStart + varName.length,
          color: palette.chain, // Bound index color
          priority: 23,
        });
      }
    }
  }

  // 2. Scan LaTeX commands for constants, functions, and parameters
  while (index < body.length) {
    if (body[index] === "%") {
      index = skipComment(body, index);
      continue;
    }

    const existingColor = readColorCommand(body, index);
    if (existingColor !== null) {
      index = existingColor[1];
      continue;
    }

    const operand = readOperand(body, index);
    if (operand !== null && operand.kind === "opaque") {
      index = operand.end;
      continue;
    }

    const inUnit = units.find((u) => u.start <= index && index < u.end);
    if (inUnit) {
      index = inUnit.end;
      continue;
    }

    const inDiff = diffs.find((d) => d.start <= index && index < d.end);
    if (inDiff) {
      index = inDiff.end;
      continue;
    }

    const inDim = dims.find((d) => d.start <= index && index < d.end);
    if (inDim) {
      index = inDim.end;
      continue;
    }

    // Door 1: Native LaTeX Macro Fast-Path (Sovereign TeX path, 0.3 ns check)
    if (body.charCodeAt(index) === 92) { // '\\'
      if (index + 1 < body.length) {
        let cmdEnd = index + 1;
        const c1 = body.charCodeAt(cmdEnd);
        if ((c1 >= 65 && c1 <= 90) || (c1 >= 97 && c1 <= 122)) { // [A-Za-z]
          cmdEnd++;
          while (cmdEnd < body.length) {
            const c = body.charCodeAt(cmdEnd);
            if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) {
              cmdEnd++;
            } else {
              break;
            }
          }
        } else {
          cmdEnd++;
        }
        const name = body.slice(index, cmdEnd);

        // Skip environment arguments: \begin{bmatrix}, \end{cases}, \begin{array}{cc|c}
        const envEnd = skipEnvironmentHead(body, name, cmdEnd);
        if (envEnd !== null) {
          index = envEnd;
          continue;
        }

        // Color custom operators as functions: \operatorname{rank}, \operatorname*{argmin}
        if (name === "\\operatorname") {
          let afterCmd = cmdEnd;
          if (afterCmd < body.length && body[afterCmd] === "*") {
            afterCmd++;
          }
          while (afterCmd < body.length && /\s/.test(body[afterCmd])) {
            afterCmd++;
          }
          if (afterCmd < body.length && body[afterCmd] === "{") {
            const braced = readBraced(body, afterCmd);
            if (braced !== null) {
              if (options?.taxonomyFunctions !== false) {
                spans.push({
                  start: index,
                  end: braced[1],
                  color: palette.main,
                  priority: 22,
                });
              }
              index = braced[1];
              continue;
            }
          }
          index = cmdEnd;
          continue;
        }

        // Definition commands: \newcommand, \renewcommand, \providecommand, \DeclareMathOperator, \def, \let
        if (
          name === "\\newcommand" ||
          name === "\\renewcommand" ||
          name === "\\providecommand" ||
          name === "\\DeclareMathOperator"
        ) {
          let afterCmd = cmdEnd;
          if (afterCmd < body.length && body[afterCmd] === "*") afterCmd++;
          while (afterCmd < body.length && /\s/.test(body[afterCmd])) afterCmd++;
          if (afterCmd < body.length && body[afterCmd] === "{") {
            const braced = readBraced(body, afterCmd);
            if (braced) afterCmd = braced[1];
          } else if (afterCmd < body.length && body[afterCmd] === "\\") {
            const m = matchCommand(body, afterCmd);
            if (m) afterCmd += m.length;
          }
          index = afterCmd;
          continue;
        }

        if (name === "\\def" || name === "\\let") {
          let afterCmd = cmdEnd;
          while (afterCmd < body.length && /\s/.test(body[afterCmd])) afterCmd++;
          if (afterCmd < body.length && body[afterCmd] === "\\") {
            const m = matchCommand(body, afterCmd);
            if (m) afterCmd += m.length;
          }
          while (afterCmd < body.length && body[afterCmd] !== "{") {
            afterCmd++;
          }
          if (afterCmd < body.length && body[afterCmd] === "{") {
            const braced = readBraced(body, afterCmd);
            if (braced) afterCmd = braced[1];
          }
          index = afterCmd;
          continue;
        }

        if (OPAQUE_MACROS.has(name.slice(1))) {
          let afterCmd = cmdEnd;
          while (afterCmd < body.length && /\s/.test(body[afterCmd])) {
            afterCmd++;
          }
          if (afterCmd < body.length && body[afterCmd] === "{") {
            const braced = readBraced(body, afterCmd);
            if (braced !== null) {
              index = braced[1];
              continue;
            }
          }
        }

        if (STRUCTURAL_LAYOUT_MACROS.has(name)) {
          if (!forLatexWrap) {
            spans.push({
              start: index,
              end: cmdEnd,
              color: palette.structural || "none",
              priority: 25,
            });
          }
          index = cmdEnd;
          continue;
        }

        if (MATH_ACCENTS.has(name)) {
          let targetStart = cmdEnd;
          while (targetStart < body.length && /\s/.test(body[targetStart])) {
            targetStart++;
          }
          if (targetStart < body.length) {
            let targetEnd = -1;
            if (body[targetStart] === "{") {
              const braced = readBraced(body, targetStart);
              if (braced) targetEnd = braced[1];
            } else if (body[targetStart] === "\\") {
              const nextCmd = body.slice(targetStart).match(/^(\\[A-Za-z]+|\\.)/);
              if (nextCmd) {
                let afterNext = targetStart + nextCmd[0].length;
                while (afterNext < body.length && /\s/.test(body[afterNext])) {
                  afterNext++;
                }
                if (afterNext < body.length && body[afterNext] === "{") {
                  const innerBraced = readBraced(body, afterNext);
                  if (innerBraced) afterNext = innerBraced[1];
                }
                targetEnd = afterNext;
              }
            } else {
              const letMatch = body.slice(targetStart).match(/^[a-zA-Z](')*/);
              if (letMatch) targetEnd = targetStart + letMatch[0].length;
            }
            if (targetEnd === -1) {
              index = cmdEnd;
              continue;
            }
            const isDot =
              name === "\\dot" ||
              name === "\\ddot" ||
              name === "\\dddot" ||
              name === "\\ddddot";
            if (options?.taxonomyParameters !== false) {
              spans.push({
                start: index,
                end: targetEnd,
                color: isDot ? palette.derivative : (palette.parameter || palette.main),
                priority: 22,
              });
            }
            index = targetEnd;
            continue;
          }
        }

        // Query O(1) MPHF catalog first
        const catalogEntry = lookupCatalog(name);
        if (catalogEntry?.uncolored) {
          index = cmdEnd;
          continue;
        }

        if (
          name === "\\Bbb" ||
          name === "\\mod" ||
          name === "\\pmod" ||
          name === "\\pod" ||
          (catalogEntry && catalogEntry.roleId === ROLE_FUNCTION && catalogEntry.arity === 1 && !catalogEntry.extensible)
        ) {
          let targetStart = cmdEnd;
          while (targetStart < body.length && /\s/.test(body[targetStart])) {
            targetStart++;
          }
          if (targetStart < body.length) {
            let targetEnd = targetStart + 1;
            if (body[targetStart] === "{") {
              const braced = readBraced(body, targetStart);
              if (braced) targetEnd = braced[1];
            } else if (body[targetStart] === "\\") {
              const subCmd = matchCommand(body, targetStart);
              if (subCmd) targetEnd = targetStart + subCmd.length;
            } else {
              const letMatch = body.slice(targetStart).match(/^[a-zA-Z0-9](')*/);
              if (letMatch) targetEnd = targetStart + letMatch[0].length;
            }
            spans.push({
              start: index,
              end: targetEnd,
              color: palette.main,
              priority: 20,
            });
            index = targetEnd;
            continue;
          }
        }
        if (catalogEntry) {
          if (catalogEntry.roleId === ROLE_CONSTANT) {
            if (options?.taxonomyConstants !== false) {
              spans.push({
                start: index,
                end: cmdEnd,
                color: paletteArray[ROLE_CONSTANT],
                priority: catalogEntry.priority || 22,
              });
            }
            index = cmdEnd;
            continue;
          }
          if (catalogEntry.roleId === ROLE_FUNCTION) {
            LIMIT_MODIFIER_STICKY_RE.lastIndex = cmdEnd;
            const limitModifierMatch = LIMIT_MODIFIER_STICKY_RE.exec(body);
            if (catalogEntry.uncolored) {
              index = limitModifierMatch ? cmdEnd + limitModifierMatch[0].length : cmdEnd;
              continue;
            }
            if (options?.taxonomyFunctions !== false) {
              const spanEnd = limitModifierMatch ? cmdEnd + limitModifierMatch[0].length : cmdEnd;
              spans.push({
                start: index,
                end: spanEnd,
                color: paletteArray[ROLE_FUNCTION],
                priority: catalogEntry.priority || 22,
              });
              index = spanEnd;
            } else {
              index = cmdEnd;
            }
            continue;
          }
          if (catalogEntry.roleId === ROLE_PARAMETER) {
            if (options?.taxonomyParameters !== false) {
              spans.push({
                start: index,
                end: cmdEnd,
                color: paletteArray[ROLE_PARAMETER],
                priority: catalogEntry.priority || 20,
              });
            }
            index = cmdEnd;
            continue;
          }
          if (catalogEntry.uncolored) {
            index = cmdEnd;
            continue;
          }
        }

        if (FONT_STYLE_MACROS.has(name)) {
          let targetStart = cmdEnd;
          while (targetStart < body.length && /\s/.test(body[targetStart])) {
            targetStart++;
          }
          if (targetStart < body.length) {
            let targetEnd = targetStart + 1;
            if (body[targetStart] === "{") {
              const braced = readBraced(body, targetStart);
              if (braced) targetEnd = braced[1];
            } else {
              const letMatch = body.slice(targetStart).match(/^[a-zA-Z](')*/);
              if (letMatch) targetEnd = targetStart + letMatch[0].length;
            }
            spans.push({
              start: index,
              end: targetEnd,
              color: palette.main,
              priority: 20,
            });
            index = targetEnd;
            continue;
          }
        }

        index = cmdEnd;
        continue;
      }
      index++;
      continue;
    }

    // Max Speed syntactic sugar constructors: mat, pmat, bmat, sqrt, cases followed strictly by '[' or '{' (never '(')
    if (options?.speedSyntacticSugar !== false) {
      if (index === 0 || !/[A-Za-z0-9_\\]/.test(body[index - 1])) {
        SUGAR_CONSTRUCTOR_STICKY_RE.lastIndex = index;
        const sugarConstructorMatch = SUGAR_CONSTRUCTOR_STICKY_RE.exec(body);
        if (sugarConstructorMatch) {
          const name = sugarConstructorMatch[0];
          let lookahead = index + name.length;
          while (lookahead < body.length && /\s/.test(body[lookahead])) lookahead++;
          if (lookahead < body.length && (body[lookahead] === "[" || body[lookahead] === "{")) {
            if (!forLatexWrap) {
              spans.push({
                start: index,
                end: index + name.length,
                color: palette.structural || "none",
                priority: 25,
              });
            }
            index += name.length;
            continue;
          }
        }
      }
    }

    // Connective arithmetic operators (+, -, +-, -+, o+) when actively enabled
    if (palette.arithmetic && palette.arithmetic !== "none" && palette.arithmetic !== "off") {
      if (
        body.startsWith("o+", index) &&
        (index === 0 || !/[A-Za-z0-9_\\]/.test(body[index - 1])) &&
        (index + 2 === body.length || !/[A-Za-z0-9_]/.test(body[index + 2]))
      ) {
        spans.push({
          start: index,
          end: index + 2,
          color: palette.arithmetic,
          priority: 30,
        });
        index += 2;
        continue;
      }
      const twoChar = body.slice(index, index + 2);
      if (twoChar === "+-" || twoChar === "-+") {
        spans.push({
          start: index,
          end: index + 2,
          color: palette.arithmetic,
          priority: 30,
        });
        index += 2;
        continue;
      }
      const ch = body[index];
      if (ch === "+" || ch === "-") {
        spans.push({
          start: index,
          end: index + 1,
          color: palette.arithmetic,
          priority: 28,
        });
        index++;
        continue;
      }
    }

    // Bare math functions (sin, cos, tan, ln, exp, rank(A), relu(z), etc.) via MPHF engine
    if (options?.taxonomyFunctions !== false) {
      const bareMatch = matchBareFunction(body, index);
      if (bareMatch) {
        spans.push({
          start: index,
          end: index + bareMatch.length,
          color: paletteArray[ROLE_FUNCTION],
          priority: 22,
        });
        index += bareMatch.length;
        continue;
      }
      // Fallback for user custom bare functions (0 cycles when no custom functions defined)
      if (CUSTOM_BARE_FUNCTIONS.size > 0) {
        BARE_WORD_STICKY_RE.lastIndex = index;
        const legacyBare = BARE_WORD_STICKY_RE.exec(body);
        if (legacyBare && CUSTOM_BARE_FUNCTIONS.has(legacyBare[0].toLowerCase())) {
          const fnName = legacyBare[0];
          spans.push({
            start: index,
            end: index + fnName.length,
            color: paletteArray[ROLE_FUNCTION],
            priority: 22,
          });
          index += fnName.length;
          continue;
        }
      }
    }

    // Bare mathematical symbols (Greek letters, constants, operators like hbar, nabla, alpha, arrow.r)
    if (options?.strictDelimiterGating !== true) {
      const bareSymbol = matchBareSymbol(body, index);
      if (bareSymbol) {
        const entry = bareSymbol.entry;
        if (entry.roleId === ROLE_CONSTANT && options?.taxonomyConstants !== false) {
          spans.push({
            start: index,
            end: index + bareSymbol.length,
            color: paletteArray[ROLE_CONSTANT],
            priority: entry.priority || 22,
          });
          index += bareSymbol.length;
          continue;
        } else if (entry.roleId === ROLE_PARAMETER && options?.taxonomyParameters !== false) {
          spans.push({
            start: index,
            end: index + bareSymbol.length,
            color: paletteArray[ROLE_PARAMETER],
            priority: entry.priority || 20,
          });
          index += bareSymbol.length;
          continue;
        } else if (entry.roleId === ROLE_DERIVATIVE) {
          spans.push({
            start: index,
            end: index + bareSymbol.length,
            color: paletteArray[ROLE_DERIVATIVE],
            priority: entry.priority || 24,
          });
          index += bareSymbol.length;
          continue;
        } else if (entry.roleId === ROLE_ARITHMETIC) {
          spans.push({
            start: index,
            end: index + bareSymbol.length,
            color: paletteArray[ROLE_ARITHMETIC],
            priority: 30,
          });
          index += bareSymbol.length;
          continue;
        } else if (entry.roleId === ROLE_DOT) {
          spans.push({
            start: index,
            end: index + bareSymbol.length,
            color: paletteArray[ROLE_DOT],
            priority: 30,
          });
          index += bareSymbol.length;
          continue;
        } else if (entry.roleId === ROLE_SET) {
          spans.push({
            start: index,
            end: index + bareSymbol.length,
            color: paletteArray[ROLE_SET],
            priority: 30,
          });
          index += bareSymbol.length;
          continue;
        } else if (entry.roleId === ROLE_OPERATOR) {
          let targetColor = palette.chain || palette.derivative;
          if (
            entry.canonical === "\\bigtimes" ||
            entry.canonical === "\\bigvee" ||
            entry.canonical === "\\bigcup" ||
            entry.canonical === "\\bigcap" ||
            entry.key === "xxx" ||
            entry.key === "vvv" ||
            entry.key === "uuu" ||
            entry.key === "nnn"
          ) {
            targetColor = palette.orange;
          } else if (
            entry.canonical === "\\times" ||
            entry.canonical === "\\otimes" ||
            entry.canonical === "\\odot" ||
            entry.key === "xx" ||
            entry.key === "ox" ||
            entry.key === "o."
          ) {
            targetColor = paletteArray[ROLE_DOT];
          } else if (
            entry.canonical === "\\cup" ||
            entry.canonical === "\\cap" ||
            entry.canonical === "\\vee" ||
            entry.canonical === "\\wedge" ||
            entry.key === "uu" ||
            entry.key === "nn" ||
            entry.key === "vv" ||
            entry.key === "^^"
          ) {
            targetColor = paletteArray[ROLE_SET];
          } else if (
            entry.canonical === "\\pm" ||
            entry.canonical === "\\mp" ||
            entry.canonical === "\\oplus" ||
            entry.canonical === "\\ominus" ||
            entry.key === "o+"
          ) {
            targetColor = paletteArray[ROLE_ARITHMETIC];
          }
          spans.push({
            start: index,
            end: index + bareSymbol.length,
            color: targetColor,
            priority: 30,
          });
          index += bareSymbol.length;
          continue;
        } else if (entry.roleId === ROLE_RELATION) {
          if (entry.uncolored) {
            index += bareSymbol.length;
            continue;
          }
          let targetColor = paletteArray[ROLE_RELATION];
          if (
            entry.canonical === "\\subset" ||
            entry.canonical === "\\supset" ||
            entry.canonical === "\\in" ||
            entry.unicode === "∈" ||
            entry.unicode === "⊂" ||
            entry.unicode === "⊃" ||
            entry.key === "sub" ||
            entry.key === "in"
          ) {
            targetColor = paletteArray[ROLE_SET];
          }
          spans.push({
            start: index,
            end: index + bareSymbol.length,
            color: targetColor,
            priority: 20,
          });
          index += bareSymbol.length;
          continue;
        } else if (entry.roleId === ROLE_VARIABLE && options?.taxonomyParameters !== false) {
          spans.push({
            start: index,
            end: index + bareSymbol.length,
            color: paletteArray[ROLE_VARIABLE],
            priority: entry.priority || 20,
          });
          index += bareSymbol.length;
          continue;
        }
      }
    }

    const char2 = index + 1 < body.length ? body.slice(index, index + 2) : "";
    const char1 = body[index];

    if (char2 && (NON_SLASH_MATH_CONSTANTS.has(char2) || NON_SLASH_MATH_PARAMETERS.has(char2))) {
      const isConst = NON_SLASH_MATH_CONSTANTS.has(char2);
      if ((isConst && options?.taxonomyConstants !== false) || (!isConst && options?.taxonomyParameters !== false)) {
        spans.push({
          start: index,
          end: index + 2,
          color: isConst ? palette.orange : (palette.parameter || palette.derivative),
          priority: isConst ? 22 : 20,
        });
      }
      index += 2;
      continue;
    } else if (NON_SLASH_MATH_CONSTANTS.has(char1) || NON_SLASH_MATH_PARAMETERS.has(char1)) {
      const isConst = NON_SLASH_MATH_CONSTANTS.has(char1);
      if ((isConst && options?.taxonomyConstants !== false) || (!isConst && options?.taxonomyParameters !== false)) {
        spans.push({
          start: index,
          end: index + 1,
          color: isConst ? palette.orange : (palette.parameter || palette.derivative),
          priority: isConst ? 22 : 20,
        });
      }
      index += 1;
      continue;
    }

    index++;
  }

  return spans;
}
