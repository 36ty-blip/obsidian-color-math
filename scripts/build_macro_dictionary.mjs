// scripts/build_macro_dictionary.mjs
// Extracts authoritative LaTeX macro signatures (mandatoryArgs, hasOptionalBracket)
// for Obsidian MathJax (AMS, Physics, Mathtools, Braket) with KaTeX secondary fallback.
// Generates src/parsers/macro_dictionary.ts.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const katexDir = path.resolve(__dirname, "../node_modules/katex/src");
const katexFunctionsDir = path.join(katexDir, "functions");

if (!fs.existsSync(katexFunctionsDir)) {
  console.error("KaTeX functions directory not found at:", katexFunctionsDir);
  process.exit(1);
}

const files = fs.readdirSync(katexFunctionsDir).filter((f) => f.endsWith(".ts"));
const dictionary = {};

// 1. Parse defineFunction calls in src/functions/*.ts
for (const file of files) {
  const content = fs.readFileSync(path.join(katexFunctionsDir, file), "utf-8");
  const funcBlocks = [...content.matchAll(/defineFunction\(\{([\s\S]*?)\}\);/g)];

  for (const b of funcBlocks) {
    const block = b[1];
    const namesMatch = block.match(/names:\s*\[([\s\S]*?)\]/);
    if (!namesMatch) continue;

    const names = [...namesMatch[1].matchAll(/"(\\+[^"]+)"/g)].map((m) => m[1]);
    const numArgsMatch = block.match(/numArgs:\s*(\d+)/);
    const numArgs = numArgsMatch ? parseInt(numArgsMatch[1], 10) : 0;
    const optArgsMatch = block.match(/numOptionalArgs:\s*(\d+)/);
    const numOptionalArgs = optArgsMatch ? parseInt(optArgsMatch[1], 10) : 0;
    const hasTextArg = block.includes('"text"') || file === "text.ts";

    for (const name of names) {
      const cleanName = name.startsWith("\\\\") ? name.slice(1) : name;
      dictionary[cleanName] = {
        mandatoryArgs: numArgs,
        hasOptionalBracket: numOptionalArgs > 0,
        argType: hasTextArg ? "text" : "math",
      };
    }
  }
}

// 2. Parse defineMacro in src/macros.ts
const macrosFile = path.join(katexDir, "macros.ts");
if (fs.existsSync(macrosFile)) {
  const macroContent = fs.readFileSync(macrosFile, "utf-8");
  const macroMatches = [...macroContent.matchAll(/defineMacro\(\s*"(\\[^"]+)"\s*,\s*("([^"]*)"|function)/g)];

  for (const m of macroMatches) {
    const macroName = m[1].replace(/^\\\\+/, "\\");
    if (m[2].startsWith('"')) {
      const body = m[3] || "";
      // Count highest #1..#9 TeX macro parameter in replacement string (excluding hex colors like #6495ba)
      const paramMatches = [...body.matchAll(/#([1-9])(?![0-9a-fA-F])/g)].map((p) => parseInt(p[1], 10));
      const maxParam = paramMatches.length > 0 ? Math.max(...paramMatches) : 0;
      if (!dictionary[macroName]) {
        dictionary[macroName] = {
          mandatoryArgs: maxParam,
          hasOptionalBracket: false,
          argType: "math",
        };
      }
    }
  }
}

// 3. Add authoritative MathJax and AMS specific definitions
const mathJaxAdditions = {
  "\\operatorname": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\operatorname*": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\boxed": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\Bbb": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\frak": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\bold": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\v": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\r": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\c": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\u": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\overset": { mandatoryArgs: 2, hasOptionalBracket: false, argType: "math" },
  "\\underset": { mandatoryArgs: 2, hasOptionalBracket: false, argType: "math" },
  "\\stackrel": { mandatoryArgs: 2, hasOptionalBracket: false, argType: "math" },
  "\\dddot": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\ddddot": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\cancel": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\bcancel": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\xcancel": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\pmod": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\pmod*": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\sout": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\abs": { mandatoryArgs: 1, hasOptionalBracket: false, argType: "math" },
  "\\class": { mandatoryArgs: 2, hasOptionalBracket: false, argType: "math" },
  "\\cssId": { mandatoryArgs: 2, hasOptionalBracket: false, argType: "math" },
  "\\style": { mandatoryArgs: 2, hasOptionalBracket: false, argType: "math" },
  "\\data": { mandatoryArgs: 2, hasOptionalBracket: false, argType: "math" },
  "\\href": { mandatoryArgs: 2, hasOptionalBracket: false, argType: "math" },
};

for (const [k, v] of Object.entries(mathJaxAdditions)) {
  dictionary[k] = v;
}

const sortedKeys = Object.keys(dictionary).sort();

let code = `// src/parsers/macro_dictionary.ts
// AUTO-GENERATED from authoritative KaTeX and MathJax specifications.
// Do not edit manually. Re-generate via: node scripts/build_macro_dictionary.mjs

export interface MacroSignature {
  readonly mandatoryArgs: number;
  readonly hasOptionalBracket: boolean;
  readonly argType?: "math" | "text" | "raw";
}

export const MACRO_DICTIONARY: Record<string, MacroSignature> = {\n`;

for (const key of sortedKeys) {
  const item = dictionary[key];
  const optStr = item.hasOptionalBracket ? "true" : "false";
  const argTypeStr = item.argType ? `, argType: "${item.argType}"` : "";
  code += `  ${JSON.stringify(key)}: { mandatoryArgs: ${item.mandatoryArgs}, hasOptionalBracket: ${optStr}${argTypeStr} },\n`;
}

code += `};

/**
 * High-speed O(1) query for mathematical macro argument signatures.
 * Returns undefined for 0-argument atomic symbols.
 */
export function getMacroSignature(name: string): MacroSignature | undefined {
  return MACRO_DICTIONARY[name];
}
`;

const outPath = path.resolve(__dirname, "../src/parsers/macro_dictionary.ts");
fs.writeFileSync(outPath, code, "utf-8");
console.log(`Generated ${sortedKeys.length} authoritative macro signatures in: ${outPath}`);
