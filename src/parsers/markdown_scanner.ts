// src/parsers/markdown_scanner.ts

export const FENCED_CODE = "fenced_code";
export const CODE_SPAN = "code_span";
export const MATH_BLOCK = "math_block";

export interface MarkdownSpan {
  kind: string;
  start: number;
  contentStart: number;
  contentEnd: number;
  end: number;
}

export interface MarkdownScan {
  protected: MarkdownSpan[];
  mathBlocks: MarkdownSpan[];
}

interface ListItem {
  markerIndent: number;
  contentIndent: number;
}

interface FenceContainer {
  quoteDepth: number;
  listIndent: number;
}

function lineRanges(text: string): [number, number, number][] {
  const ranges: [number, number, number][] = [];
  let start = 0;

  while (start < text.length) {
    let contentEnd = start;
    while (contentEnd < text.length && text[contentEnd] !== "\r" && text[contentEnd] !== "\n") {
      contentEnd++;
    }

    let lineEnd = contentEnd;
    if (lineEnd < text.length) {
      if (text[lineEnd] === "\r" && lineEnd + 1 < text.length && text[lineEnd + 1] === "\n") {
        lineEnd += 2;
      } else {
        lineEnd += 1;
      }
    }

    ranges.push([start, contentEnd, lineEnd]);
    start = lineEnd;
  }

  return ranges;
}

function openingFence(line: string): [string, number] | null {
  let index = 0;
  while (index < line.length && index < 3 && line[index] === " ") {
    index++;
  }

  if (index >= line.length || (line[index] !== "`" && line[index] !== "~")) {
    return null;
  }

  const marker = line[index];
  let markerEnd = index;
  while (markerEnd < line.length && line[markerEnd] === marker) {
    markerEnd++;
  }

  const length = markerEnd - index;
  if (length < 3) {
    return null;
  }

  const info = line.slice(markerEnd);
  if (marker === "`" && info.includes("`")) {
    return null;
  }

  return [marker, length];
}

function isClosingFence(line: string, marker: string, minimum: number): boolean {
  let index = 0;
  while (index < line.length && index < 3 && line[index] === " ") {
    index++;
  }

  let markerEnd = index;
  while (markerEnd < line.length && line[markerEnd] === marker) {
    markerEnd++;
  }

  return (
    markerEnd - index >= minimum &&
    line.slice(markerEnd).split("").every((ch) => ch === " " || ch === "\t")
  );
}

function stripBlockquotes(line: string): [number, number] {
  let depth = 0;
  let index = 0;

  while (true) {
    let marker = index;
    let spaces = 0;
    while (marker < line.length && spaces < 3 && line[marker] === " ") {
      marker++;
      spaces++;
    }
    if (marker >= line.length || line[marker] !== ">") {
      return [depth, index];
    }

    index = marker + 1;
    if (index < line.length && (line[index] === " " || line[index] === "\t")) {
      index++;
    }
    depth++;
  }
}

function stripRequiredBlockquotes(line: string, depth: number): number | null {
  let index = 0;
  for (let i = 0; i < depth; i++) {
    let marker = index;
    let spaces = 0;
    while (marker < line.length && spaces < 3 && line[marker] === " ") {
      marker++;
      spaces++;
    }
    if (marker >= line.length || line[marker] !== ">") {
      return null;
    }

    index = marker + 1;
    if (index < line.length && (line[index] === " " || line[index] === "\t")) {
      index++;
    }
  }
  return index;
}

function readListMarker(line: string, start: number): number | null {
  if (start >= line.length) {
    return null;
  }

  let markerEnd = start;
  if ("-+*".includes(line[start])) {
    markerEnd++;
  } else if (/\d/.test(line[start])) {
    while (markerEnd < line.length && /\d/.test(line[markerEnd])) {
      markerEnd++;
    }
    if (markerEnd - start > 9 || markerEnd >= line.length) {
      return null;
    }
    if (line[markerEnd] !== "." && line[markerEnd] !== ")") {
      return null;
    }
    markerEnd++;
  } else {
    return null;
  }

  if (markerEnd === line.length) {
    return markerEnd + 1;
  }
  if (line[markerEnd] !== " ") {
    return null;
  }

  let whitespaceEnd = markerEnd;
  while (whitespaceEnd < line.length && line[whitespaceEnd] === " ") {
    whitespaceEnd++;
  }
  const padding = whitespaceEnd - markerEnd;
  return markerEnd + (padding <= 4 ? padding : 1);
}

function listParentCount(stack: ListItem[], markerIndent: number): number | null {
  for (let level = stack.length - 1; level >= 0; level--) {
    const item = stack[level];
    if (markerIndent === item.markerIndent) {
      return level;
    }
    if (item.contentIndent <= markerIndent && markerIndent <= item.contentIndent + 3) {
      return level + 1;
    }
  }
  return markerIndent <= 3 ? 0 : null;
}

function listContentStart(line: string, stack: ListItem[]): number {
  let cursor = 0;
  let parsedMarker = false;

  while (cursor < line.length) {
    let marker = cursor;
    while (marker < line.length && line[marker] === " ") {
      marker++;
    }

    const contentIndent = readListMarker(line, marker);
    if (contentIndent === null) {
      break;
    }

    const parentCount = listParentCount(stack, marker);
    if (parentCount === null) {
      break;
    }

    stack.splice(parentCount);
    stack.push({ markerIndent: marker, contentIndent });
    cursor = Math.min(contentIndent, line.length);
    parsedMarker = true;
  }

  if (parsedMarker) {
    return stack[stack.length - 1].contentIndent;
  }

  if (line.replace(/[ \t]/g, "").length === 0) {
    return stack.length > 0 ? stack[stack.length - 1].contentIndent : 0;
  }

  let indentation = 0;
  while (indentation < line.length && line[indentation] === " ") {
    indentation++;
  }

  for (let level = stack.length - 1; level >= 0; level--) {
    if (indentation >= stack[level].contentIndent) {
      stack.splice(level + 1);
      return stack[stack.length - 1].contentIndent;
    }
  }

  stack.length = 0;
  return 0;
}

function openingContainer(
  line: string,
  listStacks: Map<number, ListItem[]>
): [FenceContainer, number] {
  const [quoteDepth, quoteEnd] = stripBlockquotes(line);
  for (const depth of Array.from(listStacks.keys())) {
    if (depth > quoteDepth) {
      listStacks.delete(depth);
    }
  }

  if (!listStacks.has(quoteDepth)) {
    listStacks.set(quoteDepth, []);
  }
  const listStack = listStacks.get(quoteDepth)!;
  const listIndent = listContentStart(line.slice(quoteEnd), listStack);
  return [
    { quoteDepth, listIndent },
    Math.min(quoteEnd + listIndent, line.length),
  ];
}

function continuationStart(line: string, container: FenceContainer): number | null {
  const quoteEnd = stripRequiredBlockquotes(line, container.quoteDepth);
  if (quoteEnd === null) {
    return null;
  }

  const remainder = line.slice(quoteEnd);
  if (remainder.replace(/[ \t]/g, "").length === 0) {
    return line.length;
  }
  if (container.listIndent > 0 && !remainder.startsWith(" ".repeat(container.listIndent))) {
    return null;
  }
  return quoteEnd + container.listIndent;
}

function findFencedCode(text: string): MarkdownSpan[] {
  const lines = lineRanges(text);
  const spans: MarkdownSpan[] = [];
  const listStacks = new Map<number, ListItem[]>();
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const [start, contentEnd, lineEnd] = lines[lineIndex];
    const line = text.slice(start, contentEnd);
    const [container, containerEnd] = openingContainer(line, listStacks);
    const opening = openingFence(line.slice(containerEnd));
    if (opening === null) {
      lineIndex++;
      continue;
    }

    const [marker, minimum] = opening;
    let closingIndex = lineIndex + 1;
    let closed = false;

    while (closingIndex < lines.length) {
      const [closeStart, closeContentEnd, closeLineEnd] = lines[closingIndex];
      const closeLine = text.slice(closeStart, closeContentEnd);
      const closeContainerEnd = continuationStart(closeLine, container);
      if (closeContainerEnd === null) {
        spans.push({
          kind: FENCED_CODE,
          start,
          contentStart: lineEnd,
          contentEnd: closeStart,
          end: closeStart,
        });
        lineIndex = closingIndex;
        closed = true;
        break;
      }
      if (isClosingFence(closeLine.slice(closeContainerEnd), marker, minimum)) {
        spans.push({
          kind: FENCED_CODE,
          start,
          contentStart: lineEnd,
          contentEnd: closeStart,
          end: closeLineEnd,
        });
        lineIndex = closingIndex + 1;
        closed = true;
        break;
      }
      closingIndex++;
    }

    if (!closed) {
      spans.push({
        kind: FENCED_CODE,
        start,
        contentStart: lineEnd,
        contentEnd: text.length,
        end: text.length,
      });
      lineIndex = lines.length;
    }
  }

  return spans;
}

function visibleRanges(length: number, excluded: MarkdownSpan[]): [number, number][] {
  const ranges: [number, number][] = [];
  let index = 0;

  for (const span of excluded) {
    if (index < span.start) {
      ranges.push([index, span.start]);
    }
    index = Math.max(index, span.end);
  }

  if (index < length) {
    ranges.push([index, length]);
  }

  return ranges;
}

function isEscaped(text: string, index: number, lowerBound: number): boolean {
  let backslashes = 0;
  index -= 1;
  while (index >= lowerBound && text[index] === "\\") {
    backslashes++;
    index--;
  }
  return backslashes % 2 === 1;
}

function delimiterRuns(
  text: string,
  start: number,
  end: number,
  delimiter: string
): [number, number][] {
  const runs: [number, number][] = [];
  let index = start;

  while (index < end) {
    const runStart = text.indexOf(delimiter, index);
    if (runStart < 0 || runStart >= end) {
      break;
    }

    let runEnd = runStart + 1;
    while (runEnd < end && text[runEnd] === delimiter) {
      runEnd++;
    }

    if (!isEscaped(text, runStart, start)) {
      runs.push([runStart, runEnd]);
    }
    index = runEnd;
  }

  return runs;
}

function pairRuns(
  runs: [number, number][],
  kind: string,
  exactLength?: number
): MarkdownSpan[] {
  let filteredRuns = runs;
  if (exactLength !== undefined) {
    filteredRuns = runs.filter((run) => run[1] - run[0] === exactLength);
  }

  const nextSame: (number | null)[] = new Array(filteredRuns.length).fill(null);
  const nearest = new Map<number, number>();
  for (let index = filteredRuns.length - 1; index >= 0; index--) {
    const len = filteredRuns[index][1] - filteredRuns[index][0];
    nextSame[index] = nearest.get(len) ?? null;
    nearest.set(len, index);
  }

  const spans: MarkdownSpan[] = [];
  let index = 0;
  while (index < filteredRuns.length) {
    const closingIndex = nextSame[index];
    if (closingIndex === null) {
      index++;
      continue;
    }

    const opening = filteredRuns[index];
    const closing = filteredRuns[closingIndex];
    spans.push({
      kind,
      start: opening[0],
      contentStart: opening[1],
      contentEnd: closing[0],
      end: closing[1],
    });
    index = closingIndex + 1;
  }

  return spans;
}

function findCodeSpans(text: string, fenced: MarkdownSpan[]): MarkdownSpan[] {
  const spans: MarkdownSpan[] = [];
  for (const [start, end] of visibleRanges(text.length, fenced)) {
    spans.push(...pairRuns(delimiterRuns(text, start, end, "`"), CODE_SPAN));
  }
  return spans;
}

function findMathBlocks(text: string, protectedSpans: MarkdownSpan[]): MarkdownSpan[] {
  const spans: MarkdownSpan[] = [];
  for (const [start, end] of visibleRanges(text.length, protectedSpans)) {
    spans.push(
      ...pairRuns(delimiterRuns(text, start, end, "$"), MATH_BLOCK, 2)
    );
  }
  return spans;
}

export function scanMarkdown(text: string): MarkdownScan {
  const fenced = findFencedCode(text);
  const codeSpans = findCodeSpans(text, fenced);
  const protectedSpans = [...fenced, ...codeSpans].sort((a, b) => a.start - b.start);
  return {
    protected: protectedSpans,
    mathBlocks: findMathBlocks(text, protectedSpans),
  };
}
