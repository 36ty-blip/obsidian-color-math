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
        base = {
          raw: cmd,
          inner: cmd,
          end: index + cmd.length,
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
              const norm1 = arg1.braced
                ? normalizeLatexBraces(arg1.inner)
                : normalizeLatexBraces(arg1.raw);
              const norm2 = arg2.braced
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


