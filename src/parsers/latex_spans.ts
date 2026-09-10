// src/parsers/latex_spans.ts

export const STYLE_MACROS = new Set([
  "mathbf",
  "mathcal",
  "mathbb",
  "mathrm",
  "mathit",
  "mathsf",
  "mathtt",
  "boldsymbol",
  "mathfrak",
  "pmb",
  "operatorname",
  "text",
  "textbf",
  "textit",
  "textrm",
  "texttt",
]);

export const FUNCTION_MACROS = new Set([
  "Tr",
  "arccos",
  "arcsin",
  "arctan",
  "cos",
  "cosh",
  "det",
  "exp",
  "ln",
  "log",
  "max",
  "min",
  "sec",
  "sin",
  "sinh",
  "sqrt",
  "sup",
  "tan",
  "tanh",
  "tr",
  "trace",
  "operatorname",
]);

export const OPERATOR_COMMANDS = new Set([
  "bigcap",
  "bigcup",
  "bigoplus",
  "bigotimes",
  "bigsqcup",
  "bigvee",
  "bigwedge",
  "cdot",
  "coprod",
  "int",
  "iint",
  "iiint",
  "inf",
  "lim",
  "max",
  "min",
  "oint",
  "otimes",
  "prod",
  "sum",
  "sup",
  "times",
]);

export const NON_OPERAND_COMMANDS = new Set([
  "!",
  ",",
  ":",
  ";",
  "\\",
  "approx",
  "atop",
  "choose",
  "cap",
  "displaystyle",
  "displaylimits",
  "emptyset",
  "end",
  "equiv",
  "Leftarrow",
  "Leftrightarrow",
  "Rightarrow",
  "geq",
  "in",
  "leq",
  "leftarrow",
  "leftrightarrow",
  "limits",
  "longleftarrow",
  "longrightarrow",
  "mapsto",
  "middle",
  "mp",
  "neq",
  "nolimits",
  "notin",
  "over",
  "pm",
  "propto",
  "quad",
  "qquad",
  "right",
  "rVert",
  "scriptstyle",
  "scriptscriptstyle",
  "sim",
  "setminus",
  "subset",
  "subseteq",
  "supset",
  "supseteq",
  "to",
  "textstyle",
  "cup",
  "rightarrow",
]);

export const UNARY_MACROS = new Set([
  "acute",
  "bar",
  "breve",
  "check",
  "ddot",
  "dot",
  "grave",
  "hat",
  "mathring",
  "overline",
  "tilde",
  "underline",
  "vec",
  "widehat",
  "widetilde",
]);

export const SYMBOL_MACROS = new Set([
  "Delta",
  "Gamma",
  "Im",
  "Lambda",
  "Omega",
  "Phi",
  "Pi",
  "Psi",
  "Re",
  "Sigma",
  "Theta",
  "Upsilon",
  "Xi",
  "aleph",
  "alpha",
  "beta",
  "bot",
  "chi",
  "delta",
  "ell",
  "epsilon",
  "eta",
  "gamma",
  "hbar",
  "imath",
  "infty",
  "iota",
  "jmath",
  "kappa",
  "lambda",
  "mu",
  "nabla",
  "nu",
  "omega",
  "partial",
  "perp",
  "phi",
  "pi",
  "psi",
  "rho",
  "sigma",
  "tau",
  "theta",
  "top",
  "upsilon",
  "varepsilon",
  "varphi",
  "varpi",
  "varrho",
  "varsigma",
  "vartheta",
  "xi",
  "zeta",
]);

export const DELIMITER_SIZE_COMMANDS = new Set([
  "Big",
  "Bigg",
  "Biggl",
  "Biggm",
  "Biggr",
  "Bigl",
  "Bigm",
  "Bigr",
  "big",
  "bigg",
  "biggl",
  "biggm",
  "biggr",
  "bigl",
  "bigm",
  "bigr",
]);

export const OPAQUE_MACROS = new Set([
  "color",
  "colorbox",
  "fcolorbox",
  "text",
  "textbf",
  "textcolor",
  "textit",
  "textrm",
  "texttt",
  "verb",
]);

export const MATRIX_ENVIRONMENTS = new Set([
  "Bmatrix",
  "Vmatrix",
  "array",
  "bmatrix",
  "matrix",
  "pmatrix",
  "smallmatrix",
  "vmatrix",
]);

export const NEGATABLE_RELATIONS = new Set([
  "approx",
  "equiv",
  "geq",
  "in",
  "leq",
  "sim",
  "subset",
  "subseteq",
  "supset",
  "supseteq",
]);

export interface OperandSpan {
  kind: string;
  start: number;
  end: number;
}

export function operandText(source: string, span: OperandSpan): string {
  return source.slice(span.start, span.end);
}

export function skipWhitespace(source: string, index: number, end: number): number {
  while (index < end && /\s/.test(source[index])) {
    index++;
  }
  return index;
}

function skipComment(source: string, start: number, end: number): number {
  let index = start + 1;
  while (index < end && source[index] !== "\r" && source[index] !== "\n") {
    index++;
  }
  if (index < end && source[index] === "\r" && index + 1 < end && source[index + 1] === "\n") {
    return index + 2;
  }
  return Math.min(index + 1, end);
}

export function skipIgnorable(source: string, index: number, end: number): number {
  while (true) {
    index = skipWhitespace(source, index, end);
    if (index >= end || source[index] !== "%") {
      return index;
    }
    index = skipComment(source, index, end);
  }
}

export function readCommand(source: string, start: number, end: number): [string, number] | null {
  if (start >= end || source[start] !== "\\") return null;
  const match = source.slice(start, end).match(/^(\\[A-Za-z]+|\\.)/);
  if (!match) return null;
  return [match[0].slice(1), start + match[0].length];
}

export function readGroupEnd(
  source: string,
  start: number,
  end: number,
  opening?: string
): number | null {
  if (start >= end) return null;
  opening = opening === undefined ? source[start] : opening;
  const closingMap: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
  const closing = closingMap[opening];
  if (!closing || source[start] !== opening) return null;

  let depth = 1;
  let index = start + 1;
  while (index < end) {
    if (source[index] === "%") {
      index = skipComment(source, index, end);
      continue;
    }
    if (source[index] === "\\") {
      const command = readCommand(source, index, end);
      if (command !== null && command[0] === "verb") {
        const verbEnd = readVerbEndHelper(source, command[1], end);
        if (verbEnd >= end) return null;
        index = verbEnd;
        continue;
      }
      if (command !== null && command[0] === "left") {
        const nested = readLeftRightEnd(source, index, end);
        if (nested !== null) {
          index = nested;
          continue;
        }
      }
      index = command !== null ? command[1] : index + 1;
      continue;
    }
    if (source[index] === opening) {
      depth++;
    } else if (source[index] === closing) {
      depth--;
      if (depth === 0) {
        return index + 1;
      }
    }
    index++;
  }
  return null;
}

function readDelimiterEnd(source: string, start: number, end: number): number | null {
  start = skipIgnorable(source, start, end);
  if (start >= end) return null;
  if (source[start] === "\\") {
    const command = readCommand(source, start, end);
    return command !== null ? command[1] : null;
  }
  return start + 1;
}

function leftDelimiter(source: string, start: number, end: number): string | null {
  const command = readCommand(source, start, end);
  if (command === null || command[0] !== "left") return null;
  const delimiterStart = skipIgnorable(source, command[1], end);
  if (delimiterStart >= end) return null;
  if (source[delimiterStart] !== "\\") {
    return source[delimiterStart];
  }
  const delimiter = readCommand(source, delimiterStart, end);
  return delimiter !== null ? delimiter[0] : null;
}

export function readLeftRightEnd(source: string, start: number, end: number): number | null {
  const command = readCommand(source, start, end);
  if (command === null || command[0] !== "left") return null;
  let index = readDelimiterEnd(source, command[1], end);
  if (index === null) return null;

  let depth = 1;
  while (index < end) {
    if (source[index] === "%") {
      index = skipComment(source, index, end);
      continue;
    }
    if (source[index] === "{") {
      const groupEnd = readGroupEnd(source, index, end);
      if (groupEnd !== null) {
        index = groupEnd;
        continue;
      }
    }
    if (source[index] !== "\\") {
      index++;
      continue;
    }
    const nested = readCommand(source, index, end);
    if (nested === null) {
      index++;
      continue;
    }
    const [name, commandEnd] = nested;
    if (name === "verb") {
      const verbEnd = readVerbEndHelper(source, commandEnd, end);
      if (verbEnd >= end) return null;
      index = verbEnd;
      continue;
    }
    if (name === "left") {
      const delimiterEnd = readDelimiterEnd(source, commandEnd, end);
      if (delimiterEnd !== null) {
        depth++;
        index = delimiterEnd;
        continue;
      }
    } else if (name === "right") {
      const delimiterEnd = readDelimiterEnd(source, commandEnd, end);
      if (delimiterEnd !== null) {
        depth--;
        if (depth === 0) {
          return delimiterEnd;
        }
        index = delimiterEnd;
        continue;
      }
    }
    index = commandEnd;
  }
  return null;
}

function readEnvironmentMarker(
  source: string,
  start: number,
  end: number
): [string, string, number] | null {
  const command = readCommand(source, start, end);
  if (command === null || (command[0] !== "begin" && command[0] !== "end")) {
    return null;
  }
  const [marker, index] = command;
  const groupStart = skipIgnorable(source, index, end);
  const groupEnd = readGroupEnd(source, groupStart, end);
  if (groupEnd === null) return null;
  const name = source.slice(groupStart + 1, groupEnd - 1).trim();
  if (!name) return null;
  return [marker, name, groupEnd];
}

export function readEnvironmentEnd(
  source: string,
  start: number,
  end: number
): [string, number] | null {
  const opening = readEnvironmentMarker(source, start, end);
  if (opening === null || opening[0] !== "begin") return null;

  const stack = [opening[1]];
  let index = opening[2];
  while (index < end) {
    if (source[index] === "%") {
      index = skipComment(source, index, end);
      continue;
    }
    if (source[index] === "{") {
      const groupEnd = readGroupEnd(source, index, end);
      if (groupEnd !== null) {
        index = groupEnd;
        continue;
      }
    }
    if (source[index] !== "\\") {
      index++;
      continue;
    }

    const marker = readEnvironmentMarker(source, index, end);
    if (marker === null) {
      const command = readCommand(source, index, end);
      if (command !== null && command[0] === "verb") {
        const verbEnd = readVerbEndHelper(source, command[1], end);
        if (verbEnd >= end) return null;
        index = verbEnd;
        continue;
      }
      index = command !== null ? command[1] : index + 1;
      continue;
    }

    const [markerKind, name, markerEnd] = marker;
    if (markerKind === "begin") {
      stack.push(name);
    } else if (name !== stack[stack.length - 1]) {
      return null;
    } else {
      stack.pop();
      if (stack.length === 0) {
        return [opening[1], markerEnd];
      }
    }
    index = markerEnd;
  }
  return null;
}

function readArgumentEnd(source: string, start: number, end: number): number | null {
  start = skipIgnorable(source, start, end);
  if (start >= end) return null;
  if (source[start] === "{" || source[start] === "(" || source[start] === "[") {
    return readGroupEnd(source, start, end);
  }
  if (source[start] === "\\") {
    const operand = readOperand(source, start, end);
    return operand !== null && operand.kind !== "opaque" ? operand.end : null;
  }
  return start + 1;
}

function consumeScripts(source: string, start: number, end: number): number {
  let current = start;
  while (true) {
    const marker = skipIgnorable(source, current, end);
    if (marker >= end || (source[marker] !== "_" && source[marker] !== "^")) {
      return current;
    }
    const argumentEnd = readArgumentEnd(source, marker + 1, end);
    if (argumentEnd === null) {
      return current;
    }
    current = argumentEnd;
  }
}

function consumePostfix(source: string, start: number, end: number): number {
  let current = start;
  while (true) {
    const previous = current;
    current = consumeScripts(source, current, end);
    const primeStart = skipIgnorable(source, current, end);
    if (primeStart < end && (source[primeStart] === "'" || source[primeStart] === "’")) {
      current = primeStart;
    }
    while (current < end && (source[current] === "'" || source[current] === "’")) {
      current++;
    }
    if (current === previous) {
      return current;
    }
  }
}

function consumeOperatorScripts(source: string, start: number, end: number): number {
  const modifierStart = skipIgnorable(source, start, end);
  const modifier = readCommand(source, modifierStart, end);
  if (
    modifier !== null &&
    (modifier[0] === "displaylimits" || modifier[0] === "limits" || modifier[0] === "nolimits")
  ) {
    start = modifier[1];
  }
  return consumeScripts(source, start, end);
}

function readNormEnd(source: string, start: number, end: number): number | null {
  const opening = readCommand(source, start, end);
  if (opening === null) return null;
  const closingNameMap: Record<string, string> = { "|": "|", Vert: "Vert", lVert: "rVert" };
  const closingName = closingNameMap[opening[0]];
  if (!closingName) return null;

  let index = opening[1];
  let braceDepth = 0;
  while (index < end) {
    if (source[index] === "%") {
      index = skipComment(source, index, end);
      continue;
    }
    if (source[index] === "{") {
      braceDepth++;
    } else if (source[index] === "}" && braceDepth > 0) {
      braceDepth--;
    } else if (source[index] === "\\") {
      const command = readCommand(source, index, end);
      if (command !== null) {
        if (command[0] === "verb") {
          const verbEnd = readVerbEndHelper(source, command[1], end);
          if (verbEnd >= end) return null;
          index = verbEnd;
          continue;
        }
        if (command[0] === "left") {
          const groupEnd = readLeftRightEnd(source, index, end);
          if (groupEnd !== null) {
            index = groupEnd;
            continue;
          }
        }
        if (braceDepth === 0 && command[0] === closingName) {
          return consumePostfix(source, command[1], end);
        }
        index = command[1];
        continue;
      }
    }
    index++;
  }
  return null;
}

function consumeArguments(
  source: string,
  start: number,
  end: number,
  count: number
): number | null {
  let index = start;
  for (let i = 0; i < count; i++) {
    const argumentEnd = readArgumentEnd(source, index, end);
    if (argumentEnd === null) return null;
    index = argumentEnd;
  }
  return index;
}

function consumeOptionalBracket(source: string, start: number, end: number): number | null {
  const index = skipIgnorable(source, start, end);
  if (index >= end || source[index] !== "[") {
    return start;
  }
  return readGroupEnd(source, index, end);
}

function readVerbEndHelper(source: string, start: number, end: number): number {
  const index = start < end && source[start] === "*" ? start + 1 : start;
  if (index >= end || /\s/.test(source[index])) {
    return end;
  }
  const closing = source.indexOf(source[index], index + 1);
  return closing < 0 || closing >= end ? end : closing + 1;
}

function containsVerbCommand(source: string, start: number, end: number): boolean {
  let index = start;
  while (index < end) {
    if (source[index] === "%") {
      index = skipComment(source, index, end);
      continue;
    }
    if (source[index] !== "\\") {
      index++;
      continue;
    }
    const command = readCommand(source, index, end);
    if (command === null) {
      index++;
      continue;
    }
    if (command[0] === "verb") {
      return true;
    }
    index = command[1];
  }
  return false;
}

function readNegatedRelationEnd(source: string, start: number, end: number): number | null {
  const index = skipIgnorable(source, start, end);
  if (index < end && (source[index] === "=" || source[index] === "<" || source[index] === ">")) {
    return index + 1;
  }
  const command = readCommand(source, index, end);
  if (command !== null && NEGATABLE_RELATIONS.has(command[0])) {
    return command[1];
  }
  return null;
}

export function readOperand(
  source: string,
  start: number,
  end?: number
): OperandSpan | null {
  end = end === undefined ? source.length : end;
  if (start >= end || /\s/.test(source[start])) {
    return null;
  }

  if (source[start] === "\\") {
    const command = readCommand(source, start, end);
    if (command === null) return null;
    let [name, commandEnd] = command;
    if (name === "operatorname" && commandEnd < end && source[commandEnd] === "*") {
      commandEnd++;
    }

    if (name === "|" || name === "Vert" || name === "lVert") {
      const normEnd = readNormEnd(source, start, end);
      if (normEnd !== null) {
        return { kind: "norm", start, end: normEnd };
      }
      return {
        kind: name === "lVert" ? "opaque" : "structural",
        start,
        end: name !== "lVert" ? commandEnd : end,
      };
    }

    if (name === "verb") {
      return { kind: "opaque", start, end: readVerbEndHelper(source, commandEnd, end) };
    }

    if (name === "not") {
      const relationEnd = readNegatedRelationEnd(source, commandEnd, end);
      return {
        kind: "opaque",
        start,
        end: relationEnd !== null ? relationEnd : end,
      };
    }

    if (name === "begin") {
      const env = readEnvironmentEnd(source, start, end);
      if (env !== null) {
        const [envName, envEnd] = env;
        if (containsVerbCommand(source, start, envEnd)) {
          return { kind: "opaque", start, end: envEnd };
        }
        const kind = MATRIX_ENVIRONMENTS.has(envName) ? "matrix" : "environment";
        return {
          kind,
          start,
          end: consumePostfix(source, envEnd, end),
        };
      }
      return { kind: "opaque", start, end };
    }

    if (name === "left") {
      const groupEnd = readLeftRightEnd(source, start, end);
      if (groupEnd === null) {
        return { kind: "opaque", start, end };
      }
      if (containsVerbCommand(source, start, groupEnd)) {
        return { kind: "opaque", start, end: groupEnd };
      }
      return {
        kind: "group",
        start,
        end: consumePostfix(source, groupEnd, end),
      };
    }

    if (OPERATOR_COMMANDS.has(name)) {
      return {
        kind: "operator",
        start,
        end: consumeOperatorScripts(source, commandEnd, end),
      };
    }

    if (name === "\\") {
      let layoutEnd = commandEnd;
      if (layoutEnd < end && source[layoutEnd] === "*") {
        layoutEnd++;
      }
      const optionalStart = skipIgnorable(source, layoutEnd, end);
      if (optionalStart < end && source[optionalStart] === "[") {
        const optionalEnd = readGroupEnd(source, optionalStart, end);
        if (optionalEnd === null) {
          return { kind: "opaque", start, end };
        }
        layoutEnd = optionalEnd;
      }
      return { kind: "structural", start, end: layoutEnd };
    }

    if (NON_OPERAND_COMMANDS.has(name)) {
      return { kind: "structural", start, end: commandEnd };
    }

    if (DELIMITER_SIZE_COMMANDS.has(name)) {
      const delimiterEnd = readDelimiterEnd(source, commandEnd, end);
      return {
        kind: "structural",
        start,
        end: delimiterEnd !== null ? delimiterEnd : commandEnd,
      };
    }

    if (SYMBOL_MACROS.has(name)) {
      return {
        kind: "symbol",
        start,
        end: consumePostfix(source, commandEnd, end),
      };
    }

    if (name === "color" || name === "colorbox" || name === "textcolor") {
      const optionalEnd = consumeOptionalBracket(source, commandEnd, end);
      const argsEnd =
        optionalEnd !== null ? consumeArguments(source, optionalEnd, end, 2) : null;
      return {
        kind: "opaque",
        start,
        end: argsEnd !== null ? argsEnd : end,
      };
    }

    if (name === "fcolorbox") {
      const optionalEnd = consumeOptionalBracket(source, commandEnd, end);
      const frameEnd =
        optionalEnd !== null ? consumeArguments(source, optionalEnd, end, 1) : null;
      const bgModelEnd =
        frameEnd !== null ? consumeOptionalBracket(source, frameEnd, end) : null;
      const argsEnd =
        bgModelEnd !== null ? consumeArguments(source, bgModelEnd, end, 2) : null;
      return {
        kind: "opaque",
        start,
        end: argsEnd !== null ? argsEnd : end,
      };
    }

    let argumentCount = 0;
    if (name === "frac" || name === "dfrac" || name === "tfrac") {
      argumentCount = 2;
    } else if (STYLE_MACROS.has(name) || name === "boxed") {
      argumentCount = 1;
    } else if (name === "sqrt") {
      const optional = skipIgnorable(source, commandEnd, end);
      if (optional < end && source[optional] === "[") {
        const optionalEnd = readGroupEnd(source, optional, end);
        if (optionalEnd === null) return null;
        commandEnd = optionalEnd;
      }
      argumentCount = 1;
    } else if (UNARY_MACROS.has(name)) {
      argumentCount = 1;
    } else if (name === "overset" || name === "stackrel" || name === "underset") {
      argumentCount = 2;
    }

    let atomEnd = commandEnd;
    if (argumentCount) {
      const argumentsEnd = consumeArguments(source, commandEnd, end, argumentCount);
      if (argumentsEnd === null) {
        return { kind: "opaque", start, end };
      }
      atomEnd = argumentsEnd;
    }

    if (!argumentCount && !FUNCTION_MACROS.has(name)) {
      return { kind: "opaque", start, end };
    }

    const scriptedEnd = consumeScripts(source, atomEnd, end);
    if (FUNCTION_MACROS.has(name)) {
      const groupStart = skipIgnorable(source, scriptedEnd, end);
      if (groupStart < end && (source[groupStart] === "(" || source[groupStart] === "[")) {
        const groupEnd = readGroupEnd(source, groupStart, end);
        if (groupEnd !== null) {
          atomEnd = groupEnd;
        }
      } else if (
        source.startsWith("\\left", groupStart) &&
        ["(", "[", "lparen", "lbrack"].includes(leftDelimiter(source, groupStart, end) ?? "")
      ) {
        const groupEnd = readLeftRightEnd(source, groupStart, end);
        if (groupEnd !== null) {
          atomEnd = groupEnd;
        }
      } else {
        atomEnd = scriptedEnd;
      }
    }

    const kind = OPAQUE_MACROS.has(name)
      ? "opaque"
      : FUNCTION_MACROS.has(name)
      ? "function"
      : "operand";
    return {
      kind,
      start,
      end: consumePostfix(source, atomEnd, end),
    };
  }

  if (source[start] === "(" || source[start] === "{" || source[start] === "[") {
    const groupEnd = readGroupEnd(source, start, end);
    if (groupEnd === null) {
      return { kind: "opaque", start, end };
    }
    if (containsVerbCommand(source, start, groupEnd)) {
      return { kind: "opaque", start, end: groupEnd };
    }
    const innerStart = skipIgnorable(source, start + 1, groupEnd - 1);
    const innerCommand = readCommand(source, innerStart, groupEnd - 1);
    const kind =
      source[start] === "{" && innerCommand !== null && innerCommand[0] === "color"
        ? "opaque"
        : "group";
    return {
      kind,
      start,
      end: consumePostfix(source, groupEnd, end),
    };
  }

  const numberMatch = source.slice(start, end).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
  if (numberMatch) {
    return {
      kind: "number",
      start,
      end: consumePostfix(source, start + numberMatch[0].length, end),
    };
  }

  if (/[A-Za-z]/.test(source[start])) {
    let nameEnd = start + 1;
    while (nameEnd < end && source[nameEnd] === "'") {
      nameEnd++;
    }
    const groupStart = skipIgnorable(source, nameEnd, end);
    let atomEnd = nameEnd;
    let kind = "symbol";
    if (groupStart < end && source[groupStart] === "(") {
      const groupEnd = readGroupEnd(source, groupStart, end);
      if (groupEnd !== null) {
        atomEnd = groupEnd;
        kind = "function";
      }
    } else if (
      source.startsWith("\\left", groupStart) &&
      ["(", "lparen"].includes(leftDelimiter(source, groupStart, end) ?? "")
    ) {
      const groupEnd = readLeftRightEnd(source, groupStart, end);
      if (groupEnd !== null) {
        atomEnd = groupEnd;
        kind = "function";
      }
    }
    return {
      kind,
      start,
      end: consumePostfix(source, atomEnd, end),
    };
  }

  return null;
}

export function findOperandSpans(
  source: string,
  start: number = 0,
  end?: number
): OperandSpan[] {
  end = end === undefined ? source.length : end;
  const operands: OperandSpan[] = [];
  let index = start;
  while (index < end) {
    index = skipWhitespace(source, index, end);
    if (index >= end) break;
    if (source[index] === "%") {
      index = skipComment(source, index, end);
      continue;
    }
    const operand = readOperand(source, index, end);
    if (operand === null) {
      index++;
      continue;
    }
    if (operand.kind !== "operator" && operand.kind !== "opaque" && operand.kind !== "structural") {
      operands.push(operand);
    }
    index = Math.max(index + 1, operand.end);
  }
  return operands;
}

export function findOperatorSpans(
  source: string,
  start: number = 0,
  end?: number
): OperandSpan[] {
  end = end === undefined ? source.length : end;
  const operators: OperandSpan[] = [];
  let index = start;
  while (index < end) {
    index = skipWhitespace(source, index, end);
    if (index >= end) break;
    if (source[index] === "%") {
      index = skipComment(source, index, end);
      continue;
    }
    const operand = readOperand(source, index, end);
    if (operand === null) {
      index++;
      continue;
    }
    if (operand.kind === "operator") {
      operators.push(operand);
    }
    index = Math.max(index + 1, operand.end);
  }
  return operators;
}

export function findAllOperatorSpans(
  source: string,
  start: number = 0,
  end?: number
): OperandSpan[] {
  end = end === undefined ? source.length : end;
  const operators: OperandSpan[] = [];
  let index = start;
  while (index < end) {
    if (source[index] === "%") {
      index = skipComment(source, index, end);
      continue;
    }
    const operand = readOperand(source, index, end);
    if (operand !== null) {
      if (operand.kind === "operator") {
        operators.push(operand);
        index = operand.end;
        continue;
      }
      if (operand.kind === "opaque") {
        index = operand.end;
        continue;
      }
    }
    if (source[index] === "\\") {
      const command = readCommand(source, index, end);
      if (command !== null) {
        index = command[1];
        continue;
      }
    }
    index++;
  }
  return operators;
}

export function findTopLevelTokens(
  source: string,
  tokens: string[],
  start: number = 0,
  end?: number
): [number, number, string][] {
  end = end === undefined ? source.length : end;
  const found: [number, number, string][] = [];
  let index = start;
  const ordered = [...tokens].sort((a, b) => b.length - a.length);

  while (index < end) {
    index = skipWhitespace(source, index, end);
    if (index >= end) break;
    if (source[index] === "%") {
      index = skipComment(source, index, end);
      continue;
    }

    let matchedToken: string | null = null;
    for (const item of ordered) {
      if (source.startsWith(item, index)) {
        if (
          item.startsWith("\\") &&
          /[A-Za-z]/.test(item[item.length - 1]) &&
          index + item.length < end &&
          /[A-Za-z]/.test(source[index + item.length])
        ) {
          continue;
        }
        matchedToken = item;
        break;
      }
    }

    if (matchedToken !== null) {
      found.push([index, index + matchedToken.length, matchedToken]);
      index += matchedToken.length;
      continue;
    }

    const operand = readOperand(source, index, end);
    if (operand !== null) {
      index = Math.max(index + 1, operand.end);
      continue;
    }

    index++;
  }
  return found;
}

export function findScriptArgumentSpans(source: string): OperandSpan[] {
  const spans: OperandSpan[] = [];
  let index = 0;
  while (index < source.length) {
    if (source[index] === "%") {
      index = skipComment(source, index, source.length);
      continue;
    }
    if (source[index] !== "_" && source[index] !== "^") {
      const operand = readOperand(source, index);
      if (operand !== null && operand.kind === "opaque") {
        index = operand.end;
        continue;
      }
      if (source[index] === "\\") {
        const command = readCommand(source, index, source.length);
        if (command !== null) {
          index = command[1];
          continue;
        }
      }
      index++;
      continue;
    }

    const argumentStart = skipIgnorable(source, index + 1, source.length);
    const argumentEnd = readArgumentEnd(source, argumentStart, source.length);
    if (argumentEnd === null) {
      index++;
      continue;
    }

    let innerStart = argumentStart;
    let innerEnd = argumentEnd;
    if (source[argumentStart] === "{") {
      innerStart = argumentStart + 1;
      innerEnd = argumentEnd - 1;
    }

    if (innerStart < innerEnd) {
      spans.push({
        kind: source[index] === "_" ? "subscript" : "superscript",
        start: innerStart,
        end: innerEnd,
      });
    }

    index = argumentEnd;
  }
  return spans;
}

