// src/undo.ts

import { scanMarkdown } from "./parsers/markdown_scanner";
import {
  matchCommand,
  readColorWrapper,
  readCommentEnd,
  readVerbEnd,
} from "./utils/latex_helpers";

export function uncolorFragment(text: string): string {
  const output: string[] = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] === "%") {
      const end = readCommentEnd(text, index);
      output.push(text.slice(index, end));
      index = end;
      continue;
    }

    if (text[index] === "\\") {
      const wrapper = readColorWrapper(text, index);
      if (wrapper !== null) {
        const [value, nextIndex] = wrapper;
        if (value.length > 0) {
          output.push(uncolorFragment(value));
        }
        index = nextIndex;
        // If a standalone color declaration was stripped, clean up one following space
        if (value.length === 0 && index < text.length && text[index] === " ") {
          index++;
        }
        continue;
      }

      const verb = readVerbEnd(text, index);
      if (verb !== null) {
        const [end] = verb;
        output.push(text.slice(index, end));
        index = end;
        continue;
      }

      const command = matchCommand(text, index);
      if (command !== null) {
        output.push(command);
        index += command.length;
        continue;
      }
    }

    output.push(text[index]);
    index++;
  }

  return output.join("");
}

export function uncolorText(text: string): string {
  const scan = scanMarkdown(text);
  const allSpans = [...scan.mathBlocks, ...scan.mathInlines].sort(
    (a, b) => a.start - b.start
  );

  if (allSpans.length === 0) {
    // If no markdown math delimiters are present, uncolor as a raw LaTeX fragment directly
    return uncolorFragment(text);
  }

  const output: string[] = [];
  let index = 0;
  for (const span of allSpans) {
    output.push(text.slice(index, span.start));
    output.push(uncolorFragment(text.slice(span.start, span.end)));
    index = span.end;
  }
  output.push(text.slice(index));
  return output.join("");
}
