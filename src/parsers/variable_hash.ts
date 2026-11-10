// src/parsers/variable_hash.ts

import {
  VARIABLE_HASH_PALETTE,
  hashStringToColor,
  ColorPalette,
  MATH_ACCENTS,
  FONT_STYLE_MACROS,
  BARE_FUNCTIONS,
  MATH_PARAMETERS,
  ColorMathOptions,
} from "../config";
import { readOperand } from "./latex_spans";
import { readBraced, readColorCommand, skipEnvironmentHead, matchCommand } from "../utils/latex_helpers";
import { ColorSpan } from "../utils/spans";
import { findDifferentialSpans, DifferentialSpan, findBoundarySpans, BoundarySpan } from "./differentials";
import { findDimensionlessSpans, DimensionlessSpan } from "./dimensionless";
import { findUnitSpans, UnitSpan } from "./units";
import { SUGAR_CONSTRUCTOR_WORD_RE } from "../config/constructors.generated";
import { isEulerConstant, isImaginaryUnit } from "./constants";
import {
  matchBareSymbol,
  matchBareFunction,
  lookupCatalog,
  ROLE_PARAMETER,
  ROLE_VARIABLE,
  ROLE_CONSTANT,
  ROLE_DERIVATIVE,
  ROLE_OPERATOR,
  ROLE_RELATION,
} from "./catalog";

const VARIABLE_OPAQUE_MACROS = new Set([
  "text",
  "textbf",
  "textit",
  "textrm",
  "texttt",
  "textsf",
  "mathrm",
  "operatorname",
  "verb",
  "color",
  "textcolor",
  "colorbox",
  "fcolorbox",
  "tag",
  "label",
  "ref",
  "eqref",
  "cite",
  "hspace",
  "vspace",
  "phantom",
  "hphantom",
  "vphantom",
  "kern",
  "mkern",
  "mskip",
  "hskip",
]);

export const STATE_QUALIFIERS = new Set([
  // Family 1: Extrema & Variational Bounds
  "max", "min", "sup", "inf", "opt", "lim",
  // Family 2: Signal Metrics & Effective States
  "rms", "avg", "mean", "peak", "eff",
  // Family 3: Critical, Equilibrium & Phase Regimes
  "eq", "crit", "sat", "ss", "th", "nom",
  // Family 4: Boundary, Resultant & Directional States
  "init", "fin", "ref", "net", "tot", "ext", "int"
]);

/**
 * Determines whether a position in LaTeX code resides inside a subscript context
 * (either directly preceded by '_' or within an open '_{...}' block).
 */
export function isEnclosingSubscript(body: string, index: number): boolean {
  let depth = 0;
  for (let i = index - 1; i >= 0; i--) {
    const ch = body[i];
    if (ch === "}") {
      depth++;
    } else if (ch === "{") {
      if (depth > 0) {
        depth--;
      } else {
        let j = i - 1;
        while (j >= 0 && /\s/.test(body[j])) j--;
        return j >= 0 && body[j] === "_";
      }
    } else if (depth === 0 && (ch === "_" || ch === "^")) {
      return ch === "_";
    }
  }
  return false;
}

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

/**
 * Collects spans for variable data-flow hashing.
 * Assigns a unique, deterministic color to each distinct identifier in scope.
 */
export function collectVariableSpans(
  body: string,
  palette: string[] | ColorPalette = VARIABLE_HASH_PALETTE,
  unitSpans?: UnitSpan[],
  diffSpans?: DifferentialSpan[],
  dimSpans?: DimensionlessSpan[],
  bareFunctions: Set<string> = BARE_FUNCTIONS,
  boundarySpans?: BoundarySpan[],
  options?: ColorMathOptions
): ColorSpan[] {
  const hashPalette = options?.variableHashPalette || (Array.isArray(palette)
    ? palette
    : (palette && typeof palette === "object" ? Object.values(palette) : VARIABLE_HASH_PALETTE));
  const units = unitSpans || findUnitSpans(body);
  const diffs = diffSpans || findDifferentialSpans(body);
  const dims = dimSpans || findDimensionlessSpans(body);
  const boundaries = boundarySpans || findBoundarySpans(body);
  const spans: ColorSpan[] = [];
  let index = 0;

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
      if (isEnclosingSubscript(body, index)) {
        const innerText = body.slice(operand.start, operand.end).replace(/^\\[a-zA-Z]+\{?|\}$/g, "").trim().toLowerCase();
        if (STATE_QUALIFIERS.has(innerText)) {
          spans.push({
            start: index,
            end: operand.end,
            color: hashStringToColor(innerText, hashPalette),
            priority: 26,
          });
          index = operand.end;
          continue;
        }
      }
      index = operand.end;
      continue;
    }

    const inBoundary = boundaries.find((b) => b.start <= index && index < b.end);
    if (inBoundary) {
      index = inBoundary.end;
      continue;
    }

    const inUnit = units.find((u) => u.start <= index && index < u.end);
    if (inUnit) {
      index = inUnit.end;
      continue;
    }

    const inDiff = diffs.find((d) => d.start <= index && index < d.end);
    if (inDiff) {
      if (inDiff.kind === "differential" && options?.colorInfinitesimals === false) {
        // Do not skip! Allow variable data-flow to hash 'd' and coordinate variable separately
      } else {
        index = inDiff.end;
        continue;
      }
    }

    const inDim = dims.find((d) => d.start <= index && index < d.end);
    if (inDim) {
      index = inDim.end;
      continue;
    }

    // Backslash commands
    if (body[index] === "\\") {
      const match = body.slice(index).match(/^(\\[A-Za-z]+|\\.)/);
      if (match) {
        const cmdName = match[0];
        const cmdEnd = index + cmdName.length;

        // Skip environment arguments: \begin{bmatrix}, \end{bmatrix}, \begin{array}{cc|c}
        const envEnd = skipEnvironmentHead(body, cmdName, cmdEnd);
        if (envEnd !== null) {
          index = envEnd;
          continue;
        }

        // Skip custom operator name: \operatorname{rank}, \operatorname*{argmin}
        if (cmdName === "\\operatorname") {
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
              index = braced[1];
              continue;
            }
          }
          index = cmdEnd;
          continue;
        }

        // Check if math accent command like \dot, \ddot, \vec, \hat, \bar
        if (MATH_ACCENTS.has(cmdName)) {
          let targetStart = cmdEnd;
          while (targetStart < body.length && /\s/.test(body[targetStart])) {
            targetStart++;
          }
          if (targetStart < body.length) {
            if (body[targetStart] === "{") {
              const braced = readBraced(body, targetStart);
              if (braced) {
                const inner = braced[0];
                const baseMatch = inner.match(/[a-zA-Z]|[\u0370-\u03FF]|\uD835[\uDC00-\uDFFF]/);
                const baseLetter = baseMatch ? baseMatch[0] : "x";
                const canonicalKey = lookupCatalog(baseLetter)?.canonical || baseLetter;
                const color = hashStringToColor(canonicalKey, hashPalette);
                spans.push({
                  start: index,
                  end: braced[1],
                  color,
                  priority: 26,
                });
                index = braced[1];
                continue;
              }
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
                const baseLetter = nextCmd[0].slice(1);
                const color = hashStringToColor(baseLetter, hashPalette);
                spans.push({
                  start: index,
                  end: afterNext,
                  color,
                  priority: 26,
                });
                index = afterNext;
                continue;
              }
            } else {
              const letterMatch = body.slice(targetStart).match(/^(?:[a-zA-Z]|[\u0370-\u03FF]|\uD835[\uDC00-\uDFFF])(')*/);
              if (letterMatch) {
                const fullVar = letterMatch[0];
                const baseLetter = fullVar.replace(/'/g, "");
                const canonicalKey = lookupCatalog(baseLetter)?.canonical || baseLetter;
                const color = hashStringToColor(canonicalKey, hashPalette);
                spans.push({
                  start: index,
                  end: targetStart + fullVar.length,
                  color,
                  priority: 26,
                });
                index = targetStart + fullVar.length;
                continue;
              }
            }
          }
        }

        if (FONT_STYLE_MACROS.has(cmdName)) {
          let targetStart = cmdEnd;
          while (targetStart < body.length && /\s/.test(body[targetStart])) {
            targetStart++;
          }
          if (targetStart < body.length) {
            let targetEnd = targetStart + 1;
            let baseLetter = "R";
            if (body[targetStart] === "{") {
              const braced = readBraced(body, targetStart);
              if (braced) {
                targetEnd = braced[1];
                const bm = braced[0].match(/[a-zA-Z]/);
                if (bm) baseLetter = bm[0];
              }
            } else {
              const letMatch = body.slice(targetStart).match(/^[a-zA-Z](')*/);
              if (letMatch) {
                targetEnd = targetStart + letMatch[0].length;
                baseLetter = letMatch[0].replace(/'/g, "");
              }
            }
            const color = hashStringToColor(baseLetter, hashPalette);
            spans.push({
              start: index,
              end: targetEnd,
              color,
              priority: 26,
            });
            index = targetEnd;
            continue;
          }
        }

        // Definition commands: \newcommand, \renewcommand, \providecommand, \DeclareMathOperator, \def, \let
        if (
          cmdName === "\\newcommand" ||
          cmdName === "\\renewcommand" ||
          cmdName === "\\providecommand" ||
          cmdName === "\\DeclareMathOperator"
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

        if (cmdName === "\\def" || cmdName === "\\let") {
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

        if (VARIABLE_OPAQUE_MACROS.has(cmdName.slice(1))) {
          let afterCmd = cmdEnd;
          while (afterCmd < body.length && /\s/.test(body[afterCmd])) {
            afterCmd++;
          }
          if (afterCmd < body.length && body[afterCmd] === "{") {
            const braced = readBraced(body, afterCmd);
            if (braced !== null) {
              const innerWord = braced[0].trim().toLowerCase();
              if (isEnclosingSubscript(body, index) && STATE_QUALIFIERS.has(innerWord)) {
                const color = hashStringToColor(innerWord, hashPalette);
                spans.push({
                  start: index,
                  end: braced[1],
                  color,
                  priority: 26,
                });
                index = braced[1];
                continue;
              }
              index = braced[1];
              continue;
            }
          }
        }

        // Subscript state qualifier commands (e.g. \max, \min, \sup, \inf in A_{\max})
        if (isEnclosingSubscript(body, index)) {
          const rawMacro = cmdName.slice(1).toLowerCase();
          if (STATE_QUALIFIERS.has(rawMacro)) {
            const color = hashStringToColor(rawMacro, hashPalette);
            spans.push({
              start: index,
              end: cmdEnd,
              color,
              priority: 26,
            });
            index = cmdEnd;
            continue;
          }
        }

        const catalogEntry = lookupCatalog(cmdName);
        if (
          MATH_PARAMETERS.has(cmdName) ||
          (catalogEntry && (catalogEntry.roleId === ROLE_PARAMETER || catalogEntry.roleId === ROLE_VARIABLE))
        ) {
          const color = hashStringToColor(cmdName, hashPalette);
          spans.push({
            start: index,
            end: cmdEnd,
            color,
            priority: 26,
          });
          index = cmdEnd;
          continue;
        }

        index = cmdEnd;
        continue;
      }
    }

    // Max Speed syntactic sugar constructors via single source of truth: mat, pmat, bmat, sqrt, cases, align, etc. followed strictly by '[' or '{' (never '(')
    const sugarConstructorMatch = body
      .slice(index)
      .match(SUGAR_CONSTRUCTOR_WORD_RE);
    if (sugarConstructorMatch) {
      const name = sugarConstructorMatch[0];
      let lookahead = index + name.length;
      while (lookahead < body.length && /\s/.test(body[lookahead])) lookahead++;
      if (lookahead < body.length && (body[lookahead] === "[" || body[lookahead] === "{")) {
        // Skip keyword atomically so letters (e.g. m, a, t) are NOT individually hashed as variables
        index += name.length;
        continue;
      }
    }

    // 1. Bare functions via MPHF catalog (sin, cos, rank(A), relu(z))
    const bareFn = matchBareFunction(body, index);
    if (bareFn) {
      index += bareFn.length;
      continue;
    }

    // 2. Bare mathematical symbols (Greek letters, constants, operators like hbar, nabla, alpha, arrow.r)
    const bareSymbol = matchBareSymbol(body, index);
    if (bareSymbol) {
      if (isEnclosingSubscript(body, index)) {
        const rawKey = (bareSymbol.entry.key || "").toLowerCase();
        if (STATE_QUALIFIERS.has(rawKey)) {
          const color = hashStringToColor(rawKey, hashPalette);
          spans.push({
            start: index,
            end: index + bareSymbol.length,
            color,
            priority: 26,
          });
          index += bareSymbol.length;
          continue;
        }
      }

      const afterBare = body.slice(index + bareSymbol.length).trimStart();
      const hasArgs = afterBare.startsWith("(") || afterBare.startsWith("\\left(");
      const entry = bareSymbol.entry;
      if (hasArgs && bareSymbol.length === 1) {
        // Single-letter function call: skip function name (e.g. f(x), g(x))
        index += 1;
        continue;
      }
      const isCanonicalSymbol = entry.roleId === ROLE_CONSTANT || entry.roleId === ROLE_PARAMETER;
      if (
        hasArgs &&
        bareSymbol.length <= 3 &&
        !isCanonicalSymbol &&
        !bareFunctions.has(body.slice(index, index + bareSymbol.length).toLowerCase())
      ) {
        // Fall through to 2-3 letter variable multiplication (e.g. non-catalog identifiers)
      } else {
        const isBareDiff =
          bareSymbol.length === 2 &&
          (bareSymbol.entry.key.startsWith("d") || bareSymbol.entry.key.startsWith("∂") || bareSymbol.entry.key.startsWith("δ")) &&
          /^[a-zA-Z]$/.test(body[index + 1]);

        if (isBareDiff && (options?.variableDataFlow || options?.colorDifferentials !== false)) {
          const varChar = body[index + 1];
          const diffColor =
            typeof palette === "object" && !Array.isArray(palette) && palette.derivative
              ? palette.derivative
              : "#bb9af7";
          const canonicalVar = lookupCatalog(varChar)?.canonical || varChar;
          const varColor = hashStringToColor(canonicalVar, hashPalette);
          spans.push({
            start: index,
            end: index + 1,
            color: diffColor,
            role: "derivative",
            priority: 24,
          });
          spans.push({
            start: index + 1,
            end: index + 2,
            color: varColor,
            role: "variable",
            priority: 26,
          });
          index += bareSymbol.length;
          continue;
        }

        if (entry.roleId === ROLE_CONSTANT) {
          const constColor =
            typeof palette === "object" && !Array.isArray(palette) && palette.orange
              ? palette.orange
              : "#e0af68";
          spans.push({
            start: index,
            end: index + bareSymbol.length,
            color: constColor,
            priority: 22,
          });
        } else if (entry.roleId === ROLE_DERIVATIVE) {
          const diffColor =
            typeof palette === "object" && !Array.isArray(palette) && palette.derivative
              ? palette.derivative
              : "#2ac3de";
          spans.push({
            start: index,
            end: index + bareSymbol.length,
            color: diffColor,
            role: "derivative",
            priority: 24,
          });
        } else if (entry.roleId === ROLE_OPERATOR || entry.roleId === ROLE_RELATION) {
          const opColor =
            typeof palette === "object" && !Array.isArray(palette) && (palette.chain || palette.derivative)
              ? (palette.chain || palette.derivative)
              : "#9ece6a";
          spans.push({
            start: index,
            end: index + bareSymbol.length,
            color: opColor,
            priority: 25,
          });
        } else {
          const word = body.slice(index, index + bareSymbol.length);
          const baseWord = word.replace(/'/g, "");
          const hashKey = entry.canonical || baseWord;
          spans.push({
            start: index,
            end: index + bareSymbol.length,
            color: hashStringToColor(hashKey, hashPalette),
            priority: 26,
          });
        }
        index += bareSymbol.length;
        continue;
      }
    }

    // Check bare math functions or function calls before '('
    const wordMatch = body.slice(index).match(/^([A-Za-z]+)(?![A-Za-z])/);
    if (wordMatch) {
      const word = wordMatch[1];
      const lowerWord = word.toLowerCase();

      // 1. State qualifiers inside subscripts (Option A): hash token atomically to prevent multi-letter shattering
      if (isEnclosingSubscript(body, index) && STATE_QUALIFIERS.has(lowerWord)) {
        const color = hashStringToColor(lowerWord, hashPalette);
        spans.push({
          start: index,
          end: index + word.length,
          color,
          priority: 26,
        });
        index += word.length;
        continue;
      }

      // 2. Extremum operators max and min: always retain function meaning outside subscripts
      if (lowerWord === "max" || lowerWord === "min") {
        index += word.length;
        continue;
      }

      // Check if followed by parentheses / arguments: e.g. dim(V), det(A), rank(A)
      const afterWord = body.slice(index + word.length).trimStart();
      const hasArgs = afterWord.startsWith("(") || afterWord.startsWith("\\left(") || afterWord.startsWith("{");
      const isSubOrSuper = index > 0 && (body[index - 1] === "_" || body[index - 1] === "^");

      // 2. Dimensional and matrix functions: dim(V), det(A), ker(T), rank(M)
      const DIM_OR_MATRIX_FNS = new Set(["dim", "det", "ker", "rank", "nullity", "hom", "deg", "tr", "trace", "span", "diag"]);
      if (DIM_OR_MATRIX_FNS.has(lowerWord)) {
        if (hasArgs && !isSubOrSuper) {
          // Function call with argument: skip variable hash so function color applies
          index += word.length;
          continue;
        } else {
          // Isolated without argument: treat as variable and hash!
          const color = hashStringToColor(word, hashPalette);
          spans.push({
            start: index,
            end: index + word.length,
            color,
            priority: 26,
          });
          index += word.length;
          continue;
        }
      }

      // 3. Other bare functions without parentheses: e.g. sin x, ln x
      if (bareFunctions.has(lowerWord)) {
        index += word.length;
        continue;
      }

      // 4. Check if other multi-letter word followed by parentheses: e.g. f(x), ax(y + z)
      if (hasArgs && !isSubOrSuper) {
        if (word.length >= 4) {
          // Multi-letter function call: skip entire word (e.g. rank, nullity, poly)
          index += word.length;
          continue;
        } else if (word.length === 1) {
          // Single-letter function call: skip function name (e.g. f(x), g(x))
          index += 1;
          continue;
        } else {
          // 2 or 3 letters not in BARE_FUNCTIONS (e.g. ax in ax(y + z), xy in xy(a + b))
          // Treat as distinct single-letter variables multiplied together!
          for (let i = 0; i < word.length; i++) {
            const letter = word[i];
            const color = hashStringToColor(letter, hashPalette);
            spans.push({
              start: index + i,
              end: index + i + 1,
              color,
              priority: 26,
            });
          }
          index += word.length;
          continue;
        }
      }
    }

    // Single-character constants 'e' and 'i'/'j'
    if (isEulerConstant(body, index) || isImaginaryUnit(body, index)) {
      const constColor =
        typeof palette === "object" && !Array.isArray(palette) && palette.orange
          ? palette.orange
          : "#e0af68";
      spans.push({
        start: index,
        end: index + 1,
        color: constColor,
        priority: 22,
      });
      index++;
      continue;
    }

    // Single letter variables (optionally with prime): e.g. x, y, z, t, x', y'', 𝜓, ψ, θ
    const varMatch = body.slice(index).match(/^(?:[a-zA-Z]|[\u0370-\u03FF]|\uD835[\uDC00-\uDFFF])(')*/);
    if (varMatch) {
      const fullVar = varMatch[0];
      const baseLetter = fullVar.replace(/'/g, "");
      const varEnd = index + fullVar.length;

      const canonicalKey = lookupCatalog(baseLetter)?.canonical || baseLetter;
      const color = hashStringToColor(canonicalKey, hashPalette);
      spans.push({
        start: index,
        end: varEnd,
        color,
        priority: 26,
      });

      index = varEnd;
      continue;
    }

    index++;
  }

  return spans;
}
