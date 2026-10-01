import type { ColorMathOptions } from "../config";
import { findUnitSpans } from "../parsers/units";

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

function readSingleMacroArg(
  text: string,
  start: number,
  allowPostfix: boolean = false
): ParsedMacroArg | null {
  const index = skipIgnorableWhitespace(text, start);
  if (index >= text.length) return null;

  // Cell boundary and delimiter hard-stops: bare '&', '\\' (newline), or '$' cannot be arguments
  if (text[index] === "&" || text[index] === "$" || text.startsWith("\\\\", index)) {
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
      }

      if (!base) {
        // Check if command is followed by parenthesized argument: e.g. \sin(x) or \sin^2(x)
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
    while (j < text.length && /[0-9]/.test(text[j])) {
      j++;
    }
    // Only allow monomial chunking (e.g. 2x) if preceded by whitespace and followed by a single lowercase variable
    if (start < index && j < text.length && /^[a-z](?![A-Za-z0-9])/.test(text.slice(j))) {
      j++;
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
    } else if (BARE_GREEK_AND_CONSTANTS[word]) {
      base = {
        raw: word,
        inner: word,
        end: j,
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
]);

/**
 * Normalizes unbraced arguments in LaTeX expressions (e.g. \frac2L -> \frac{2}{L}, \sqrt V -> \sqrt{V},
 * \frac VI -> \frac{V}{I}, \frac hp -> \frac{h}{p}, E_n -> E_{n}, x^2 -> x^{2}).
 * This guarantees that when color wrappers like \textcolor are subsequently applied,
 * LaTeX macro parsing never fails due to unbraced single-token arguments.
 */
export function normalizeLatexBraces(source: string): string {
  let result = "";
  let index = 0;

  while (index < source.length) {
    if (source[index] === "%") {
      const end = readCommentEnd(source, index);
      result += source.slice(index, end);
      index = end;
      continue;
    }

    if (source[index] === "^" || source[index] === "_") {
      const marker = source[index];
      const arg = readSingleMacroArg(source, index + 1);
      if (arg) {
        const normInner = arg.braced
          ? normalizeLatexBraces(arg.inner)
          : normalizeLatexBraces(arg.raw);
        result += `${marker}{${normInner}}`;
        index = arg.end;
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

const TYPST_FONT_MAP: Record<string, string> = {
  bb: "\\mathbb",
  cal: "\\mathcal",
  bold: "\\mathbf",
  frak: "\\mathfrak",
  scr: "\\mathscr",
};

const BARE_GREEK_AND_CONSTANTS: Record<string, string> = {
  alpha: "\\alpha",
  beta: "\\beta",
  gamma: "\\gamma",
  delta: "\\delta",
  epsilon: "\\epsilon",
  zeta: "\\zeta",
  eta: "\\eta",
  theta: "\\theta",
  iota: "\\iota",
  kappa: "\\kappa",
  lambda: "\\lambda",
  mu: "\\mu",
  nu: "\\nu",
  xi: "\\xi",
  pi: "\\pi",
  rho: "\\rho",
  sigma: "\\sigma",
  tau: "\\tau",
  upsilon: "\\upsilon",
  phi: "\\phi",
  chi: "\\chi",
  psi: "\\psi",
  omega: "\\omega",
  varepsilon: "\\varepsilon",
  vartheta: "\\vartheta",
  varpi: "\\varpi",
  varrho: "\\varrho",
  varsigma: "\\varsigma",
  varphi: "\\varphi",
  Gamma: "\\Gamma",
  Delta: "\\Delta",
  Theta: "\\Theta",
  Lambda: "\\Lambda",
  Xi: "\\Xi",
  Pi: "\\Pi",
  Sigma: "\\Sigma",
  Upsilon: "\\Upsilon",
  Phi: "\\Phi",
  Psi: "\\Psi",
  Omega: "\\Omega",
  oo: "\\infty",
  hbar: "\\hbar",
  nabla: "\\nabla",
  partial: "\\partial",
  ell: "\\ell",
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
      }
    }

    result += source[index];
    index++;
  }

  return result;
}

/**
 * Normalizes Typst font shortcuts: bb(R) -> \mathbb{R}, cal(L) -> \mathcal{L},
 * bold(f(x)) -> \mathbf{f(x)}, frak(g) -> \mathfrak{g}, scr(F) -> \mathscr{F}.
 * Uses balanced parenthesis scanning to preserve nested arguments.
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

    const prevChar = index > 0 ? source[index - 1] : "";
    if (index === 0 || !/[A-Za-z0-9_\\]/.test(prevChar)) {
      const match = source.slice(index).match(/^(bb|cal|bold|frak|scr)\s*\(/);
      if (match) {
        const prefix = match[1];
        const parenStart = index + match[0].length - 1;
        let depth = 1;
        let j = parenStart + 1;
        while (j < source.length && depth > 0) {
          if (source[j] === "%") {
            j = readCommentEnd(source, j);
            continue;
          }
          if (source[j] === "\\") {
            const cmd = matchCommand(source, j);
            j += cmd ? cmd.length : 1;
            continue;
          }
          if (source[j] === "(") depth++;
          else if (source[j] === ")") depth--;
          j++;
        }

        if (depth === 0) {
          const innerArg = source.slice(parenStart + 1, j - 1);
          const macro = TYPST_FONT_MAP[prefix];
          const normInner = normalizeTypstFontShortcuts(innerArg);
          result += `${macro}{${normInner}}`;
          index = j;
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

      if (result[index] === "{") {
        // Must NOT be a macro argument like \text{W} or \mathrm{X}
        const isMacroArg = /\\[A-Za-z]+$/.test(result.slice(0, index));
        if (isMacroArg) {
          const braced = readBraced(result, index);
          index = braced ? braced[1] : index + 1;
          continue;
        }

        const numBraced = readBraced(result, index);
        if (numBraced) {
          let afterNum = skipIgnorableWhitespace(result, numBraced[1]);
          if (afterNum < result.length && result[afterNum] === "/") {
            let afterSlash = skipIgnorableWhitespace(result, afterNum + 1);
            if (afterSlash < result.length) {
              const denArg = readSingleMacroArg(result, afterSlash, false);
              if (denArg) {
                const numInner = numBraced[0].slice(1, -1);
                const denInner = denArg.braced ? denArg.inner : denArg.raw;
                const replacement = `\\frac{${numInner}}{${denInner}}`;
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

    // Check for bare word boundary
    const prevChar = index > 0 ? source[index - 1] : "";
    if (index === 0 || !/[A-Za-z0-9_\\]/.test(prevChar)) {
      // Check for 'oo' (infinity)
      if (
        source.startsWith("oo", index) &&
        (index + 2 === source.length || !/[A-Za-z0-9]/.test(source[index + 2]))
      ) {
        result += "\\infty";
        index += 2;
        continue;
      }

      // Check for alphabetical word
      if (/[A-Za-z]/.test(source[index])) {
        let j = index;
        while (j < source.length && /[A-Za-z]/.test(source[j])) {
          j++;
        }
        const word = source.slice(index, j);
        const nextChar = j < source.length ? source[j] : "";
        if (!/[A-Za-z0-9]/.test(nextChar) && BARE_GREEK_AND_CONSTANTS[word]) {
          result += BARE_GREEK_AND_CONSTANTS[word];
          index = j;
          continue;
        }
      }
    }

    result += source[index];
    index++;
  }

  return result;
}

const TALL_MATH_PATTERN =
  /\\(?:frac|dfrac|tfrac|cfrac|binom|dbinom|tbinom|sum|prod|coprod|bigcup|bigcap|bigsqcup|bigvee|bigwedge|bigoplus|bigotimes|int|iint|iiint|oint|smallint|stackrel|overset|underset|atop|sqrt)(?![A-Za-z])|\\begin\s*\{(?:matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|aligned|cases|array|split|gather)\}/;

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
    return /\\(?:right|bigr|Bigr|biggr|Biggr|big|Big|bigg|Bigg)\s*$/.test(before);
  } else {
    return /\\(?:left|bigl|Bigl|biggl|Biggl|big|Big|bigg|Bigg)\s*$/.test(before);
  }
}

/**
 * Typst-Style Auto-Scaling Delimiters:
 * Automatically scales balanced `( ... )`, `[ ... ]`, `\{ ... \}`, and paired `| ... |` / `\| ... \|` with `\left` and `\right`
 * whenever the interior content contains tall mathematical structures (fractions, sums, integrals, matrices).
 */
export function normalizeAutoScaledDelimiters(source: string): string {
  interface DelimNode {
    type: "(" | "[" | "{" | "|" | "\\|";
    start: number;
    end: number;
    sized: boolean;
  }

  const stack: DelimNode[] = [];
  interface Replacement {
    start: number;
    end: number;
    replacement: string;
  }
  const replacements: Replacement[] = [];

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

    if (source[index] === "\\") {
      const verb = readVerbEnd(source, index);
      if (verb !== null) {
        index = verb[0];
        continue;
      }

      const cmd = matchCommand(source, index);
      if (cmd && OPAQUE_TEXT_COMMANDS.has(cmd)) {
        const braced = readBraced(source, index + cmd.length);
        if (braced) {
          index = braced[1];
          continue;
        }
      }

      // Check escaped \{ or \}
      if (source.startsWith("\\{", index)) {
        const sized = isDelimSized(source, index, false);
        stack.push({ type: "{", start: index, end: index + 2, sized });
        index += 2;
        continue;
      }
      if (source.startsWith("\\}", index)) {
        const sized = isDelimSized(source, index, true);
        // Pop any unclosed lone vertical bars inside
        while (stack.length > 0 && (stack[stack.length - 1].type === "|" || stack[stack.length - 1].type === "\\|")) {
          stack.pop();
        }
        if (stack.length > 0 && stack[stack.length - 1].type === "{") {
          const open = stack.pop()!;
          if (!open.sized && !sized) {
            const inner = source.slice(open.end, index);
            if (TALL_MATH_PATTERN.test(inner)) {
              replacements.push({ start: index, end: index + 2, replacement: "\\right\\}" });
              replacements.push({ start: open.start, end: open.end, replacement: "\\left\\{" });
            }
          }
        }
        index += 2;
        continue;
      }

      // Check double vertical bar \|
      if (source.startsWith("\\|", index)) {
        const sized = isDelimSized(source, index, false);
        if (stack.length > 0 && stack[stack.length - 1].type === "\\|") {
          const open = stack.pop()!;
          if (!open.sized && !sized) {
            const inner = source.slice(open.end, index);
            if (TALL_MATH_PATTERN.test(inner)) {
              replacements.push({ start: index, end: index + 2, replacement: "\\right\\|" });
              replacements.push({ start: open.start, end: open.end, replacement: "\\left\\|" });
            }
          }
        } else {
          stack.push({ type: "\\|", start: index, end: index + 2, sized });
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
          (stack[stack.length - 1].type === "|" || stack[stack.length - 1].type === "\\|")
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
        (stack[stack.length - 1].type === "|" || stack[stack.length - 1].type === "\\|")
      ) {
        stack.pop();
      }
    }

    // Check single vertical bar |
    if (source[index] === "|") {
      const sized = isDelimSized(source, index, false);
      if (stack.length > 0 && stack[stack.length - 1].type === "|") {
        const open = stack.pop()!;
        if (!open.sized && !sized) {
          const inner = source.slice(open.end, index);
          if (TALL_MATH_PATTERN.test(inner)) {
            replacements.push({ start: index, end: index + 1, replacement: "\\right|" });
            replacements.push({ start: open.start, end: open.end, replacement: "\\left|" });
          }
        }
      } else {
        stack.push({ type: "|", start: index, end: index + 1, sized });
      }
      index++;
      continue;
    }

    if (source[index] === "(" || source[index] === "[") {
      const char = source[index] as "(" | "[";
      const sized = isDelimSized(source, index, false);
      stack.push({ type: char, start: index, end: index + 1, sized });
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
      if (stack.length > 0 && stack[stack.length - 1].type === matchType) {
        const open = stack.pop()!;
        if (!open.sized && !sized) {
          const inner = source.slice(open.end, index);
          if (TALL_MATH_PATTERN.test(inner)) {
            replacements.push({
              start: index,
              end: index + 1,
              replacement: char === ")" ? "\\right)" : "\\right]",
            });
            replacements.push({
              start: open.start,
              end: open.end,
              replacement: open.type === "(" ? "\\left(" : "\\left[",
            });
          }
        }
      }
      index++;
      continue;
    }

    index++;
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
export function autoSealUnclosedDelimiters(source: string): string {
  let openBraceCount = 0;
  let openLeftCount = 0;
  let index = 0;

  while (index < source.length) {
    if (source[index] === "%") {
      index = readCommentEnd(source, index);
      continue;
    }

    if (source.charCodeAt(index) === 34) {
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

    if (source[index] === "\\") {
      const verb = readVerbEnd(source, index);
      if (verb !== null) {
        index = verb[0];
        continue;
      }

      if (
        source.startsWith("\\left", index) &&
        (index + 5 === source.length || !/[A-Za-z]/.test(source[index + 5]))
      ) {
        openLeftCount++;
        index += 5;
        continue;
      }

      if (
        source.startsWith("\\right", index) &&
        (index + 6 === source.length || !/[A-Za-z]/.test(source[index + 6]))
      ) {
        if (openLeftCount > 0) openLeftCount--;
        index += 6;
        continue;
      }

      if (source.startsWith("\\{", index) || source.startsWith("\\}", index)) {
        index += 2;
        continue;
      }

      const cmd = matchCommand(source, index);
      index += cmd ? cmd.length : 1;
      continue;
    }

    if (source[index] === "{") {
      openBraceCount++;
    } else if (source[index] === "}") {
      if (openBraceCount > 0) openBraceCount--;
    }

    index++;
  }

  let result = source;
  if (openBraceCount > 0) {
    result += "}".repeat(openBraceCount);
  }
  if (openLeftCount > 0) {
    result += " \\right.".repeat(openLeftCount);
  }

  return result;
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

/**
 * Master mathematical syntax normalizer executing in strict pipeline dependency order:
 * 1. Quoted Text Isolation ("text" -> \text{text})
 * 2. Typst Font Shortcuts (bb(R) -> \mathbb{R}, cal(L) -> \mathcal{L})
 * 3. Infix Inverted Division ({a+b}/{c+d} -> \frac{a+b}{c+d}, 12 / 3 -> \frac{12}{3})
 * 4. Bare Greek & Math Constants (alpha -> \alpha, pi -> \pi, oo -> \infty)
 * 5. Typst Auto-Scaling Delimiters (( \frac{a}{b} ) -> \left( \frac{a}{b} \right), | \frac{a}{b} | -> \left| \frac{a}{b} \right|)
 * 6. Smart Whitespace & Fraction Braces Normalization (\frac 12 3 -> \frac{12}{3})
 * 7. Physical Unit Spacing Normalization (12 m/s^2 -> 12 \; m/s^2)
 * 8. Compiler Crash Immunity (Auto-sealing unclosed { and \left)
 */
export function normalizeMathSyntax(
  source: string,
  options?: ColorMathOptions
): string {
  let text = normalizeQuotedStrings(source);
  text = normalizeTypstFontShortcuts(text);
  text = normalizeInfixDivision(text, options?.requireBracesForSlashDivision);
  text = normalizeBareGreekInMath(text);
  if (options?.autoScaleDelimiters !== false) {
    text = normalizeAutoScaledDelimiters(text);
  }
  text = normalizeLatexBraces(text);
  if (options?.colorUnits === true) {
    text = normalizePhysicalUnitSpacing(text, options);
  }
  if (options?.crashImmunityAutoSeal === true) {
    text = autoSealUnclosedDelimiters(text);
  }
  return text;
}



