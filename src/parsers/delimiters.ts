// src/parsers/delimiters.ts

import { RAINBOW_DELIMITER_COLORS } from "../config";
import { ColorSpan } from "../utils/spans";
import { skipEnvironmentHead, readColorCommand } from "../utils/latex_helpers";

export interface DelimiterItem {
  type: string;
  start: number;
  end: number;
  isLeftRight: boolean;
}

export interface DelimiterPair {
  open: DelimiterItem;
  close: DelimiterItem;
  depth: number;
}

export interface DelimiterScanResult {
  pairs: DelimiterPair[];
  unmatched: DelimiterItem[];
}

export interface DelimiterCollectorOptions {
  forLatexWrap?: boolean;
  palette?: string[];
  includeBareBraces?: boolean;
  highlightUnmatched?: boolean;
  onlyUnmatched?: boolean;
  errorColor?: string;
}

function skipWhitespace(text: string, start: number): number {
  while (start < text.length && /\s/.test(text[start])) {
    start++;
  }
  return start;
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

function getDelimiterType(str: string): string {
  if (str === "(" || str === ")") return "paren";
  if (str === "[" || str === "]") return "bracket";
  if (str === "\\{" || str === "\\}") return "brace";
  if (str === "{" || str === "}") return "bare_brace";
  if (str === "\\langle" || str === "\\rangle") return "angle";
  if (str === "|" || str === "\\|") return "pipe";
  return "other";
}

/**
 * Scans all delimiter pairs and identifies unmatched/unclosed delimiters.
 */
export function findDelimiterScan(
  text: string,
  options?: { includeBareBraces?: boolean }
): DelimiterScanResult {
  const includeBareBraces = options?.includeBareBraces ?? false;
  const pairs: DelimiterPair[] = [];
  const unmatched: DelimiterItem[] = [];
  const stack: { item: DelimiterItem; depth: number }[] = [];

  let index = 0;
  while (index < text.length) {
    if (text[index] === "%") {
      index = skipComment(text, index);
      continue;
    }

    // Skip environment declarations like \begin{matrix}, \begin{array}{cc|c}, \end{matrix}
    if (text.startsWith("\\begin", index) || text.startsWith("\\end", index)) {
      const isBegin = text.startsWith("\\begin", index);
      const cmdName = isBegin ? "\\begin" : "\\end";
      const cmdEnd = index + cmdName.length;
      const envHeadEnd = skipEnvironmentHead(text, cmdName, cmdEnd);
      if (envHeadEnd !== null) {
        index = envHeadEnd;
        continue;
      }
    }

    // Skip color commands like \textcolor{...}{...} so inner braces are not counted as bare delimiters
    const colorCmd = readColorCommand(text, index);
    if (colorCmd !== null) {
      index = colorCmd[1];
      continue;
    }

    // Check \left / \right
    if (text.startsWith("\\left", index)) {
      const afterLeft = skipWhitespace(text, index + 5);
      const delimMatch = text.slice(afterLeft).match(/^(\(|\)|\[|\]|\\\{|\\\}|\\langle|\\rangle|\||\\\||\.)/);
      if (delimMatch) {
        const delimStr = delimMatch[0];
        const delimEnd = afterLeft + delimStr.length;
        const type = getDelimiterType(delimStr);
        const depth = stack.length;
        stack.push({
          item: {
            type,
            start: index,
            end: delimEnd,
            isLeftRight: true,
          },
          depth,
        });
        index = delimEnd;
        continue;
      }
    }

    if (text.startsWith("\\right", index)) {
      const afterRight = skipWhitespace(text, index + 6);
      const delimMatch = text.slice(afterRight).match(/^(\(|\)|\[|\]|\\\{|\\\}|\\langle|\\rangle|\||\\\||\.)/);
      if (delimMatch) {
        const delimStr = delimMatch[0];
        const delimEnd = afterRight + delimStr.length;
        const type = getDelimiterType(delimStr);

        // Find matching left
        let matchIdx = -1;
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].item.isLeftRight) {
            matchIdx = i;
            break;
          }
        }

        if (matchIdx !== -1) {
          const matched = stack.splice(matchIdx, 1)[0];
          pairs.push({
            open: matched.item,
            close: {
              type,
              start: index,
              end: delimEnd,
              isLeftRight: true,
            },
            depth: matched.depth,
          });
        } else {
          unmatched.push({
            type,
            start: index,
            end: delimEnd,
            isLeftRight: true,
          });
        }
        index = delimEnd;
        continue;
      }
    }

    // Sized delimiters: \bigl, \Bigl, \biggl, \Biggl and closing \bigr, \Bigr, etc.
    const sizedOpenMatch = text.slice(index).match(/^(\\(?:big|Big|bigg|Bigg)l)(\(|\)|\[|\]|\\\{|\\\}|\\langle|\\rangle|\||\\\|)/);
    if (sizedOpenMatch) {
      const fullStr = sizedOpenMatch[0];
      const delimStr = sizedOpenMatch[2];
      const type = getDelimiterType(delimStr);
      const depth = stack.length;
      stack.push({
        item: {
          type,
          start: index,
          end: index + fullStr.length,
          isLeftRight: false,
        },
        depth,
      });
      index += fullStr.length;
      continue;
    }

    const sizedCloseMatch = text.slice(index).match(/^(\\(?:big|Big|bigg|Bigg)r)(\(|\)|\[|\]|\\\{|\\\}|\\langle|\\rangle|\||\\\|)/);
    if (sizedCloseMatch) {
      const fullStr = sizedCloseMatch[0];
      const delimStr = sizedCloseMatch[2];
      const type = getDelimiterType(delimStr);

      let matchIdx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (!stack[i].item.isLeftRight && stack[i].item.type === type) {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx !== -1) {
        const matched = stack.splice(matchIdx, 1)[0];
        pairs.push({
          open: matched.item,
          close: {
            type,
            start: index,
            end: index + fullStr.length,
            isLeftRight: false,
          },
          depth: matched.depth,
        });
      } else {
        unmatched.push({
          type,
          start: index,
          end: index + fullStr.length,
          isLeftRight: false,
        });
      }
      index += fullStr.length;
      continue;
    }

    // Escaped set braces \{ and \}
    if (text.startsWith("\\{", index)) {
      const depth = stack.length;
      stack.push({
        item: {
          type: "brace",
          start: index,
          end: index + 2,
          isLeftRight: false,
        },
        depth,
      });
      index += 2;
      continue;
    }

    if (text.startsWith("\\}", index)) {
      let matchIdx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (!stack[i].item.isLeftRight && stack[i].item.type === "brace") {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx !== -1) {
        const matched = stack.splice(matchIdx, 1)[0];
        pairs.push({
          open: matched.item,
          close: {
            type: "brace",
            start: index,
            end: index + 2,
            isLeftRight: false,
          },
          depth: matched.depth,
        });
      } else {
        unmatched.push({
          type: "brace",
          start: index,
          end: index + 2,
          isLeftRight: false,
        });
      }
      index += 2;
      continue;
    }

    // Bare angle brackets \langle and \rangle
    if (text.startsWith("\\langle", index)) {
      const depth = stack.length;
      stack.push({
        item: {
          type: "angle",
          start: index,
          end: index + 7,
          isLeftRight: false,
        },
        depth,
      });
      index += 7;
      continue;
    }

    if (text.startsWith("\\rangle", index)) {
      let matchIdx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (!stack[i].item.isLeftRight && stack[i].item.type === "angle") {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx !== -1) {
        const matched = stack.splice(matchIdx, 1)[0];
        pairs.push({
          open: matched.item,
          close: {
            type: "angle",
            start: index,
            end: index + 7,
            isLeftRight: false,
          },
          depth: matched.depth,
        });
      } else {
        unmatched.push({
          type: "angle",
          start: index,
          end: index + 7,
          isLeftRight: false,
        });
      }
      index += 7;
      continue;
    }

    // Standard brackets ( ... ) and [ ... ]
    if (text[index] === "(" || text[index] === "[") {
      const type = text[index] === "(" ? "paren" : "bracket";
      const depth = stack.length;
      stack.push({
        item: {
          type,
          start: index,
          end: index + 1,
          isLeftRight: false,
        },
        depth,
      });
      index += 1;
      continue;
    }

    if (text[index] === ")" || text[index] === "]") {
      const type = text[index] === ")" ? "paren" : "bracket";
      let matchIdx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (!stack[i].item.isLeftRight && stack[i].item.type === type) {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx !== -1) {
        const matched = stack.splice(matchIdx, 1)[0];
        pairs.push({
          open: matched.item,
          close: {
            type,
            start: index,
            end: index + 1,
            isLeftRight: false,
          },
          depth: matched.depth,
        });
      } else {
        unmatched.push({
          type,
          start: index,
          end: index + 1,
          isLeftRight: false,
        });
      }
      index += 1;
      continue;
    }

    // Bare grouping braces { ... }
    if (includeBareBraces && text[index] === "{") {
      const depth = stack.length;
      stack.push({
        item: {
          type: "bare_brace",
          start: index,
          end: index + 1,
          isLeftRight: false,
        },
        depth,
      });
      index += 1;
      continue;
    }

    if (includeBareBraces && text[index] === "}") {
      let matchIdx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (!stack[i].item.isLeftRight && stack[i].item.type === "bare_brace") {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx !== -1) {
        const matched = stack.splice(matchIdx, 1)[0];
        pairs.push({
          open: matched.item,
          close: {
            type: "bare_brace",
            start: index,
            end: index + 1,
            isLeftRight: false,
          },
          depth: matched.depth,
        });
      } else {
        unmatched.push({
          type: "bare_brace",
          start: index,
          end: index + 1,
          isLeftRight: false,
        });
      }
      index += 1;
      continue;
    }

    // Skip generic LaTeX commands like \frac, \sqrt, etc.
    if (text[index] === "\\") {
      const cmdMatch = text.slice(index).match(/^(\\[A-Za-z]+|\\.)/);
      if (cmdMatch) {
        index += cmdMatch[0].length;
        continue;
      }
    }

    index++;
  }

  // Any remaining items left on stack were never closed!
  for (const remaining of stack) {
    unmatched.push(remaining.item);
  }

  return { pairs, unmatched };
}

/**
 * Parses all balanced delimiter pairs in a LaTeX string.
 */
export function findDelimiterPairs(
  text: string,
  options?: { includeBareBraces?: boolean }
): DelimiterPair[] {
  return findDelimiterScan(text, options).pairs;
}

/**
 * Collects ColorSpan items for rainbow delimiters.
 * @param options Options including forLatexWrap, palette, includeBareBraces, highlightUnmatched.
 */
export function collectDelimiterSpans(
  text: string,
  options?: DelimiterCollectorOptions
): ColorSpan[] {
  const forLatexWrap = options?.forLatexWrap ?? false;
  // SAFETY GUARD: If forLatexWrap is true (LaTeX baking), we NEVER include bare braces!
  const includeBareBraces = forLatexWrap ? false : (options?.includeBareBraces ?? false);
  const scan = findDelimiterScan(text, { includeBareBraces: options?.includeBareBraces ?? false });
  const palette = options?.palette || RAINBOW_DELIMITER_COLORS;
  const spans: ColorSpan[] = [];

  if (!options?.onlyUnmatched) {
    for (const pair of scan.pairs) {
      // SAFETY GUARD: Never emit bare braces into LaTeX string output
      if (forLatexWrap && pair.open.type === "bare_brace") {
        continue;
      }
      if (pair.open.type === "bare_brace" && !includeBareBraces) {
        continue;
      }

      const color = palette[pair.depth % palette.length];
      if (forLatexWrap && pair.open.isLeftRight) {
        // Wrap entire \left...\right expression so KaTeX/MathJax does not fail group boundaries
        spans.push({
          start: pair.open.start,
          end: pair.close.end,
          color,
          priority: 24,
        });
      } else {
        // Discrete opening and closing spans
        spans.push({
          start: pair.open.start,
          end: pair.open.end,
          color,
          priority: 25,
        });
        spans.push({
          start: pair.close.start,
          end: pair.close.end,
          color,
          priority: 25,
        });
      }
    }
  }

  // Highlight unmatched delimiters (unclosed opening or stray closing)
  if (options?.highlightUnmatched) {
    const errColor = options?.errorColor || "#f7768e";
    for (const item of scan.unmatched) {
      if (item.type === "bare_brace" && !options?.includeBareBraces && !options?.onlyUnmatched) {
        continue;
      }
      spans.push({
        start: item.start,
        end: item.end,
        color: errColor,
        priority: 99,
      });
    }
  }

  return spans.sort((a, b) => a.start - b.start);
}
