// src/parsers/frontmatter.ts

import { ColorMathOptions, ActiveMathMode, SuperFamilyMode, GranularMathMode } from "../config";

export interface NoteFieldDetection {
  isQuantum: boolean;
  field?: string;
  overrides: Partial<ColorMathOptions>;
  theme?: string;
  detectedMode?: ActiveMathMode;
}

const QUANTUM_TERM_REGEX = /\b(quantum|qm|physics|quantum[-_]mechanics)\b/i;
const IN_BODY_TAG_REGEX = /(?:^|\s)#(quantum|physics|qm|quantum[-_]mechanics)\b/i;

interface ModeRule {
  mode: GranularMathMode;
  superFamily: SuperFamilyMode;
  regex: RegExp;
  tagRegex: RegExp;
}

export const MODE_RULES: ModeRule[] = [
  // 1. Quantum & Stochastic
  {
    mode: "quantum",
    superFamily: "quantum_stochastic",
    regex: /\b(quantum|qm|quantum[-_\s]mechanics|quantum[-_\s]physics|schrodinger|dirac|wavefunction|bra[-_\s]ket|qft|quantum[-_\s]information|qubits?)\b/i,
    tagRegex: /(?:^|\s)#(quantum|qm|physics|schrodinger|dirac|qft)\b/i,
  },
  {
    mode: "stochastic",
    superFamily: "quantum_stochastic",
    regex: /\b(stochastic|ito[-_\s]calculus|stratonovich|brownian[-_\s]motion|wiener[-_\s]process|martingales?|financial[-_\s]math(ematics)?|black[-_\s]scholes)\b/i,
    tagRegex: /(?:^|\s)#(stochastic|ito|brownian|martingale)\b/i,
  },
  {
    mode: "probability",
    superFamily: "quantum_stochastic",
    regex: /\b(probability|statistics|stats|random[-_\s]variables?|markov|bayes(ian)?|distributions?)\b/i,
    tagRegex: /(?:^|\s)#(probability|statistics|stats|bayes)\b/i,
  },

  // 2. Geometry & Tensors
  {
    mode: "geometry_tensors",
    superFamily: "geometry",
    regex: /\b(geometry|differential[-_\s]geometry|diffgeo|tensors?|general[-_\s]relativity|gr|riemannian|curved[-_\s]spacetime|christoffel|manifold|minkowski)\b/i,
    tagRegex: /(?:^|\s)#(geometry|diffgeo|tensor|gr|relativity|riemannian|manifold)\b/i,
  },
  {
    mode: "topology",
    superFamily: "geometry",
    regex: /\b(topology|algebraic[-_\s]topology|homology|cohomology|homotopy|homeomorphism|simplicial)\b/i,
    tagRegex: /(?:^|\s)#(topology|homology|homotopy)\b/i,
  },

  // 3. Fields & PDEs
  {
    mode: "pde_transport",
    superFamily: "pde",
    regex: /\b(pdes?|partial[-_\s]differential[-_\s]equations?|fluids?|fluid[-_\s]dynamics|navier[-_\s]stokes|heat[-_\s]equation|wave[-_\s]equation|advection|convection|conservation[-_\s]laws?|transport)\b/i,
    tagRegex: /(?:^|\s)#(pde|fluids?|heat|wave|navier[-_]stokes|transport)\b/i,
  },
  {
    mode: "continuum",
    superFamily: "pde",
    regex: /\b(continuum|elasticity|solid[-_\s]mechanics|viscoelasticity|stress[-_\s]strain|aerodynamics|hydrodynamics)\b/i,
    tagRegex: /(?:^|\s)#(continuum|elasticity|aerodynamics|hydrodynamics)\b/i,
  },

  // 4. Dynamics & ODEs
  {
    mode: "ode_dynamics",
    superFamily: "dynamics",
    regex: /\b(odes?|ordinary[-_\s]differential[-_\s]equations?|dynamical[-_\s]systems?|phase[-_\s]portrait|phase[-_\s]space|bifurcation|chaos|lorenz|attractor|limit[-_\s]cycle|kinematics)\b/i,
    tagRegex: /(?:^|\s)#(ode|dynamics|chaos|lorenz|kinematics)\b/i,
  },
  {
    mode: "optimization",
    superFamily: "dynamics",
    regex: /\b(optimization|calculus[-_\s]of[-_\s]variations|variational|euler[-_\s]lagrange|convex[-_\s]optimization|lagrangian[-_\s]multiplier|kkt|gradient[-_\s]descent)\b/i,
    tagRegex: /(?:^|\s)#(optimization|variational|convex)\b/i,
  },

  // 5. Algebra & Discrete
  {
    mode: "linear_algebra",
    superFamily: "algebra",
    regex: /\b(linear[-_\s]algebra|matrices|matrix[-_\s]theory|eigenvalues?|eigenvectors?|spectral[-_\s]theory|inner[-_\s]product[-_\s]space)\b/i,
    tagRegex: /(?:^|\s)#(linear[-_]algebra|matrices|matrix)\b/i,
  },
  {
    mode: "abstract_algebra",
    superFamily: "algebra",
    regex: /\b(abstract[-_\s]algebra|group[-_\s]theory|rings?|fields?|galois|category[-_\s]theory|morphisms?|homomorphisms?)\b/i,
    tagRegex: /(?:^|\s)#(algebra|groups?|category[-_]theory)\b/i,
  },
  {
    mode: "number_theory",
    superFamily: "algebra",
    regex: /\b(number[-_\s]theory|arithmetic|modular[-_\s]arithmetic|divisibility|prime[-_\s]numbers?|diophantine|cryptography)\b/i,
    tagRegex: /(?:^|\s)#(number[-_]theory|modular|primes?)\b/i,
  },
  {
    mode: "logic_sets",
    superFamily: "algebra",
    regex: /\b(logic|set[-_\s]theory|model[-_\s]theory|proof[-_\s]theory|boolean[-_\s]algebra|axiomatic)\b/i,
    tagRegex: /(?:^|\s)#(logic|sets?)\b/i,
  },

  // 6. Analysis & Calculus
  {
    mode: "complex",
    superFamily: "analysis",
    regex: /\b(complex[-_\s]?analysis|holomorphic|meromorphic|cauchy[-_\s]?riemann|wirtinger|contour[-_\s]?integration?)\b/i,
    tagRegex: /(?:^|\s)#(complex[-_]analysis|holomorphic)\b/i,
  },
  {
    mode: "calculus",
    superFamily: "analysis",
    regex: /\b(calculus|real[-_\s]?analysis|differentiation|integration|leibniz|multivariable[-_\s]?calculus)\b/i,
    tagRegex: /(?:^|\s)#(calculus|analysis|math)\b/i,
  },
];

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

function matchValueAgainstRegex(val: unknown, regex: RegExp): boolean {
  if (typeof val === "string") {
    return regex.test(val);
  }
  if (Array.isArray(val)) {
    return val.some((item) => typeof item === "string" && regex.test(item));
  }
  return false;
}

/**
 * Checks if a property value or list of values indicates a Quantum note.
 */
function matchesQuantumTerm(value: unknown): boolean {
  return matchValueAgainstRegex(value, QUANTUM_TERM_REGEX);
}

/**
 * Detects the active mathematical mode for a note based on its YAML properties,
 * frontmatter tags, or inline hashtags.
 */
export function detectNoteMode(
  content: string,
  frontmatterCache?: Record<string, unknown>,
  fallbackMode: ActiveMathMode = "analysis"
): ActiveMathMode {
  const frontmatter = frontmatterCache && Object.keys(frontmatterCache).length > 0
    ? frontmatterCache
    : parseFrontmatterText(content);

  // 1. Check explicit `color-math.mode` or top-level `mode` in frontmatter
  const colorMathConfig = frontmatter["color-math"] as Record<string, unknown> | undefined;
  if (colorMathConfig && typeof colorMathConfig === "object" && typeof colorMathConfig.mode === "string") {
    const rawMode = colorMathConfig.mode.toLowerCase().trim();
    for (const rule of MODE_RULES) {
      if (rawMode === rule.mode || rawMode === rule.superFamily) {
        return rule.mode;
      }
    }
  }
  if (typeof frontmatter.mode === "string") {
    const rawMode = frontmatter.mode.toLowerCase().trim();
    for (const rule of MODE_RULES) {
      if (rawMode === rule.mode || rawMode === rule.superFamily) {
        return rule.mode;
      }
    }
  }

  // 2. Check standard note properties: field, subject, topic, discipline, category
  const targetKeys = ["field", "subject", "topic", "discipline", "category", "color-math-field"];
  for (const rule of MODE_RULES) {
    for (const key of targetKeys) {
      if (matchValueAgainstRegex(frontmatter[key], rule.regex)) {
        return rule.mode;
      }
    }
  }

  // 3. Check tags in frontmatter (e.g. `tags: [math/pde, fluids]`)
  if (frontmatter.tags) {
    for (const rule of MODE_RULES) {
      if (matchValueAgainstRegex(frontmatter.tags, rule.regex)) {
        return rule.mode;
      }
    }
  }

  // 4. Check in-body tags e.g. #pde, #diffgeo, #quantum
  for (const rule of MODE_RULES) {
    if (rule.tagRegex.test(content)) {
      return rule.mode;
    }
  }

  return fallbackMode;
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
    theme = frontmatter["color-math-theme"];
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

  const detectedMode = detectNoteMode(content, frontmatterCache);

  if (isQuantum || detectedMode === "quantum") {
    isQuantum = true;
    overrides.colorQuantumOperators = true;
    overrides.field = "quantum";
  }

  return {
    isQuantum,
    field: isQuantum ? "quantum" : undefined,
    overrides,
    theme,
    detectedMode,
  };
}
