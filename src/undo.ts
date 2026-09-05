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
        output.push(uncolorFragment(value));
        index = nextIndex;
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
  const mathBlocks = scanMarkdown(text).mathBlocks;
  if (mathBlocks.length === 0) {
    return text;
  }

  const output: string[] = [];
  let index = 0;
  for (const span of mathBlocks) {
    output.push(text.slice(index, span.start));
    output.push(uncolorFragment(text.slice(span.start, span.end)));
    index = span.end;
  }
  output.push(text.slice(index));
  return output.join("");
}
