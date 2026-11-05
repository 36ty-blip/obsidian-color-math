import type { ColorMathOptions } from "../config";
import { findUnitSpans } from "../parsers/units";
import {
  matchBareSymbol,
  matchBareFunction,
  lookupCatalog,
  lookupMacroSignature,
  ROLE_FUNCTION,
} from "../parsers/catalog";
import {
  MATRIX_SUGAR_PREFIXES,
  CONSTRUCTOR_GATING_RE,
  PRECEDING_MATRIX_RE,
  MATRIX_PREFIX_UNWRAPPED_RE,
  MATRIX_PREFIX_WRAPPED_RE,
  MATRIX_PREFIX_BACKSLASHED_RE,
} from "../config/constructors.generated";
export { MATRIX_SUGAR_PREFIXES };

const COMMAND_STICKY_RE = /\\(?:[A-Za-z]+|.)/y;

export function matchCommand(text: string, index: number): string | null {
  if (index >= text.length || text[index] !== "\\") return null;
  COMMAND_STICKY_RE.lastIndex = index;
  const match = COMMAND_STICKY_RE.exec(text);
  return match ? match[0] : null;
}

export function readCommentEnd(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length && text[index] !== "\r" && text[index] !== "\n") {
    index++;
  }
  if (text.startsWith("\r\n", index)) {
    return index + 2;
  }
  return Math.min(index + 1, text.length);
}

export function readVerbEnd(text: string, start: number): [number, boolean] | null {
  if (!text.startsWith("\\verb", start)) {
    return null;
  }
  let commandEnd = start + 5;
  if (commandEnd < text.length && /[A-Za-z]/.test(text[commandEnd])) {
    return null;
  }
  if (commandEnd < text.length && text[commandEnd] === "*") {
    commandEnd++;
  }
  if (commandEnd >= text.length || /\s/.test(text[commandEnd])) {
    return [text.length, false];
  }

  const delimiter = text[commandEnd];
  const closing = text.indexOf(delimiter, commandEnd + 1);
  return closing < 0 ? [text.length, false] : [closing + 1, true];
}

export function readBraced(text: string, start: number): [string, number] | null {
  if (start >= text.length || text[start] !== "{") {
    return null;
  }

  let depth = 0;
  let index = start;

  while (index < text.length) {
    const char = text[index];

    if (char === "%") {
      index = readCommentEnd(text, index);
      continue;
    }

    if (char === "\\") {
      const verb = readVerbEnd(text, index);
      if (verb !== null) {
        const [vEnd, closed] = verb;
        if (!closed) {
          return null;
        }
        index = vEnd;
        continue;
      }
      const command = matchCommand(text, index);
      index = command !== null ? index + command.length : index + 1;
      continue;
    }

    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        return [text.slice(start, index + 1), index + 1];
      }
    }

    index++;
  }

  return null;
}

export function readScriptArgument(text: string, start: number): [string, number] | null {
  if (start >= text.length) {
    return null;
  }

  if (text[start] === "{") {
    return readBraced(text, start);
  }

  if (text[start] === "$" || text[start] === "\r" || text[start] === "\n") {
    return null;
  }

  if (text[start] === "\\") {
    const command = matchCommand(text, start);
    if (command !== null) {
      return [command, start + command.length];
    }
  }

  return [text[start], start + 1];
}

export function readScript(text: string, start: number): [string, number, boolean] | null {
  const marker = text[start];
  const argumentStart = start + 1;

  if (argumentStart < text.length && text[argumentStart] === "{") {
    const argumentData = readBraced(text, argumentStart);
    if (argumentData === null) {
      return [text.slice(start), text.length, false];
    }
    const [argument, end] = argumentData;
    return [`${marker}${argument}`, end, true];
  }

  const argumentData = readScriptArgument(text, argumentStart);
  if (argumentData === null) {
    return null;
  }

  const [argument, end] = argumentData;
  return [`${marker}${argument}`, end, true];
}

export function readColorWrapper(text: string, start: number): [string, number] | null {
  let command: string | null = null;
  for (const candidate of ["\\textcolor", "\\colorbox", "\\color"]) {
    if (
      text.startsWith(candidate, start) &&
      (start + candidate.length === text.length ||
        !/[A-Za-z]/.test(text[start + candidate.length]))
    ) {
      command = candidate;
      break;
    }
  }

  if (command === null) {
    return null;
  }

  let index = start + command.length;
  while (index < text.length && /\s/.test(text[index])) {
    index++;
  }

  // Handle optional model in brackets, e.g. \textcolor[HTML]{...}{...} or \color[rgb]{...}
  if (index < text.length && text[index] === "[") {
    const closeBracket = text.indexOf("]", index);
    if (closeBracket !== -1) {
      index = closeBracket + 1;
      while (index < text.length && /\s/.test(text[index])) {
        index++;
      }
    }
  }

  const colorData = readBraced(text, index);
  if (colorData === null) {
    return null;
  }

  index = colorData[1];
  while (index < text.length && /\s/.test(text[index])) {
    index++;
  }

  // If command is \color, it may be a declaration (\color{red} x) or legacy scoped (\color{red}{x})
  if (command === "\\color") {
    if (index < text.length && text[index] === "{") {
      const valueData = readBraced(text, index);
      if (valueData !== null) {
        const [value, end] = valueData;
        return [value.slice(1, -1), end];
      }
    }
    // Standalone declaration: strip the command and color specifier
    return ["", index];
  }

  // \textcolor and \colorbox require the second argument {content}
  const valueData = readBraced(text, index);
  if (valueData === null) {
    return null;
  }

  const [value, end] = valueData;
  return [value.slice(1, -1), end];
}

export function readColorCommand(text: string, start: number): [string, number] | null {
  const wrapper = readColorWrapper(text, start);
  if (wrapper === null) {
    return null;
  }
  const [, end] = wrapper;
  return [text.slice(start, end), end];
}

export function containsColorWrapper(text: string): boolean {
  if (!text.includes("\\textcolor") && !text.includes("\\color") && !text.includes("\\colorbox")) {
    return false;
  }
  let index = 0;
  while (index < text.length) {
    if (text[index] === "%") {
      index = readCommentEnd(text, index);
      continue;
    }
    if (text[index] === "\\") {
      if (readColorWrapper(text, index) !== null) {
        return true;
      }
      const verb = readVerbEnd(text, index);
      if (verb !== null) {
        index = verb[0];
        continue;
      }
      const command = matchCommand(text, index);
      index = command !== null ? index + command.length : index + 1;
      continue;
    }
    index++;
  }
  return false;
}

interface ParsedMacroArg {
  raw: string;
  inner: string;
  end: number;
  braced: boolean;
}

function skipIgnorableWhitespace(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    if (/\s/.test(text[index])) {
      index++;
      continue;
    }
    if (text[index] === "%") {
      index = readCommentEnd(text, index);
      continue;
    }
    break;
  }
  return index;
}

const TWO_ARG_COMMANDS = new Set([
  "\\frac",
  "\\dfrac",
  "\\tfrac",
  "\\cfrac",
  "\\binom",
  "\\dbinom",
  "\\tbinom",
  "\\overset",
  "\\underset",
  "\\stackrel",
]);

const LEGACY_TEX_FONT_MACROS: Record<string, string> = {
  "\\Bbb": "\\mathbb",
  "\\frak": "\\mathfrak",
  "\\cal": "\\mathcal",
  "\\bold": "\\mathbf",
  "\\bm": "\\boldsymbol",
};

const BRACE_NORMALIZED_ONE_ARG_COMMANDS = new Set([
  "\\bar",
  "\\dot",
  "\\ddot",
  "\\dddot",
  "\\ddddot",
  "\\hat",
  "\\mathring",
  "\\vec",
  "\\overline",
  "\\underline",
  "\\pmod",
  "\\pod",
  "\\mod",
  "\\mathscr",
  "\\overrightarrow",
  "\\overleftarrow",
  "\\widehat",
  "\\widetilde",
  "\\tilde",
  "\\check",
  "\\acute",
  "\\grave",
  "\\breve",
  "\\mathbf",
  "\\mathcal",
  "\\mathbb",
  "\\mathfrak",
  "\\mathsf",
  "\\mathtt",
  "\\mathit",
  "\\boldsymbol",
  "\\pmb",
  "\\ket",
  "\\bra",
  "\\abs",
  "\\norm",
  "\\sqrt",
]);

const ONE_ARG_COMMANDS = new Set([
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
  "\\overline",
  "\\underline",
  "\\mathbf",
  "\\mathcal",
  "\\mathbb",
  "\\Bbb",
  "\\mathfrak",
  "\\mathsf",
  "\\mathtt",
  "\\mathit",
  "\\boldsymbol",
  "\\pmb",
  "\\boxed",
  "\\operatorname",
]);

const OPAQUE_TEXT_COMMANDS = new Set([
  "\\text",
  "\\mathrm",
  "\\textbf",
  "\\textit",
  "\\texttt",
  "\\textrm",
  "\\textnormal",
  "\\textsf",
  "\\textsl",
  "\\textsc",
  "\\mbox",
  "\\tag",
  "\\intertext",
  "\\shortintertext",
  "\\operatorname",
  "\\hspace",
  "\\vspace",
  "\\phantom",
  "\\hphantom",
  "\\vphantom",
  "\\kern",
  "\\mkern",
  "\\mskip",
  "\\hskip",
  "\\label",
  "\\ref",
  "\\eqref",
  "\\cite",
  "\\class",
  "\\cssId",
  "\\style",
  "\\data",
  "\\href",
  "\\htmlClass",
  "\\htmlId",
  "\\htmlStyle",
  "\\htmlData",
]);

export function readOpaqueCommand(text: string, start: number): [string, number] | null {
  const cmd = matchCommand(text, start);
  if (!cmd || !OPAQUE_TEXT_COMMANDS.has(cmd)) return null;
  let cur = start + cmd.length;
  if (cur < text.length && text[cur] === "*") {
    cur++;
  }
  while (cur < text.length && /\s/.test(text[cur])) {
    cur++;
  }
  if (cur < text.length && text[cur] === "{") {
    const braced = readBraced(text, cur);
    if (braced) {
      return [text.slice(start, braced[1]), braced[1]];
    }
    // Mid-typing unclosed opaque text command (e.g. \text{ratio): protect inner prose
    return [text.slice(start), text.length];
  }
  return null;
}

const KNOWN_FUNCTIONS = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc",
  "arcsin", "arccos", "arctan", "arccot", "arcsec", "arccsc",
  "sinh", "cosh", "tanh", "coth", "sech", "csch",
  "arsinh", "arcosh", "artanh", "arcoth", "arsech", "arcsch",
  "ln", "log", "exp", "lg", "lb",
  "det", "dim", "ker", "deg", "gcd", "hom", "inf", "sup",
  "lim", "liminf", "limsup", "max", "min", "arg", "argmax", "argmin",
  "Pr", "Tr", "rank", "diag", "trace", "relu", "sigmoid", "softmax"
]);

function readSingleMacroArg(
  text: string,
  start: number,
  allowPostfix: boolean = false
): ParsedMacroArg | null {
  const index = skipIgnorableWhitespace(text, start);
  if (index >= text.length) return null;

  // Cell boundary and delimiter hard-stops: bare '&', '\\' (newline), '$', '\right', or '\end' cannot be arguments
  if (
    text[index] === "&" ||
    text[index] === "$" ||
    text.startsWith("\\\\", index) ||
    text.startsWith("\\right", index) ||
    text.startsWith("\\end", index)
  ) {
    return null;
  }

  let base: ParsedMacroArg | null = null;

  if (text[index] === "{") {
    const braced = readBraced(text, index);
    if (braced) {
      base = {
        raw: braced[0],
        inner: braced[0].slice(1, -1),
        end: braced[1],
        braced: true,
      };
    } else {
      return null;
    }
  } else if (text[index] === "(") {
    let depth = 1;
    let j = index + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === "%") {
        j = readCommentEnd(text, j);
        continue;
      }
      if (text[j] === "\\") {
        const cmd = matchCommand(text, j);
        j += cmd ? cmd.length : 1;
        continue;
      }
      if (text[j] === "(") depth++;
      else if (text[j] === ")") depth--;
      j++;
    }
    if (depth === 0) {
      base = {
        raw: text.slice(index, j),
        inner: text.slice(index + 1, j - 1),
        end: j,
        braced: false,
      };
    }
  } else if (text[index] === "\\") {
    const cmd = matchCommand(text, index);
    if (cmd) {
      let afterCmd = index + cmd.length;

      if (cmd === "\\sqrt") {
        let cur = skipIgnorableWhitespace(text, afterCmd);
        if (cur < text.length && text[cur] === "[") {
          let depth = 1;
          let j = cur + 1;
          while (j < text.length && depth > 0) {
            if (text[j] === "[") depth++;
            else if (text[j] === "]") depth--;
            j++;
          }
          if (depth === 0) {
            cur = j;
          }
        }
        const subArg = readSingleMacroArg(text, cur, true);
        if (subArg) {
          base = {
            raw: text.slice(index, subArg.end),
            inner: text.slice(index, subArg.end),
            end: subArg.end,
            braced: false,
          };
        }
      } else if (TWO_ARG_COMMANDS.has(cmd)) {
        const arg1 = readSingleMacroArg(text, afterCmd, true);
        if (arg1) {
          const arg2 = readSingleMacroArg(text, arg1.end, true);
          if (arg2) {
            base = {
              raw: text.slice(index, arg2.end),
              inner: text.slice(index, arg2.end),
              end: arg2.end,
              braced: false,
            };
          }
        }
      } else if (ONE_ARG_COMMANDS.has(cmd)) {
        if (cmd === "\\operatorname" && text[afterCmd] === "*") {
          afterCmd++;
        }
        const subArg = readSingleMacroArg(text, afterCmd, false);
        if (subArg) {
          base = {
            raw: text.slice(index, subArg.end),
            inner: text.slice(index, subArg.end),
            end: subArg.end,
            braced: false,
          };
        }
      } else if (OPAQUE_TEXT_COMMANDS.has(cmd)) {
        let afterOpaque = afterCmd;
        while (afterOpaque < text.length && /\s/.test(text[afterOpaque])) {
          afterOpaque++;
        }
        if (afterOpaque < text.length && text[afterOpaque] === "{") {
          const braced = readBraced(text, afterOpaque);
          if (braced) {
            base = {
              raw: text.slice(index, braced[1]),
              inner: text.slice(index, braced[1]),
              end: braced[1],
              braced: false,
            };
          }
        } else {
          const unbracedArg = readSingleMacroArg(text, afterOpaque, false);
          if (unbracedArg) {
            base = {
              raw: `${cmd}{${unbracedArg.raw}}`,
              inner: `${cmd}{${unbracedArg.raw}}`,
              end: unbracedArg.end,
              braced: false,
            };
          }
        }
      }

      if (!base) {
        // Check if command is followed by parenthesized argument ONLY for known math functions: e.g. \sin(x) or \sin^2(x)
        const cmdName = cmd.startsWith("\\") ? cmd.slice(1) : cmd;
        if (
          KNOWN_FUNCTIONS.has(cmdName) ||
          lookupCatalog(cmd)?.roleId === ROLE_FUNCTION ||
          lookupCatalog(cmdName)?.roleId === ROLE_FUNCTION ||
          cmd === "\\operatorname"
        ) {
          let lookahead = afterCmd;
          if (lookahead < text.length && text[lookahead] === "^") {
            lookahead++;
            if (lookahead < text.length && text[lookahead] === "{") {
              while (lookahead < text.length && text[lookahead] !== "}") lookahead++;
              if (lookahead < text.length) lookahead++;
            } else if (lookahead < text.length && /[0-9A-Za-z]/.test(text[lookahead])) {
              lookahead++;
            }
          }
          let ws = lookahead;
          while (ws < text.length && /\s/.test(text[ws])) ws++;
          if (ws < text.length && text[ws] === "(") {
            let depth = 1;
            let p = ws + 1;
            while (p < text.length && depth > 0) {
              if (text[p] === "\\") {
                const subCmd = matchCommand(text, p);
                p += subCmd ? subCmd.length : 1;
                continue;
              }
              if (text[p] === "(") depth++;
              else if (text[p] === ")") depth--;
              p++;
            }
            if (depth === 0) {
              base = {
                raw: text.slice(index, p),
                inner: text.slice(index, p),
                end: p,
                braced: false,
              };
            }
          }
        }

        if (!base) {
          base = {
            raw: cmd,
            inner: cmd,
            end: index + cmd.length,
            braced: false,
          };
        }
      }
    }
  }

  // Digits / numbers and monomial chunking: e.g. 12 or 2x
  if (!base && index < text.length && /[0-9]/.test(text[index])) {
    let j = index + 1;
    // Only multi-digit chunking (e.g. 12 in \frac 12 3) if preceded by whitespace; if touching command (\frac12), keep single digit
    if (start < index) {
      while (j < text.length && /[0-9]/.test(text[j])) {
        j++;
      }
      // Only allow monomial chunking (e.g. 2x) if preceded by whitespace and followed by a single lowercase variable
      if (j < text.length && /^[a-z](?![A-Za-z0-9])/.test(text.slice(j))) {
        j++;
      }
    }
    base = {
      raw: text.slice(index, j),
      inner: text.slice(index, j),
      end: j,
      braced: false,
    };
  }

  // Identifiers, bare functions (sin(x)), and bare symbols (alpha)
  if (!base && index < text.length && /[A-Za-z]/.test(text[index])) {
    let j = index + 1;
    while (j < text.length && /[A-Za-z]/.test(text[j])) {
      j++;
    }
    const word = text.slice(index, j);
    if (
      KNOWN_FUNCTIONS.has(word.toLowerCase()) ||
      lookupCatalog(word)?.roleId === ROLE_FUNCTION ||
      lookupCatalog(word.toLowerCase())?.roleId === ROLE_FUNCTION ||
      lookupCatalog("\\" + word)?.roleId === ROLE_FUNCTION ||
      lookupCatalog("\\" + word.toLowerCase())?.roleId === ROLE_FUNCTION
    ) {
      // Check for power: e.g. sin^2(x)
      let lookahead = j;
      if (lookahead < text.length && text[lookahead] === "^") {
        lookahead++;
        if (lookahead < text.length && text[lookahead] === "{") {
          while (lookahead < text.length && text[lookahead] !== "}") lookahead++;
          if (lookahead < text.length) lookahead++;
        } else if (lookahead < text.length && /[0-9A-Za-z]/.test(text[lookahead])) {
          lookahead++;
        }
      }
      let ws = lookahead;
      while (ws < text.length && /\s/.test(text[ws])) ws++;
      if (ws < text.length && text[ws] === "(") {
        let depth = 1;
        let p = ws + 1;
        while (p < text.length && depth > 0) {
          if (text[p] === "\\") {
            const subCmd = matchCommand(text, p);
            p += subCmd ? subCmd.length : 1;
            continue;
          }
          if (text[p] === "(") depth++;
          else if (text[p] === ")") depth--;
          p++;
        }
        if (depth === 0) {
          base = {
            raw: text.slice(index, p),
            inner: text.slice(index, p),
            end: p,
            braced: false,
          };
        }
      }
    }
    if (!base) {
      const bareSym = matchBareSymbol(text, index);
      if (bareSym) {
        base = {
          raw: text.slice(index, index + bareSym.length),
          inner: text.slice(index, index + bareSym.length),
          end: index + bareSym.length,
          braced: false,
        };
      } else {
        // Single character for arbitrary variables (e.g. 'a' in \frac ab, 'V' in \frac VI)
        base = {
          raw: text[index],
          inner: text[index],
          end: index + 1,
          braced: false,
        };
      }
    }
  }

  if (!base && index < text.length) {
    base = {
      raw: text[index],
      inner: text[index],
      end: index + 1,
      braced: false,
    };
  }

  if (!base) return null;

  if (allowPostfix) {
    let current = base.end;
    while (current < text.length) {
      let checkPos = current;
      while (checkPos < text.length && /\s/.test(text[checkPos])) {
        checkPos++;
      }
      if (checkPos >= text.length) break;

      const ch = text[checkPos];
      if (ch === "_" || ch === "^") {
        const scriptArg = readSingleMacroArg(text, checkPos + 1, false);
        if (scriptArg) {
          current = scriptArg.end;
          continue;
        }
      } else if (ch === "'" || ch === "’") {
        current = checkPos + 1;
        while (current < text.length && (text[current] === "'" || text[current] === "’")) {
          current++;
        }
        continue;
      }
      break;
    }

    if (current > base.end) {
      return {
        raw: text.slice(index, current),
        inner: text.slice(index, current),
        end: current,
        braced: false,
      };
    }
  }

  return base;
}

/**
 * Normalizes unbraced arguments in LaTeX expressions (e.g. \frac2L -> \frac{2}{L}, \sqrt V -> \sqrt{V},
 * \frac VI -> \frac{V}{I}, \frac hp -> \frac{h}{p}, E_n -> E_{n}, x^2 -> x^{2}).
 * This guarantees that when color wrappers like \textcolor are subsequently applied,
 * LaTeX macro parsing never fails due to unbraced single-token arguments.
 */
export function normalizeLatexBraces(source: string): string {
  let result = "";
  let index = 0;
  const dynamicMacros = new Map<string, number>();

  while (index < source.length) {
    if (source[index] === "%") {
      const end = readCommentEnd(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }

    if (source[index] === "^" || source[index] === "_") {
      const marker = source[index];
      const nextIdx = index + 1;
      if (nextIdx < source.length && source[nextIdx] === "{") {
        const braced = readBraced(source, nextIdx);
        if (braced) {
          const normInner = normalizeLatexBraces(braced[0].slice(1, -1));
          result += `${marker}{${normInner}}`;
          index = braced[1];
          continue;
        }
      }
      const arg = readSingleMacroArg(source, nextIdx);
      if (arg) {
        const isCmd = arg.raw.startsWith("\\");
        const scriptContent =
          !arg.braced && !isCmd && arg.raw.length > 1
            ? arg.raw[0]
            : arg.braced
            ? normalizeLatexBraces(arg.inner)
            : normalizeLatexBraces(arg.raw);
        const scriptEnd =
          !arg.braced && !isCmd && arg.raw.length > 1
            ? nextIdx + 1
            : arg.end;
        result += `${marker}{${scriptContent}}`;
        index = scriptEnd;
        continue;
      } else {
        result += marker;
        index++;
        continue;
      }
    }

    if (source[index] === "\\") {
      const verb = readVerbEnd(source, index);
      if (verb !== null) {
        const [vEnd] = verb;
        result += source.slice(index, vEnd);
        index = vEnd;
        continue;
      }

      const cmd = matchCommand(source, index);
      if (cmd) {
        if (
          cmd === "\\def" ||
          cmd === "\\newcommand" ||
          cmd === "\\renewcommand" ||
          cmd === "\\providecommand" ||
          cmd === "\\DeclareMathOperator"
        ) {
          const macroEnd = skipMacroDefinition(source, index);
          if (macroEnd !== null) {
            if (cmd === "\\def") {
              let p = index + cmd.length;
              while (p < macroEnd && /\s/.test(source[p])) p++;
              const macroName = matchCommand(source, p);
              if (macroName) {
                const bodyIdx = source.indexOf("{", p + macroName.length);
                if (bodyIdx !== -1 && bodyIdx < macroEnd) {
                  const paramStr = source.slice(p + macroName.length, bodyIdx);
                  const matches = paramStr.match(/#\d+/g);
                  dynamicMacros.set(macroName, matches ? matches.length : 0);
                }
              }
            } else {
              let p = index + cmd.length;
              if (p < macroEnd && source[p] === "*") p++;
              while (p < macroEnd && /\s/.test(source[p])) p++;
              let macroName: string | null = null;
              if (p < macroEnd && source[p] === "{") {
                const b = readBraced(source, p);
                if (b) {
                  macroName = b[0].slice(1, -1).trim();
                  p = b[1];
                }
              } else if (p < macroEnd && source[p] === "\\") {
                macroName = matchCommand(source, p);
                if (macroName) p += macroName.length;
              }
              if (macroName) {
                if (!macroName.startsWith("\\")) macroName = "\\" + macroName;
                while (p < macroEnd && /\s/.test(source[p])) p++;
                let numArgs = 0;
                if (p < macroEnd && source[p] === "[") {
                  const close = source.indexOf("]", p);
                  if (close !== -1 && close < macroEnd) {
                    const argStr = source.slice(p + 1, close).trim();
                    const n = parseInt(argStr, 10);
                    if (!isNaN(n)) numArgs = n;
                  }
                }
                dynamicMacros.set(macroName, numArgs);
              }
            }
            result += source.slice(index, macroEnd);
            index = macroEnd;
            continue;
          }
        }

        if (OPAQUE_TEXT_COMMANDS.has(cmd)) {
          const braced = readBraced(source, index + cmd.length);
          if (braced) {
            result += `${cmd}${braced[0]}`;
            index = braced[1];
            continue;
          }
        }

        if (TWO_ARG_COMMANDS.has(cmd)) {
          const arg1 = readSingleMacroArg(source, index + cmd.length, true);
          if (arg1) {
            const arg2 = readSingleMacroArg(source, arg1.end, true);
            if (arg2) {
              const norm1 = arg1.braced || (arg1.raw.startsWith("(") && arg1.raw.endsWith(")"))
                ? normalizeLatexBraces(arg1.inner)
                : normalizeLatexBraces(arg1.raw);
              const norm2 = arg2.braced || (arg2.raw.startsWith("(") && arg2.raw.endsWith(")"))
                ? normalizeLatexBraces(arg2.inner)
                : normalizeLatexBraces(arg2.raw);
              result += `${cmd}{${norm1}}{${norm2}}`;
              index = arg2.end;
              continue;
            }
          }
        } else if (cmd === "\\sqrt") {
          let cur = skipIgnorableWhitespace(source, index + cmd.length);
          let optional = "";
          if (cur < source.length && source[cur] === "[") {
            let depth = 1;
            let j = cur + 1;
            while (j < source.length && depth > 0) {
              if (source[j] === "[") depth++;
              else if (source[j] === "]") depth--;
              j++;
            }
            if (depth === 0) {
              optional = source.slice(cur, j);
              cur = j;
            } else {
              // Unclosed optional bracket (e.g. \sqrt[ or \sqrt[n):
              // Do not treat '[' as a macro argument; preserve macro for autoSealUnclosedDelimiters
              result += source.slice(index, cur);
              index = cur;
              continue;
            }
          }
          const arg = readSingleMacroArg(source, cur, true);
          if (arg) {
            const norm = arg.braced
              ? normalizeLatexBraces(arg.inner)
              : normalizeLatexBraces(arg.raw);
            result += `${cmd}${optional}{${norm}}`;
            index = arg.end;
            continue;
          }
        } else if (LEGACY_TEX_FONT_MACROS[cmd]) {
          let afterCmd = index + cmd.length;
          const arg = readSingleMacroArg(source, afterCmd, false);
          if (arg) {
            const norm = arg.braced
              ? normalizeLatexBraces(arg.inner)
              : normalizeLatexBraces(arg.raw);
            result += `${LEGACY_TEX_FONT_MACROS[cmd]}{${norm}}`;
            index = arg.end;
            continue;
          }
        } else if (BRACE_NORMALIZED_ONE_ARG_COMMANDS.has(cmd) || dynamicMacros.get(cmd) === 1) {
          let afterCmd = index + cmd.length;
          const arg = readSingleMacroArg(source, afterCmd, false);
          if (arg) {
            if (
              cmd === "\\dot" &&
              !arg.braced &&
              arg.raw === "N" &&
              source[afterCmd] === " "
            ) {
              result += `${cmd} ${arg.raw}`;
              index = arg.end;
              continue;
            }
            const norm = arg.braced
              ? normalizeLatexBraces(arg.inner)
              : normalizeLatexBraces(arg.raw);
            result += `${cmd}{${norm}}`;
            index = arg.end;
            continue;
          }
        }
      }
    }

    result += source[index];
    index++;
  }

  return result;
}

/**
 * Reads and skips environment declaration headers including arguments:
 * e.g., \begin{matrix}, \begin{array}{cc|c}, \begin{alignedat}{2}, \end{array}
 */
export function skipEnvironmentHead(
  text: string,
  cmdName: string,
  cmdEnd: number,
  limit: number = text.length
): number | null {
  if (cmdName !== "\\begin" && cmdName !== "\\end") {
    return null;
  }
  let afterCmd = cmdEnd;
  while (afterCmd < limit && /\s/.test(text[afterCmd])) {
    afterCmd++;
  }
  if (afterCmd < limit && text[afterCmd] === "{") {
    const group = readBraced(text, afterCmd);
    if (group !== null && group[1] <= limit) {
      const rawName = group[0].trim();
      const envName = rawName.startsWith("{") && rawName.endsWith("}")
        ? rawName.slice(1, -1).trim()
        : rawName;
      let nextIdx = group[1];
      if (
        cmdName === "\\begin" &&
        (envName === "array" ||
          envName === "tabular" ||
          envName.startsWith("alignat") ||
          envName.startsWith("alignedat"))
      ) {
        // Skip optional position argument [t], [b], [c]
        let scanOpt = nextIdx;
        while (scanOpt < limit && /\s/.test(text[scanOpt])) scanOpt++;
        if (scanOpt < limit && text[scanOpt] === "[") {
          const bracketEnd = text.indexOf("]", scanOpt);
          if (bracketEnd !== -1 && bracketEnd < limit) {
            nextIdx = bracketEnd + 1;
          }
        }
        // Skip column specification argument {cc|c} or {num}
        let scanCols = nextIdx;
        while (scanCols < limit && /\s/.test(text[scanCols])) scanCols++;
        if (scanCols < limit && text[scanCols] === "{") {
          const colBraced = readBraced(text, scanCols);
          if (colBraced !== null && colBraced[1] <= limit) {
            nextIdx = colBraced[1];
          }
        }
      }
      return nextIdx;
    }
  }
  return null;
}

/**
 * Reads and skips macro definition declarations including signature, parameters, and body:
 * e.g., \newcommand{\foo}[1]{body}, \renewcommand{\bar}{body}, \def\by#1{#1 \times #1}, \def \dom{\text{dom}\,}, \let\a=\b
 */
export function skipMacroDefinition(
  text: string,
  start: number,
  limit: number = text.length
): number | null {
  if (start >= limit || text[start] !== "\\") return null;
  const cmd = matchCommand(text, start);
  if (!cmd) return null;

  if (
    cmd === "\\newcommand" ||
    cmd === "\\renewcommand" ||
    cmd === "\\providecommand" ||
    cmd === "\\DeclareMathOperator"
  ) {
    let cur = start + cmd.length;
    if (cur < limit && text[cur] === "*") cur++;
    cur = skipIgnorableWhitespace(text, cur);
    // Macro name: {\foo} or \foo
    if (cur < limit && text[cur] === "{") {
      const b = readBraced(text, cur);
      if (b && b[1] <= limit) cur = b[1];
      else return null;
    } else if (cur < limit && text[cur] === "\\") {
      const m = matchCommand(text, cur);
      if (m) cur += m.length;
      else return null;
    } else {
      return null;
    }
    cur = skipIgnorableWhitespace(text, cur);
    // Optional parameter brackets: [1], [default]
    while (cur < limit && text[cur] === "[") {
      const close = text.indexOf("]", cur);
      if (close !== -1 && close < limit) cur = close + 1;
      else break;
      cur = skipIgnorableWhitespace(text, cur);
    }
    // Definition body: {body}
    if (cur < limit && text[cur] === "{") {
      const b = readBraced(text, cur);
      if (b && b[1] <= limit) return b[1];
    }
    return null;
  }

  if (cmd === "\\def") {
    let cur = start + cmd.length;
    cur = skipIgnorableWhitespace(text, cur);
    // Target command: \foo
    if (cur < limit && text[cur] === "\\") {
      const m = matchCommand(text, cur);
      if (m) cur += m.length;
      else return null;
    } else {
      return null;
    }
    // Consume parameter pattern until {
    while (cur < limit && text[cur] !== "{") {
      cur++;
    }
    // Body: {body}
    if (cur < limit && text[cur] === "{") {
      const b = readBraced(text, cur);
      if (b && b[1] <= limit) return b[1];
    }
    return null;
  }

  if (cmd === "\\let") {
    let cur = start + cmd.length;
    cur = skipIgnorableWhitespace(text, cur);
    if (cur < limit && text[cur] === "\\") {
      const m = matchCommand(text, cur);
      if (m) cur += m.length;
      else return null;
    } else if (cur < limit) {
      cur++;
    } else {
      return null;
    }
    cur = skipIgnorableWhitespace(text, cur);
    if (cur < limit && text[cur] === "=") {
      cur++;
      cur = skipIgnorableWhitespace(text, cur);
    }
    if (cur < limit && text[cur] === "\\") {
      const m = matchCommand(text, cur);
      if (m) cur += m.length;
      else return null;
    } else if (cur < limit) {
      cur++;
    } else {
      return null;
    }
    return cur;
  }

  return null;
}

function readDelimitedPair(
  source: string,
  start: number,
  openChar: string = "[",
  closeChar: string = "]"
): { inner: string; end: number } | null {
  if (start >= source.length || source[start] !== openChar) return null;
  let depth = 1;
  let i = start + 1;
  while (i < source.length && depth > 0) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === openChar) depth++;
    else if (source[i] === closeChar) depth--;
    i++;
  }
  if (depth === 0) {
    return { inner: source.slice(start + 1, i - 1), end: i };
  }
  return null;
}

export const UNIVERSAL_FONT_MODIFIER_MAP: Record<string, string> = {
  bb: "\\mathbb",
  cal: "\\mathcal",
  bold: "\\mathbf",
  frak: "\\mathfrak",
  scr: "\\mathscr",
  rm: "\\mathrm",
  sf: "\\mathsf",
  tt: "\\mathtt",
  text: "\\text",
  mathbb: "\\mathbb",
  mathcal: "\\mathcal",
  mathbf: "\\mathbf",
  mathfrak: "\\mathfrak",
  mathscr: "\\mathscr",
  mathrm: "\\mathrm",
  mathsf: "\\mathsf",
  mathtt: "\\mathtt",
};


/**
 * Normalizes Typst-style quoted strings: "where " x > 0 -> \text{where } x > 0.
 * Distinguishes ASCII double quotes (34) from consecutive primes '' (39, 39).
 */
export function normalizeQuotedStrings(source: string): string {
  let result = "";
  let index = 0;

  while (index < source.length) {
    if (source[index] === "%") {
      const end = readCommentEnd(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }

    if (source[index] === "\\") {
      const verb = readVerbEnd(source, index);
      if (verb !== null) {
        result += source.slice(index, verb[0]);
        index = verb[0];
        continue;
      }
      const cmd = matchCommand(source, index);
      if (cmd && OPAQUE_TEXT_COMMANDS.has(cmd)) {
        const braced = readBraced(source, index + cmd.length);
        if (braced) {
          result += `${cmd}${braced[0]}`;
          index = braced[1];
          continue;
        }
        let nextPos = index + cmd.length;
        while (nextPos < source.length && /\s/.test(source[nextPos])) nextPos++;
        if (nextPos < source.length && (source.charCodeAt(nextPos) === 34 || source[nextPos] === "'" || source[nextPos] === "`" || source[nextPos] === "“" || source[nextPos] === "”")) {
          // TeX single-token unbraced argument for text commands: \text" or \text' or \text“
          result += `${cmd}{${source[nextPos]}}`;
          index = nextPos + 1;
          continue;
        }
      }
      if (cmd) {
        result += cmd;
        index += cmd.length;
        continue;
      }
    }

    if (source.charCodeAt(index) === 34) {
      let j = index + 1;
      let closed = false;
      while (j < source.length) {
        if (source.startsWith("$$", j)) {
          break; // cannot cross display math boundary
        }
        if (source[j] === "\r" || source[j] === "\n") {
          break; // cannot cross newlines in single-line math
        }
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source.charCodeAt(j) === 34) {
          closed = true;
          break;
        }
        j++;
      }

      if (closed) {
        const textContent = source.slice(index + 1, j);
        const escaped = textContent.replace(/\$/g, "\\$");
        const withSpaces = escaped.replace(/ {2,}/g, (m) => "\\ ".repeat(m.length));
        result += `\\text{${withSpaces}}`;
        index = j + 1;
        continue;
      } else {
        // Auto-convert unclosed quote to \text{...} up to line/math boundary
        const textContent = source.slice(index + 1, j);
        let braceCount = 0;
        let balanced = "";
        for (let k = 0; k < textContent.length; k++) {
          if (textContent[k] === "\\") {
            balanced += textContent.slice(k, k + 2);
            k++;
            continue;
          }
          if (textContent[k] === "{") {
            braceCount++;
            balanced += "{";
          } else if (textContent[k] === "}") {
            if (braceCount > 0) {
              braceCount--;
              balanced += "}";
            } else {
              // Stray closing brace: balance as {}
              balanced += "{}";
            }
          } else {
            balanced += textContent[k];
          }
        }
        if (braceCount > 0) {
          balanced += "}".repeat(braceCount);
        }
        const escaped = balanced.replace(/\$/g, "\\$");
        const withSpaces = escaped.replace(/ {2,}/g, (m) => "\\ ".repeat(m.length));
        result += `\\text{${withSpaces}}`;
        index = j;
        continue;
      }
    }

    result += source[index];
    index++;
  }

  return result;
}

/**
 * Normalizes universal font modifiers across all three delimiter styles ({}, [], ()):
 * - bb(R) / bb[R] / bb{R} -> \mathbb{R}
 * - cal(L) / cal[L] / cal{L} -> \mathcal{L}
 * - bold(v) / bold[v] / bold{v} -> \mathbf{v}
 * - frak(g) / frak[g] / frak{g} -> \mathfrak{g}
 * - scr(F) / scr[F] / scr{F} -> \mathscr{F}
 * - Also supports native commands with brackets/braces/parens:
 *   \bold[v], \cal[L], \frak[g], \scr[F], \bb[R], \rm[v], \sf[v], \tt[v], \text[v]
 */
export function normalizeTypstFontShortcuts(source: string): string {
  let result = "";
  let index = 0;

  while (index < source.length) {
    if (source[index] === "%") {
      const end = readCommentEnd(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }

    if (source[index] === "\\") {
      const verb = readVerbEnd(source, index);
      if (verb !== null) {
        result += source.slice(index, verb[0]);
        index = verb[0];
        continue;
      }

      // Check if this backslash command is a font modifier followed by [, {, or (
      const fontMatch = source.slice(index + 1).match(/^(bb|cal|bold|frak|scr|rm|sf|tt|text|mathbb|mathcal|mathbf|mathfrak|mathscr|mathrm|mathsf|mathtt)\s*([{[(])/);
      if (fontMatch) {
        const prefix = fontMatch[1];
        const openChar = fontMatch[2];
        const closeChar = openChar === "(" ? ")" : openChar === "[" ? "]" : "}";
        const argStart = index + 1 + fontMatch[0].length - 1;
        const delimited = readDelimitedPair(source, argStart, openChar, closeChar);
        if (delimited) {
          const macro = UNIVERSAL_FONT_MODIFIER_MAP[prefix] || `\\${prefix}`;
          const normInner = normalizeTypstFontShortcuts(delimited.inner);
          result += `${macro}{${normInner}}`;
          index = delimited.end;
          continue;
        }
      }

      const cmd = matchCommand(source, index);
      if (cmd) {
        if (OPAQUE_TEXT_COMMANDS.has(cmd)) {
          const braced = readBraced(source, index + cmd.length);
          if (braced) {
            result += `${cmd}${braced[0]}`;
            index = braced[1];
            continue;
          }
        }
        result += cmd;
        index += cmd.length;
        continue;
      }
    }

    // Bare font modifier keywords (bold[v], scr{F}, cal(L), etc.)
    const prevChar = index > 0 ? source[index - 1] : "";
    if (index === 0 || !/[A-Za-z0-9_\\]/.test(prevChar)) {
      const match = source.slice(index).match(/^(bb|cal|bold|frak|scr|rm|sf|tt|text)\s*([{[(])/);
      if (match) {
        const prefix = match[1];
        const openChar = match[2];
        const closeChar = openChar === "(" ? ")" : openChar === "[" ? "]" : "}";
        const argStart = index + match[0].length - 1;
        const delimited = readDelimitedPair(source, argStart, openChar, closeChar);
        if (delimited) {
          const macro = UNIVERSAL_FONT_MODIFIER_MAP[prefix];
          const normInner = normalizeTypstFontShortcuts(delimited.inner);
          result += `${macro}{${normInner}}`;
          index = delimited.end;
          continue;
        }
      }
    }

    result += source[index];
    index++;
  }

  return result;
}

/**
 * Normalizes Infix Inverted Division:
 * - Grouped braces: {a + b} / {c + d} -> \frac{a + b}{c + d}
 * - Grouped parens in braces: {(a + b)} / {(c + d)} -> \frac{(a + b)}{(c + d)}
 * - Bounded numbers: 12 / 3 -> \frac{12}{3}
 * - Preserves literal unit slashes like m/s, km/h and exponent slashes.
 */
export function normalizeInfixDivision(source: string, requireBraces: boolean = false): string {
  let result = source;

  // 1. Grouped braces: {numerator} / {denominator}
  let changed = true;
  while (changed) {
    changed = false;
    let index = 0;
    while (index < result.length) {
      if (result[index] === "%") {
        index = readCommentEnd(result, index);
        continue;
      }
      if (result[index] === "\\") {
        const cmd = matchCommand(result, index);
        index += cmd ? cmd.length : 1;
        continue;
      }

      if (result[index] === "{" || result[index] === "[") {
        const isBracket = result[index] === "[";
        // Must NOT be a macro argument like \text{W} or \mathrm{X} or \sqrt[n]
        const isMacroArg = /\\[A-Za-z]+$/.test(result.slice(0, index));
        if (isMacroArg) {
          if (isBracket) {
            const bracketPair = readDelimitedPair(result, index, "[", "]");
            index = bracketPair ? bracketPair.end : index + 1;
          } else {
            const braced = readBraced(result, index);
            index = braced ? braced[1] : index + 1;
          }
          continue;
        }

        const numDelim = isBracket
          ? readDelimitedPair(result, index, "[", "]")
          : (() => {
              const b = readBraced(result, index);
              return b ? { inner: b[0].slice(1, -1), end: b[1] } : null;
            })();

        if (numDelim) {
          let afterNum = skipIgnorableWhitespace(result, numDelim.end);
          if (afterNum < result.length && result[afterNum] === "/") {
            let afterSlash = skipIgnorableWhitespace(result, afterNum + 1);
            if (afterSlash < result.length) {
              if (result[afterSlash] === "[") {
                const denBracket = readDelimitedPair(result, afterSlash, "[", "]");
                if (denBracket) {
                  const replacement = `\\frac{${numDelim.inner}}{${denBracket.inner}}`;
                  result =
                    result.slice(0, index) +
                    replacement +
                    result.slice(denBracket.end);
                  changed = true;
                  break;
                }
              }
              const denArg = readSingleMacroArg(result, afterSlash, false);
              if (denArg) {
                const denInner = denArg.braced ? denArg.inner : denArg.raw;
                const replacement = `\\frac{${numDelim.inner}}{${denInner}}`;
                result =
                  result.slice(0, index) +
                  replacement +
                  result.slice(denArg.end);
                changed = true;
                break;
              }
            }
          }
        }
      }
      index++;
    }
  }

  // 2. Whitespace-bounded numeric division: e.g. 12 / 3 -> \frac{12}{3}, 1 / 2 -> \frac{1}{2}
  if (!requireBraces) {
    result = result.replace(
      /(^|[^A-Za-z0-9_\\])\b([0-9]+)\s*\/\s*([0-9]+)\b/g,
      "$1\\frac{$2}{$3}"
    );
  }

  return result;
}

/**
 * Normalizes bare Greek letters and constants in math mode:
 * alpha -> \alpha, beta -> \beta, pi -> \pi, Gamma -> \Gamma, oo -> \infty, hbar -> \hbar.
 * Excludes matches inside \text{...} or \mathrm{...} and matches already prefixed by \.
 */
export function normalizeBareGreekInMath(source: string): string {
  let result = "";
  let index = 0;

  while (index < source.length) {
    if (source[index] === "%") {
      const end = readCommentEnd(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }

    if (source[index] === "\\") {
      const verb = readVerbEnd(source, index);
      if (verb !== null) {
        result += source.slice(index, verb[0]);
        index = verb[0];
        continue;
      }
      const opaque = readOpaqueCommand(source, index);
      if (opaque) {
        result += opaque[0];
        index = opaque[1];
        continue;
      }
      const cmd = matchCommand(source, index);
      if (cmd) {
        if (cmd === "\\begin" || cmd === "\\end") {
          const envHeadEnd = skipEnvironmentHead(source, cmd, index + cmd.length);
          if (envHeadEnd !== null) {
            result += source.slice(index, envHeadEnd);
            index = envHeadEnd;
            continue;
          }
        }
        result += cmd;
        index += cmd.length;
        continue;
      }
    }

    // Check for bare word boundary (exclude ^ so expressions like ^nu_k don't corrupt touching variables)
    const prevChar = index > 0 ? source[index - 1] : "";
    if (index === 0 || !/[A-Za-z0-9_\\^]/.test(prevChar)) {
      // 1. Lemire MPHF catalog match
      const bare = matchBareSymbol(source, index);
      if (bare) {
        let canonical = bare.entry.canonical;
        if (!canonical && bare.entry.unicode && (bare.entry.domains & 1 /* Greek */ || bare.length <= 2)) {
          canonical = lookupCatalog(bare.entry.unicode)?.canonical;
        }
        // Exclude non-LaTeX / invalid MathJax macros
        const isInvalidMacro =
          !canonical ||
          !canonical.startsWith("\\") ||
          /^\\Bbb[A-Za-z]/.test(canonical) ||
          canonical === "\\greater" ||
          canonical === "\\equal" ||
          canonical === "\\mupNu" ||
          canonical === "\\bigtimes" ||
          canonical === "\\lat" ||
          canonical === "\\diameter" ||
          canonical === "\\limit" ||
          canonical === "\\smwhtdiamond" ||
          canonical === "\\mathdollar";

        if (!isInvalidMacro) {
          result += canonical;
          index += bare.length;
          continue;
        }
      }
    }

    result += source[index];
    index++;
  }

  return result;
}

export const STANDARD_LATEX_OPERATORS = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc",
  "sinh", "cosh", "tanh", "coth",
  "arcsin", "arccos", "arctan",
  "log", "ln", "lg", "exp",
  "lim", "liminf", "limsup",
  "max", "min", "sup", "inf",
  "det", "dim", "gcd", "hom", "ker", "deg", "arg", "Pr",
]);

/**
 * Normalizes bare mathematical operators/functions into their canonical LaTeX macros:
 * e.g. sin x -> \sin x, cos(x) -> \cos(x), ln 2 -> \ln 2, det(M) -> \det(M).
 * Ensures MathJax renders them in upright Roman operator font rather than italic math variables.
 * Restricts backslash insertion to STANDARD_LATEX_OPERATORS to avoid MathJax / LaTeX undefined control sequence errors.
 */
export function normalizeBareFunctions(source: string): string {
  let result = "";
  let index = 0;

  while (index < source.length) {
    if (source[index] === "%") {
      const end = readCommentEnd(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }

    if (source[index] === "\\") {
      const verb = readVerbEnd(source, index);
      if (verb !== null) {
        result += source.slice(index, verb[0]);
        index = verb[0];
        continue;
      }
      const opaque = readOpaqueCommand(source, index);
      if (opaque) {
        result += opaque[0];
        index = opaque[1];
        continue;
      }
      const cmd = matchCommand(source, index);
      if (cmd) {
        if (cmd === "\\begin" || cmd === "\\end") {
          const envHeadEnd = skipEnvironmentHead(source, cmd, index + cmd.length);
          if (envHeadEnd !== null) {
            result += source.slice(index, envHeadEnd);
            index = envHeadEnd;
            continue;
          }
        }
        result += cmd;
        index += cmd.length;
        continue;
      }
    }

    const prevChar = index > 0 ? source[index - 1] : "";
    if (index === 0 || !/[A-Za-z0-9_\\]/.test(prevChar)) {
      const fnMatch = matchBareFunction(source, index);
      if (fnMatch) {
        const rawWord = source.slice(index, index + fnMatch.length).toLowerCase();
        if (STANDARD_LATEX_OPERATORS.has(rawWord)) {
          let nextPos = index + fnMatch.length;
          while (nextPos < source.length && /\s/.test(source[nextPos])) nextPos++;
          if (nextPos < source.length && source[nextPos] === "[") {
            const bracket = readDelimitedPair(source, nextPos, "[", "]");
            if (bracket) {
              result += `\\${rawWord}(${bracket.inner})`;
              index = bracket.end;
              continue;
            }
          }
          result += "\\" + rawWord;
          index += fnMatch.length;
          continue;
        }
      }
    }

    result += source[index];
    index++;
  }

  return result;
}

export function estimateMathHeight(expr: string): number {
  const trimmed = expr.trim();
  if (!trimmed) return 1.0;

  // 1. Matrix / Multi-line environment detection: count rows via \\
  const matrixMatch = trimmed.match(/\\begin\s*\{(?:matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|cases|array|aligned|align|gather|gathered|split)\}([\s\S]*?)\\end/);
  if (matrixMatch) {
    const innerContent = matrixMatch[1];
    const rows = 1 + (innerContent.match(/\\\\/g) || []).length;
    return Math.max(1.0, rows * 1.3);
  }

  // 2. Recursive Fraction Height Calculation: \cfrac, \dfrac, \frac, \tfrac
  const fracRegex = /\\(cfrac|dfrac|frac|tfrac)\s*\{/g;
  let maxFracHeight = 0;
  let match: RegExpExecArray | null;

  while ((match = fracRegex.exec(trimmed)) !== null) {
    const fracType = match[1];
    const isDisplay = fracType === "cfrac" || fracType === "dfrac";
    const clearance = isDisplay ? 0.4 : 0.2;

    const numStart = match.index + match[0].length - 1;
    const numBraced = readBraced(trimmed, numStart);
    if (!numBraced) continue;

    let denStart = numBraced[1];
    while (denStart < trimmed.length && /\s/.test(trimmed[denStart])) denStart++;
    if (denStart >= trimmed.length || trimmed[denStart] !== "{") continue;
    const denBraced = readBraced(trimmed, denStart);
    if (!denBraced) continue;

    const numHeight = estimateMathHeight(numBraced[0].slice(1, -1));
    const denHeight = estimateMathHeight(denBraced[0].slice(1, -1));

    const totalFracHeight = (isDisplay ? Math.max(numHeight, 1.2) : numHeight)
                          + (isDisplay ? Math.max(denHeight, 1.2) : denHeight)
                          + clearance;

    if (totalFracHeight > maxFracHeight) {
      maxFracHeight = totalFracHeight;
    }
  }

  if (maxFracHeight > 0) {
    return maxFracHeight;
  }

  // 3. Large Operators with limits
  if (/\\(?:int|iint|iiint|oint|sum|prod|coprod|bigcup|bigcap|bigsqcup|bigvee|bigwedge)(?:_|\^)/.test(trimmed)) {
    return 2.5;
  }
  if (/\\(?:int|iint|iiint|oint|sum|prod|coprod|bigcup|bigcap|bigsqcup|bigvee|bigwedge)\b/.test(trimmed)) {
    return 2.0;
  }

  // 4. Roots (\sqrt)
  const sqrtMatch = trimmed.match(/\\sqrt\s*\{([\s\S]*?)\}/);
  if (sqrtMatch) {
    return estimateMathHeight(sqrtMatch[1]) + 0.3;
  }

  // 5. Binomials
  if (/\\(?:binom|dbinom|tbinom)\b/.test(trimmed)) {
    return 2.2;
  }

  // 6. Existing sized delimiters inside
  if (/\\(?:Bigg|bigg)[lrm]?/.test(trimmed)) {
    return 3.4;
  }
  if (/\\(?:Big)[lrm]?/.test(trimmed)) {
    return 2.2;
  }

  return 1.0;
}

function isDelimSized(source: string, index: number, isClosing: boolean): boolean {
  if (
    index > 0 &&
    source[index - 1] === "\\" &&
    source.slice(index - 1, index + 1) !== "\\{" &&
    source.slice(index - 1, index + 1) !== "\\}" &&
    source.slice(index - 1, index + 1) !== "\\|"
  ) {
    return true; // \( or \) or \[ or \] (LaTeX math/display delimiters)
  }
  const before = source.slice(Math.max(0, index - 10), index);
  if (isClosing) {
    return /\\(?:right|middle|bigr|Bigr|biggr|Biggr|big|Big|bigg|Bigg)\s*$/.test(before);
  } else {
    return /\\(?:left|middle|bigl|Bigl|biggl|Biggl|big|Big|bigg|Bigg)\s*$/.test(before);
  }
}

/**
 * Typst-Style Auto-Scaling Delimiters:
 * Automatically scales balanced `( ... )`, `[ ... ]`, `\{ ... \}`, and paired `| ... |` / `\| ... \|` with `\Bigl` / `\Biggl` sized delimiters
 * whenever the interior content contains tall mathematical structures (fractions, sums, integrals, matrices).
 */
export function normalizeAutoScaledDelimiters(source: string): string {
  interface DelimNode {
    type: "(" | "[" | "{" | "|" | "\\|";
    start: number;
    end: number;
    sized: boolean;
    braceDepth: number;
    envDepth: number;
    height: number;
    fracDepth: number;
    hasMatrix?: boolean;
    isStructuralEnclosure?: boolean;
  }

  const stack: DelimNode[] = [];
  interface Replacement {
    start: number;
    end: number;
    replacement: string;
  }
  const replacements: Replacement[] = [];

  function bumpStackHeight(amount: number) {
    for (let s = 0; s < stack.length; s++) {
      stack[s].height += amount;
    }
  }

  function setStackMinHeight(minH: number) {
    for (let s = 0; s < stack.length; s++) {
      if (stack[s].height < minH) stack[s].height = minH;
    }
  }

  function getLevelFromHeight(h: number): "Big" | "bigg" | "Bigg" | "left_right" | null {
    if (h >= 4.8) return "left_right";
    if (h >= 3.4) return "Bigg";
    if (h >= 2.5) return "bigg";
    if (h >= 1.8) return "Big";
    return null;
  }

  let braketDepth = 0;
  let braceDepth = 0;
  let envDepth = 0;
  let index = 0;
  while (index < source.length) {
    if (source[index] === "%") {
      index = readCommentEnd(source, index);
      continue;
    }

    if (source.charCodeAt(index) === 34) {
      // String literal
      let j = index + 1;
      while (j < source.length) {
        if (source.startsWith("$$", j)) break;
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source.charCodeAt(j) === 34) {
          j++;
          break;
        }
        j++;
      }
      index = j;
      continue;
    }

    if (source.startsWith("\\begin", index)) {
      envDepth++;
      const mat = source.slice(index).match(/^\\begin\s*\{(?:matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|cases|array|aligned|align|gather|split)\}/);
      if (mat) {
        setStackMinHeight(3.4);
        for (let s = 0; s < stack.length; s++) {
          stack[s].hasMatrix = true;
        }
      }
    } else if (source.startsWith("\\end", index)) {
      envDepth = Math.max(0, envDepth - 1);
    }

    if (source[index] === "{" && (index === 0 || source[index - 1] !== "\\")) {
      braceDepth++;
    } else if (source[index] === "}" && (index === 0 || source[index - 1] !== "\\")) {
      while (stack.length > 0 && stack[stack.length - 1].braceDepth >= braceDepth) {
        stack.pop();
      }
      braceDepth = Math.max(0, braceDepth - 1);
      for (let s = 0; s < stack.length; s++) {
        if (stack[s].fracDepth > 0) stack[s].fracDepth--;
      }
    }

    if (source[index] === "&" || source.startsWith("\\\\", index)) {
      if (source.startsWith("\\\\", index)) {
        bumpStackHeight(1.3);
      }
      while (stack.length > 0 && stack[stack.length - 1].envDepth === envDepth) {
        stack.pop();
      }
    }

    if (source[index] === "⟨") {
      braketDepth++;
    } else if (source[index] === "⟩") {
      braketDepth = Math.max(0, braketDepth - 1);
    }

    if (source[index] === "\\") {
      const verb = readVerbEnd(source, index);
      if (verb !== null) {
        index = verb[0];
        continue;
      }

      const opaque = readOpaqueCommand(source, index);
      if (opaque) {
        index = opaque[1];
        continue;
      }

      const fracMatch = source.slice(index).match(/^\\(cfrac|dfrac|frac|tfrac)(?![A-Za-z])/);
      if (fracMatch) {
        const isDisplay = fracMatch[1] === "cfrac" || fracMatch[1] === "dfrac";
        const added = isDisplay ? 1.6 : 1.2;
        for (let s = 0; s < stack.length; s++) {
          stack[s].height += added * (1 + stack[s].fracDepth);
          stack[s].fracDepth++;
        }
      }

      const bigOpMatch = source.slice(index).match(/^\\(?:int|iint|iiint|oint|sum|prod|coprod|bigcup|bigcap)(?![A-Za-z])/);
      if (bigOpMatch) {
        setStackMinHeight(2.5);
      }

      const cmd = matchCommand(source, index);
      if (cmd === "\\langle") {
        braketDepth++;
      } else if (cmd === "\\rangle") {
        braketDepth = Math.max(0, braketDepth - 1);
      }

      // Check escaped \{ or \}
      if (source.startsWith("\\{", index)) {
        const sized = isDelimSized(source, index, false);
        stack.push({ type: "{", start: index, end: index + 2, sized, braceDepth, envDepth, height: 1.0, fracDepth: 0 });
        index += 2;
        continue;
      }
      if (source.startsWith("\\}", index)) {
        const sized = isDelimSized(source, index, true);
        while (stack.length > 0 && (stack[stack.length - 1].type === "|" || stack[stack.length - 1].type === "\\|")) {
          stack.pop();
        }
        if (stack.length > 0 && stack[stack.length - 1].type === "{" && stack[stack.length - 1].braceDepth === braceDepth && stack[stack.length - 1].envDepth === envDepth) {
          const open = stack.pop()!;
          if (stack.length > 0) {
            stack[stack.length - 1].height = Math.max(stack[stack.length - 1].height, open.height);
          }
          if (!open.sized && !sized) {
            const level = getLevelFromHeight(open.height);
            if (level === "left_right") {
              replacements.push({ start: index, end: index + 2, replacement: `\\right\\}` });
              replacements.push({ start: open.start, end: open.end, replacement: `\\left\\{` });
            } else if (level) {
              replacements.push({ start: index, end: index + 2, replacement: `\\${level}r\\}` });
              replacements.push({ start: open.start, end: open.end, replacement: `\\${level}l\\{` });
            }
          }
        }
        index += 2;
        continue;
      }

      // Check double vertical bar \|
      if (source.startsWith("\\|", index)) {
        if (braketDepth > 0) {
          index += 2;
          continue;
        }
        const sized = isDelimSized(source, index, false);
        if (sized) {
          index += 2;
          continue;
        }
        if (stack.length > 0 && stack[stack.length - 1].type === "\\|" && stack[stack.length - 1].braceDepth === braceDepth && stack[stack.length - 1].envDepth === envDepth) {
          const open = stack.pop()!;
          if (stack.length > 0) {
            stack[stack.length - 1].height = Math.max(stack[stack.length - 1].height, open.height);
          }
          if (!open.sized && !sized) {
            const level = getLevelFromHeight(open.height);
            if (level === "left_right") {
              replacements.push({ start: index, end: index + 2, replacement: `\\right\\|` });
              replacements.push({ start: open.start, end: open.end, replacement: `\\left\\|` });
            } else if (level) {
              replacements.push({ start: index, end: index + 2, replacement: `\\${level}r\\|` });
              replacements.push({ start: open.start, end: open.end, replacement: `\\${level}l\\|` });
            }
          }
        } else {
          stack.push({ type: "\\|", start: index, end: index + 2, sized, braceDepth, envDepth, height: 1.0, fracDepth: 0 });
        }
        index += 2;
        continue;
      }

      if (
        cmd === "\\rangle" ||
        cmd === "\\quad" ||
        cmd === "\\qquad" ||
        cmd === "\\to" ||
        cmd === "\\implies" ||
        cmd === "\\iff" ||
        cmd === "\\approx" ||
        cmd === "\\equiv" ||
        cmd === "\\le" ||
        cmd === "\\ge" ||
        cmd === "\\leq" ||
        cmd === "\\geq" ||
        cmd === "\\ne" ||
        cmd === "\\neq"
      ) {
        while (
          stack.length > 0 &&
          !stack[stack.length - 1].isStructuralEnclosure &&
          (stack[stack.length - 1].type === "|" || stack[stack.length - 1].type === "\\|") &&
          stack[stack.length - 1].braceDepth === braceDepth &&
          stack[stack.length - 1].envDepth === envDepth
        ) {
          stack.pop();
        }
      }

      index += cmd ? cmd.length : 1;
      continue;
    }

    if (source[index] === "=" || source[index] === "," || source[index] === ";" || source[index] === ">") {
      while (
        stack.length > 0 &&
        !stack[stack.length - 1].isStructuralEnclosure &&
        (stack[stack.length - 1].type === "|" || stack[stack.length - 1].type === "\\|") &&
        stack[stack.length - 1].braceDepth === braceDepth &&
        stack[stack.length - 1].envDepth === envDepth
      ) {
        stack.pop();
      }
    }

    // Check single vertical bar |
    if (source[index] === "|") {
      if (braketDepth > 0) {
        index++;
        continue;
      }
      const sized = isDelimSized(source, index, false);
      if (sized) {
        index++;
        continue;
      }
      if (stack.length > 0 && stack[stack.length - 1].type === "|" && stack[stack.length - 1].braceDepth === braceDepth && stack[stack.length - 1].envDepth === envDepth) {
        const open = stack.pop()!;
        if (stack.length > 0) {
          stack[stack.length - 1].height = Math.max(stack[stack.length - 1].height, open.height);
          if (open.hasMatrix) stack[stack.length - 1].hasMatrix = true;
        }
        if (!open.sized && !sized) {
          const level = open.hasMatrix ? "left_right" : getLevelFromHeight(open.height);
          if (level === "left_right") {
            replacements.push({ start: index, end: index + 1, replacement: `\\right|` });
            replacements.push({ start: open.start, end: open.end, replacement: `\\left|` });
          } else if (level) {
            replacements.push({ start: index, end: index + 1, replacement: `\\${level}r|` });
            replacements.push({ start: open.start, end: open.end, replacement: `\\${level}l|` });
          }
        }
      } else {
        let look = index + 1;
        while (look < source.length && /\s/.test(source[look])) look++;
        const isPrecedingMatrix = source.startsWith("\\begin", look) ||
          PRECEDING_MATRIX_RE.test(source.slice(look));
        stack.push({
          type: "|",
          start: index,
          end: index + 1,
          sized,
          braceDepth,
          envDepth,
          height: 1.0,
          fracDepth: 0,
          isStructuralEnclosure: isPrecedingMatrix,
        });
      }
      index++;
      continue;
    }

    if (source[index] === "(" || source[index] === "[") {
      const char = source[index] as "(" | "[";
      const sized = isDelimSized(source, index, false);
      stack.push({ type: char, start: index, end: index + 1, sized, braceDepth, envDepth, height: 1.0, fracDepth: 0 });
      index++;
      continue;
    }

    if (source[index] === ")" || source[index] === "]") {
      const char = source[index] as ")" | "]";
      const matchType = char === ")" ? "(" : "[";
      const sized = isDelimSized(source, index, true);
      // Pop any unclosed lone vertical bars inside
      while (stack.length > 0 && (stack[stack.length - 1].type === "|" || stack[stack.length - 1].type === "\\|")) {
        stack.pop();
      }
      if (stack.length > 0 && stack[stack.length - 1].type === matchType && stack[stack.length - 1].braceDepth === braceDepth && stack[stack.length - 1].envDepth === envDepth) {
        const open = stack.pop()!;
        if (stack.length > 0) {
          stack[stack.length - 1].height = Math.max(stack[stack.length - 1].height, open.height);
          if (open.hasMatrix) stack[stack.length - 1].hasMatrix = true;
        }
        if (!open.sized && !sized) {
          const level = open.hasMatrix ? "left_right" : getLevelFromHeight(open.height);
          if (level === "left_right") {
            replacements.push({
              start: index,
              end: index + 1,
              replacement: char === ")" ? `\\right)` : `\\right]`,
            });
            replacements.push({
              start: open.start,
              end: open.end,
              replacement: open.type === "(" ? `\\left(` : `\\left[`,
            });
          } else if (level) {
            replacements.push({
              start: index,
              end: index + 1,
              replacement: char === ")" ? `\\${level}r)` : `\\${level}r]`,
            });
            replacements.push({
              start: open.start,
              end: open.end,
              replacement: open.type === "(" ? `\\${level}l(` : `\\${level}l[`,
            });
          }
        }
      }
      index++;
      continue;
    }

    index++;
  }

  // Real-Time Mid-Typing Scaling: Scale unclosed opening delimiters that enclose tall content
  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    if (!unclosed.sized) {
      const level = unclosed.hasMatrix ? "left_right" : getLevelFromHeight(unclosed.height);
      if (level === "left_right") {
        if (unclosed.type === "(" || unclosed.type === "[") {
          replacements.push({
            start: unclosed.start,
            end: unclosed.end,
            replacement: `\\left${unclosed.type}`,
          });
        } else if (unclosed.type === "{") {
          replacements.push({
            start: unclosed.start,
            end: unclosed.end,
            replacement: `\\left\\{`,
          });
        } else if (unclosed.type === "|") {
          replacements.push({
            start: unclosed.start,
            end: unclosed.end,
            replacement: `\\left|`,
          });
        } else if (unclosed.type === "\\|") {
          replacements.push({
            start: unclosed.start,
            end: unclosed.end,
            replacement: `\\left\\|`,
          });
        }
      } else if (level) {
        if (unclosed.type === "(" || unclosed.type === "[") {
          replacements.push({
            start: unclosed.start,
            end: unclosed.end,
            replacement: `\\${level}l${unclosed.type}`,
          });
        } else if (unclosed.type === "{") {
          replacements.push({
            start: unclosed.start,
            end: unclosed.end,
            replacement: `\\${level}l\\{`,
          });
        } else if (unclosed.type === "|") {
          replacements.push({
            start: unclosed.start,
            end: unclosed.end,
            replacement: `\\${level}l|`,
          });
        } else if (unclosed.type === "\\|") {
          replacements.push({
            start: unclosed.start,
            end: unclosed.end,
            replacement: `\\${level}l\\|`,
          });
        }
      }
    }
  }

  if (replacements.length === 0) return source;

  // Apply replacements descending by start offset
  replacements.sort((a, b) => b.start - a.start);
  let result = source;
  for (const rep of replacements) {
    result = result.slice(0, rep.start) + rep.replacement + result.slice(rep.end);
  }
  return result;
}

/**
 * Compiler Crash Immunity:
 * Detects unclosed `\left` delimiters and unclosed `{` scopes at the equation boundary,
 * automatically appending matching `}` and `\right.` to prevent MathJax red syntax errors while typing.
 */
const EXTENSIBLE_DELIM_RE =
  /^(\\(?:\{|\}|langle|rangle|vert|Vert|lvert|rvert|lVert|rVert|lceil|rceil|lfloor|rfloor|backslash)|\(|\)|\[|\]|\||\\\||\/|\.|⟦|⟧|⟨|⟩|‖|⟪|⟫|⎰|⎱|⦃|⦄|⌈|⌉|⌊|⌋)/u;

const DELIMITER_SIZING_COMMANDS = new Set([
  "\\big", "\\Big", "\\bigg", "\\Bigg",
  "\\bigl", "\\Bigl", "\\biggl", "\\Biggl",
  "\\bigr", "\\Bigr", "\\biggr", "\\Biggr",
  "\\bigm", "\\Bigm", "\\biggm", "\\Biggm",
  "\\middle",
]);

/**
 * Two-Tier Progressive Macro Auto-Sealer:
 * - Tier 1 (Hardcoded 3): strictly \sqrt, \frac, \binom
 * - Tier 2 (O(1) MPHF HashMap Fallback): all other macros queried via lookupMacroSignature(cmd)
 * Automatically seals missing brackets ([▢]) and braces ({▢}) during mid-typing.
 */
function progressiveMacroAutoSeal(input: string): string {
  let result = "";
  let i = 0;
  const len = input.length;

  while (i < len) {
    if (input[i] === "%") {
      const end = readCommentEnd(input, i);
      result += input.slice(i, end);
      i = end;
      continue;
    }

    if (input[i] === "\\") {
      const verb = readVerbEnd(input, i);
      if (verb !== null) {
        result += input.slice(i, verb[0]);
        i = verb[0];
        continue;
      }

      let cmd = matchCommand(input, i);
      if (
        !cmd ||
        cmd === "\\\\" ||
        cmd === "\\{" ||
        cmd === "\\}" ||
        cmd === "\\left" ||
        cmd === "\\right" ||
        cmd === "\\begin" ||
        cmd === "\\end" ||
        DELIMITER_SIZING_COMMANDS.has(cmd)
      ) {
        result += input.slice(i, i + (cmd ? cmd.length : 1));
        i += cmd ? cmd.length : 1;
        continue;
      }

      let mandatoryArgs = 0;
      let hasOptionalBracket = false;
      let isMacro = false;

      // Canonicalize TeX shorthand \bm -> \boldsymbol
      if (cmd === "\\bm") {
        cmd = "\\boldsymbol";
      }

      // Tier 1: Strictly 3 Hardcoded Commands
      if (cmd === "\\sqrt") {
        isMacro = true;
        mandatoryArgs = 1;
        hasOptionalBracket = true;
      } else if (cmd === "\\frac") {
        isMacro = true;
        mandatoryArgs = 2;
        hasOptionalBracket = false;
      } else if (cmd === "\\binom") {
        isMacro = true;
        mandatoryArgs = 2;
        hasOptionalBracket = false;
      } else {
        // Tier 2: O(1) MPHF HashMap Fallback
        const sig = lookupMacroSignature(cmd);
        if (sig && (sig.mandatoryArgs > 0 || sig.hasOptionalBracket)) {
          isMacro = true;
          mandatoryArgs = sig.mandatoryArgs;
          hasOptionalBracket = sig.hasOptionalBracket;
        }
      }

      if (!isMacro) {
        result += cmd;
        i += cmd.length;
        continue;
      }

      let cursor = i + cmd.length;
      let sealedCmd = cmd;

      // 1. Optional bracket handling
      if (hasOptionalBracket) {
        let after = cursor;
        while (after < len && /\s/.test(input[after])) after++;
        if (after < len && input[after] === "[") {
          let depth = 1;
          let j = after + 1;
          while (j < len && depth > 0) {
            if (input[j] === "[") depth++;
            else if (input[j] === "]") depth--;
            j++;
          }
          if (depth === 0) {
            sealedCmd += input.slice(cursor, j);
            cursor = j;
          } else {
            // Unclosed bracket (e.g. \sqrt[ or \sqrt[n)
            const inner = input.slice(after + 1).trim();
            if (inner.length === 0) {
              sealedCmd += "[▢]";
            } else {
              sealedCmd += input.slice(cursor) + "]";
            }
            if (mandatoryArgs > 0) {
              sealedCmd += "{▢}".repeat(mandatoryArgs);
            }
            result += sealedCmd;
            i = len;
            break;
          }
        }
      }

      // 2. Mandatory arguments handling
      let argsFound = 0;
      let argEnd = cursor;
      let trailingArgsStr = "";

      while (argsFound < mandatoryArgs) {
        let wsStart = argEnd;
        while (wsStart < len && /\s/.test(input[wsStart])) wsStart++;
        if (wsStart >= len) break;

        const nextChar = input[wsStart];
        if (
          nextChar === "+" || nextChar === "=" || nextChar === "<" || nextChar === ">" ||
          nextChar === "-" || nextChar === "*" || nextChar === "/" || nextChar === "," ||
          nextChar === ";" || nextChar === ")" || nextChar === "]" || nextChar === "&" ||
          nextChar === "$" || input.startsWith("\\\\", wsStart) || input.startsWith("\\right", wsStart) ||
          input.startsWith("\\end", wsStart)
        ) {
          break;
        }

        if (nextChar === "{") {
          const braced = readBraced(input, wsStart);
          if (braced) {
            const inner = braced[0].slice(1, -1);
            const sealedInner = progressiveMacroAutoSeal(inner);
            if (sealedInner !== inner) {
              trailingArgsStr += input.slice(argEnd, wsStart) + "{" + sealedInner + "}";
            } else if (inner.trim().length === 0 && wsStart + braced[0].length >= len) {
              trailingArgsStr += input.slice(argEnd, wsStart) + "{▢}";
            } else {
              trailingArgsStr += input.slice(argEnd, braced[1]);
            }
            argsFound++;
            argEnd = braced[1];
            continue;
          } else {
            break;
          }
        } else {
          // TeX allows single token arguments without braces (e.g. \frac 1 2 or \mathbf x)
          if (/[A-Za-z0-9]/.test(nextChar)) {
            trailingArgsStr += input.slice(argEnd, wsStart + 1);
            argsFound++;
            argEnd = wsStart + 1;
            continue;
          }
          break;
        }
      }

      const missing = mandatoryArgs - argsFound;
      if (missing > 0) {
        let peek = argEnd;
        while (peek < len && /\s/.test(input[peek])) peek++;
        const isAtBoundary = (
          peek >= len ||
          input[peek] === "+" || input[peek] === "=" || input[peek] === "<" || input[peek] === ">" ||
          input[peek] === "-" || input[peek] === "*" || input[peek] === "/" || input[peek] === "," ||
          input[peek] === ";" || input[peek] === ")" || input[peek] === "]" || input[peek] === "}" || input[peek] === "&" ||
          input[peek] === "$" || input.startsWith("\\\\", peek) || input.startsWith("\\right", peek) ||
          input.startsWith("\\end", peek)
        );

        if (isAtBoundary) {
          result += sealedCmd + trailingArgsStr + "{▢}".repeat(missing);
          i = argEnd;
          continue;
        }
      }

      result += sealedCmd + trailingArgsStr;
      i = argEnd;
      continue;
    }

    result += input[i];
    i++;
  }

  return result;
}

export function autoSealUnclosedDelimiters(
  source: string,
  sealEndOfExpression: boolean = true
): string {
  let frames: Array<{ leftCount: number; parenCount?: number; startPos: number }> = [{ leftCount: 0, parenCount: 0, startPos: 0 }];
  let envStack: number[] = []; // records totalLeftCount when entering an environment
  let envBraceStack: number[] = []; // records frames.length when entering an environment
  let openEnvs: string[] = []; // tracks unclosed \begin{...} environment names
  let totalLeftCount = 0;
  let substackDepth = 0;
  let cellBraceDepth = 0;
  let cellStartPos = 0;
  let output = "";
  let index = 0;

  while (index < source.length) {
    if (source[index] === "%") {
      const end = readCommentEnd(source, index);
      output += source.slice(index, end);
      index = end;
      continue;
    }

    if (source.charCodeAt(index) === 34) {
      let j = index + 1;
      let matchedQuote = false;
      while (j < source.length) {
        if (source.startsWith("$$", j)) break;
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source.charCodeAt(j) === 34) {
          j++;
          matchedQuote = true;
          break;
        }
        j++;
      }
      if (matchedQuote) {
        output += source.slice(index, j);
        index = j;
        continue;
      } else {
        // Auto-convert unclosed quote to \text{...} up to boundary
        const textContent = source.slice(index + 1, j);
        let braceCount = 0;
        let balanced = "";
        for (let k = 0; k < textContent.length; k++) {
          if (textContent[k] === "\\") {
            balanced += textContent.slice(k, k + 2);
            k++;
            continue;
          }
          if (textContent[k] === "{") {
            braceCount++;
            balanced += "{";
          } else if (textContent[k] === "}") {
            if (braceCount > 0) {
              braceCount--;
              balanced += "}";
            } else {
              balanced += "{}";
            }
          } else {
            balanced += textContent[k];
          }
        }
        if (braceCount > 0) {
          balanced += "}".repeat(braceCount);
        }
        const escaped = balanced.replace(/\$/g, "\\$");
        const withSpaces = escaped.replace(/ {2,}/g, (m) => "\\ ".repeat(m.length));
        output += `\\text{${withSpaces}}`;
        index = j;
        continue;
      }
    }

    if (source[index] === "\\") {
      const verb = readVerbEnd(source, index);
      if (verb !== null) {
        output += source.slice(index, verb[0]);
        index = verb[0];
        continue;
      }

      const cmd = matchCommand(source, index);
      if (cmd && OPAQUE_TEXT_COMMANDS.has(cmd)) {
        const braced = readBraced(source, index + cmd.length);
        if (braced) {
          output += `${cmd}${braced[0]}`;
          index = braced[1];
          continue;
        }
        let nextPos = index + cmd.length;
        while (nextPos < source.length && /\s/.test(source[nextPos])) nextPos++;
        if (nextPos < source.length && (source.charCodeAt(nextPos) === 34 || source[nextPos] === "'" || source[nextPos] === "`" || source[nextPos] === "“" || source[nextPos] === "”")) {
          output += `${cmd}{${source[nextPos]}}`;
          index = nextPos + 1;
          continue;
        }
      }

      // Check \begin{...}
      const beginMatch = source.slice(index).match(/^\\begin\s*\{([A-Za-z*]+)\}/);
      if (beginMatch) {
        output += beginMatch[0];
        openEnvs.push(beginMatch[1]);
        envStack.push(totalLeftCount);
        envBraceStack.push(frames.length);
        cellBraceDepth = frames.length;
        cellStartPos = output.length;
        index += beginMatch[0].length;
        continue;
      }

      // Check \substack
      if (source.startsWith("\\substack", index) && (index + 9 === source.length || !/[A-Za-z]/.test(source[index + 9]))) {
        output += "\\substack";
        substackDepth++;
        index += 9;
        continue;
      }

      // Check \end{...}
      const endMatch = source.slice(index).match(/^\\end\s*\{([A-Za-z*]+)\}/);
      if (endMatch) {
        const endEnv = endMatch[1];
        const lastIdx = openEnvs.lastIndexOf(endEnv);
        if (lastIdx !== -1) {
          openEnvs.splice(lastIdx, 1);
        }
        if (envStack.length > 0) {
          const startLeft = envStack.pop()!;
          const unclosedInEnv = totalLeftCount - startLeft;
          if (unclosedInEnv > 0) {
            output += " \\right.".repeat(unclosedInEnv) + " ";
            totalLeftCount -= unclosedInEnv;
            frames[frames.length - 1].leftCount = Math.max(0, frames[frames.length - 1].leftCount - unclosedInEnv);
          }
        }
        if (envBraceStack.length > 0) {
          const envStartBraces = envBraceStack.pop()!;
          while (frames.length > envStartBraces) {
            const frame = frames.pop()!;
            if (frame.leftCount > 0) {
              output += " \\right.".repeat(frame.leftCount);
              totalLeftCount = Math.max(0, totalLeftCount - frame.leftCount);
            }
            output += "}";
          }
          cellBraceDepth = envBraceStack.length > 0 ? envBraceStack[envBraceStack.length - 1] : 0;
        }
        output += endMatch[0];
        index += endMatch[0].length;
        continue;
      }

      // Check \\ (matrix row break)
      if (source.startsWith("\\\\", index)) {
        if (substackDepth === 0) {
          if (envBraceStack.length > 0) {
            while (frames.length > cellBraceDepth) {
              const frame = frames.pop()!;
              if (frame.leftCount > 0) {
                output += " \\right.".repeat(frame.leftCount);
                totalLeftCount = Math.max(0, totalLeftCount - frame.leftCount);
              }
              output += "}";
            }
          }
          const unclosedInEnv = envStack.length > 0
            ? totalLeftCount - envStack[envStack.length - 1]
            : frames[frames.length - 1].leftCount;
          if (unclosedInEnv > 0) {
            output += " \\right.".repeat(unclosedInEnv) + " \\\\ " + "\\left. ".repeat(unclosedInEnv);
            index += 2;
            cellStartPos = output.length;
            continue;
          }
        }
        output += "\\\\";
        index += 2;
        cellStartPos = output.length;
        continue;
      }

      if (
        source.startsWith("\\left", index) &&
        (index + 5 === source.length || !/[A-Za-z]/.test(source[index + 5]))
      ) {
        let after = index + 5;
        while (after < source.length && /\s/.test(source[after])) after++;
        const delim = source.slice(after).match(EXTENSIBLE_DELIM_RE);
        if (delim) {
          frames[frames.length - 1].leftCount++;
          totalLeftCount++;
          output += source.slice(index, after + delim[0].length);
          index = after + delim[0].length;
          continue;
        } else {
          frames[frames.length - 1].leftCount++;
          totalLeftCount++;
          output += "\\left.";
          index = after;
          continue;
        }
      }

      if (
        source.startsWith("\\right", index) &&
        (index + 6 === source.length || !/[A-Za-z]/.test(source[index + 6]))
      ) {
        let after = index + 6;
        while (after < source.length && /\s/.test(source[after])) after++;
        const delim = source.slice(after).match(EXTENSIBLE_DELIM_RE);
        const delimStr = delim ? delim[0] : ".";
        const nextIdx = delim ? after + delim[0].length : after;

        // Check if an ancestor frame has an unclosed \left
        let hasAncestorLeft = false;
        for (let i = frames.length - 1; i >= 0; i--) {
          if (frames[i].leftCount > 0) {
            hasAncestorLeft = true;
            break;
          }
        }

        if (hasAncestorLeft) {
          while (frames.length > 1 && frames[frames.length - 1].leftCount === 0) {
            frames.pop();
            output += "}";
          }
          const currentFrame = frames[frames.length - 1];
          if (currentFrame.leftCount > 0) {
            currentFrame.leftCount--;
            totalLeftCount = Math.max(0, totalLeftCount - 1);
            output += "\\right" + delimStr;
          }
        } else {
          const currentFrame = frames[frames.length - 1];
          output =
            output.slice(0, currentFrame.startPos) +
            "\\left. " +
            output.slice(currentFrame.startPos) +
            "\\right" +
            delimStr;
        }
        index = nextIdx;
        continue;
      }

      if (source.startsWith("\\{", index) || source.startsWith("\\}", index)) {
        output += source.slice(index, index + 2);
        index += 2;
        continue;
      }

      const genCmd = matchCommand(source, index);
      const len = genCmd ? genCmd.length : 1;
      output += source.slice(index, index + len);
      index += len;
      continue;
    }

    // Check & (column alignment tab)
    if (source[index] === "&") {
      if (envBraceStack.length > 0) {
        while (frames.length > cellBraceDepth) {
          const frame = frames.pop()!;
          if (frame.leftCount > 0) {
            output += " \\right.".repeat(frame.leftCount);
            totalLeftCount = Math.max(0, totalLeftCount - frame.leftCount);
          }
          output += "}";
        }
      }
      const unclosedInEnv = envStack.length > 0
        ? totalLeftCount - envStack[envStack.length - 1]
        : frames[frames.length - 1].leftCount;
      if (unclosedInEnv > 0) {
        output += " \\right.".repeat(unclosedInEnv) + " & " + "\\left. ".repeat(unclosedInEnv);
        index++;
        cellStartPos = output.length;
        continue;
      }
      output += "&";
      index++;
      cellStartPos = output.length;
      continue;
    }

    if (source[index] === "(") {
      const cur = frames[frames.length - 1];
      cur.parenCount = (cur.parenCount || 0) + 1;
      output += "(";
      index++;
      continue;
    }

    if (source[index] === ")") {
      const cur = frames[frames.length - 1];
      if (cur.parenCount && cur.parenCount > 0) {
        cur.parenCount--;
      }
      output += ")";
      index++;
      continue;
    }

    if (source[index] === "{") {
      output += "{";
      frames.push({ leftCount: 0, parenCount: 0, startPos: output.length });
      index++;
      continue;
    }

    if (source[index] === "}") {
      if (substackDepth > 0) {
        substackDepth--;
      }
      if (envBraceStack.length > 0 && frames.length <= cellBraceDepth) {
        // Stray closing brace inside an environment cell: balance by prepending '{' at cellStartPos
        output = output.slice(0, cellStartPos) + "{" + output.slice(cellStartPos) + "}";
        index++;
        continue;
      }
      if (frames.length > 1) {
        const frame = frames.pop()!;
        if (frame.parenCount && frame.parenCount > 0) {
          output += ")".repeat(frame.parenCount);
        }
        if (frame.leftCount > 0) {
          output += " \\right.".repeat(frame.leftCount);
          totalLeftCount = Math.max(0, totalLeftCount - frame.leftCount);
        }
        output += "}";
      } else {
        // Stray closing brace at top level: balance by adding '{' just beside it to make '{}'
        output += "{}";
        index++;
        continue;
      }
      index++;
      continue;
    }

    output += source[index];
    index++;
  }

  if (sealEndOfExpression) {
    // Close unclosed brace frames
    while (frames.length > 1) {
      const frame = frames.pop()!;
      if (frame.parenCount && frame.parenCount > 0) {
        output += ")".repeat(frame.parenCount);
      }
      if (frame.leftCount > 0) {
        output += " \\right.".repeat(frame.leftCount);
        totalLeftCount = Math.max(0, totalLeftCount - frame.leftCount);
      }
      if (output.endsWith("\\") && !output.endsWith("\\\\")) {
        output += " ";
      }
      output += "}";
    }

    // Close root frame unclosed \left and unclosed parens
    const root = frames[0];
    if (root.parenCount && root.parenCount > 0) {
      output += ")".repeat(root.parenCount);
    }
    if (root.leftCount > 0) {
      output += " \\right.".repeat(root.leftCount);
      totalLeftCount = Math.max(0, totalLeftCount - root.leftCount);
    }

    // Close any unclosed \begin{...} environments
    while (openEnvs.length > 0) {
      const unclosedEnv = openEnvs.pop()!;
      output += ` \\end{${unclosedEnv}}`;
    }

    // 1. Auto-seal dangling caret (^) and underscore (_) with Unicode placeholder ▢
    output = output.replace(/(\^|_)([\s]*)([+\-=<>/*,)\]};$]|\\right|$)/g, "$1{▢}$2$3");

    // 2. Progressive Two-Tier Macro Auto-Sealing (Tier 1: strictly \sqrt, \frac, \binom; Tier 2: O(1) HashMap)
    output = progressiveMacroAutoSeal(output);

    // 4. Auto-seal lone trailing backslash at the end of input
    output = output.replace(/\\$/g, "\\ ");
  }

  return output;
}

/**
 * Normalizes physical unit spacing:
 * When a number is followed by a tightly bound physical unit (0 or 1 space),
 * auto-inserts an ISO-compliant thin space `\; ` if not already preceded by spacing commands.
 * Only applied when colorUnits is enabled.
 */
export function normalizePhysicalUnitSpacing(
  source: string,
  options?: ColorMathOptions
): string {
  if (options?.colorUnits !== true) return source;

  const spans = findUnitSpans(source, {
    allowSingleLetterUnits: options?.allowSingleLetterUnits,
    activeMode: options?.activeMode,
  });
  if (spans.length === 0) return source;

  interface Replacement {
    start: number;
    end: number;
    replacement: string;
  }
  const replacements: Replacement[] = [];

  for (const span of spans) {
    const before = source.slice(0, span.start);
    // Look backwards from span.start to see if immediately preceded by a number + (0 or 1 space)
    const match = /(?:^|[^A-Za-z0-9_])(\d+(?:\.\d+)?|\.\d+)([ ]{0,1})$/.exec(before);
    if (match) {
      const spacer = match[2];
      const spacerStart = span.start - spacer.length;
      replacements.push({
        start: spacerStart,
        end: span.start,
        replacement: "\\; ",
      });
    }
  }

  if (replacements.length === 0) return source;

  replacements.sort((a, b) => b.start - a.start);
  let result = source;
  for (const rep of replacements) {
    result = result.slice(0, rep.start) + rep.replacement + result.slice(rep.end);
  }
  return result;
}

const ASCII_OPERATOR_EXACT_MAP: Record<string, string> = {
  // Bidirectional double arrows
  "<=>": "\\iff ",
  "<==>": "\\Longleftrightarrow ",
  // Bidirectional single arrows
  "<->": "\\leftrightarrow ",
  "<-->": "\\longleftrightarrow ",
  // Right double arrows
  "=>": "\\implies ",
  "==>": "\\Longrightarrow ",
  // Right single arrows
  "->": "\\to ",
  "-->": "\\longrightarrow ",
  // Left double arrows
  "<==": "\\Longleftarrow ",
  // Left single arrows
  "<-": "\\leftarrow ",
  "<--": "\\longleftarrow ",
  // Mapping
  "|->": "\\mapsto ",
  // Inequalities & Relations
  ">=": "\\ge ",
  "<=": "\\le ",
  "!=": "\\neq ",
  ":=": "\\coloneqq ",
  "+-": "\\pm ",
  "-+": "\\mp ",
  "^^": "\\wedge ",
  "~=": "\\approx ",
  "<<": "\\ll ",
  ">>": "\\gg ",
};

function isOpChar(c: string): boolean {
  return (
    c === "<" ||
    c === ">" ||
    c === "=" ||
    c === "-" ||
    c === "!" ||
    c === ":" ||
    c === "+" ||
    c === "~" ||
    c === "|" ||
    c === "^"
  );
}

/**
 * Normalizes pure ASCII operators and arrows to canonical LaTeX:
 * Uses Maximal Munch (greedy continuous operator run scanning) to prevent
 * accidental sub-token fragmentation (e.g. <==> being partially matched as < \implies >).
 * Skips comments (% ...), \text{...}, \verb, and LaTeX commands (\cmd).
 */
export function normalizeAsciiOperators(source: string): string {
  let result = "";
  let index = 0;
  const len = source.length;
  while (index < len) {
    const char = source[index];
    if (char === "%") {
      const end = readCommentEnd(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }
    if (char === "\\") {
      const verb = readVerbEnd(source, index);
      if (verb !== null) {
        result += source.slice(index, verb[0]);
        index = verb[0];
        continue;
      }
      const opaque = readOpaqueCommand(source, index);
      if (opaque) {
        result += opaque[0];
        index = opaque[1];
        continue;
      }
      const cmd = matchCommand(source, index);
      if (cmd) {
        if (cmd === "\\begin" || cmd === "\\end") {
          const envHeadEnd = skipEnvironmentHead(source, cmd, index + cmd.length);
          if (envHeadEnd !== null) {
            result += source.slice(index, envHeadEnd);
            index = envHeadEnd;
            continue;
          }
        }
        result += cmd;
        index += cmd.length;
        continue;
      }
    }

    // Multi-dialect ASCII shorthand operators (Maximal Munch: 3-char before 2-char)
    // Never trigger alphabetic operator shorthands inside subscript/superscript braces (e.g. \partial_{xxx}, u_{xx}, g_{uu})
    const isScriptBrace =
      index >= 2 &&
      (source.slice(index - 2, index) === "_{" || source.slice(index - 2, index) === "^{");
    const isPrevBoundary =
      !isScriptBrace && (index === 0 || !/[A-Za-z0-9_\\^]/.test(source[index - 1]));
    if (isPrevBoundary) {
      // Length 3: xxx (\bigtimes), vvv (\bigvee), uuu (\bigcup), nnn (\bigcap)
      if (index + 3 <= len) {
        const sub3 = source.slice(index, index + 3);
        let rep3: string | null = null;
        if (sub3 === "xxx") rep3 = "\\bigtimes ";
        else if (sub3 === "vvv") rep3 = "\\bigvee ";
        else if (sub3 === "uuu") rep3 = "\\bigcup ";
        else if (sub3 === "nnn") rep3 = "\\bigcap ";

        if (rep3 !== null) {
          const isNextBoundary = index + 3 === len || !/[A-Za-z0-9_]/.test(source[index + 3]);
          if (isNextBoundary) {
            result += (index + 3 >= len || source.slice(index + 3).trim().length === 0) ? rep3.trimEnd() : rep3;
            index += 3;
            if (index < len && source[index] === " ") index++;
            continue;
          }
        }
      }

      // Length 2: xx (\times), vv (\vee), uu (\cup), nn (\cap), ox (\otimes), o+ (\oplus), o. (\odot)
      if (index + 2 <= len) {
        const sub2 = source.slice(index, index + 2);
        let rep2: string | null = null;
        if (sub2 === "xx") rep2 = "\\times ";
        else if (sub2 === "vv") rep2 = "\\vee ";
        else if (sub2 === "uu") rep2 = "\\cup ";
        else if (sub2 === "nn") rep2 = "\\cap ";
        else if (sub2 === "ox") rep2 = "\\otimes ";
        else if (sub2 === "o+") rep2 = "\\oplus ";
        else if (sub2 === "o.") rep2 = "\\odot ";

        if (rep2 !== null) {
          const isNextBoundary = index + 2 === len || !/[A-Za-z0-9_]/.test(source[index + 2]);
          if (isNextBoundary) {
            result += (index + 2 >= len || source.slice(index + 2).trim().length === 0) ? rep2.trimEnd() : rep2;
            index += 2;
            if (index < len && source[index] === " ") index++;
            continue;
          }
        }
      }
    }

    // Continuous Operator Run (Maximal Munch)
    if (isOpChar(char)) {
      let opEnd = index;
      while (opEnd < len && isOpChar(source[opEnd])) {
        opEnd++;
      }
      const cluster = source.slice(index, opEnd);

      // Exact match in dictionary
      if (ASCII_OPERATOR_EXACT_MAP[cluster]) {
        // Guard: Do not treat trailing blockquote arrows (e.g. \n>>$$) as binary \gg / \ll
        if (
          (cluster === ">>" || cluster === "<<") &&
          (opEnd >= len || source.slice(opEnd).trim().length === 0)
        ) {
          result += cluster;
          index = opEnd;
          continue;
        }

        let rep = ASCII_OPERATOR_EXACT_MAP[cluster];
        // Do not inject trailing space at the end of expression to protect inline math closing $
        if (opEnd >= len || source.slice(opEnd).trim().length === 0) {
          rep = rep.trimEnd();
        }
        result += rep;
        index = opEnd;
        if (index < len && source[index] === " ") index++;
        continue;
      }

      // Arbitrary shaft lengths:
      // <=2 dashes/equals: standard \longleftrightarrow, \longrightarrow, etc.
      // >=3 dashes/equals: extensible stretchy arrows (\xleftrightarrow{\hspace{...em}}) scaling with dash count
      if (/^<={2,}>$/.test(cluster)) {
        const eqCount = cluster.length - 2;
        if (eqCount <= 2) {
          result += "\\Longleftrightarrow ";
        } else {
          const em = (eqCount * 0.35).toFixed(2);
          result += `\\xLeftrightarrow{\\hspace{${em}em}} `;
        }
        index = opEnd;
        if (index < len && source[index] === " ") index++;
        continue;
      }
      if (/^<-{2,}>$/.test(cluster)) {
        const dashCount = cluster.length - 2;
        if (dashCount <= 2) {
          result += "\\longleftrightarrow ";
        } else {
          const em = (dashCount * 0.35).toFixed(2);
          result += `\\xleftrightarrow{\\hspace{${em}em}} `;
        }
        index = opEnd;
        if (index < len && source[index] === " ") index++;
        continue;
      }
      if (/^={2,}>$/.test(cluster)) {
        const eqCount = cluster.length - 1;
        if (eqCount <= 2) {
          result += "\\Longrightarrow ";
        } else {
          const em = (eqCount * 0.35).toFixed(2);
          result += `\\xRightarrow{\\hspace{${em}em}} `;
        }
        index = opEnd;
        if (index < len && source[index] === " ") index++;
        continue;
      }
      if (/^-{2,}>$/.test(cluster)) {
        const dashCount = cluster.length - 1;
        if (dashCount <= 2) {
          result += "\\longrightarrow ";
        } else {
          const em = (dashCount * 0.35).toFixed(2);
          result += `\\xrightarrow{\\hspace{${em}em}} `;
        }
        index = opEnd;
        if (index < len && source[index] === " ") index++;
        continue;
      }
      if (/^<={2,}$/.test(cluster)) {
        const eqCount = cluster.length - 1;
        if (eqCount <= 2) {
          result += "\\Longleftarrow ";
        } else {
          const em = (eqCount * 0.35).toFixed(2);
          result += `\\xLeftarrow{\\hspace{${em}em}} `;
        }
        index = opEnd;
        if (index < len && source[index] === " ") index++;
        continue;
      }
      if (/^<-{2,}$/.test(cluster)) {
        const dashCount = cluster.length - 1;
        if (dashCount <= 2) {
          result += "\\longleftarrow ";
        } else {
          const em = (dashCount * 0.35).toFixed(2);
          result += `\\xleftarrow{\\hspace{${em}em}} `;
        }
        index = opEnd;
        if (index < len && source[index] === " ") index++;
        continue;
      }

      // Not a recognized operator ligature; emit verbatim
      result += cluster;
      index = opEnd;
      continue;
    }

    result += char;
    index++;
  }
  return result;
}

export const normalizeTypstArrows = normalizeAsciiOperators;

/**
 * Normalizes ASCII ellipses: continuous dot runs (3+ dots)
 * - Between binary operators or relations: \cdots
 * - Between commas, semicolons, brackets, or standard variables: \ldots
 * Skips comments (% ...), opaque text commands (\text{...}), \verb, and LaTeX commands.
 */
export function normalizeAsciiEllipses(source: string): string {
  let result = "";
  let index = 0;
  const len = source.length;

  while (index < len) {
    const char = source[index];

    // Comments
    if (char === "%") {
      const end = readCommentEnd(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }

    // TeX commands and opaque blocks
    if (char === "\\") {
      const verb = readVerbEnd(source, index);
      if (verb !== null) {
        result += source.slice(index, verb[0]);
        index = verb[0];
        continue;
      }
      const opaque = readOpaqueCommand(source, index);
      if (opaque) {
        result += opaque[0];
        index = opaque[1];
        continue;
      }
      const cmd = matchCommand(source, index);
      if (cmd) {
        result += cmd;
        index += cmd.length;
        continue;
      }
    }

    // Continuous dot runs (3 or more dots)
    if (char === ".") {
      let dotEnd = index;
      while (dotEnd < len && source[dotEnd] === ".") {
        dotEnd++;
      }
      const dotCount = dotEnd - index;
      if (dotCount >= 3) {
        // Inspect backward non-whitespace context
        let prevIdx = index - 1;
        while (prevIdx >= 0 && /\s/.test(source[prevIdx])) {
          prevIdx--;
        }
        const prevChar = prevIdx >= 0 ? source[prevIdx] : "";

        // Inspect forward non-whitespace context
        let nextIdx = dotEnd;
        while (nextIdx < len && /\s/.test(source[nextIdx])) {
          nextIdx++;
        }
        const nextChar = nextIdx < len ? source[nextIdx] : "";

        // Check if preceded or followed by binary operators or relations
        const isOperatorContext =
          prevChar === "+" ||
          prevChar === "-" ||
          prevChar === "*" ||
          prevChar === "/" ||
          prevChar === "=" ||
          prevChar === "<" ||
          prevChar === ">" ||
          prevChar === "~" ||
          nextChar === "+" ||
          nextChar === "-" ||
          nextChar === "*" ||
          nextChar === "/" ||
          nextChar === "=" ||
          nextChar === "<" ||
          nextChar === ">" ||
          nextChar === "~" ||
          source.slice(Math.max(0, prevIdx - 6), prevIdx + 1).includes("\\times") ||
          source.slice(Math.max(0, prevIdx - 5), prevIdx + 1).includes("\\cdot") ||
          source.slice(nextIdx, nextIdx + 7).startsWith("\\times") ||
          source.slice(nextIdx, nextIdx + 6).startsWith("\\cdot");

        const isTrailing = dotEnd >= len || source.slice(dotEnd).trim().length === 0;
        if (isOperatorContext) {
          result += isTrailing ? "\\cdots" : "\\cdots ";
        } else {
          result += isTrailing ? "\\ldots" : "\\ldots ";
        }
        index = dotEnd;
        if (index < len && source[index] === " ") index++;
        continue;
      }
    }

    result += char;
    index++;
  }
  return result;
}

export const NUMBER_BOUND_UNITS_MAP: Record<string, string> = {
  // Degrees / Temperature (Atomic tokens to prevent variable collision)
  degC: "^\\circ\\text{C}",
  deg_C: "^\\circ\\text{C}",
  degF: "^\\circ\\text{F}",
  deg_F: "^\\circ\\text{F}",
  deg: "^\\circ",
  // Resistance
  kohm: "\\; \\text{k}\\Omega",
  Mohm: "\\; \\text{M}\\Omega",
  ohm: "\\; \\Omega",
  // Capacitance
  uF: "\\; \\mu\\text{F}",
  nF: "\\; \\text{nF}",
  pF: "\\; \\text{pF}",
  // Inductance
  mH: "\\; \\text{mH}",
  uH: "\\; \\mu\\text{H}",
  // Frequency
  kHz: "\\; \\text{kHz}",
  MHz: "\\; \\text{MHz}",
  GHz: "\\; \\text{GHz}",
  THz: "\\; \\text{THz}",
  // Current / Voltage
  mA: "\\; \\text{mA}",
  uA: "\\; \\mu\\text{A}",
  mV: "\\; \\text{mV}",
  kV: "\\; \\text{kV}",
  // Time
  ns: "\\; \\text{ns}",
  ms: "\\; \\text{ms}",
  us: "\\; \\mu\\text{s}",
};

export const SORTED_NUMBER_BOUND_UNIT_KEYS: string[] = Object.keys(
  NUMBER_BOUND_UNITS_MAP
).sort((a, b) => b.length - a.length);

/**
 * Normalizes number-bound physical units and neutralizes comment line-cuts:
 * - 90 deg -> 90^\circ
 * - 25 degC -> 25^\circ\text{C}
 * - 98 degF -> 98^\circ\text{F}
 * - 10 ohm -> 10 \; \Omega
 * - 10 uF -> 10 \; \mu\text{F}
 * - 50 % -> 50\% (neutralizing LaTeX comment truncation)
 */
export function normalizeNumberBoundUnits(source: string): string {
  if (!/\d/.test(source)) return source;

  let result = "";
  let index = 0;
  const len = source.length;

  while (index < len) {
    if (source[index] === "%") {
      const end = readCommentEnd(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }

    if (source[index] === "\\") {
      const verb = readVerbEnd(source, index);
      if (verb !== null) {
        result += source.slice(index, verb[0]);
        index = verb[0];
        continue;
      }
      const opaque = readOpaqueCommand(source, index);
      if (opaque) {
        result += opaque[0];
        index = opaque[1];
        continue;
      }
      const cmd = matchCommand(source, index);
      if (cmd) {
        result += cmd;
        index += cmd.length;
        continue;
      }
    }

    // Check for number literal
    const prevChar = index > 0 ? source[index - 1] : "";
    if (index === 0 || !/[A-Za-z0-9_\\]/.test(prevChar)) {
      const numMatch = source.slice(index).match(/^(\d+(?:\.\d+)?|\.\d+)/);
      if (numMatch) {
        const numStr = numMatch[0];
        const afterNumIndex = index + numStr.length;
        const afterNum = source.slice(afterNumIndex);

        // Check whitespace: <= 1 space allowed. 2+ spaces treats as algebra.
        if (!afterNum.startsWith("  ")) {
          let spaceLen = 0;
          if (afterNum.startsWith(" ")) spaceLen = 1;
          const candidateSlice = afterNum.slice(spaceLen);

          // 1. Percent sign check:
          if (candidateSlice.startsWith("%")) {
            let isPercent = false;
            if (spaceLen === 0) {
              // Directly attached to number: 50%, 33.3%
              isPercent = true;
            } else {
              // Spaced: 50 %
              const afterPct = candidateSlice.slice(1);
              const trimmed = afterPct.trimStart();
              if (
                trimmed.length === 0 ||
                /^(?:[\n\r+\-*/=<>,;)\]}\\]|\\(?:times|cdot|pm|mp|le|ge|neq|approx|sim|equiv|quad|qquad|\\))/.test(
                  trimmed
                )
              ) {
                isPercent = true;
              }
            }

            if (isPercent) {
              result += `${numStr}\\%`;
              index = afterNumIndex + spaceLen + 1;
              continue;
            }
          }

          // 2. Unit token check:
          let matchedUnit = false;
          for (const unitKey of SORTED_NUMBER_BOUND_UNIT_KEYS) {
            if (candidateSlice.startsWith(unitKey)) {
              const boundaryChar = candidateSlice[unitKey.length];
              if (!boundaryChar || !/[A-Za-z0-9_]/.test(boundaryChar)) {
                const replacement = NUMBER_BOUND_UNITS_MAP[unitKey];
                result += `${numStr}${replacement}`;
                index = afterNumIndex + spaceLen + unitKey.length;
                matchedUnit = true;
                break;
              }
            }
          }
          if (matchedUnit) {
            continue;
          }
        }
      }
    }

    result += source[index];
    index++;
  }

  return result;
}

const readBracketPair = readDelimitedPair;

/**
 * Normalizes chained-bracket roots with O(1) arity gating:
 * - sqrt[expr] -> \sqrt{expr}
 * - sqrt[n][expr] -> \sqrt[n]{expr}
 * - sqrt[3][aj][kd] -> \sqrt[3]{aj}[kd] (3rd bracket preserved via arity gating)
 * - Leaves standard LaTeX \sqrt[n]{x} and \sqrt{x} intact.
 */
export function normalizeChainedRoots(
  source: string,
  autoSealCrashImmunity: boolean = true
): string {
  let result = "";
  let index = 0;
  const len = source.length;

  while (index < len) {
    if (source[index] === "%") {
      const end = readCommentEnd(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }

    if (source[index] === "\\") {
      const verb = readVerbEnd(source, index);
      if (verb !== null) {
        result += source.slice(index, verb[0]);
        index = verb[0];
        continue;
      }
      const opaque = readOpaqueCommand(source, index);
      if (opaque) {
        result += opaque[0];
        index = opaque[1];
        continue;
      }
      // Check for \sqrt[...] where user typed chained brackets with \sqrt
      if (source.startsWith("\\sqrt[", index)) {
        const firstBracket = readBracketPair(source, index + 5);
        if (firstBracket) {
          let afterFirst = firstBracket.end;
          while (afterFirst < len && /\s/.test(source[afterFirst])) afterFirst++;
          if (afterFirst < len && source[afterFirst] === "[") {
            const secondBracket = readBracketPair(source, afterFirst);
            if (secondBracket) {
              const inner1 = firstBracket.inner.includes("sqrt[") ? normalizeChainedRoots(firstBracket.inner, autoSealCrashImmunity) : firstBracket.inner;
              const inner2 = secondBracket.inner.includes("sqrt[") ? normalizeChainedRoots(secondBracket.inner, autoSealCrashImmunity) : secondBracket.inner;
              result += `\\sqrt[${inner1}]{${inner2}}`;
              index = secondBracket.end;
              continue;
            } else if (autoSealCrashImmunity) {
              const inner1 = firstBracket.inner;
              const unclosed2 = source.slice(afterFirst + 1);
              result += `\\sqrt[${inner1}]{${unclosed2}}`;
              index = len;
              continue;
            }
          }
        } else if (autoSealCrashImmunity) {
          const unclosed = source.slice(index + 6);
          result += `\\sqrt{${unclosed}}`;
          index = len;
          continue;
        }
      }
      const cmd = matchCommand(source, index);
      if (cmd) {
        result += cmd;
        index += cmd.length;
        continue;
      }
    }

    // Bare sqrt[...
    const prevChar = index > 0 ? source[index - 1] : "";
    if (
      (index === 0 || !/[A-Za-z0-9_\\]/.test(prevChar)) &&
      source.startsWith("sqrt[", index)
    ) {
      const firstBracket = readBracketPair(source, index + 4);
      if (firstBracket) {
        let afterFirst = firstBracket.end;
        while (afterFirst < len && /\s/.test(source[afterFirst])) afterFirst++;
        if (afterFirst < len && source[afterFirst] === "[") {
          const secondBracket = readBracketPair(source, afterFirst);
          if (secondBracket) {
            // Arity = 2 saturated! [index][radicand]
            const inner1 = firstBracket.inner.includes("sqrt[") ? normalizeChainedRoots(firstBracket.inner, autoSealCrashImmunity) : firstBracket.inner;
            const inner2 = secondBracket.inner.includes("sqrt[") ? normalizeChainedRoots(secondBracket.inner, autoSealCrashImmunity) : secondBracket.inner;
            result += `\\sqrt[${inner1}]{${inner2}}`;
            index = secondBracket.end;
            continue;
          } else if (autoSealCrashImmunity) {
            const inner1 = firstBracket.inner;
            const unclosed2 = source.slice(afterFirst + 1);
            result += `\\sqrt[${inner1}]{${unclosed2}}`;
            index = len;
            continue;
          }
        }
        // Single argument root [radicand]
        const inner1 = firstBracket.inner.includes("sqrt[") ? normalizeChainedRoots(firstBracket.inner, autoSealCrashImmunity) : firstBracket.inner;
        result += `\\sqrt{${inner1}}`;
        index = firstBracket.end;
        continue;
      } else if (autoSealCrashImmunity) {
        const unclosed = source.slice(index + 5);
        result += `\\sqrt{${unclosed}}`;
        index = len;
        continue;
      }
    }

    result += source[index];
    index++;
  }
  return result;
}

export interface FormattedMatrixResult {
  renderedRows: string;
  hasPartitions: boolean;
  colSpec: string;
}

/**
 * Parses and formats matrix row/cell content with depth shielding and vertical partition (|) awareness.
 */
function formatMatrixCells(
  inner: string,
  autoDetectNewlines: boolean = true,
  prefix?: string,
  padRaggedRows: boolean = true
): FormattedMatrixResult {
  const allRows: string[][][] = [];
  let currentRowSegments: string[][] = [];
  let currentSegment: string[] = [];
  let currentCell = "";
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  function flushCell() {
    currentSegment.push(currentCell.trim());
    currentCell = "";
  }

  function flushSegment() {
    flushCell();
    currentRowSegments.push(currentSegment);
    currentSegment = [];
  }

  function flushRow() {
    flushSegment();
    if (currentRowSegments.some((seg) => seg.some((c) => c.length > 0))) {
      allRows.push(currentRowSegments);
    }
    currentRowSegments = [];
  }

  let k = 0;
  while (k < inner.length) {
    const ch = inner[k];

    if (ch === "\\") {
      if (inner.startsWith("\\\\", k)) {
        if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
          flushRow();
          k += 2;
          continue;
        }
      }
      const subCmd = matchCommand(inner, k);
      const cmdLen = subCmd ? subCmd.length : 2;
      currentCell += inner.slice(k, k + cmdLen);
      k += cmdLen;
      continue;
    }

    if (ch === "(") parenDepth++;
    else if (ch === ")" && parenDepth > 0) parenDepth--;
    else if (ch === "{") braceDepth++;
    else if (ch === "}" && braceDepth > 0) braceDepth--;
    else if (ch === "[") bracketDepth++;
    else if (ch === "]" && bracketDepth > 0) bracketDepth--;

    if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      const isNewline = ch === "\n" || (ch === "\r" && inner[k + 1] === "\n");
      if (ch === ";" || (autoDetectNewlines && isNewline)) {
        flushRow();
        if (ch === "\r" && inner[k + 1] === "\n") k++;
        k++;
        continue;
      }
      if (ch === "|") {
        flushSegment();
        k++;
        continue;
      }
      if (ch === "," || ch === "&") {
        flushCell();
        k++;
        continue;
      }
    }

    currentCell += ch;
    k++;
  }

  if (currentCell.trim().length > 0 || currentSegment.length > 0 || currentRowSegments.length > 0) {
    flushRow();
  }

  const isAlignmentFamily =
    prefix === "align" ||
    prefix === "aligned" ||
    prefix === "split" ||
    prefix === "gather" ||
    prefix === "gathered" ||
    prefix === "multline" ||
    prefix === "equation" ||
    prefix === "cases" ||
    prefix === "dcases" ||
    prefix === "rcases";

  // Trim trailing empty cells in each segment of each row (from trailing commas/semicolons)
  for (const row of allRows) {
    for (let s = 0; s < row.length; s++) {
      let end = row[s].length;
      while (end > 0 && row[s][end - 1].length === 0) end--;
      row[s] = row[s].slice(0, end);
    }
  }

  // Ragged row padding: pad short rows up to maximum column count across all rows
  if (padRaggedRows && !isAlignmentFamily && allRows.length > 1) {
    const numSegments = Math.max(1, ...allRows.map((r) => r.length));
    for (let s = 0; s < numSegments; s++) {
      const maxCols = Math.max(
        1,
        ...allRows.map((r) => (r[s] ? r[s].length : 0))
      );
      for (const row of allRows) {
        if (!row[s]) {
          row[s] = [];
        }
        while (row[s].length < maxCols) {
          row[s].push("");
        }
      }
    }
  }

  const hasPartitions = allRows.some((row) => row.length > 1);

  // Compute column specification across partition segments
  const numSegments = Math.max(1, ...allRows.map((r) => r.length));
  const specParts: string[] = [];
  for (let s = 0; s < numSegments; s++) {
    const maxCols = Math.max(
      1,
      ...allRows.map((r) => (r[s] ? r[s].length : 0))
    );
    specParts.push("c".repeat(maxCols));
  }
  const colSpec = specParts.join("|");

  const renderedRows = allRows
    .map((row) => {
      const rowCells = row.flatMap((seg) => seg);
      let rowStr = rowCells.join(" & ").trim();
      // Preserve tight relation binding for aligned derivations (e.g. &= -> &= rather than & =)
      rowStr = rowStr.replace(/(?:^|\s)& (?=[=<>:~])/g, (m) => m.startsWith(" ") ? " &" : "&");
      return rowStr;
    })
    .filter((r) => r.length > 0)
    .join(" \\\\ ");

  return {
    renderedRows,
    hasPartitions,
    colSpec,
  };
}

function renderBracketMatrix(
  prefix: string,
  defaultEnv: string,
  formatted: FormattedMatrixResult
): string {
  if (!formatted.hasPartitions) {
    if (prefix === "cases") {
      return `\\begin{cases} ${formatted.renderedRows} \\end{cases}`;
    }
    if (prefix === "matrix") {
      return `\\begin{matrix} ${formatted.renderedRows} \\end{matrix}`;
    }
    const envName =
      prefix === "mat" ? defaultEnv : MATRIX_SUGAR_PREFIXES[prefix] || "matrix";
    return `\\begin{${envName}} ${formatted.renderedRows} \\end{${envName}}`;
  }

  // Augmented partitioned matrix with \begin{array}{<colSpec>}
  const envName =
    prefix === "mat" ? defaultEnv : MATRIX_SUGAR_PREFIXES[prefix] || "matrix";
  const { colSpec, renderedRows } = formatted;

  switch (envName) {
    case "pmatrix":
      return `\\left( \\begin{array}{${colSpec}} ${renderedRows} \\end{array} \\right)`;
    case "vmatrix":
      return `\\left| \\begin{array}{${colSpec}} ${renderedRows} \\end{array} \\right|`;
    case "Vmatrix":
      return `\\left\\| \\begin{array}{${colSpec}} ${renderedRows} \\end{array} \\right\\|`;
    case "Bmatrix":
      return `\\left\\{ \\begin{array}{${colSpec}} ${renderedRows} \\end{array} \\right\\}`;
    case "matrix":
      return `\\begin{array}{${colSpec}} ${renderedRows} \\end{array}`;
    case "bmatrix":
    default:
      return `\\left[ \\begin{array}{${colSpec}} ${renderedRows} \\end{array} \\right]`;
  }
}

function renderWrapperMatrix(
  wrapEnv: string,
  formatted: FormattedMatrixResult
): string {
  if (!formatted.hasPartitions) {
    return `\\begin{${wrapEnv}} ${formatted.renderedRows} \\end{${wrapEnv}}`;
  }
  const { colSpec, renderedRows } = formatted;
  switch (wrapEnv) {
    case "pmatrix":
      return `\\left( \\begin{array}{${colSpec}} ${renderedRows} \\end{array} \\right)`;
    case "vmatrix":
      return `\\left| \\begin{array}{${colSpec}} ${renderedRows} \\end{array} \\right|`;
    case "Vmatrix":
      return `\\left\\| \\begin{array}{${colSpec}} ${renderedRows} \\end{array} \\right\\|`;
    case "Bmatrix":
      return `\\left\\{ \\begin{array}{${colSpec}} ${renderedRows} \\end{array} \\right\\}`;
    case "matrix":
      return `\\begin{array}{${colSpec}} ${renderedRows} \\end{array}`;
    case "bmatrix":
    default:
      return `\\left[ \\begin{array}{${colSpec}} ${renderedRows} \\end{array} \\right]`;
  }
}

/**
 * Normalizes shift-free breathing-room matrices and delimiter-wrapped matrices:
 * - mat[1, 2; 3, 4] -> \begin{matrix}
 * - pmat[1, 2; 3, 4] -> \begin{pmatrix}
 * - bmat[1, 2; 3, 4] -> \begin{bmatrix}
 * - cmat[1, 2; 3, 4] / Bmat[...] -> \begin{Bmatrix}
 * - dmat[1, 2; 3, 4] / vmat[...] -> \begin{vmatrix}
 * - nmat[1, 2; 3, 4] / Vmat[...] -> \begin{Vmatrix}
 * - |mat[...]| -> \begin{vmatrix}
 * - ||mat[...]|| / \|mat[...]\| -> \begin{Vmatrix}
 * - \{mat[...]\} / \{dmat[...]\} -> \begin{Bmatrix}
 * - (mat[...]) -> \begin{pmatrix}
 * - [mat[...]] -> \begin{bmatrix}
 */
export function normalizeBracketMatrices(
  source: string,
  defaultEnv: string = "matrix",
  autoDetectNewlines: boolean = true,
  autoSealCrashImmunity: boolean = true,
  padRaggedRows: boolean = true
): string {
  let result = "";
  let index = 0;
  const len = source.length;

  while (index < len) {
    if (source[index] === "%") {
      const end = readCommentEnd(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }

    if (source[index] === "\\") {
      const verb = readVerbEnd(source, index);
      if (verb !== null) {
        result += source.slice(index, verb[0]);
        index = verb[0];
        continue;
      }
      const opaque = readOpaqueCommand(source, index);
      if (opaque) {
        result += opaque[0];
        index = opaque[1];
        continue;
      }
      // Check if this backslash starts an escaped wrapper like \| or \{
      if (!source.startsWith("\\|", index) && !source.startsWith("\\{", index)) {
        const isBackslashedMat = MATRIX_PREFIX_BACKSLASHED_RE.test(source.slice(index));
        if (!isBackslashedMat) {
          const cmd = matchCommand(source, index);
          if (cmd) {
            result += cmd;
            index += cmd.length;
            continue;
          }
        }
      }
    }

    // 1. Check delimiter-wrapped matrix shorthand:
    // ||mat[...]||, \|mat[...]\|, |mat[...]|, \{mat[...]\}, (mat[...]), [mat[...]]
    let wrapOpen: string | null = null;
    let wrapClose: string | null = null;
    let wrapEnv: string | null = null;

    if (source.startsWith("||", index)) {
      wrapOpen = "||";
      wrapClose = "||";
      wrapEnv = "Vmatrix";
    } else if (source.startsWith("\\|", index)) {
      wrapOpen = "\\|";
      wrapClose = "\\|";
      wrapEnv = "Vmatrix";
    } else if (source[index] === "|") {
      wrapOpen = "|";
      wrapClose = "|";
      wrapEnv = "vmatrix";
    } else if (source.startsWith("\\{", index)) {
      wrapOpen = "\\{";
      wrapClose = "\\}";
      wrapEnv = "Bmatrix";
    } else if (source[index] === "{" && (index === 0 || source[index - 1] !== "\\")) {
      wrapOpen = "{";
      wrapClose = "}";
      wrapEnv = "Bmatrix";
    } else if (source[index] === "(") {
      wrapOpen = "(";
      wrapClose = ")";
      wrapEnv = "pmatrix";
    } else if (source[index] === "[") {
      wrapOpen = "[";
      wrapClose = "]";
      wrapEnv = "bmatrix";
    }

    if (wrapOpen !== null && wrapClose !== null && wrapEnv !== null) {
      const afterOpen = source.slice(index + wrapOpen.length);
      const wrapMatMatch = afterOpen.match(MATRIX_PREFIX_WRAPPED_RE);
      if (wrapMatMatch) {
        const openChar = wrapMatMatch[2] || wrapMatMatch[1];
        const closeChar = openChar === "{" ? "}" : "]";
        const matStart = index + wrapOpen.length + wrapMatMatch[0].length - 1;
        const bracket = readDelimitedPair(source, matStart, openChar, closeChar);
        if (bracket) {
          const afterBracket = source.slice(bracket.end);
          const closeLeadWhitespace = afterBracket.match(/^\s*/)?.[0].length || 0;
          const targetSlice = afterBracket.slice(closeLeadWhitespace);
          if (targetSlice.startsWith(wrapClose)) {
            const formatted = formatMatrixCells(bracket.inner, autoDetectNewlines, wrapEnv, padRaggedRows);
            result += renderWrapperMatrix(wrapEnv, formatted);
            index = bracket.end + closeLeadWhitespace + wrapClose.length;
            continue;
          } else if (autoSealCrashImmunity) {
            const formatted = formatMatrixCells(bracket.inner, autoDetectNewlines, wrapEnv, padRaggedRows);
            result += renderWrapperMatrix(wrapEnv, formatted);
            index = bracket.end;
            continue;
          }
        } else if (autoSealCrashImmunity) {
          const unclosedInner = source.slice(matStart + 1);
          const formatted = formatMatrixCells(unclosedInner, autoDetectNewlines, wrapEnv, padRaggedRows);
          result += renderWrapperMatrix(wrapEnv, formatted);
          index = len;
          continue;
        }
      }
    }

    // 2. Unwrapped matrix prefix shorthand (supports both bare mat[...] and backslashed \mat[...]):
    const isBackslashedMat = source[index] === "\\";
    const matSliceStart = isBackslashedMat ? index + 1 : index;
    const prevChar = index > 0 ? source[index - 1] : "";
    if (isBackslashedMat || index === 0 || !/[A-Za-z0-9_\\]/.test(prevChar)) {
      const match = source.slice(matSliceStart).match(MATRIX_PREFIX_UNWRAPPED_RE);
      if (match) {
        const prefix = match[1];
        const openChar = match[2];
        const closeChar = openChar === "{" ? "}" : "]";
        const bracketStart = matSliceStart + match[0].length - 1;
        const bracket = readDelimitedPair(source, bracketStart, openChar, closeChar);
        if (bracket) {
          if (prefix === "abs") {
            const hasRows = bracket.inner.includes(";") || bracket.inner.includes("\\\\");
            if (hasRows) {
              const formatted = formatMatrixCells(bracket.inner, autoDetectNewlines, "dmat", padRaggedRows);
              result += renderBracketMatrix("dmat", defaultEnv, formatted);
            } else {
              result += `\\left| ${bracket.inner} \\right|`;
            }
          } else {
            const formatted = formatMatrixCells(bracket.inner, autoDetectNewlines, prefix, padRaggedRows);
            result += renderBracketMatrix(prefix, defaultEnv, formatted);
          }
          index = bracket.end;
          continue;
        } else if (autoSealCrashImmunity) {
          const unclosedInner = source.slice(bracketStart + 1);
          if (prefix === "abs") {
            const hasRows = unclosedInner.includes(";") || unclosedInner.includes("\\\\");
            if (hasRows) {
              const formatted = formatMatrixCells(unclosedInner, autoDetectNewlines, "dmat", padRaggedRows);
              result += renderBracketMatrix("dmat", defaultEnv, formatted);
            } else {
              result += `\\left| ${unclosedInner} \\right.`;
            }
          } else {
            const formatted = formatMatrixCells(unclosedInner, autoDetectNewlines, prefix, padRaggedRows);
            result += renderBracketMatrix(prefix, defaultEnv, formatted);
          }
          index = len;
          continue;
        }
      }
    }

    result += source[index];
    index++;
  }
  return result;
}

/**
 * Diagnostic matrix delimiter validator:
 * Validates column balance across rows in LaTeX matrix environments.
 * Non-blocking: returns ragged row indices without failing compilation.
 */
export function validateMatrixDelimiters(
  latex: string
): { isRagged: boolean; raggedRows: number[] } {
  const envMatch = latex.match(
    /\\begin\s*\{((?:p|b|B|v|V|small)?matrix)\}([\s\S]*?)\\end\s*\{\1\}/
  );
  if (!envMatch) return { isRagged: false, raggedRows: [] };

  const inner = envMatch[2];
  const rows = inner.split(/\\\\/);
  if (rows.length <= 1) return { isRagged: false, raggedRows: [] };

  const colCounts = rows.map((row) => {
    let count = 1;
    for (let i = 0; i < row.length; i++) {
      if (row[i] === "&") count++;
    }
    return count;
  });

  const expected = colCounts[0];
  const raggedRows: number[] = [];
  for (let i = 1; i < colCounts.length; i++) {
    if (colCounts[i] !== expected) {
      raggedRows.push(i + 1);
    }
  }

  return { isRagged: raggedRows.length > 0, raggedRows };
}

/**
 * Rectilinear matrix padding: pads short rows in LaTeX matrix environments with trailing '&'
 * up to the maximum column count across all rows.
 * Alignment chains (aligned, cases, split, etc.) are strictly exempted.
 */
export function padRaggedMatrixRows(latex: string): string {
  return latex.replace(
    /\\begin\s*\{((?:p|b|B|v|V|small)?matrix)\}([\s\S]*?)\\end\s*\{\1\}/g,
    (match: string, envName: string, inner: string) => {
      const rows = inner.split(/\\\\/);
      if (rows.length <= 1) return match;

      const rowAmpCounts = rows.map((row) => {
        let count = 0;
        let depth = 0;
        for (let i = 0; i < row.length; i++) {
          const ch = row[i];
          if (ch === "{" || ch === "[" || ch === "(") depth++;
          else if ((ch === "}" || ch === "]" || ch === ")") && depth > 0) depth--;
          else if (depth === 0 && ch === "&") count++;
        }
        return count;
      });

      const maxAmps = Math.max(...rowAmpCounts);
      if (maxAmps === 0 || rowAmpCounts.every((c) => c === maxAmps)) {
        return match;
      }

      const paddedRows = rows.map((row, idx) => {
        const diff = maxAmps - rowAmpCounts[idx];
        if (diff <= 0) return row;
        const trailingSpaces = row.match(/\s*$/)?.[0] || "";
        const trimmed = row.slice(0, row.length - trailingSpaces.length);
        return trimmed + " &".repeat(diff) + trailingSpaces;
      });

      return `\\begin{${envName}}${paddedRows.join("\\\\")}\\end{${envName}}`;
    }
  );
}

/**
 * Ergonomic matrix padding: adds extra '&' before the first column and at the end of the last row
 * to provide comfortable delimiter clearance so matrix parentheses do not cling to numbers.
 */
export function padMatrixEnvironment(source: string, padVectors: boolean = true): string {
  return source.replace(
    /\\begin\s*\{((?:p|b|B|v|V|small)?matrix)\}([\s\S]*?)\\end\s*\{\1\}/g,
    (match: string, envName: string, inner: string) => {
      if (!padVectors) {
        // If single-column vector (no & present), keep compact and bypass extra padding
        if (!inner.includes("&")) {
          return match;
        }
      }
      const rowRegex = /\\\\(?:\[[^\]]*\])?/g;
      let m: RegExpExecArray | null;
      let lastIndex = 0;
      const parts: { content: string; sep: string }[] = [];
      while ((m = rowRegex.exec(inner)) !== null) {
        parts.push({ content: inner.slice(lastIndex, m.index), sep: m[0] });
        lastIndex = m.index + m[0].length;
      }
      parts.push({ content: inner.slice(lastIndex), sep: "" });

      let lastNonEmptyIndex = -1;
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].content.trim()) {
          lastNonEmptyIndex = i;
          break;
        }
      }

      const padded = parts.map((part, index) => {
        let trimmed = part.content.trim();
        if (!trimmed) return part.content + part.sep;

        const leadMatch = part.content.match(/^\s*/);
        const trailMatch = part.content.match(/\s*$/);
        const lead = leadMatch ? leadMatch[0] : "";
        const trail = trailMatch ? trailMatch[0] : "";

        if (!trimmed.startsWith("&")) {
          trimmed = "& " + trimmed;
        }

        if (index === lastNonEmptyIndex && !trimmed.endsWith("&")) {
          trimmed = trimmed + " &";
        }

        return lead + trimmed + trail + part.sep;
      });

      return `\\begin{${envName}}${padded.join("")}\\end{${envName}}`;
    }
  );
}

export const SHIFT_FREE_ACCENTS_MAP: Record<string, string> = {
  hat: "\\hat",
  bar: "\\bar",
  dot: "\\dot",
  ddot: "\\ddot",
  tilde: "\\tilde",
  vec: "\\vec",
  check: "\\check",
};

/**
 * Normalizes shift-free single-bracket accents:
 * hat[x] -> \hat{x}, bar[x] -> \bar{x}, dot[x] -> \dot{x}, ddot[x] -> \ddot{x},
 * tilde[x] -> \tilde{x}, vec[x] -> \vec{x}, check[x] -> \check{x}
 * Also supports backslashed forms: \hat[x] -> \hat{x}
 */
export function normalizeShiftFreeAccents(source: string): string {
  let result = "";
  let index = 0;
  const len = source.length;

  while (index < len) {
    if (source[index] === "%") {
      const end = readCommentEnd(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }

    if (source[index] === "\\") {
      const verb = readVerbEnd(source, index);
      if (verb !== null) {
        result += source.slice(index, verb[0]);
        index = verb[0];
        continue;
      }
      const opaque = readOpaqueCommand(source, index);
      if (opaque) {
        result += opaque[0];
        index = opaque[1];
        continue;
      }
      const cmdMatch = source.slice(index + 1).match(/^(hat|bar|dot|ddot|tilde|vec|check)\s*\[/);
      if (cmdMatch) {
        const prefix = cmdMatch[1];
        const argStart = index + 1 + cmdMatch[0].length - 1;
        const bracket = readDelimitedPair(source, argStart, "[", "]");
        if (bracket) {
          const normInner = normalizeShiftFreeAccents(bracket.inner);
          result += `\\${prefix}{${normInner}}`;
          index = bracket.end;
          continue;
        }
      }
      const cmd = matchCommand(source, index);
      if (cmd) {
        result += cmd;
        index += cmd.length;
        continue;
      }
    }

    const prevChar = index > 0 ? source[index - 1] : "";
    if (index === 0 || !/[A-Za-z0-9_\\]/.test(prevChar)) {
      const match = source.slice(index).match(/^(hat|bar|dot|ddot|tilde|vec|check)\s*\[/);
      if (match) {
        const prefix = match[1];
        const argStart = index + match[0].length - 1;
        const bracket = readDelimitedPair(source, argStart, "[", "]");
        if (bracket) {
          const macro = SHIFT_FREE_ACCENTS_MAP[prefix];
          const normInner = normalizeShiftFreeAccents(bracket.inner);
          result += `${macro}{${normInner}}`;
          index = bracket.end;
          continue;
        }
      }
    }

    result += source[index];
    index++;
  }
  return result;
}

/**
 * Normalizes shift-free bracketed fraction arguments:
 * \frac[a][b] -> \frac{a}{b}, frac[a][b] -> \frac{a}{b}, dfrac[a][b] -> \dfrac{a}{b}
 */
export function normalizeBracketFractions(
  source: string,
  autoSealCrashImmunity: boolean = true
): string {
  let result = "";
  let index = 0;
  const len = source.length;

  while (index < len) {
    if (source[index] === "%") {
      const end = readCommentEnd(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }

    if (source[index] === "\\") {
      const verb = readVerbEnd(source, index);
      if (verb !== null) {
        result += source.slice(index, verb[0]);
        index = verb[0];
        continue;
      }
      const opaque = readOpaqueCommand(source, index);
      if (opaque) {
        result += opaque[0];
        index = opaque[1];
        continue;
      }
      const fracMatch = source.slice(index).match(/^\\(d?frac)\s*\[/);
      if (fracMatch) {
        const macro = fracMatch[1];
        const firstStart = index + fracMatch[0].length - 1;
        const firstBracket = readDelimitedPair(source, firstStart, "[", "]");
        if (firstBracket) {
          let afterFirst = firstBracket.end;
          while (afterFirst < len && /\s/.test(source[afterFirst])) afterFirst++;
          if (afterFirst < len && source[afterFirst] === "[") {
            const secondBracket = readDelimitedPair(source, afterFirst, "[", "]");
            if (secondBracket) {
              result += `\\${macro}{${firstBracket.inner}}{${secondBracket.inner}}`;
              index = secondBracket.end;
              continue;
            } else if (autoSealCrashImmunity) {
              const unclosedSecond = source.slice(afterFirst + 1);
              result += `\\${macro}{${firstBracket.inner}}{${unclosedSecond}}`;
              index = len;
              continue;
            }
          }
        } else if (autoSealCrashImmunity) {
          const unclosedFirst = source.slice(firstStart + 1);
          result += `\\${macro}{${unclosedFirst}}{}`;
          index = len;
          continue;
        }
      }
      const cmd = matchCommand(source, index);
      if (cmd) {
        result += cmd;
        index += cmd.length;
        continue;
      }
    }

    const prevChar = index > 0 ? source[index - 1] : "";
    if (index === 0 || !/[A-Za-z0-9_\\]/.test(prevChar)) {
      const fracMatch = source.slice(index).match(/^(d?frac)\s*\[/);
      if (fracMatch) {
        const macro = fracMatch[1];
        const firstStart = index + fracMatch[0].length - 1;
        const firstBracket = readDelimitedPair(source, firstStart, "[", "]");
        if (firstBracket) {
          let afterFirst = firstBracket.end;
          while (afterFirst < len && /\s/.test(source[afterFirst])) afterFirst++;
          if (afterFirst < len && source[afterFirst] === "[") {
            const secondBracket = readDelimitedPair(source, afterFirst, "[", "]");
            if (secondBracket) {
              result += `\\${macro}{${firstBracket.inner}}{${secondBracket.inner}}`;
              index = secondBracket.end;
              continue;
            } else if (autoSealCrashImmunity) {
              const unclosedSecond = source.slice(afterFirst + 1);
              result += `\\${macro}{${firstBracket.inner}}{${unclosedSecond}}`;
              index = len;
              continue;
            }
          }
        } else if (autoSealCrashImmunity) {
          const unclosedFirst = source.slice(firstStart + 1);
          result += `\\${macro}{${unclosedFirst}}{}`;
          index = len;
          continue;
        }
      }
    }

    result += source[index];
    index++;
  }
  return result;
}

/**
 * Master mathematical syntax normalizer executing in strict pipeline dependency order:
 * 1. Zero-width character sanitization (\u200B, \uFEFF, etc.)
 * 2. Quoted Text Isolation ("text" -> \text{text})
 * 3. Typst Font Shortcuts (bb(R) -> \mathbb{R}, cal(L) -> \mathcal{L})
 * 4. Typst Arrow Normalization (-> -> \to, => -> \implies)
 * 5. Infix Inverted Division ({a+b}/{c+d} -> \frac{a+b}{c+d}, 12 / 3 -> \frac{12}{3})
 * 6. Bare Greek & Math Constants (alpha -> \alpha, pi -> \pi, oo -> \infty)
 * 7. Typst Auto-Scaling Delimiters (( \frac{a}{b} ) -> \left( \frac{a}{b} \right), | \frac{a}{b} | -> \left| \frac{a}{b} \right|)
 * 8. Smart Whitespace & Fraction Braces Normalization (\frac 12 3 -> \frac{12}{3})
 * 9. Ergonomic Matrix Padding (adding extra & clearance for comfortable typing)
 * 10. Physical Unit Spacing Normalization (12 m/s^2 -> 12 \; m/s^2)
 * 11. Compiler Crash Immunity (Auto-sealing unclosed { and \left)
 */
export function normalizeMathSyntax(
  source: string,
  options?: ColorMathOptions
): string {
  let text = source;
  if (/[\u200B-\u200D\uFEFF]/.test(text)) {
    text = text.replace(/[\u200B-\u200D\uFEFF]/g, "");
  }
  if (/[\u0300-\u036F\u20D0-\u20FF]/.test(text)) {
    text = text.replace(/([A-Za-z])\u0302/g, "\\hat{$1}");
    text = text.replace(/([A-Za-z])\u0304/g, "\\bar{$1}");
    text = text.replace(/([A-Za-z])\u0307/g, "\\dot{$1}");
    text = text.replace(/([A-Za-z])\u0308/g, "\\ddot{$1}");
    text = text.replace(/([A-Za-z])\u0303/g, "\\tilde{$1}");
    text = text.replace(/([A-Za-z])\u20D7/g, "\\vec{$1}");
    text = text.replace(/([A-Za-z])\u030C/g, "\\check{$1}");
  }
  if (
    options?.speedSyntacticSugar !== false &&
    options?.sugarNumberBoundUnits !== false &&
    /\d/.test(text)
  ) {
    text = normalizeNumberBoundUnits(text);
  }
  if (
    options?.speedSyntacticSugar !== false &&
    options?.sugarQuotedStrings !== false &&
    text.includes('"')
  ) {
    text = normalizeQuotedStrings(text);
  }
  if (/(?:^|[^A-Za-z0-9_\\])\\?(?:bb|cal|bold|frak|scr|rm|sf|tt|text|mathbb|mathcal|mathbf|mathfrak|mathscr|mathrm|mathsf|mathtt)\s*([{[(])/.test(text)) {
    text = normalizeTypstFontShortcuts(text);
  }
  if (
    options?.speedSyntacticSugar !== false &&
    options?.sugarBracketMatrices !== false &&
    CONSTRUCTOR_GATING_RE.test(text)
  ) {
    const defaultEnv = options?.defaultMatrixEnvironment || "matrix";
    const autoNewlines = options?.autoDetectNewlinesAsMatrixRows !== false;
    const autoSeal = options?.crashImmunityAutoSeal !== false;
    const padRagged = options?.raggedRowDiagnostics !== false;
    text = normalizeBracketMatrices(text, defaultEnv, autoNewlines, autoSeal, padRagged);
  }
  if (
    options?.speedSyntacticSugar !== false &&
    /(?:^|[^A-Za-z0-9_\\])\\?(?:hat|bar|dot|ddot|tilde|vec|check)\s*\[/.test(text)
  ) {
    text = normalizeShiftFreeAccents(text);
  }
  if (
    options?.speedSyntacticSugar !== false &&
    /(?:^|[^A-Za-z0-9_\\])\\?(?:d?frac)\s*\[/.test(text)
  ) {
    const autoSeal = options?.crashImmunityAutoSeal !== false;
    text = normalizeBracketFractions(text, autoSeal);
  }
  if (
    options?.speedSyntacticSugar !== false &&
    options?.sugarChainedRoots !== false &&
    (text.includes("sqrt[") || text.includes("\\sqrt["))
  ) {
    const autoSeal = options?.crashImmunityAutoSeal !== false;
    text = normalizeChainedRoots(text, autoSeal);
  }
  if (
    options?.speedSyntacticSugar !== false &&
    options?.sugarAsciiEllipses !== false &&
    text.includes("...")
  ) {
    text = normalizeAsciiEllipses(text);
  }
  if (
    options?.speedSyntacticSugar !== false &&
    options?.sugarAsciiOperators !== false &&
    (text.includes("-") ||
      text.includes("=") ||
      text.includes(">") ||
      text.includes("<") ||
      text.includes("!") ||
      text.includes(":") ||
      text.includes("+") ||
      text.includes("~") ||
      text.includes("|") ||
      text.includes("^") ||
      text.includes(".") ||
      text.includes("xx") ||
      text.includes("vv") ||
      text.includes("uu") ||
      text.includes("nn") ||
      text.includes("ox") ||
      text.includes("o+") ||
      text.includes("o."))
  ) {
    text = normalizeAsciiOperators(text);
  }
  if (text.includes("/")) {
    text = normalizeInfixDivision(text, options?.requireBracesForSlashDivision);
  }
  if (/[a-zA-Z]/.test(text)) {
    if (options?.bareGreekRequiresBackslash !== true) {
      text = normalizeBareGreekInMath(text);
    }
    text = normalizeBareFunctions(text);
  }
  if (options?.autoScaleDelimiters !== false && (text.includes("(") || text.includes("[") || text.includes("|"))) {
    text = normalizeAutoScaledDelimiters(text);
  }
  text = normalizeLatexBraces(text);
  if (options?.raggedRowDiagnostics !== false && text.includes("\\begin") && text.includes("matrix")) {
    text = padRaggedMatrixRows(text);
  }
  if (options?.padMatrixPadding === true && text.includes("\\begin") && text.includes("matrix")) {
    text = padMatrixEnvironment(text, options?.padMatrixVectors !== false);
  }
  if (options?.colorUnits === true && /\d/.test(text)) {
    text = normalizePhysicalUnitSpacing(text, options);
  }
  if (options?.crashImmunityAutoSeal !== false) {
    text = autoSealUnclosedDelimiters(text, options?.crashImmunityAutoSeal === true);
  }
  return text;
}

/**
 * SIMD-accelerated O(K) comment masking (where K is the number of comment lines, not N characters):
 * Uses native C++/SIMD indexOf to jump directly across comments, blanking out comment bodies
 * (% ... \n) with space characters (' ') via " ".repeat(len).
 * Preserves exact character offsets and string length while completely shielding downstream
 * tokenizers, parsers, and regex engines from executing inside comments.
 */
const HTML_ATTR_WRAPPER_COMMANDS = new Set([
  "\\class",
  "\\cssId",
  "\\style",
  "\\data",
  "\\href",
  "\\htmlClass",
  "\\htmlId",
  "\\htmlStyle",
  "\\htmlData",
]);

function maskHtmlAttributeMacros(text: string): string {
  let result = "";
  let index = 0;
  const len = text.length;
  while (index < len) {
    if (text[index] === "\\") {
      const cmd = matchCommand(text, index);
      if (cmd && HTML_ATTR_WRAPPER_COMMANDS.has(cmd)) {
        let cur = index + cmd.length;
        while (cur < len && /\s/.test(text[cur])) cur++;
        if (cur < len && text[cur] === "{") {
          const braced = readBraced(text, cur);
          if (braced) {
            const innerLen = braced[0].length - 2;
            result += text.slice(index, cur + 1) + (innerLen > 0 ? " ".repeat(innerLen) : "") + "}";
            index = braced[1];
            continue;
          }
        }
      }
      if (cmd) {
        result += cmd;
        index += cmd.length;
        continue;
      }
    }
    result += text[index];
    index++;
  }
  return result;
}

export function maskComments(text: string): string {
  const hasAttrMacro =
    text.includes("\\class") ||
    text.includes("\\cssId") ||
    text.includes("\\style") ||
    text.includes("\\data") ||
    text.includes("\\href") ||
    text.includes("\\html");
  if (!text.includes("%")) {
    return hasAttrMacro ? maskHtmlAttributeMacros(text) : text;
  }
  let result = "";
  let cursor = 0;
  const len = text.length;

  while (cursor < len) {
    const percentIdx = text.indexOf("%", cursor);
    if (percentIdx === -1) {
      result += text.slice(cursor);
      break;
    }

    result += text.slice(cursor, percentIdx);

    // Check if % is escaped by an odd number of preceding backslashes
    let backslashCount = 0;
    let b = percentIdx - 1;
    while (b >= 0 && text.charCodeAt(b) === 92 /* '\\' */) {
      backslashCount++;
      b--;
    }

    if (backslashCount % 2 === 1) {
      // Escaped \% -> keep verbatim
      result += "%";
      cursor = percentIdx + 1;
    } else {
      // True unescaped comment -> keep '%' and blank out body up to \r or \n with spaces
      result += "%";
      let endOfLine = text.indexOf("\n", percentIdx + 1);
      if (endOfLine === -1) {
        endOfLine = len;
      }
      // If line ends with \r\n, do not blank out \r so CRLF line termination remains intact
      let commentBodyEnd = endOfLine;
      if (commentBodyEnd > percentIdx + 1 && text.charCodeAt(commentBodyEnd - 1) === 13 /* '\r' */) {
        commentBodyEnd--;
      }
      // Also handle standalone \r if earlier than \n
      const crIdx = text.indexOf("\r", percentIdx + 1);
      if (crIdx !== -1 && crIdx < commentBodyEnd) {
        commentBodyEnd = crIdx;
      }

      const commentLen = commentBodyEnd - (percentIdx + 1);
      if (commentLen > 0) {
        result += " ".repeat(commentLen);
      }
      cursor = commentBodyEnd;
    }
  }
  return hasAttrMacro ? maskHtmlAttributeMacros(result) : result;
}




