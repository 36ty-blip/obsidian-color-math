// src/parsers/taxonomy.ts

import {
  COLORS,
  ColorPalette,
  ColorMathOptions,
  BARE_FUNCTIONS,
  MATH_ACCENTS,
  FONT_STYLE_MACROS,
  NON_SLASH_MATH_CONSTANTS,
  NON_SLASH_MATH_PARAMETERS,
} from "../config";
import { lookupCatalog, matchBareFunction, matchBareSymbol } from "./catalog";
import { readOperand, OPAQUE_MACROS } from "./latex_spans";
import { readBraced, readColorCommand, skipEnvironmentHead, matchCommand } from "../utils/latex_helpers";
import { ColorSpan } from "../utils/spans";
import { findDifferentialSpans, DifferentialSpan } from "./differentials";
import { findDimensionlessSpans, DimensionlessSpan } from "./dimensionless";
import { findUnitSpans, UnitSpan } from "./units";

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
  options?: ColorMathOptions
): ColorSpan[] {
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

    // Bare math functions (sin, cos, tan, ln, exp, rank(A), relu(z), etc.) via MPHF engine
    if (options?.taxonomyFunctions !== false) {
      const bareMatch = matchBareFunction(body, index);
      if (bareMatch) {
        spans.push({
          start: index,
          end: index + bareMatch.length,
          color: palette.main,
          priority: 22,
        });
        index += bareMatch.length;
        continue;
      }
      // Fallback for user custom bare functions
      const legacyBare = body.slice(index).match(/^([A-Za-z]+)(?![A-Za-z])/);
      if (legacyBare && BARE_FUNCTIONS.has(legacyBare[1].toLowerCase())) {
        const fnName = legacyBare[1];
        spans.push({
          start: index,
          end: index + fnName.length,
          color: palette.main,
          priority: 22,
        });
        index += fnName.length;
        continue;
      }
    }

    // Bare mathematical symbols (Greek letters, constants, operators like hbar, nabla, alpha, arrow.r)
    const bareSymbol = matchBareSymbol(body, index);
    if (bareSymbol) {
      const entry = bareSymbol.entry;
      if (entry.role === "constant" && options?.taxonomyConstants !== false) {
        spans.push({
          start: index,
          end: index + bareSymbol.length,
          color: palette.orange,
          priority: entry.priority || 22,
        });
        index += bareSymbol.length;
        continue;
      } else if (entry.role === "parameter" && options?.taxonomyParameters !== false) {
        spans.push({
          start: index,
          end: index + bareSymbol.length,
          color: palette.parameter || palette.derivative,
          priority: entry.priority || 20,
        });
        index += bareSymbol.length;
        continue;
      } else if (entry.role === "differential") {
        spans.push({
          start: index,
          end: index + bareSymbol.length,
          color: palette.derivative || palette.main,
          priority: entry.priority || 24,
        });
        index += bareSymbol.length;
        continue;
      } else if (entry.role === "operator") {
        spans.push({
          start: index,
          end: index + bareSymbol.length,
          color: palette.chain || palette.derivative,
          priority: 25,
        });
        index += bareSymbol.length;
        continue;
      } else if (entry.role === "relation") {
        spans.push({
          start: index,
          end: index + bareSymbol.length,
          color: palette.chain || palette.derivative,
          priority: 20,
        });
        index += bareSymbol.length;
        continue;
      } else if (entry.role === "variable" && options?.taxonomyParameters !== false) {
        spans.push({
          start: index,
          end: index + bareSymbol.length,
          color: palette.parameter || palette.main,
          priority: entry.priority || 20,
        });
        index += bareSymbol.length;
        continue;
      }
    }

    if (body[index] === "\\") {
      const match = body.slice(index).match(/^(\\[A-Za-z]+|\\.)/);
      if (match) {
        const name = match[0];
        const cmdEnd = index + name.length;

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
        if (
          name === "\\Bbb" ||
          name === "\\mod" ||
          name === "\\pmod" ||
          name === "\\pod" ||
          (catalogEntry && catalogEntry.arity === 1 && !catalogEntry.extensible)
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
          if (catalogEntry.role === "constant") {
            if (options?.taxonomyConstants !== false) {
              spans.push({
                start: index,
                end: cmdEnd,
                color: palette.orange,
                priority: catalogEntry.priority || 22,
              });
            }
            index = cmdEnd;
            continue;
          }
          if (catalogEntry.role === "function") {
            if (catalogEntry.uncolored) {
              const remaining = body.slice(cmdEnd);
              const limitModifierMatch = remaining.match(/^(\s*\\(?:limits|nolimits|displaylimits))(?![a-zA-Z])/);
              index = limitModifierMatch ? cmdEnd + limitModifierMatch[0].length : cmdEnd;
              continue;
            }
            if (options?.taxonomyFunctions !== false) {
              let spanEnd = cmdEnd;
              const remaining = body.slice(cmdEnd);
              const limitModifierMatch = remaining.match(/^(\s*\\(?:limits|nolimits|displaylimits))(?![a-zA-Z])/);
              if (limitModifierMatch) {
                spanEnd = cmdEnd + limitModifierMatch[0].length;
              }
              spans.push({
                start: index,
                end: spanEnd,
                color: palette.main,
                priority: catalogEntry.priority || 22,
              });
              index = spanEnd;
            } else {
              index = cmdEnd;
            }
            continue;
          }
          if (catalogEntry.role === "parameter") {
            if (options?.taxonomyParameters !== false) {
              spans.push({
                start: index,
                end: cmdEnd,
                color: palette.parameter || palette.derivative,
                priority: catalogEntry.priority || 20,
              });
            }
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
    } else {
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
    }

    index++;
  }

  return spans;
}
