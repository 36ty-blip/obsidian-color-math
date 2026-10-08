// src/parsers/delimiters.ts

import { RAINBOW_DELIMITER_COLORS } from "../config";
import { ColorSpan } from "../utils/spans";
import { skipEnvironmentHead, readColorCommand, skipMacroDefinition } from "../utils/latex_helpers";

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
  strictBracketWarnings?: boolean;
}

const OPTIONAL_BRACKET_COMMANDS = new Set([
  "\\sqrt",
  "\\\\",
  "\\tag",
  "\\xleftarrow",
  "\\xrightarrow",
  "\\rule",
  "\\makebox",
  "\\framebox",
  "\\parbox",
]);

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

/**
 * Checks if a substring contains a top-level comma (depth 0 of any nested brackets/braces),
 * used to identify valid mathematical intervals like [a, b) and (a, b].
 */
function hasTopLevelComma(text: string, start: number, end: number): boolean {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let i = start;
  while (i < end) {
    const ch = text[i];
    if (ch === "%") {
      i = skipComment(text, i);
      continue;
    }
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === "{" || text.startsWith("\\{", i)) {
      if (text.startsWith("\\{", i)) i++;
      braceDepth++;
    } else if (ch === "}" || text.startsWith("\\}", i)) {
      if (text.startsWith("\\}", i)) i++;
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (ch === "," && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      return true;
    }
    i++;
  }
  return false;
}

const EXTENSIBLE_DELIM_RE =
  /^(\(|\)|\[|\]|\\\{|\\\}|\\langle|\\rangle|\||\\\||\\vert|\\Vert|\\lvert|\\rvert|\\lVert|\\rVert|\\lceil|\\rceil|\\lfloor|\\rfloor|\\backslash|\/|\.|[⟨⟩⟦⟧‖⟪⟫⎰⎱⦃⦄⌈⌉⌊⌋])/;
const SIZED_DELIM_RE =
  /^(\(|\)|\[|\]|\\\{|\\\}|\\langle|\\rangle|\||\\\||\\vert|\\Vert|\\lvert|\\rvert|\\lVert|\\rVert|\\lceil|\\rceil|\\lfloor|\\rfloor|[⟨⟩⟦⟧‖⟪⟫⎰⎱⦃⦄⌈⌉⌊⌋])/;

export const UNICODE_OPEN_DELIMS: Record<string, string> = {
  "⟦": "bracket",
  "⟨": "angle",
  "⟪": "angle",
  "⦃": "brace",
  "⎰": "brace",
  "⌈": "bracket",
  "⌊": "bracket",
};

export const UNICODE_CLOSE_DELIMS: Record<string, string> = {
  "⟧": "bracket",
  "⟩": "angle",
  "⟫": "angle",
  "⦄": "brace",
  "⎱": "brace",
  "⌉": "bracket",
  "⌋": "bracket",
};

function getDelimiterType(str: string): string {
  if (str === "(" || str === ")") return "paren";
  if (str === "[" || str === "]" || str === "⟦" || str === "⟧" || str === "⌈" || str === "⌉" || str === "⌊" || str === "⌋") return "bracket";
  if (str === "\\{" || str === "\\}" || str === "⦃" || str === "⦄" || str === "⎰" || str === "⎱") return "brace";
  if (str === "{" || str === "}") return "bare_brace";
  if (str === "\\langle" || str === "\\rangle" || str === "⟨" || str === "⟩" || str === "⟪" || str === "⟫") return "angle";
  if (
    str === "|" ||
    str === "\\|" ||
    str === "\\vert" ||
    str === "\\Vert" ||
    str === "\\lvert" ||
    str === "\\rvert" ||
    str === "\\lVert" ||
    str === "\\rVert" ||
    str === "‖"
  )
    return "pipe";
  if (
    str === "\\lceil" ||
    str === "\\rceil" ||
    str === "\\lfloor" ||
    str === "\\rfloor"
  )
    return "bracket";
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
  const ignoredBracketIndices = new Set<number>();

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

    // Skip macro definition headers: \newcommand{\foo}[1]{...}, \def\foo{...}
    const macroDefEnd = skipMacroDefinition(text, index);
    if (macroDefEnd !== null) {
      index = macroDefEnd;
      continue;
    }

    // Skip color commands like \textcolor{...}{...} so inner braces are not counted as bare delimiters
    const colorCmd = readColorCommand(text, index);
    if (colorCmd !== null) {
      index = colorCmd[1];
      continue;
    }

    // Check \left / \right
    if (
      text.startsWith("\\left", index) &&
      (index + 5 === text.length || !/[A-Za-z]/.test(text[index + 5]))
    ) {
      const afterLeft = skipWhitespace(text, index + 5);
      const delimMatch = text.slice(afterLeft).match(EXTENSIBLE_DELIM_RE);
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
      } else {
        // Bare \left without extensible delimiter
        const depth = stack.length;
        stack.push({
          item: {
            type: "bare_left",
            start: index,
            end: index + 5,
            isLeftRight: true,
          },
          depth,
        });
        index += 5;
        continue;
      }
    }

    if (
      text.startsWith("\\right", index) &&
      (index + 6 === text.length || !/[A-Za-z]/.test(text[index + 6]))
    ) {
      const afterRight = skipWhitespace(text, index + 6);
      const delimMatch = text.slice(afterRight).match(EXTENSIBLE_DELIM_RE);
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
      } else {
        // Bare \right without extensible delimiter (always unmatched syntax error)
        unmatched.push({
          type: "bare_right",
          start: index,
          end: index + 6,
          isLeftRight: true,
        });
        index += 6;
        continue;
      }
    }

    // Sized delimiters: \big, \bigl, \bigr, \bigm, \Big, \Bigl, \Bigr, \Bigm, \bigg, \biggl, \biggr, \biggm, \Bigg, \Biggl, \Biggr, \Biggm
    const sizedPrefix = text.slice(index).match(/^(\\(?:Bigg|bigg|Big|big)[lrm]?)/);
    if (sizedPrefix) {
      const prefixStr = sizedPrefix[1];
      const afterPrefix = index + prefixStr.length;
      const delimMatch = text.slice(afterPrefix).match(SIZED_DELIM_RE);
      if (delimMatch) {
        const delimStr = delimMatch[0];
        const fullLen = prefixStr.length + delimStr.length;
        const type = getDelimiterType(delimStr);

        const isExplicitOpen = prefixStr.endsWith("l");
        const isExplicitClose = prefixStr.endsWith("r");
        const isOpenDelim = !isExplicitClose && (isExplicitOpen || ["(", "[", "\\{", "\\langle", "\\lceil", "\\lfloor", "⟨", "⟦", "⦃", "⎰", "⌈", "⌊"].includes(delimStr));
        const isCloseDelim = !isExplicitOpen && (isExplicitClose || [")", "]", "\\}", "\\rangle", "\\rceil", "\\rfloor", "⟩", "⟧", "⦄", "⎱", "⌉", "⌋"].includes(delimStr));

        if (isOpenDelim) {
          const depth = stack.length;
          stack.push({
            item: {
              type,
              start: index,
              end: index + fullLen,
              isLeftRight: false,
            },
            depth,
          });
          index += fullLen;
          continue;
        }

        if (isCloseDelim) {
          let matchIdx = -1;
          for (let i = stack.length - 1; i >= 0; i--) {
            if (!stack[i].item.isLeftRight && stack[i].item.type === type) {
              matchIdx = i;
              break;
            }
          }
          // Half-open interval fallback: \bigl[ a, b \bigr) or \bigl( a, b \bigr]
          if (matchIdx === -1 && (type === "paren" || type === "bracket")) {
            const altType = type === "paren" ? "bracket" : "paren";
            for (let i = stack.length - 1; i >= 0; i--) {
              if (
                !stack[i].item.isLeftRight &&
                stack[i].item.type === altType &&
                hasTopLevelComma(text, stack[i].item.end, index)
              ) {
                matchIdx = i;
                break;
              }
            }
          }
          if (matchIdx !== -1) {
            const matched = stack.splice(matchIdx, 1)[0];
            pairs.push({
              open: matched.item,
              close: {
                type,
                start: index,
                end: index + fullLen,
                isLeftRight: false,
              },
              depth: matched.depth,
            });
          } else {
            unmatched.push({
              type,
              start: index,
              end: index + fullLen,
              isLeftRight: false,
            });
          }
          index += fullLen;
          continue;
        }

        // Symmetric delimiters like \big| or \Bigm|: match stack if existing, else push
        if (type === "pipe" || prefixStr.endsWith("m")) {
          let matchIdx = -1;
          for (let i = stack.length - 1; i >= 0; i--) {
            if (!stack[i].item.isLeftRight && stack[i].item.type === type) {
              matchIdx = i;
              break;
            }
          }
          if (matchIdx !== -1 && !isExplicitOpen) {
            const matched = stack.splice(matchIdx, 1)[0];
            pairs.push({
              open: matched.item,
              close: {
                type,
                start: index,
                end: index + fullLen,
                isLeftRight: false,
              },
              depth: matched.depth,
            });
          } else {
            const depth = stack.length;
            stack.push({
              item: {
                type,
                start: index,
                end: index + fullLen,
                isLeftRight: false,
              },
              depth,
            });
          }
          index += fullLen;
          continue;
        }
      }
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

    // Bare Unicode opening delimiters (⟨, ⟦, ⟪, ⌈, ⌊, ⦃, ⎰)
    const uniOpenType = UNICODE_OPEN_DELIMS[text[index]];
    if (uniOpenType) {
      const depth = stack.length;
      stack.push({
        item: {
          type: uniOpenType,
          start: index,
          end: index + 1,
          isLeftRight: false,
        },
        depth,
      });
      index += 1;
      continue;
    }

    // Bare Unicode closing delimiters (⟩, ⟧, ⟫, ⌉, ⌋, ⦄, ⎱)
    const uniCloseType = UNICODE_CLOSE_DELIMS[text[index]];
    if (uniCloseType) {
      let matchIdx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (!stack[i].item.isLeftRight && stack[i].item.type === uniCloseType) {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx !== -1) {
        const matched = stack.splice(matchIdx, 1)[0];
        pairs.push({
          open: matched.item,
          close: {
            type: uniCloseType,
            start: index,
            end: index + 1,
            isLeftRight: false,
          },
          depth: matched.depth,
        });
      } else {
        unmatched.push({
          type: uniCloseType,
          start: index,
          end: index + 1,
          isLeftRight: false,
        });
      }
      index += 1;
      continue;
    }

    // Standard brackets ( ... ) and [ ... ]
    if (text[index] === "(" || (text[index] === "[" && !ignoredBracketIndices.has(index))) {
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

    if (text[index] === ")" || (text[index] === "]" && !ignoredBracketIndices.has(index))) {
      const type = text[index] === ")" ? "paren" : "bracket";
      let matchIdx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (!stack[i].item.isLeftRight && stack[i].item.type === type) {
          matchIdx = i;
          break;
        }
      }
      // Half-open interval fallback: [a, b) or (a, b] containing top-level comma
      if (matchIdx === -1 && (type === "paren" || type === "bracket")) {
        const altType = type === "paren" ? "bracket" : "paren";
        for (let i = stack.length - 1; i >= 0; i--) {
          if (!stack[i].item.isLeftRight && stack[i].item.type === altType && hasTopLevelComma(text, stack[i].item.end, index)) {
            matchIdx = i;
            break;
          }
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

    // String quotes " ... "
    if (text.charCodeAt(index) === 34) {
      let matchIdx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (!stack[i].item.isLeftRight && stack[i].item.type === "quote") {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx !== -1) {
        const matched = stack.splice(matchIdx, 1)[0];
        pairs.push({
          open: matched.item,
          close: {
            type: "quote",
            start: index,
            end: index + 1,
            isLeftRight: false,
          },
          depth: matched.depth,
        });
      } else {
        const depth = stack.length;
        stack.push({
          item: {
            type: "quote",
            start: index,
            end: index + 1,
            isLeftRight: false,
          },
          depth,
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
        const cmd = cmdMatch[0];
        index += cmd.length;
        if (OPTIONAL_BRACKET_COMMANDS.has(cmd)) {
          let cur = skipWhitespace(text, index);
          if (cur < text.length && text[cur] === "[") {
            let depth = 1;
            let j = cur + 1;
            while (j < text.length && depth > 0) {
              if (text[j] === "[") depth++;
              else if (text[j] === "]") depth--;
              j++;
            }
            if (depth === 0) {
              ignoredBracketIndices.add(cur);
              ignoredBracketIndices.add(j - 1);
            }
          }
        }
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
  const scan = findDelimiterScan(text, {
    includeBareBraces: options?.highlightUnmatched ? true : Boolean(options?.includeBareBraces),
  });
  const palette = options?.palette || RAINBOW_DELIMITER_COLORS;
  const spans: ColorSpan[] = [];

  if (!options?.onlyUnmatched) {
    for (const pair of scan.pairs) {
      // SAFETY GUARD: Never emit bare braces or quotes into LaTeX string output
      if (forLatexWrap && (pair.open.type === "bare_brace" || pair.open.type === "quote")) {
        continue;
      }
      if (pair.open.type === "quote") {
        continue;
      }
      if (pair.open.type === "bare_brace" && !includeBareBraces) {
        continue;
      }

      const color = palette[pair.depth % palette.length];
      if (forLatexWrap && pair.open.isLeftRight) {
        const innerText = text.slice(pair.open.end, pair.close.start);
        if (/\\begin\s*\{|&|\\\\/.test(innerText)) {
          // Never wrap across environment blocks or alignment tabs (&, \\):
          // In MathJax and KaTeX, wrapping across & breaks alignment tables
          continue;
        }
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
    const strict = options?.strictBracketWarnings === true;

    for (const item of scan.unmatched) {
      // True MathJax compiler syntax errors:
      // 1. Unmatched bare grouping braces: item.type === "bare_brace"
      // 2. Unmatched quotes: item.type === "quote"
      // 3. Unmatched \left / \right: item.isLeftRight === true
      const isSyntaxError = item.type === "bare_brace" || item.type === "quote" || item.isLeftRight === true;

      // Mathematical delimiters (bare paren, bracket, brace, angle, pipe) only warn if strictBracketWarnings is enabled
      if (!isSyntaxError && !strict) {
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
