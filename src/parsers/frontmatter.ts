// src/parsers/frontmatter.ts

import { ColorMathOptions } from "../config";

export interface NoteFieldDetection {
  isQuantum: boolean;
  field?: string;
  overrides: Partial<ColorMathOptions>;
  theme?: string;
}

const QUANTUM_TERM_REGEX = /\b(quantum|qm|physics|quantum[-_]mechanics)\b/i;
const IN_BODY_TAG_REGEX = /(?:^|\s)#(quantum|physics|qm|quantum[-_]mechanics)\b/i;

/**
 * Lightweight, zero-dependency YAML frontmatter parser for Obsidian notes.
 * Safely parses nested dictionaries (like color-math:), arrays, and scalar key-values.
 */
export function parseFrontmatterText(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {};
  }

  const lines = match[1].split(/\r?\n/);
  const result: Record<string, unknown> = {};
  let currentParent: string | null = null;
  let parentObj: Record<string, unknown> = {};

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) {
      continue;
    }

    const isIndented = /^\s{2,}|\t/.test(rawLine);
    const line = rawLine.trim();

    // Check for inline dictionary like `color-math: { field: quantum }`
    const inlineDictMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*\{([^}]*)\}/);
    if (inlineDictMatch) {
      const parentKey = inlineDictMatch[1];
      const innerPairs = inlineDictMatch[2].split(",");
      const subObj: Record<string, unknown> = {};
      for (const pair of innerPairs) {
        const [k, ...vParts] = pair.split(":");
        if (k && vParts.length > 0) {
          subObj[k.trim()] = parseYamlValue(vParts.join(":").trim());
        }
      }
      result[parentKey] = subObj;
      currentParent = null;
      continue;
    }

    // Check for parent key without value e.g. `color-math:` or `tags:`
    const sectionMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*$/);
    if (!isIndented && sectionMatch) {
      currentParent = sectionMatch[1];
      parentObj = {};
      result[currentParent] = parentObj;
      continue;
    }

    // List item e.g. `- item`
    if (isIndented && line.startsWith("- ")) {
      const itemValue = parseYamlValue(line.slice(2).trim());
      if (currentParent) {
        if (!Array.isArray(result[currentParent])) {
          result[currentParent] = [];
        }
        (result[currentParent] as unknown[]).push(itemValue);
      }
      continue;
    }

    // Key-value pair
    const kvMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const valStr = kvMatch[2].trim();
      const val = parseYamlValue(valStr);

      if (isIndented && currentParent) {
        parentObj[key] = val;
      } else {
        currentParent = null;
        result[key] = val;
      }
    }
  }

  return result;
}

function parseYamlValue(valStr: string): unknown {
  if (!valStr) return "";
  if (valStr.startsWith("[") && valStr.endsWith("]")) {
    return valStr
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }
  if (valStr === "true") return true;
  if (valStr === "false") return false;
  if (valStr === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(valStr)) return Number(valStr);
  return valStr.replace(/^['"]|['"]$/g, "");
}

/**
 * Checks if a property value or list of values indicates a Quantum note.
 */
function matchesQuantumTerm(value: unknown): boolean {
  if (typeof value === "string") {
    return QUANTUM_TERM_REGEX.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => typeof item === "string" && QUANTUM_TERM_REGEX.test(item));
  }
  return false;
}

/**
 * Inspects a note's frontmatter properties, tags, and content to detect whether
 * it is a Quantum Mechanics note, returning applicable option overrides.
 */
export function detectNoteField(
  content: string,
  frontmatterCache?: Record<string, unknown>
): NoteFieldDetection {
  const frontmatter = frontmatterCache && Object.keys(frontmatterCache).length > 0
    ? frontmatterCache
    : parseFrontmatterText(content);

  const overrides: Partial<ColorMathOptions> = {};
  let isQuantum = false;
  let theme: string | undefined = undefined;

  // 1. Check explicit `color-math` block in frontmatter
  const colorMathConfig = frontmatter["color-math"] as Record<string, unknown> | undefined;
  if (colorMathConfig && typeof colorMathConfig === "object") {
    if (matchesQuantumTerm(colorMathConfig.field)) {
      isQuantum = true;
    }
    if (colorMathConfig["energy-operator"] === true || colorMathConfig.energyOperator === true) {
      isQuantum = true;
    }
    if (typeof colorMathConfig.theme === "string") {
      theme = colorMathConfig.theme;
    }
    if (typeof colorMathConfig["rainbow-delimiters"] === "boolean") {
      overrides.rainbowDelimiters = colorMathConfig["rainbow-delimiters"];
    }
    if (typeof colorMathConfig["variable-dataflow"] === "boolean") {
      overrides.variableDataFlow = colorMathConfig["variable-dataflow"];
    }
  }

  // Flat color-math properties
  if (matchesQuantumTerm(frontmatter["color-math-field"])) {
    isQuantum = true;
  }
  if (frontmatter["color-math-energy-operator"] === true) {
    isQuantum = true;
  }
  if (typeof frontmatter["color-math-theme"] === "string") {
    theme = frontmatter["color-math-theme"] as string;
  }

  // 2. Check standard note properties: field, subject, topic, discipline, category
  const targetKeys = ["field", "subject", "topic", "discipline", "category"];
  for (const key of targetKeys) {
    if (matchesQuantumTerm(frontmatter[key])) {
      isQuantum = true;
      break;
    }
  }

  // 3. Check tags in frontmatter
  if (!isQuantum && frontmatter.tags) {
    if (matchesQuantumTerm(frontmatter.tags)) {
      isQuantum = true;
    }
  }

  // 4. Check in-body tags
  if (!isQuantum && IN_BODY_TAG_REGEX.test(content)) {
    isQuantum = true;
  }

  if (isQuantum) {
    overrides.colorQuantumOperators = true;
    overrides.field = "quantum";
  }

  return {
    isQuantum,
    field: isQuantum ? "quantum" : undefined,
    overrides,
    theme,
  };
}
