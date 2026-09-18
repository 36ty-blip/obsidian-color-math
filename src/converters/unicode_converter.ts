// src/converters/unicode_converter.ts

/**
 * Lossless bidirectional converter between standard LaTeX math commands and Unicode math glyphs.
 * Only converts tokens within math blocks/inlines, protecting delimiters and non-math prose.
 */

import {
  UNICODE_DIFFERENTIALS,
  UNICODE_CONSTANTS,
  UNICODE_VECTORS,
  UNICODE_INTEGRALS,
  UNICODE_BIG_OPERATORS,
  UNICODE_RELATIONS,
  UNICODE_ARROWS,
  UNICODE_SETS,
  UNICODE_MULTIPLICATION,
  UNICODE_ADDITIVE,
  UNICODE_GREEK_LOWER_STANDARD,
  UNICODE_GREEK_LOWER_PLANE1,
  UNICODE_GREEK_UPPER_STANDARD,
  UNICODE_GREEK_UPPER_PLANE1,
  PROTECTED_DELIMITER_MACROS,
  DELIMITER_AUTO_REPAIR,
} from "../config/unicode";
import { scanMarkdown } from "../parsers/markdown_scanner";

export interface UnicodeConversionOptions {
  convertDefiniteIntegrals?: boolean; // default: false (preserves \int_a^b)
  convertBoundedOperators?: boolean;  // default: false (preserves \sum_{i=1}^n)
  greekStyle?: "plane1" | "standard"; // default: "plane1" (𝝍) vs "standard" (ψ)
  convertProseToUnicode?: boolean;    // default: true (\psi -> 𝝍 in prose)
  convertProseToLatex?: boolean;      // default: false (𝝍 in prose preserved)
}

const DELIMITER_PREFIX_REGEX =
  /(?:\\(?:left|right|middle|bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr|bigm|Bigm))\s*$/;

/**
 * Checks if the command at `cmdStart` follows an extensible delimiter prefix like \left or \right.
 */
function isProtectedDelimiter(body: string, cmdStart: number): boolean {
  const prefixText = body.slice(0, cmdStart);
  return DELIMITER_PREFIX_REGEX.test(prefixText);
}

/**
 * Checks if an operator like \int or \sum is immediately followed by limits (_ or ^).
 */
function hasLimits(body: string, cmdEnd: number): boolean {
  let idx = cmdEnd;
  while (idx < body.length && /\s/.test(body[idx])) {
    idx++;
  }
  return idx < body.length && (body[idx] === "_" || body[idx] === "^");
}

/**
 * Builds the LaTeX -> Unicode replacement map based on user options.
 */
export function getLatexToUnicodeMap(
  options?: UnicodeConversionOptions
): { key: string; val: string }[] {
  const greekLower =
    options?.greekStyle === "standard"
      ? UNICODE_GREEK_LOWER_STANDARD
      : UNICODE_GREEK_LOWER_PLANE1;

  const greekUpper =
    options?.greekStyle === "standard"
      ? UNICODE_GREEK_UPPER_STANDARD
      : UNICODE_GREEK_UPPER_PLANE1;

  const rawMap: Record<string, string> = {
    ...UNICODE_DIFFERENTIALS,
    ...UNICODE_CONSTANTS,
    ...UNICODE_VECTORS,
    ...UNICODE_RELATIONS,
    ...UNICODE_ARROWS,
    ...UNICODE_SETS,
    ...UNICODE_MULTIPLICATION,
    ...UNICODE_ADDITIVE,
    ...greekLower,
    ...greekUpper,
  };

  // Sort keys by length descending to match longer commands first (\longrightarrow before \to)
  return Object.entries(rawMap)
    .sort(([a], [b]) => b.length - a.length)
    .map(([key, val]) => ({ key, val }));
}

/**
 * Builds the Unicode -> LaTeX replacement map.
 * Supports both Plane 1 and Standard Greek, all operators, differentials, and relations.
 */
export function getUnicodeToLatexMap(): { char: string; latex: string }[] {
  const map: Record<string, string> = {};

  // Register LaTeX -> Unicode inverses
  const sources = [
    UNICODE_DIFFERENTIALS,
    UNICODE_CONSTANTS,
    UNICODE_VECTORS,
    UNICODE_INTEGRALS,
    UNICODE_BIG_OPERATORS,
    UNICODE_RELATIONS,
    UNICODE_ARROWS,
    UNICODE_SETS,
    UNICODE_MULTIPLICATION,
    UNICODE_ADDITIVE,
    UNICODE_GREEK_LOWER_PLANE1,
    UNICODE_GREEK_LOWER_STANDARD,
    UNICODE_GREEK_UPPER_PLANE1,
    UNICODE_GREEK_UPPER_STANDARD,
  ];

  for (const src of sources) {
    for (const [tex, uni] of Object.entries(src)) {
      if (!map[uni]) {
        map[uni] = tex;
      }
    }
  }

  // Register common aliases (e.g. Sans-Serif Bold Italic 𝝍 from Espanso)
  if (!map["𝝍"]) {
    map["𝝍"] = "\\psi";
  }

  // Sort characters by length descending (Plane 1 surrogate pairs have length 2)
  return Object.entries(map)
    .sort(([a], [b]) => b.length - a.length)
    .map(([char, latex]) => ({ char, latex }));
}

/**
 * Converts LaTeX commands in a single math expression to clean Unicode glyphs.
 */
export function convertLatexToUnicode(
  mathBody: string,
  options?: UnicodeConversionOptions
): string {
  const map = getLatexToUnicodeMap(options);
  let result = "";
  let idx = 0;

  while (idx < mathBody.length) {
    if (mathBody[idx] === "\\") {
      const match = mathBody.slice(idx).match(/^(\\[A-Za-z]+)/);
      if (match) {
        const cmd = match[1];
        const cmdName = cmd.slice(1);
        const cmdEnd = idx + cmd.length;

        // 1. Delimiter Protection: never convert delimiters attached to \left, \right, \Bigl, etc.
        if (PROTECTED_DELIMITER_MACROS.has(cmdName) && isProtectedDelimiter(mathBody, idx)) {
          result += cmd;
          idx = cmdEnd;
          continue;
        }

        // 2. Integral handling: check for bounds (_ or ^)
        if (cmd in UNICODE_INTEGRALS) {
          const bounded = hasLimits(mathBody, cmdEnd);
          if (!bounded || options?.convertDefiniteIntegrals === true) {
            result += UNICODE_INTEGRALS[cmd];
            idx = cmdEnd;
            continue;
          } else {
            // Preserve \int_a^b
            result += cmd;
            idx = cmdEnd;
            continue;
          }
        }

        // 3. Big operators handling: check for bounds (_ or ^)
        if (cmd in UNICODE_BIG_OPERATORS) {
          const bounded = hasLimits(mathBody, cmdEnd);
          if (!bounded || options?.convertBoundedOperators === true) {
            result += UNICODE_BIG_OPERATORS[cmd];
            idx = cmdEnd;
            continue;
          } else {
            // Preserve \sum_{i=1}^n
            result += cmd;
            idx = cmdEnd;
            continue;
          }
        }

        // 4. General dictionary replacement
        const entry = map.find((m) => m.key === cmd);
        if (entry) {
          result += entry.val;
          // For differentials like \partial, consume one delimiter space if followed by a variable (e.g. \partial t -> ∂t)
          if (cmd in UNICODE_DIFFERENTIALS && cmdEnd < mathBody.length && mathBody[cmdEnd] === " ") {
            const nextChar = mathBody[cmdEnd + 1];
            if (nextChar && /[A-Za-z0-9]/.test(nextChar)) {
              idx = cmdEnd + 1;
              continue;
            }
          }
          idx = cmdEnd;
          continue;
        }

        result += cmd;
        idx = cmdEnd;
        continue;
      }
    }

    result += mathBody[idx];
    idx++;
  }

  return result;
}

/**
 * Converts Unicode math symbols in a single math expression back to standard LaTeX commands.
 * Automatically repairs broken delimiter syntax like \left⟨ -> \left\langle.
 */
export function convertUnicodeToLatex(mathBody: string): string {
  // Step 1: Auto-repair broken delimiter syntax like \left⟨, \right⟩, \Bigl⌈
  let repaired = mathBody.replace(
    /(\\(?:left|right|middle|bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr|bigm|Bigm)\s*)([⟨⟩⌈⌉⌊⌋‖⎸])/g,
    (_, prefix: string, delim: string) => {
      const fixed = DELIMITER_AUTO_REPAIR[delim] || delim;
      return `${prefix}${fixed}`;
    }
  );

  // Step 2: Convert Unicode symbols to canonical LaTeX
  const map = getUnicodeToLatexMap();
  let result = "";
  let idx = 0;

  while (idx < repaired.length) {
    const entry = map.find((m) => repaired.startsWith(m.char, idx));
    if (entry) {
      const nextCharIdx = idx + entry.char.length;
      const nextChar = nextCharIdx < repaired.length ? repaired[nextCharIdx] : "";
      // Spacing guard: add trailing space if followed by an ASCII letter (e.g. \psi x, not \psix)
      const needsTrailingSpace = /[a-zA-Z]/.test(nextChar);
      result += entry.latex + (needsTrailingSpace ? " " : "");
      idx += entry.char.length;
      continue;
    }

    result += repaired[idx];
    idx++;
  }

  return result;
}

/**
 * Transforms all math expressions in a Markdown document in-place.
 * Prose, code blocks, and markdown structure are guaranteed untouched.
 */
export function convertDocumentMath(
  text: string,
  direction: "to-unicode" | "to-latex",
  options?: UnicodeConversionOptions
): string {
  const scan = scanMarkdown(text);

  type SpanItem =
    | { kind: "math"; span: (typeof scan.mathBlocks)[number] }
    | { kind: "protected"; span: (typeof scan.protected)[number] };

  const spansWithType: SpanItem[] = [
    ...scan.mathBlocks.map((s) => ({ kind: "math" as const, span: s })),
    ...scan.mathInlines.map((s) => ({ kind: "math" as const, span: s })),
    ...scan.protected.map((s) => ({ kind: "protected" as const, span: s })),
  ];
  spansWithType.sort((a, b) => a.span.start - b.span.start);

  const convertProseToUnicode = options?.convertProseToUnicode ?? false;
  const convertProseToLatex = options?.convertProseToLatex ?? false;

  const convertProse = (chunk: string): string => {
    if (direction === "to-unicode" && convertProseToUnicode) {
      return convertLatexToUnicode(chunk, options);
    }
    if (direction === "to-latex" && convertProseToLatex) {
      return convertUnicodeToLatex(chunk);
    }
    return chunk;
  };

  let result = "";
  let idx = 0;

  for (const item of spansWithType) {
    if (item.span.start > idx) {
      result += convertProse(text.slice(idx, item.span.start));
    }

    if (item.kind === "protected") {
      // Code blocks and inline code spans are never modified
      result += text.slice(item.span.start, item.span.end);
    } else {
      const mathSpan = item.span;
      result += text.slice(mathSpan.start, mathSpan.contentStart);
      const mathContent = text.slice(mathSpan.contentStart, mathSpan.contentEnd);
      const converted =
        direction === "to-unicode"
          ? convertLatexToUnicode(mathContent, options)
          : convertUnicodeToLatex(mathContent);
      result += converted;
      result += text.slice(mathSpan.contentEnd, mathSpan.end);
    }

    idx = item.span.end;
  }

  if (idx < text.length) {
    result += convertProse(text.slice(idx));
  }

  return result;
}

/**
 * Asynchronously converts math expressions in a Markdown document in chunks of 3-6 blocks,
 * cooperatively yielding to the event loop between chunks so the Windows/Electron UI never freezes.
 */
export async function convertDocumentMathChunked(
  text: string,
  direction: "to-unicode" | "to-latex",
  options?: UnicodeConversionOptions,
  chunkSize: number = 4,
  onProgress?: (processed: number, total: number) => void
): Promise<string> {
  const scan = scanMarkdown(text);

  type SpanItem =
    | { kind: "math"; span: (typeof scan.mathBlocks)[number] }
    | { kind: "protected"; span: (typeof scan.protected)[number] };

  const spansWithType: SpanItem[] = [
    ...scan.mathBlocks.map((s) => ({ kind: "math" as const, span: s })),
    ...scan.mathInlines.map((s) => ({ kind: "math" as const, span: s })),
    ...scan.protected.map((s) => ({ kind: "protected" as const, span: s })),
  ];
  spansWithType.sort((a, b) => a.span.start - b.span.start);

  const convertProseToUnicode = options?.convertProseToUnicode ?? false;
  const convertProseToLatex = options?.convertProseToLatex ?? false;

  const convertProse = (chunk: string): string => {
    if (direction === "to-unicode" && convertProseToUnicode) {
      return convertLatexToUnicode(chunk, options);
    }
    if (direction === "to-latex" && convertProseToLatex) {
      return convertUnicodeToLatex(chunk);
    }
    return chunk;
  };

  let result = "";
  let idx = 0;
  let mathBlockCount = 0;
  const totalMathBlocks = scan.mathBlocks.length + scan.mathInlines.length;

  for (let i = 0; i < spansWithType.length; i++) {
    const item = spansWithType[i];
    if (item.span.start > idx) {
      result += convertProse(text.slice(idx, item.span.start));
    }

    if (item.kind === "protected") {
      result += text.slice(item.span.start, item.span.end);
    } else {
      const mathSpan = item.span;
      result += text.slice(mathSpan.start, mathSpan.contentStart);
      const mathContent = text.slice(mathSpan.contentStart, mathSpan.contentEnd);
      const converted =
        direction === "to-unicode"
          ? convertLatexToUnicode(mathContent, options)
          : convertUnicodeToLatex(mathContent);
      result += converted;
      result += text.slice(mathSpan.contentEnd, mathSpan.end);

      mathBlockCount++;
      if (mathBlockCount % chunkSize === 0) {
        if (onProgress) {
          onProgress(mathBlockCount, totalMathBlocks);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    idx = item.span.end;
  }

  if (idx < text.length) {
    result += convertProse(text.slice(idx));
  }

  return result;
}

