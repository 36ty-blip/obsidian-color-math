// src/utils/latex_helpers.ts

export function matchCommand(text: string, index: number): string | null {
  if (index >= text.length || text[index] !== "\\") return null;
  const match = text.slice(index).match(/^(\\[A-Za-z]+|\\.)/);
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
  for (const candidate of ["\\textcolor", "\\color"]) {
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

  const colorData = readBraced(text, index);
  if (colorData === null) {
    return null;
  }

  index = colorData[1];
  while (index < text.length && /\s/.test(text[index])) {
    index++;
  }

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
