// src/parsers/cst/index.ts
//! Public API for Concrete Syntax Tree (CST) Parser & 14-Discipline Engine.

import { MathCSTParser } from "./parser";
import { collectSpansFromCST } from "./collector";
import { CSTCollectorOptions } from "./types";
import { ColorSpan } from "../../utils/spans";

export * from "./types";
export * from "./tokenizer";
export * from "./stack";
export * from "./parser";
export * from "./collector";

/**
 * Convenience entrypoint: Parses LaTeX math string directly into atomic ColorSpans via CST.
 */
export function parseMathWithCST(
  text: string,
  options?: CSTCollectorOptions
): ColorSpan[] {
  const parser = new MathCSTParser(text);
  const ast = parser.parse();
  return collectSpansFromCST(ast, options);
}
