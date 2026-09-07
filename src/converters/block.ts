// src/converters/block.ts

import { COLORS, ColorPalette, ColorMathOptions } from "../config";
import { scanMarkdown } from "../parsers/markdown_scanner";
import { convertDerivativeLine } from "./derivative";
import { colorGenericMathLine, colorLatexBody } from "./generic";
import { convertMatrixBlock } from "./matrix";

export type Converter = (text: string, palette?: ColorPalette) => string | null;

const LINE_CONVERTERS: Converter[] = [
  (text, palette) => convertDerivativeLine(text, palette),
  () => null, // convert_integral_line stub
  () => null, // convert_limit_line stub
  () => null, // convert_equation_line stub
];

const BLOCK_CONVERTERS: Converter[] = [
  (text, palette) => convertMatrixBlock(text, palette),
  () => null, // convert_align_block stub
];

function tryConverters(
  text: string,
  converters: Converter[],
  palette: ColorPalette
): string | null {
  for (const converter of converters) {
    const converted = converter(text, palette);
    if (converted !== null) {
      return converted;
    }
  }
  return null;
}

export function convertMathBlock(
  block: string,
  palette: ColorPalette = COLORS,
  options?: ColorMathOptions
): string {
  const match = block.match(/^(\s*#+\s*)?\$\$([\s\S]*)\$\$([\s]*)$/);
  if (!match) {
    return block;
  }

  const prefix = match[1] || "";
  const body = match[2];
  const suffix = match[3];

  const lineMatch = tryConverters(block, LINE_CONVERTERS, palette);
  if (lineMatch !== null) {
    return lineMatch;
  }

  const blockMatch = tryConverters(block, BLOCK_CONVERTERS, palette);
  if (blockMatch !== null) {
    return blockMatch;
  }

  // fallback to generic coloring
  return `${prefix}$$${colorLatexBody(body, palette, options)}$$${suffix}`;
}

export function convertLine(
  line: string,
  palette: ColorPalette = COLORS,
  options?: ColorMathOptions
): string {
  const converted = tryConverters(line, LINE_CONVERTERS, palette);
  if (converted !== null) {
    return converted;
  }
  return colorGenericMathLine(line, palette, options);
}

export function convertText(
  text: string,
  palette: ColorPalette = COLORS,
  options?: ColorMathOptions
): string {
  const mathBlocks = scanMarkdown(text).mathBlocks;
  if (mathBlocks.length === 0) {
    return text;
  }

  const converted: string[] = [];
  let index = 0;
  for (const span of mathBlocks) {
    converted.push(text.slice(index, span.start));
    converted.push(
      convertMathBlock(text.slice(span.start, span.end), palette, options)
    );
    index = span.end;
  }
  converted.push(text.slice(index));
  return converted.join("");
}
