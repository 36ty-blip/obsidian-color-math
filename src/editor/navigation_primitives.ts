// src/editor/navigation_primitives.ts
//! Shared structural navigation primitives, DOM element matching utilities,
//! and token normalization functions for MathJax CHTML layout navigation.

import { CSTNode, FractionNode, GroupNode, SpatialCoordinate4D } from "../parsers/cst/types";

export interface MultiScaleRange {
  glyph: { start: number; end: number };      // W=0
  atom: { start: number; end: number };       // W=1
  slot: { start: number; end: number };       // W=2
  molecule: { start: number; end: number };   // W=3
  enclosure: { start: number; end: number };  // W=4
}

export interface ResolvedRange {
  start: number;
  end: number;
  kind: "leaf" | "numerator" | "denominator" | "fraction" | "script" | "matrix_cell" | "root" | "text" | "underover";
  coord?: SpatialCoordinate4D;
  scales?: MultiScaleRange;
}

/**
 * Robust selector matching that gracefully falls back for mock or synthetic DOM nodes.
 */
export function matchesSelector(el: Element, sel: string): boolean {
  if (typeof (el as any).matches === "function") {
    return Boolean((el as any).matches(sel));
  }
  return false;
}

/**
 * Checks if a parent element contains a child element, with iterative traversal fallback.
 */
export function elementContains(parent: Element | null, child: Element): boolean {
  if (!parent || !child) return false;
  if (typeof (parent as any).contains === "function") {
    return Boolean((parent as any).contains(child));
  }
  let curr: Element | null = child.parentElement;
  while (curr) {
    if (curr === parent) return true;
    curr = curr.parentElement;
  }
  return false;
}

/**
 * Checks if an element is an internal building block of a stretchy horizontal/vertical delimiter.
 */
export function isInsideStretchy(el: Element): boolean {
  if (typeof (el as any).closest === "function") {
    return Boolean((el as any).closest("mjx-stretchy-h, mjx-stretchy-v"));
  }
  let curr: Element | null = el.parentElement;
  while (curr) {
    if (matchesSelector(curr, "mjx-stretchy-h, mjx-stretchy-v")) return true;
    curr = curr.parentElement;
  }
  return false;
}

/**
 * Computes the aggregate start and end span of a list of CST nodes.
 */
export function getNodeListSpan(nodes: CSTNode[]): { start: number; end: number } | null {
  if (!nodes || nodes.length === 0) return null;
  return {
    start: nodes[0].start,
    end: nodes[nodes.length - 1].end,
  };
}

/**
 * Tests whether a CST node represents a literal period/dot separator.
 */
export function isPeriodNode(n: CSTNode | undefined): boolean {
  if (!n) return false;
  return (
    (n.kind === "punctuation" && (n as any).char === ".") ||
    (n.kind === "identifier" && (n as any).text === ".") ||
    (n.kind === "operator" && (n as any).text === ".")
  );
}

/**
 * Normalizes mathematical operator characters and Unicode arrows to ASCII equivalents.
 */
export function normalizeMathOperatorChars(s: string): string {
  return s
    .replace(/\u2212/g, "-")
    .replace(/\u2217/g, "*")
    .replace(/\u22c5/g, "*")
    .replace(/\u00b7/g, "*")
    .replace(/\u2236/g, ":")
    .replace(/\u2032/g, "'")
    .replace(/=\u0338/g, "≠")
    .replace(/[\u{1D719}\u03D5]/gu, "φ")
    .replace(/[\u{1D716}\u03F5]/gu, "ε")
    .replace(/[\u{1D717}\u03D1]/gu, "ϑ")
    .replace(/[\u{1D71B}\u03D6]/gu, "ϖ")
    .replace(/[\u{1D71A}\u03F1]/gu, "ϱ")
    .replace(/\u2264/g, "<=")
    .replace(/\u2265/g, ">=")
    .replace(/\u2260/g, "!=")
    .replace(/\u2248/g, "~=")
    .replace(/\u2261/g, "==")
    .replace(/\u00b1/g, "+-")
    .replace(/\u2213/g, "-+")
    .replace(/\u2192/g, "->")
    .replace(/\u21d2/g, "=>")
    .replace(/\u27f6/g, "-->")
    .replace(/\u27f9/g, "==>")
    .replace(/\u2190/g, "<-")
    .replace(/\u27f5/g, "<--");
}

/**
 * Spacing commands that produce layout gaps (<mjx-mspace>) or whitespace without visible glyphs.
 */
export const SPACING_COMMANDS = new Set([
  "\\quad",
  "\\qquad",
  "\\,",
  "\\:",
  "\\;",
  "\\!",
  "\\ ",
  "\\",
  "\\enspace",
  "\\space",
  "\\thinspace",
  "\\medspace",
  "\\thickspace",
  "\\negthinspace",
  "\\negmedspace",
  "\\negthickspace",
  "\\hskip",
  "\\kern",
]);

/**
 * Big operators with limits (MathJax renders <mjx-munderover>).
 */
export const ASCII_OPERATOR_UNICODE_MAP: Record<string, string | string[]> = {
  "=>": ["⟹", "⇒", "==>", "=>"],
  "==>": ["⟹", "⇒", "==>", "=>"],
  "->": ["→", "⟶", "-->", "->"],
  "-->": ["→", "⟶", "-->", "->"],
  "<-": ["←", "⟵", "<--", "<-"],
  "<--": ["←", "⟵", "<--", "<-"],
  "<->": ["↔", "⟷", "<-->", "<->"],
  "<-->": ["↔", "⟷", "<-->", "<->"],
  "<=>": ["⟺", "⇔", "<==>", "<=>"],
  "<==>": ["⟺", "⇔", "<==>", "<=>"],
  "|->": ["↦", "⟼", "|->"],
  "<=": ["≤", "<="],
  ">=": ["≥", ">="],
  "!=": ["≠", "!="],
  ":=": ["≔", ":="],
  "+-": ["±", "+-"],
  "-+": ["∓", "-+"],
  "~=": ["≈", "~="],
  "==": ["≡", "=="],
  "<<": "≪",
  ">>": "≫",
  "oo": "∞",
  "and": "∧",
  "nn": "∧",
  "or": "∨",
  "vv": "∨",
  "...": ["⋯", "…", "..."],
};

export const DELIMITER_BRACKET_MAP: Record<string, string | string[]> = {
  "\\{": "{",
  "\\lbrace": "{",
  "\\}": "}",
  "\\rbrace": "}",
  "\\lbrack": "[",
  "\\rbrack": "]",
  "\\langle": ["⟨", "<"],
  "\\rangle": ["⟩", ">"],
  "\\vert": ["|", "∣"],
  "|": ["|", "∣"],
  "\\|": ["‖", "∥", "||"],
  "\\Vert": ["‖", "∥", "||"],
};

export const BIG_OPS = new Set(["\\sum", "\\prod", "\\coprod", "\\bigcup", "\\bigcap", "\\lim"]);

export const ACCENT_DOM_MAP: Record<string, string[]> = {
  "\\vec": ["⃗", "→", "\u20D7"],
  "\\hat": ["^", "ˆ"],
  "\\bar": ["¯", "-"],
  "\\dot": ["˙"],
  "\\ddot": ["¨"],
  "\\tilde": ["˜", "~"],
  "\\check": ["ˇ"],
};

export const SHIFT_FREE_ACCENT_MAP: Record<string, string> = {
  hat: "\\hat",
  bar: "\\bar",
  vec: "\\vec",
  dot: "\\dot",
  ddot: "\\ddot",
  tilde: "\\tilde",
  check: "\\check",
};


/**
 * Font commands and extensible accents that wrap an argument expression.
 */
export const FONT_ACCENT_COMMANDS = new Set([
  "\\mathbf",
  "\\boldsymbol",
  "\\pmb",
  "\\vec",
  "\\hat",
  "\\bar",
  "\\tilde",
  "\\dot",
  "\\ddot",
  "\\mathit",
  "\\mathrm",
  "\\mathbb",
  "\\mathcal",
  "\\mathfrak",
  "\\mathsf",
  "\\mathtt",
  "\\Bbb",
  "\\check",
  "\\acute",
  "\\grave",
  "\\breve",
  "\\overline",
  "\\underline",
  "\\overrightarrow",
  "\\overleftarrow",
  "\\overleftrightarrow",
  "\\widetilde",
  "\\widehat",
  "\\text",
  "\\operatorname",
  "\\ket",
  "\\bra",
  "\\braket",
  "\\dd",
  "\\va",
  "\\vb",
  "\\vu",
  "\\abs",
  "\\norm",
  "\\cancel",
  "\\bcancel",
  "\\xcancel",
  "\\sout",
]);

/**
 * Commands that form compound accents over multiple children or structural elements.
 */
export const COMPOUND_ACCENT_COMMANDS = new Set([
  "\\overline",
  "\\underline",
  "\\widetilde",
  "\\widehat",
  "\\overrightarrow",
  "\\overleftarrow",
  "\\overleftrightarrow",
  "\\vec",
  "\\hat",
  "\\bar",
  "\\tilde",
]);

/**
 * Tests whether a group argument contains 2D structures or child nodes that prevent atomic fusion.
 */
export function hasStructuralChild(groupArg: GroupNode): boolean {
  return (
    groupArg.delimType === "matrix" ||
    groupArg.children.some(
      (c) =>
        c.kind === "group" ||
        c.kind === "fraction" ||
        c.kind === "underover" ||
        c.kind === "root" ||
        c.kind === "script" ||
        c.kind === "operator" ||
        c.kind === "punctuation" ||
        (c.kind === "command" && (c.name === "\\sqrt" || c.name === "\\mroot" || c.name.startsWith("\\")))
    )
  );
}

/**
 * Analyzes whether a font/accent group argument should be reconciled as individual children
 * or fused into an atomic leaf representation.
 */
export function analyzeFontAccentGroup(
  nodeName: string,
  groupArg: GroupNode
): { hasStructuralChild: boolean; isCompoundAccent: boolean } {
  const structural = hasStructuralChild(groupArg);
  const isSingleFontStyledIdentifier =
    groupArg.children.length === 2 &&
    groupArg.children[0].kind === "command" &&
    (groupArg.children[1].kind === "identifier" || groupArg.children[1].kind === "command");
  const isCompound =
    structural ||
    (COMPOUND_ACCENT_COMMANDS.has(nodeName) &&
      groupArg.children.length > 1 &&
      !isSingleFontStyledIdentifier);
  return { hasStructuralChild: structural, isCompoundAccent: isCompound };
}

/**
 * Attempts to extract a 2-argument binomial fraction from consecutive CST nodes.
 * Reconciles KaTeX/MathJax binomials (\binom, \dbinom, \tbinom) into a unified FractionNode.
 */
export function tryExtractBinomFraction(
  nodes: CSTNode[],
  index: number
): { fracNode: FractionNode; consumed: number } | null {
  const node = nodes[index];
  if (
    node.kind === "command" &&
    (node.name === "\\binom" || node.name === "\\dbinom" || node.name === "\\tbinom" || node.name === "binom") &&
    index + 2 < nodes.length &&
    nodes[index + 1].kind === "group" &&
    nodes[index + 2].kind === "group"
  ) {
    const numGroup = nodes[index + 1] as GroupNode;
    const denGroup = nodes[index + 2] as GroupNode;
    return {
      fracNode: {
        kind: "fraction",
        command: node.name,
        start: node.start,
        end: denGroup.end,
        numerator: numGroup.children,
        denominator: denGroup.children,
      },
      consumed: 2,
    };
  }
  return null;
}

/**
 * Extracts a 2D grid of <mjx-mtd> cell elements from a MathJax <mjx-mtable> or table container.
 */
export function extractDomTableGrid(tableEl: Element): Element[][] {
  const rows = Array.from(tableEl.querySelectorAll("mjx-mtr"));
  return rows.map((r) => Array.from(r.querySelectorAll("mjx-mtd")));
}

/**
 * Resolves the 0-indexed (row, col) coordinates of a target element inside a MathJax matrix.
 */
export function getMtdCoordinates(target: Element): { row: number; col: number } | null {
  const mtd = target.closest("mjx-mtd");
  const mtr = mtd?.closest("mjx-mtr");
  if (!mtd || !mtr || !mtr.parentElement) return null;
  const row = Array.from(mtr.parentElement.children).indexOf(mtr);
  const col = Array.from(mtr.children).indexOf(mtd);
  if (row < 0 || col < 0) return null;
  return { row, col };
}


