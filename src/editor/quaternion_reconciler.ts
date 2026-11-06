// src/editor/quaternion_reconciler.ts
//! Non-Commutative Hamilton Quaternion (\mathbb{H}) Spatial Layout Reconciliation Engine.
//! Reconciles 2D MathJax CHTML DOM elements with CST nodes into a 4D spatial quaternion coordinate:
//!   q = w + x\mathbf{i} + y\mathbf{j} + z\mathbf{k} \in \mathbb{H}
//! Where:
//!   w = multi-scale hierarchical depth (0: micro-glyph, 1: token atom, 2: slot, 3: molecule, 4: enclosure)
//!   x = horizontal sequence flow index
//!   y = vertical baseline slot level (+1: numerator/superscript, -1: denominator/subscript, 0: baseline)
//!   z = structural isolation plane index (\mathbf{k}-axis)
//! Eliminates flat 1D array cascades, immunizes against limit authoring order, and isolates subtrees.

import { CSTNode, FractionNode, GroupNode, ScriptNode, SpatialCoordinate4D, UnderOverNode } from "../parsers/cst/types";
import { MultiScaleRange, ResolvedRange, SPACING_COMMANDS, FONT_ACCENT_COMMANDS } from "./lazy_navigation";
import { indexMathJaxElement, getMathJaxElementRange } from "./weakmap_index";
import { MathCSTParser } from "../parsers/cst/parser";
import {
  lookupCatalog,
  getExpectedChildTag,
  getTagName,
  getTagIdFromNodeName,
  tagMatchesMask,
  ChtmlTagMask,
  MASK_TRANSPARENT_INTERMEDIATE,
  MASK_STRETCHY_FRAGMENTS,
  MASK_SLOT_CONTAINERS,
  TAG_NUM,
  TAG_DEN,
  TAG_BOX,
  TAG_ROOT,
  TAG_UNDER,
  TAG_OVER,
  ROLE_FUNCTION,
  ROLE_OPERATOR,
  ROLE_RELATION,
  ROLE_DOT,
  ROLE_ARITHMETIC,
  ROLE_ARROW,
  ROLE_DELIMITER,
  ROLE_SPACING,
} from "../parsers/catalog";

export interface QuaternionResolvedRange extends ResolvedRange {
  coord: SpatialCoordinate4D;
  scales: MultiScaleRange;
}

// Backwards-compatible alias for existing tests and consumers
export type TensorResolvedRange = QuaternionResolvedRange;

interface MultiScaleContext {
  slot: { start: number; end: number };
  molecule: { start: number; end: number };
  enclosure: { start: number; end: number };
}

function matchesSelector(el: Element, sel: string): boolean {
  if (typeof (el as any).matches === "function") {
    return el.matches(sel);
  }
  return false;
}

function elementContains(parent: Element | null, child: Element): boolean {
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
function isInsideStretchy(el: Element): boolean {
  if (typeof (el as any).closest === "function") {
    return !!(el as any).closest("mjx-stretchy-h, mjx-stretchy-v");
  }
  let curr: Element | null = el.parentElement;
  while (curr) {
    if (matchesSelector(curr, "mjx-stretchy-h, mjx-stretchy-v")) return true;
    curr = curr.parentElement;
  }
  return false;
}

/**
 * Safely extracts normalized text content from native elements, LiteNodes, or mock elements.
 * In live MathJax 4 CHTML, glyph characters are rendered via CSS `mjx-c.mjx-cHEX::before`
 * pseudo-elements and `textContent` is empty (`""`). When `textContent` is empty, this
 * function decodes all child `<mjx-c class="mjx-cHEX">` hexadecimal codepoints in O(k) time.
 */
function normalizeMathOperatorChars(s: string): string {
  return s
    .replace(/\u2212/g, "-")
    .replace(/\u2217/g, "*")
    .replace(/\u2236/g, ":")
    .replace(/\u2032/g, "'");
}

export function getElementText(el: any): string {
  if (!el) return "";
  let raw = "";
  if (typeof el.textContent === "string") {
    raw = el.textContent.trim();
  } else if (typeof el.textContent === "function") {
    try {
      const res = el.textContent();
      raw = typeof res === "string" ? res.trim() : "";
    } catch {
      raw = "";
    }
  } else if (typeof el.innerText === "string") {
    raw = el.innerText.trim();
  } else if (typeof el.nodeValue === "string") {
    raw = el.nodeValue.trim();
  }

  if (raw.length > 0) {
    const norm = typeof raw.normalize === "function" ? raw.normalize("NFKD").trim() : raw;
    return normalizeMathOperatorChars(norm);
  }

  // Fallback for live MathJax 4 CHTML where glyphs are encoded in <mjx-c class="mjx-cHEX">
  const domEl = el as Element;
  const glyphEls: Element[] = [];
  if (typeof domEl?.matches === "function" && domEl.matches("mjx-c")) {
    glyphEls.push(domEl);
  } else if (typeof domEl?.querySelectorAll === "function") {
    const matched = domEl.querySelectorAll("mjx-c");
    if (matched) {
      for (let i = 0; i < matched.length; i++) {
        const item = matched[i];
        if (item) glyphEls.push(item);
      }
    }
  }

  if (glyphEls.length > 0) {
    let decoded = "";
    for (const g of glyphEls) {
      const cls = typeof g.className === "string" ? g.className : "";
      const m = cls.match(/mjx-c([0-9A-Fa-f]+)/);
      if (m && typeof m[1] === "string") {
        try {
          decoded += String.fromCodePoint(parseInt(m[1], 16));
        } catch {
          // Ignore malformed codepoint
        }
      }
    }
    if (decoded.length > 0) {
      // Preserve invisible math operators (U+2061..U+2064) so isElementInvisible can detect them,
      // while normalizing mathematical alphanumeric symbols (e.g. U+1D465 -> 'x') via NFKD.
      const norm = typeof decoded.normalize === "function" ? decoded.normalize("NFKD") : decoded;
      return normalizeMathOperatorChars(norm);
    }
  }

  return "";
}

/**
 * Resolves the canonical normalized Unicode text expected for an AST leaf node.
 * Shared across Engine A (`QuaternionReconciler`), Engine B (`dom_stamper`), and `lazy_navigation`.
 */
export function getExpectedLeafNodeText(n?: CSTNode, latex?: string): string {
  if (!n) return "";
  switch (n.kind) {
    case "identifier":
    case "operator": {
      const txt = n.text || "";
      if (txt.startsWith("\\")) {
        const entry = lookupCatalog(txt) || lookupCatalog(txt.slice(1));
        if (entry?.expectedText !== undefined) return entry.expectedText;
        if (entry?.unicode) return entry.unicode;
        if (txt === "\\pi") return "π";
        return txt.slice(1);
      }
      return txt;
    }
    case "text":
      return (n.text || "").trim();
    case "number":
      return n.value;
    case "punctuation":
      return n.char;
    case "command": {
      const entry = lookupCatalog(n.name);
      if (entry?.expectedText !== undefined) return entry.expectedText;
      if (n.name === "\\pi" || n.name === "pi") return "π";
      return n.name.replace(/^\\/, "");
    }
    default:
      return latex ? latex.slice(n.start, n.end).trim() : "";
  }
}

/**
 * Checks whether a DOM element's normalized text matches an AST leaf node's expected Unicode
 * OR its raw LaTeX source slice (for lightweight unit-test mock DOM elements).
 */
export function isLeafTextMatch(domText: string, n?: CSTNode, latex?: string): boolean {
  if (!n) return false;
  if (!domText) return true;
  const expected = getExpectedLeafNodeText(n, latex);
  if (!expected) return true;
  if (domText === expected) return true;
  const fusedMatch = expected.match(/^\\[a-zA-Z]+\{([\s\S]*)\}$/);
  if (fusedMatch) {
    const innerExp = fusedMatch[1].trim();
    if (domText === innerExp || (innerExp.length > 0 && domText.includes(innerExp))) return true;
  }
  if (n.kind === "command") {
    const rawCmd = n.name;
    const bareCmd = rawCmd.replace(/^\\/, "");
    if (domText === rawCmd || domText === bareCmd) return true;
  }
  if (latex) {
    const rawSlice = latex.slice(n.start, n.end).trim();
    if (rawSlice && (domText === rawSlice || domText === rawSlice.replace(/^\\/, ""))) return true;
  }
  return false;
}

/**
 * Detects invisible mathematical pseudo-operators injected by MathJax CHTML (e.g. U+2061 ApplyFunction).
 */
function isElementInvisible(el: Element): boolean {
  if (el.children && el.children.length > 0) {
    // Check if children are solely <mjx-c> glyphs or nested elements
    const nonGlyphChildren = Array.from(el.children).filter((c) => !matchesSelector(c, "mjx-c"));
    if (nonGlyphChildren.length > 0) {
      const hasVisibleChildren = nonGlyphChildren.some((c) => !isElementInvisible(c));
      if (hasVisibleChildren) return false;
    }
  }
  const text = getElementText(el);
  if (!text) return false;
  return /^[\u200B-\u200F\u2060-\u206F\uFEFF\s]+$/.test(text);
}

/**
 * Validates that a script container belongs to the current slot scope
 * and is not sequestered inside a nested slot (mjx-script, mjx-num, mjx-under, etc.).
 * Chained scripts whose parent is an outer script container (mjx-msup/msub/msubsup) are in scope.
 */
function isScriptInSlotScope(el: Element, slotEl: Element): boolean {
  const elTagId = getTagIdFromNodeName(el.tagName);
  if (tagMatchesMask(elTagId, MASK_STRETCHY_FRAGMENTS) || isInsideStretchy(el) || isElementInvisible(el)) {
    return false;
  }
  let curr = el.parentElement;
  while (curr && curr !== slotEl) {
    const currTagId = getTagIdFromNodeName(curr.tagName);
    if (tagMatchesMask(currTagId, MASK_SLOT_CONTAINERS | ChtmlTagMask.MROW)) {
      return false;
    }
    curr = curr.parentElement;
  }
  return curr === slotEl;
}

/**
 * Finds the direct base element (<mjx-base> or firstElementChild) of a script/limit container
 * without descending into nested groups (<mjx-mrow>) or nested script/limit containers.
 */
function findDirectScriptBase(container: Element): Element | null {
  const candidates = Array.from(container.querySelectorAll("mjx-base"));
  for (const cand of candidates) {
    let curr = cand.parentElement;
    let isDirect = true;
    while (curr && curr !== container) {
      const tagId = getTagIdFromNodeName(curr.tagName);
      if (!tagMatchesMask(tagId, MASK_TRANSPARENT_INTERMEDIATE | ChtmlTagMask.MUNDER | ChtmlTagMask.MOVER)) {
        isDirect = false;
        break;
      }
      curr = curr.parentElement;
    }
    if (isDirect && curr === container) {
      return cand;
    }
  }
  return container.firstElementChild;
}

/**
 * Returns the next unreconciled element in document order within the current slot scope.
 */
function getNextSlotItem(slotEl: Element, excludeSet?: ReadonlySet<Element>): Element | null {
  const all = Array.from(
    slotEl.querySelectorAll(
      "mjx-mi, mjx-mn, mjx-mo, mjx-mtext, mjx-mspace, mjx-mrow, mjx-msub, mjx-msup, mjx-msubsup, mjx-munder, mjx-mover, mjx-munderover, mjx-mfrac, mjx-frac, mjx-sqrt, mjx-mroot, mjx-mtable, mjx-table, mjx-itable, mjx-linestack, mjx-linebox"
    )
  );
  for (const el of all) {
    if (el.classList.contains("cm-tensor-reconciled")) continue;
    if (excludeSet && excludeSet.has(el)) continue;
    if (!isScriptInSlotScope(el, slotEl)) continue;
    return el;
  }
  return null;
}

function isElementInSlotScope(el: Element, slotEl: Element): boolean {
  if (isInsideStretchy(el) || isElementInvisible(el)) {
    return false;
  }
  if (typeof el.parentElement === "undefined") {
    return true;
  }
  let curr = el.parentElement;
  while (curr && curr !== slotEl) {
    if (matchesSelector(curr, "mjx-mfrac, mjx-frac, mjx-sqrt, mjx-mroot, mjx-box, mjx-munder, mjx-mover, mjx-munderover, mjx-mtable, mjx-table, mjx-itable, mjx-mtd, mjx-linestack, mjx-linebox, mjx-msub, mjx-msup, mjx-msubsup, mjx-script")) {
      return false;
    }
    curr = curr.parentElement;
  }
  return curr === slotEl;
}

/**
 * Computes the aggregate start and end span of a list of CST nodes.
 */
function getNodeListSpan(nodes: CSTNode[]): { start: number; end: number } | null {
  if (!nodes || nodes.length === 0) return null;
  return {
    start: nodes[0].start,
    end: nodes[nodes.length - 1].end,
  };
}

let activeReconcilerLatex = "";

/**
 * Verifies that a DOM leaf's normalized text is compatible with the raw LaTeX source slice [start, end].
 * Acts as the central Final Unicode Gate at the stamping chokepoint so no code path can stamp a mismatched character.
 */
export function isSliceTextCompatible(domText: string, rawSlice: string): boolean {
  const cleanDom = normalizeMathOperatorChars(domText.trim());
  const cleanSlice = normalizeMathOperatorChars(rawSlice.trim());
  if (!cleanDom || !cleanSlice) return true;
  if (cleanDom === cleanSlice || domText.trim() === rawSlice.trim()) return true;

  // Strip sizing/fence prefixes (\left, \right, \middle, \big, \Big, \bigg, \Bigg, etc.)
  const strippedFence = cleanSlice
    .replace(/^\\(?:left|right|middle|[bB]igg?[lrm]?)\b\s*/, "")
    .trim();
  if (strippedFence && (cleanDom === strippedFence || cleanDom === strippedFence.replace(/^\\/, ""))) {
    return true;
  }

  // Common delimiter, ASCII operator shorthand & symbol equivalences
  if ((strippedFence === "\\{" || strippedFence === "\\lbrace") && cleanDom === "{") return true;
  if ((strippedFence === "\\}" || strippedFence === "\\rbrace") && cleanDom === "}") return true;
  if (strippedFence === "\\lbrack" && cleanDom === "[") return true;
  if (strippedFence === "\\rbrack" && cleanDom === "]") return true;
  if (strippedFence === "\\langle" && (cleanDom === "⟨" || cleanDom === "<")) return true;
  if (strippedFence === "\\rangle" && (cleanDom === "⟩" || cleanDom === ">")) return true;
  if ((strippedFence === "|" || strippedFence === "\\vert") && (cleanDom === "|" || cleanDom === "∣")) return true;
  if ((strippedFence === "\\|" || strippedFence === "\\Vert") && (cleanDom === "‖" || cleanDom === "∥" || cleanDom === "||")) return true;
  if ((strippedFence === "\\pi" || strippedFence === "pi") && cleanDom === "π") return true;
  if ((strippedFence === "=>" || strippedFence === "==>") && (cleanDom === "⟹" || cleanDom === "⇒")) return true;
  if ((strippedFence === "->" || strippedFence === "-->") && (cleanDom === "→" || cleanDom === "⟶")) return true;
  if ((strippedFence === "<->" || strippedFence === "<-->") && (cleanDom === "↔" || cleanDom === "⟷")) return true;
  if ((strippedFence === "<=>" || strippedFence === "<==>") && (cleanDom === "⟺" || cleanDom === "⇔")) return true;
  if (strippedFence === "|->" && (cleanDom === "↦" || cleanDom === "⟼")) return true;
  if (strippedFence === "<=" && cleanDom === "≤") return true;
  if (strippedFence === ">=" && cleanDom === "≥") return true;
  if (strippedFence === "!=" && cleanDom === "≠") return true;
  if (strippedFence === ":=" && (cleanDom === "≔" || cleanDom === ":=")) return true;
  if (strippedFence === "+-" && cleanDom === "±") return true;
  if (strippedFence === "-+" && cleanDom === "∓") return true;
  if (strippedFence === "~=" && cleanDom === "≈") return true;
  if (strippedFence === "<<" && cleanDom === "≪") return true;
  if (strippedFence === ">>" && cleanDom === "≫") return true;
  if (/^\.{3,}$/.test(strippedFence) && (cleanDom === "⋯" || cleanDom === "…")) return true;

  // Matrix environment fence headers (\begin{cases} -> {, \begin{pmatrix} -> (, \end{pmatrix} -> ), etc.)
  if (/^\\(?:begin|end)\s*\{(?:cases|dcases|rcases|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|matrix|array)\}/.test(cleanSlice)) {
    return true;
  }

  // Extensible over/under braces and arrows
  if (/^\\(?:under|over)(?:brace|line|rightarrow|leftarrow|leftrightarrow)/.test(cleanSlice)) {
    return true;
  }

  // Catalog lookup (both with and without leading backslash)
  const bare = strippedFence.replace(/^\\/, "");
  const cat = lookupCatalog(strippedFence) || lookupCatalog("\\" + bare) || lookupCatalog(bare);
  if (cat) {
    if (
      (cat.expectedText && (cleanDom === cat.expectedText || cleanDom.includes(cat.expectedText))) ||
      (cat.unicode && (cleanDom === cat.unicode || cleanDom.includes(cat.unicode)))
    ) {
      return true;
    }
  }

  // Fused macro or accent/font wrapper (e.g. \vec{V}, \mathbf{M}, \text{or}, "or")
  const unquoted = cleanSlice.replace(/^"(.*)"$/, "$1").trim();
  if (unquoted && cleanDom === unquoted) return true;
  const braceMatch = cleanSlice.match(/\{([^{}]+)\}/);
  if (braceMatch) {
    const inner = normalizeMathOperatorChars(braceMatch[1].trim());
    if (inner && (cleanDom === inner || cleanDom.includes(inner) || inner.includes(cleanDom))) {
      return true;
    }
  }

  // Unicode Plane-1 mathematical alphanumeric symbol in source (e.g. 𝝍 -> \psi -> 𝜓)
  const nfkdSlice = typeof cleanSlice.normalize === "function" ? cleanSlice.normalize("NFKD") : cleanSlice;
  const nfkdDom = typeof cleanDom.normalize === "function" ? cleanDom.normalize("NFKD") : cleanDom;
  if (nfkdDom === nfkdSlice) return true;

  return false;
}

/**
 * Central Final Verification Gate at the stamping chokepoint:
 * 1. Enforces 2D cell/line containment (<mjx-mtd>, <mjx-linebox>).
 * 2. Enforces Unicode identity between the DOM leaf and the LaTeX slice [start, end].
 */
function passesFinalStampGate(el: Element, range: QuaternionResolvedRange): boolean {
  const { start, end, kind } = range;
  if (start < 0 || end <= start) return false;
  if (el.classList && typeof el.classList.contains === "function" && el.classList.contains("color-math-cell-padding")) {
    return false;
  }

  // 1. 2D Cell / Line Containment Check
  let curr = el.parentElement;
  while (curr) {
    if (matchesSelector(curr, "mjx-mtd, mjx-linebox")) {
      const cellRange = getMathJaxElementRange(curr);
      if (cellRange && (start < cellRange.start || end > cellRange.end)) {
        return false;
      }
      break;
    }
    curr = curr.parentElement;
  }

  // 2. Unicode Identity Check for atomic leaf tags
  if (
    activeReconcilerLatex &&
    (kind === "leaf" || kind === "text") &&
    matchesSelector(el, "mjx-mi, mjx-mn, mjx-mo, mjx-mtext") &&
    !el.querySelector("mjx-stretchy-h, mjx-stretchy-v")
  ) {
    const domText = getElementText(el);
    const rawSlice = activeReconcilerLatex.slice(start, end);
    if (domText && rawSlice && !isSliceTextCompatible(domText, rawSlice)) {
      return false;
    }
  }

  return true;
}

/**
 * Attaches a cm-src-<start>-<end> class (Method 1) and indexes into WeakMap (Method 2)
 * with full 4D spatial coordinate quaternion and multi-scale hierarchy metadata.
 */
function stampQuaternionElement(
  el: Element,
  range: QuaternionResolvedRange
): boolean {
  if (!passesFinalStampGate(el, range)) {
    return false;
  }
  const { start, end, kind, coord, scales } = range;
  if (start >= 0 && end > start) {
    el.classList.add(`cm-src-${start}-${end}`);
    indexMathJaxElement(el, {
      start,
      end,
      kind,
      coord,
      scales,
    });
    return true;
  }
  return false;
}

/**
 * Propagates stamp classes and coordinate metadata down to leaf glyph elements (<mjx-c>).
 */
function stampChildGlyphs(el: Element, range: QuaternionResolvedRange): void {
  // Never propagate to child glyphs if the parent leaf failed the Final Verification Gate
  const parentRange = getMathJaxElementRange(el);
  if (!parentRange || parentRange.start !== range.start || parentRange.end !== range.end) {
    return;
  }
  const glyphs = Array.from(el.querySelectorAll("mjx-c"));
  const glyphCoord: SpatialCoordinate4D = {
    ...range.coord,
    w: 0, // Micro-glyph scale
  };
  for (const glyph of glyphs) {
    stampQuaternionElement(glyph, {
      ...range,
      coord: glyphCoord,
    });
  }
}

export class QuaternionSpatialReconciler {
  private readonly latex: string;
  private readonly formulaSpan: { start: number; end: number };
  private moleculeCounter = 0;
  private readonly basePlaneMap = new Map<CSTNode, number>();
  /** Tracks every CSTNode consumed and bound by Engine A so Engine B never re-consumes it onto later DOM leaves. */
  public readonly reconciledNodes = new Set<CSTNode>();

  constructor(latex: string) {
    this.latex = latex;
    this.formulaSpan = { start: 0, end: latex.length };
  }

  /**
   * Allocates a unique 3D isolation plane Z >= 1 for a structural molecule on the quaternion k-axis.
   * Chained scripts sharing the same anchorBase reuse the same Z plane so Y: +1 <-> -1
   * conjugation pairs superscripts and subscripts on the same base while isolating sibling scripts.
   */
  private allocatePlaneZ(anchorBase?: CSTNode): number {
    if (anchorBase) {
      const existing = this.basePlaneMap.get(anchorBase);
      if (existing !== undefined) return existing;
      const nextZ = ++this.moleculeCounter;
      this.basePlaneMap.set(anchorBase, nextZ);
      return nextZ;
    }
    return ++this.moleculeCounter;
  }

  /**
   * Main entry point: Hierarchically reconciles a MathJax CHTML container with the CST nodes.
   */
  public reconcile(container: Element, ast: CSTNode[]): void {
    if (!container || !ast || ast.length === 0) return;

    const prevActiveLatex = activeReconcilerLatex;
    activeReconcilerLatex = this.latex;
    try {
      this.reconcileInternal(container, ast);
    } finally {
      activeReconcilerLatex = prevActiveLatex;
    }
  }

  private reconcileInternal(container: Element, ast: CSTNode[]): void {
    // Find the math root container (mjx-math or direct container)
    const mathRoot = container.querySelector("mjx-math") || container;

    // Seal invisible pseudo-operators (U+2061..U+2064, ZWSP) and empty alignment spacers (<mjx-mi></mjx-mi> inside <mjx-mtd>)
    // injected by MathJax so they never pollute delimiter matching, slot leaf queries, or coordinate indices.
    const hasAnyContentInDom = Array.from(mathRoot.querySelectorAll("mjx-mi, mjx-mn, mjx-mo, mjx-mtext")).some(
      (el) => getElementText(el).length > 0
    );
    const invisibleEls = Array.from(mathRoot.querySelectorAll("mjx-mo, mjx-mi")).filter(
      (el) =>
        isElementInvisible(el) ||
        (hasAnyContentInDom &&
          matchesSelector(el, "mjx-mi") &&
          Boolean(el.parentElement && matchesSelector(el.parentElement, "mjx-mtd")) &&
          el.children.length === 0 &&
          getElementText(el) === "")
    );
    for (const inv of invisibleEls) {
      inv.classList.add("cm-tensor-reconciled");
    }

    const initialContext: MultiScaleContext = {
      slot: this.formulaSpan,
      molecule: this.formulaSpan,
      enclosure: this.formulaSpan,
    };

    // Begin top-level reconciliation at dominant baseline: Z = 0, Y = 0
    this.reconcileSlot(mathRoot, ast, 0, 0, initialContext, 0);
  }

  /**
   * Reconciles a single Baseline Slot (Z, Y) containing linear tokens and nested structural molecules.
   * Isolates subtrees: Any token discrepancies inside this slot never propagate outward.
   */
  public reconcileSlot(
    slotEl: Element,
    nodes: CSTNode[],
    z: number,
    y: number,
    context: MultiScaleContext,
    initialX: number = 0,
    excludeSet?: ReadonlySet<Element>
  ): void {
    if (!slotEl || !nodes || nodes.length === 0) return;

    const slotSpan = getNodeListSpan(nodes) || context.slot;
    const slotContext: MultiScaleContext = {
      slot: slotSpan,
      molecule: context.molecule,
      enclosure: context.enclosure,
    };

    const hasMatrixDelims = nodes.some(
      (c) =>
        (c.kind === "punctuation" && (c as any).char === "&") ||
        (c.kind === "identifier" && (c as any).text === "&") ||
        (c.kind === "operator" && (c as any).text === "&") ||
        (c.kind === "command" && (c.name === "\\\\" || c.name === "\\cr" || c.name === "\\newline"))
    );

    if (hasMatrixDelims) {
      const hasChildMatrixGroup = nodes.some(
        (n) =>
          n.kind === "group" &&
          (n.delimType === "matrix" ||
            n.children.some(
              (c) =>
                (c.kind === "punctuation" && (c as any).char === "&") ||
                (c.kind === "identifier" && (c as any).text === "&") ||
                (c.kind === "operator" && (c as any).text === "&") ||
                (c.kind === "command" && (c.name === "\\\\" || c.name === "\\cr" || c.name === "\\newline"))
            ))
      );
      const mtableCheck = !hasChildMatrixGroup
        ? Array.from(slotEl.querySelectorAll("mjx-mtable, mjx-table, mjx-itable, mjx-linestack")).filter(
            (el) => !el.classList.contains("cm-tensor-reconciled") && (isScriptInSlotScope(el, slotEl) || el.parentElement === slotEl || el.parentElement?.parentElement === slotEl)
          )
        : Array.from(slotEl.querySelectorAll("mjx-linestack")).filter(
            (el) => !el.classList.contains("cm-tensor-reconciled") && (el.parentElement === slotEl || el.parentElement?.parentElement === slotEl)
          );
      if (mtableCheck.length > 0) {
        mtableCheck[0].classList.add("cm-tensor-reconciled");
        this.reconcileMatrix(
          mtableCheck[0],
          {
            kind: "group",
            delimType: "matrix",
            openStart: slotSpan.start,
            openEnd: slotSpan.start,
            closeStart: slotSpan.end,
            closeEnd: slotSpan.end,
            openText: "",
            closeText: "",
            depth: 0,
            start: slotSpan.start,
            end: slotSpan.end,
            children: nodes,
          },
          this.allocatePlaneZ(),
          slotContext
        );
        return;
      }
    }

    let sequenceX = initialX;
    let activeZ = hasMatrixDelims && z === 0 ? this.allocatePlaneZ() : z;
    let activeY = y;
    let currentRow = 0;
    let currentCol = 0;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      switch (node.kind) {
        case "fraction": {
          this.reconcileFraction(slotEl, node, activeZ, activeY, sequenceX, slotContext);
          sequenceX++;
          break;
        }

        case "underover": {
          this.reconcileUnderOver(slotEl, node, activeZ, activeY, sequenceX, slotContext);
          sequenceX++;
          break;
        }

        case "command": {
          if (node.name === "\\sqrt") {
            const consumed = this.reconcileRoot(slotEl, node, nodes, i, activeZ, activeY, sequenceX, slotContext);
            i += consumed;
            sequenceX++;
          } else if (
            SPACING_COMMANDS.has(node.name) ||
            node.name === "\\\\" ||
            node.name === "\\" ||
            node.name === "\\cr" ||
            node.name === "\\newline"
          ) {
            if (
              hasMatrixDelims &&
              (node.name === "\\\\" || node.name === "\\cr" || node.name === "\\newline")
            ) {
              const nextEl = getNextSlotItem(slotEl, excludeSet);
              if (nextEl && matchesSelector(nextEl, "mjx-mspace")) {
                nextEl.classList.add("cm-tensor-reconciled");
              }
              currentRow++;
              currentCol = 0;
              activeY = -currentRow;
              sequenceX = 0;
              break;
            }
            // Spacing commands generate <mjx-mspace> or are purely layout whitespace
            const spaceEls = Array.from(slotEl.querySelectorAll("mjx-mspace")).filter(
              (el) => !el.classList.contains("cm-tensor-reconciled") && isElementInSlotScope(el, slotEl) && (!excludeSet || !excludeSet.has(el))
            );
            if (spaceEls.length > 0) {
              const sEl = spaceEls[0];
              sEl.classList.add("cm-tensor-reconciled");
              this.reconciledNodes.add(node);
              stampQuaternionElement(sEl, {
                start: node.start,
                end: node.end,
                kind: "leaf",
                coord: { w: 1, z: activeZ, y: activeY, x: sequenceX },
                scales: {
                  glyph: { start: node.start, end: node.end },
                  atom: { start: node.start, end: node.end },
                  slot: slotSpan,
                  molecule: context.molecule,
                  enclosure: context.enclosure,
                },
              });
            }
          } else {
            // Leaf command symbol (\alpha, \sin, \sum, \int, etc.)
            // If font command followed by argument group, fuse into single leaf
            if (FONT_ACCENT_COMMANDS.has(node.name) && i + 1 < nodes.length && nodes[i + 1].kind === "group") {
              const groupArg = nodes[i + 1] as GroupNode;
              const fusedText = this.latex
                ? this.latex.slice(node.start, groupArg.end)
                : `${node.name}{}`;
              const fusedNode: CSTNode = {
                kind: node.name === "\\text" ? "text" : "identifier",
                start: node.start,
                end: groupArg.end,
                text: fusedText,
              };
              this.reconciledNodes.add(node);
              this.reconciledNodes.add(groupArg);
              for (const gc of groupArg.children) {
                this.reconciledNodes.add(gc);
              }
              if (i + 2 < nodes.length && nodes[i + 2].kind === "script" && (nodes[i + 2] as ScriptNode).base === groupArg) {
                (nodes[i + 2] as ScriptNode).base = fusedNode;
                i++; // skip groupArg; next iteration reconciles ScriptNode with fusedNode as base
                break;
              }
              this.stampMatchingLeaf(slotEl, fusedNode, activeZ, activeY, sequenceX, slotSpan, slotContext, excludeSet);
              sequenceX++;
              i++; // will increment once more at loop end => advances by 2
              break;
            }

            // If this node is the base of an immediately following script, defer to reconcileScript
            if (i + 1 < nodes.length && nodes[i + 1].kind === "script" && (nodes[i + 1] as ScriptNode).base === node) {
              break;
            }
            this.stampMatchingLeaf(slotEl, node, activeZ, activeY, sequenceX, slotSpan, slotContext, excludeSet);
            sequenceX++;
          }
          break;
        }

        case "script": {
          this.reconcileScript(slotEl, node, activeZ, activeY, sequenceX, slotContext);
          sequenceX++;
          break;
        }

        case "group": {
          // Defer to reconcileScript ONLY if the DOM actually wraps this group in an <mjx-mrow> inside the next script container
          if (i + 1 < nodes.length && nodes[i + 1].kind === "script" && (nodes[i + 1] as ScriptNode).base === node) {
            const nextItem = getNextSlotItem(slotEl, excludeSet);
            if (nextItem && matchesSelector(nextItem, "mjx-msup, mjx-msub, mjx-msubsup, mjx-munderover, mjx-munder, mjx-mover")) {
              const rawB = findDirectScriptBase(nextItem);
              const bEl = rawB && matchesSelector(rawB, "mjx-base") && rawB.firstElementChild ? rawB.firstElementChild : rawB;
              if (bEl && matchesSelector(bEl, "mjx-mrow")) {
                break;
              }
            }
          }
          this.reconcileGroup(slotEl, node, activeZ, activeY, sequenceX, slotContext);
          sequenceX++;
          break;
        }

        case "text":
        case "identifier":
        case "number":
        case "operator":
        case "punctuation":
        case "boundary": {
          // Layout alignment delimiters (&) produce zero DOM leaf elements in MathJax CHTML
          if (
            (node.kind === "punctuation" && (node as any).char === "&") ||
            (node.kind === "identifier" && (node as any).text === "&") ||
            (node.kind === "operator" && (node as any).text === "&")
          ) {
            currentCol++;
            sequenceX = currentCol * 16;
            break;
          }
          // If this node is the base of an immediately following script, defer to reconcileScript
          if (i + 1 < nodes.length && nodes[i + 1].kind === "script" && (nodes[i + 1] as ScriptNode).base === node) {
            break;
          }
          this.stampMatchingLeaf(slotEl, node, activeZ, activeY, sequenceX, slotSpan, slotContext, excludeSet);
          sequenceX++;
          break;
        }

        default:
          break;
      }
    }
  }

  /**
   * Reconciles a Fraction molecule: <mjx-frac> containing <mjx-num> (Y=+1) and <mjx-den> (Y=-1).
   * Also handles binomials (<mjx-frac class="mjx-atop">).
   */
  private reconcileFraction(
    parentEl: Element,
    node: FractionNode,
    z: number,
    parentY: number,
    parentX: number,
    context: MultiScaleContext
  ): void {
    // In TeX/MathJax CHTML, `{num}/{den}` (node.isInfixSlash === true) renders inline on the baseline
    // (`num`, `<mjx-mo>/</mjx-mo>`, `den`) when unnormalized, or inside `<mjx-frac>`/`<mjx-mfrac>` when normalized to `\frac{num}{den}`.
    if (node.isInfixSlash) {
      const fracOrSlashCandidates = Array.from(
        parentEl.querySelectorAll("mjx-frac, mjx-mfrac, mjx-mo")
      ).filter((el) => {
        if (el.classList.contains("cm-tensor-reconciled")) return false;
        if (!isElementInSlotScope(el, parentEl)) return false;
        if (matchesSelector(el, "mjx-frac, mjx-mfrac")) return true;
        return getElementText(el) === "/";
      });
      const firstCand = fracOrSlashCandidates[0];
      if (!firstCand || matchesSelector(firstCand, "mjx-mo")) {
        this.reconcileSlot(parentEl, node.numerator, z, parentY, context, parentX);
        const numEnd = node.numerator.length > 0 ? node.numerator[node.numerator.length - 1].end : node.start;
        const denStart = node.denominator.length > 0 ? node.denominator[0].start : node.end;
        const betweenSlice = this.latex ? this.latex.slice(numEnd, denStart) : "/";
        const slashRelIdx = betweenSlice.indexOf("/");
        const slashStart = slashRelIdx >= 0 ? numEnd + slashRelIdx : numEnd;
        const slashNode: CSTNode = {
          kind: "operator",
          start: slashStart,
          end: slashStart + 1,
          text: "/",
        };
        this.stampMatchingLeaf(parentEl, slashNode, z, parentY, parentX + 1, context.slot, context);
        this.reconcileSlot(parentEl, node.denominator, z, parentY, context, parentX + 2);
        return;
      }
    }

    // Locate the corresponding <mjx-frac> (or <mjx-mfrac> fallback) in this parent
    let fracEls = Array.from(parentEl.querySelectorAll("mjx-frac")).filter(
      (el) => !el.classList.contains("cm-tensor-reconciled")
    );
    if (fracEls.length === 0) {
      fracEls = Array.from(parentEl.querySelectorAll("mjx-mfrac")).filter(
        (el) => !el.classList.contains("cm-tensor-reconciled")
      );
    }
    if (fracEls.length === 0) return;

    const fracEl = fracEls[0];
    fracEl.classList.add("cm-tensor-reconciled");
    if (fracEl.parentElement && matchesSelector(fracEl.parentElement, "mjx-mfrac")) {
      fracEl.parentElement.classList.add("cm-tensor-reconciled");
    }
    const innerFrac = fracEl.querySelector("mjx-frac");
    if (innerFrac) {
      innerFrac.classList.add("cm-tensor-reconciled");
    }

    const moleculeSpan = { start: node.start, end: node.end };
    const fracZ = this.allocatePlaneZ();

    // Verify expected child slot tags from layout blueprint (TAG_NUM, TAG_DEN)
    const catEntry = lookupCatalog(node.command || "\\frac");
    const expectedNumTag = catEntry ? getExpectedChildTag(catEntry, 0) : TAG_NUM;
    const expectedDenTag = catEntry ? getExpectedChildTag(catEntry, 1) : TAG_DEN;
    const numSelector = expectedNumTag ? `${getTagName(expectedNumTag)}, mjx-num` : "mjx-num";
    const denSelector = expectedDenTag ? `${getTagName(expectedDenTag)}, mjx-den` : "mjx-den";

    // Stamp the entire fraction molecule (W = 3)
    stampQuaternionElement(fracEl, {
      start: node.start,
      end: node.end,
      kind: "fraction",
      coord: { w: 3, z, y: parentY, x: parentX },
      scales: {
        glyph: moleculeSpan,
        atom: moleculeSpan,
        slot: moleculeSpan,
        molecule: moleculeSpan,
        enclosure: context.enclosure,
      },
    });

    const unwrapFractionSlot = (slotEl: Element, slotRange: QuaternionResolvedRange): Element => {
      // In TeX/MathJax CHTML, \cfrac{num}{den} wraps <mjx-num> and <mjx-den> contents in:
      // <mjx-mrow> -> (<mjx-mpadded> strut, <mjx-texatom> actual slot children)
      const directMrows = Array.from(slotEl.children).filter((c) => matchesSelector(c, "mjx-mrow"));
      if (directMrows.length === 1) {
        const mrow = directMrows[0];
        const hasStrut = Array.from(mrow.children).some((c) => matchesSelector(c, "mjx-mpadded"));
        if (hasStrut) {
          mrow.classList.add("cm-tensor-reconciled");
          stampQuaternionElement(mrow, slotRange);
          for (const mp of Array.from(mrow.querySelectorAll("mjx-mpadded, mjx-mpadded *"))) {
            mp.classList.add("cm-tensor-reconciled");
          }
          const nonStrutChildren = Array.from(mrow.children).filter((c) => !matchesSelector(c, "mjx-mpadded"));
          if (nonStrutChildren.length === 1 && matchesSelector(nonStrutChildren[0], "mjx-texatom, mjx-mstyle, mjx-mrow")) {
            nonStrutChildren[0].classList.add("cm-tensor-reconciled");
            stampQuaternionElement(nonStrutChildren[0], slotRange);
            return nonStrutChildren[0];
          }
          return mrow;
        }
      }
      return slotEl;
    };

    // Reconcile Numerator: Z = fracZ, Y = +1
    const numEl =
      Array.from(fracEl.children).find((c) => matchesSelector(c, numSelector)) ||
      fracEl.querySelector(numSelector);
    if (numEl) {
      const numSpan = getNodeListSpan(node.numerator) || moleculeSpan;
      const numRange: QuaternionResolvedRange = {
        start: numSpan.start,
        end: numSpan.end,
        kind: "numerator",
        coord: { w: 2, z: fracZ, y: 1, x: 0 },
        scales: {
          glyph: numSpan,
          atom: numSpan,
          slot: numSpan,
          molecule: moleculeSpan,
          enclosure: context.enclosure,
        },
      };
      stampQuaternionElement(numEl, numRange);
      const numContext: MultiScaleContext = {
        slot: numSpan,
        molecule: moleculeSpan,
        enclosure: context.enclosure,
      };
      const unwrappedNumEl = unwrapFractionSlot(numEl, numRange);
      this.reconcileSlot(unwrappedNumEl, node.numerator, fracZ, 1, numContext, 0);
    }

    // Reconcile Denominator: Z = fracZ, Y = -1
    // Denominator Anti-Theft Guard: candidate denominator cannot reside inside the numerator subtree
    const denEl =
      Array.from(fracEl.children).find((c) => matchesSelector(c, denSelector)) ||
      Array.from(fracEl.querySelectorAll(denSelector)).find((cand) => !elementContains(numEl, cand)) ||
      fracEl.querySelector(denSelector);
    if (denEl) {
      const denSpan = getNodeListSpan(node.denominator) || moleculeSpan;
      const denRange: QuaternionResolvedRange = {
        start: denSpan.start,
        end: denSpan.end,
        kind: "denominator",
        coord: { w: 2, z: fracZ, y: -1, x: 0 },
        scales: {
          glyph: denSpan,
          atom: denSpan,
          slot: denSpan,
          molecule: moleculeSpan,
          enclosure: context.enclosure,
        },
      };
      stampQuaternionElement(denEl, denRange);
      const denContext: MultiScaleContext = {
        slot: denSpan,
        molecule: moleculeSpan,
        enclosure: context.enclosure,
      };
      const unwrappedDenEl = unwrapFractionSlot(denEl, denRange);
      this.reconcileSlot(unwrappedDenEl, node.denominator, fracZ, -1, denContext, 0);
    }
  }

  /**
   * Reconciles Extensible Under/Over molecules: <mjx-munder>, <mjx-mover>, <mjx-munderover>.
   * Binds base slot at Y=0 and annotation slot at Y=±1 in structural isolation.
   * Handles both single-tier extensible delimiters and two-tier nested molecules.
   */
  private reconcileUnderOver(
    parentEl: Element,
    node: UnderOverNode,
    z: number,
    parentY: number,
    parentX: number,
    context: MultiScaleContext
  ): void {
    const isUnder = node.targetRole === "underscript";
    const selector = isUnder
      ? "mjx-munder, mjx-munderover, mjx-mover"
      : "mjx-mover, mjx-munderover, mjx-munder";

    const uoEls = Array.from(parentEl.querySelectorAll(selector)).filter(
      (el) => !el.classList.contains("cm-tensor-reconciled")
    );
    if (uoEls.length === 0) return;

    const uoEl = uoEls[0];
    uoEl.classList.add("cm-tensor-reconciled");

    const moleculeSpan = { start: node.start, end: node.end };
    const uoZ = this.allocatePlaneZ();

    // Stamp the entire under/over molecule (W = 3)
    stampQuaternionElement(uoEl, {
      start: node.start,
      end: node.end,
      kind: "underover",
      coord: { w: 3, z, y: parentY, x: parentX },
      scales: {
        glyph: moleculeSpan,
        atom: moleculeSpan,
        slot: moleculeSpan,
        molecule: moleculeSpan,
        enclosure: context.enclosure,
      },
    });

    const scriptRoleY = isUnder ? -1 : 1;
    const hasScript = node.script && node.script.length > 0;

    // Check if uoEl is a nested two-tier container (has an inner munder/mover in its base)
    const baseEl =
      uoEl.querySelector("mjx-base") ||
      (uoEl.firstElementChild && !matchesSelector(uoEl.firstElementChild, "mjx-under, mjx-over")
        ? uoEl.firstElementChild
        : null);

    const innerUoEl = baseEl ? baseEl.querySelector(selector) : null;

    if (hasScript && innerUoEl) {
      // ---------------------------------------------------------
      // TWO-TIER NESTED MOLECULE (Outer = Script, Inner = Brace + Base)
      // ---------------------------------------------------------
      innerUoEl.classList.add("cm-tensor-reconciled");
      const innerZ = this.allocatePlaneZ();

      const allScriptEls = Array.from(uoEl.querySelectorAll(isUnder ? "mjx-under" : "mjx-over"));
      // 1. Reconcile Outer Script: Y = ±1, Z = uoZ
      // Outer script container is strictly the one outside innerUoEl / baseEl
      const outerScriptContainer = allScriptEls.find((el) => !baseEl?.contains(el)) || null;

      if (outerScriptContainer && node.script) {
        outerScriptContainer.classList.add("cm-tensor-reconciled");
        const scriptSpan =
          getNodeListSpan(node.script) || {
            start: node.scriptStart || node.start,
            end: node.scriptEnd || node.end,
          };
        const scriptContext: MultiScaleContext = {
          slot: scriptSpan,
          molecule: moleculeSpan,
          enclosure: context.enclosure,
        };
        stampQuaternionElement(outerScriptContainer, {
          start: scriptSpan.start,
          end: scriptSpan.end,
          kind: "script",
          coord: { w: 2, z: uoZ, y: scriptRoleY, x: 1 },
          scales: {
            glyph: scriptSpan,
            atom: scriptSpan,
            slot: scriptSpan,
            molecule: moleculeSpan,
            enclosure: context.enclosure,
          },
        });
        this.reconcileSlot(outerScriptContainer, node.script, uoZ, scriptRoleY, scriptContext, 0);
      }

      // 2. Reconcile Inner Molecule's Base: Y = 0, Z = innerZ
      const innerBase =
        innerUoEl.querySelector("mjx-base") ||
        (innerUoEl.firstElementChild && !matchesSelector(innerUoEl.firstElementChild, "mjx-under, mjx-over")
          ? innerUoEl.firstElementChild
          : null);

      if (innerBase && node.base.length > 0) {
        innerBase.classList.add("cm-tensor-reconciled");
        const baseSpan = getNodeListSpan(node.base) || { start: node.baseStart, end: node.baseEnd };
        const baseContext: MultiScaleContext = {
          slot: baseSpan,
          molecule: moleculeSpan,
          enclosure: context.enclosure,
        };
        stampQuaternionElement(innerBase, {
          start: baseSpan.start,
          end: baseSpan.end,
          kind: "leaf",
          coord: { w: 2, z: innerZ, y: 0, x: 0 },
          scales: {
            glyph: baseSpan,
            atom: baseSpan,
            slot: baseSpan,
            molecule: moleculeSpan,
            enclosure: context.enclosure,
          },
        });
        this.reconcileSlot(innerBase, node.base, innerZ, 0, baseContext, 0);
      }

      // 3. Reconcile Inner Molecule's Brace Glyph: Y = ±1, Z = innerZ
      // Inner brace container is strictly the one inside innerUoEl
      const innerBraceContainer = allScriptEls.find((el) => innerUoEl.contains(el)) || null;

      if (innerBraceContainer) {
        innerBraceContainer.classList.add("cm-tensor-reconciled");
        const braceGlyph = innerBraceContainer.querySelector("mjx-mo, mjx-c") || innerBraceContainer;
        if (braceGlyph) {
          braceGlyph.classList.add("cm-tensor-reconciled");
          const opSpan = { start: node.start, end: node.start + node.operator.length };
          const opRange: QuaternionResolvedRange = {
            start: opSpan.start,
            end: opSpan.end,
            kind: "leaf",
            coord: { w: 1, z: innerZ, y: scriptRoleY, x: 0 },
            scales: {
              glyph: opSpan,
              atom: opSpan,
              slot: opSpan,
              molecule: moleculeSpan,
              enclosure: context.enclosure,
            },
          };
          stampQuaternionElement(braceGlyph, opRange);
          stampChildGlyphs(braceGlyph, opRange);
          // Mark all internal stretchy parts as reconciled
          const stretchyParts = Array.from(braceGlyph.querySelectorAll("mjx-stretchy-h, mjx-stretchy-v, mjx-beg, mjx-ext, mjx-mid, mjx-end, mjx-spacer"));
          for (const sp of stretchyParts) {
            sp.classList.add("cm-tensor-reconciled");
            stampQuaternionElement(sp, { ...opRange, coord: { ...opRange.coord, w: 0 } });
          }
        }
      }
    } else {
      // ---------------------------------------------------------
      // SINGLE-TIER MOLECULE (No Script or Flat Container)
      // ---------------------------------------------------------
      if (baseEl && node.base.length > 0) {
        baseEl.classList.add("cm-tensor-reconciled");
        const baseSpan = getNodeListSpan(node.base) || { start: node.baseStart, end: node.baseEnd };
        const baseContext: MultiScaleContext = {
          slot: baseSpan,
          molecule: moleculeSpan,
          enclosure: context.enclosure,
        };
        stampQuaternionElement(baseEl, {
          start: baseSpan.start,
          end: baseSpan.end,
          kind: "leaf",
          coord: { w: 2, z: uoZ, y: 0, x: 0 },
          scales: {
            glyph: baseSpan,
            atom: baseSpan,
            slot: baseSpan,
            molecule: moleculeSpan,
            enclosure: context.enclosure,
          },
        });
        this.reconcileSlot(baseEl, node.base, uoZ, 0, baseContext, 0);
      }

      const scriptContainer = isUnder
        ? (uoEl.querySelector("mjx-under") || uoEl.lastElementChild)
        : (uoEl.querySelector("mjx-over") || uoEl.lastElementChild);

      if (scriptContainer) {
        scriptContainer.classList.add("cm-tensor-reconciled");

        // Stamp extensible brace glyph if present inside scriptContainer
        const braceGlyph =
          (scriptContainer.firstElementChild && matchesSelector(scriptContainer.firstElementChild, "mjx-c")
            ? scriptContainer.firstElementChild
            : Array.from(scriptContainer.querySelectorAll("mjx-mo")).find((mo) =>
                Boolean(mo.querySelector("mjx-stretchy-h, mjx-stretchy-v"))
              )) ||
          scriptContainer.querySelector("mjx-c") ||
          scriptContainer;
        if (braceGlyph) {
          braceGlyph.classList.add("cm-tensor-reconciled");
          const opSpan = { start: node.start, end: node.start + node.operator.length };
          const opRange: QuaternionResolvedRange = {
            start: opSpan.start,
            end: opSpan.end,
            kind: "leaf",
            coord: { w: 1, z: uoZ, y: scriptRoleY, x: 0 },
            scales: {
              glyph: opSpan,
              atom: opSpan,
              slot: opSpan,
              molecule: moleculeSpan,
              enclosure: context.enclosure,
            },
          };
          stampQuaternionElement(braceGlyph, opRange);
          stampChildGlyphs(braceGlyph, opRange);
          const stretchyParts = Array.from(braceGlyph.querySelectorAll("mjx-stretchy-h, mjx-stretchy-v, mjx-beg, mjx-ext, mjx-mid, mjx-end, mjx-spacer"));
          for (const sp of stretchyParts) {
            sp.classList.add("cm-tensor-reconciled");
            stampQuaternionElement(sp, { ...opRange, coord: { ...opRange.coord, w: 0 } });
          }
        }

        if (node.script && node.script.length > 0) {
          const scriptEl =
            Array.from(scriptContainer.children).find((c) => tagMatchesMask(getTagIdFromNodeName(c.tagName), ChtmlTagMask.SCRIPT | ChtmlTagMask.ROW)) ||
            scriptContainer;
          scriptEl.classList.add("cm-tensor-reconciled");
          const scriptSpan =
            getNodeListSpan(node.script) || {
              start: node.scriptStart || node.start,
              end: node.scriptEnd || node.end,
            };
          const scriptContext: MultiScaleContext = {
            slot: scriptSpan,
            molecule: moleculeSpan,
            enclosure: context.enclosure,
          };
          stampQuaternionElement(scriptEl, {
            start: scriptSpan.start,
            end: scriptSpan.end,
            kind: "script",
            coord: { w: 2, z: uoZ, y: scriptRoleY, x: 1 },
            scales: {
              glyph: scriptSpan,
              atom: scriptSpan,
              slot: scriptSpan,
              molecule: moleculeSpan,
              enclosure: context.enclosure,
            },
          });
          this.reconcileSlot(scriptEl, node.script, uoZ, scriptRoleY, scriptContext, 0);
        }
      }
    }
  }

  /**
   * Reconciles Radical molecules: <mjx-sqrt> and indexed roots <mjx-mroot>.
   */
  private reconcileRoot(
    parentEl: Element,
    node: CSTNode,
    nodes: CSTNode[],
    indexInParent: number,
    z: number,
    parentY: number,
    parentX: number,
    context: MultiScaleContext
  ): number {
    const rootEls = Array.from(parentEl.querySelectorAll("mjx-sqrt, mjx-mroot")).filter(
      (el) => !el.classList.contains("cm-tensor-reconciled")
    );
    if (rootEls.length === 0) return 0;

    const rootEl = rootEls[0];
    rootEl.classList.add("cm-tensor-reconciled");

    let end = node.end;
    let radicandNodes: CSTNode[] = [];
    let degreeNodes: CSTNode[] = [];

    // Check if degree bracket was consumed into \sqrt command node: e.g. \sqrt[3]
    const cmdText = this.latex.slice(node.start, node.end);
    const bracketMatch = cmdText.match(/\[(.*?)\]/);
    let degreeSpan: { start: number; end: number } | null = null;
    if (bracketMatch && bracketMatch.index !== undefined) {
      const degreeStart = node.start + bracketMatch.index + 1;
      const degreeEnd = degreeStart + bracketMatch[1].length;
      degreeSpan = { start: degreeStart, end: degreeEnd };
      const degreeParser = new MathCSTParser(bracketMatch[1]);
      degreeNodes = degreeParser.parse();
      for (const dn of degreeNodes) {
        dn.start += degreeStart;
        dn.end += degreeStart;
      }
    }

    // Lookahead for optional [degree] and mandatory {radicand}
    let j = indexInParent + 1;
    let consumedCount = 0;
    if (degreeNodes.length === 0 && j < nodes.length && nodes[j].kind === "group" && (nodes[j] as GroupNode).delimType === "bracket") {
      degreeNodes = (nodes[j] as GroupNode).children;
      end = nodes[j].end;
      j++;
      consumedCount++;
    }
    if (j < nodes.length && nodes[j].kind === "group") {
      radicandNodes = (nodes[j] as GroupNode).children;
      end = nodes[j].end;
      consumedCount++;
    } else if (j < nodes.length) {
      radicandNodes = [nodes[j]];
      end = nodes[j].end;
      consumedCount++;
    }

    const moleculeSpan = { start: node.start, end };
    const rootZ = this.allocatePlaneZ();

    // Stamp root molecule (W = 3)
    stampQuaternionElement(rootEl, {
      start: node.start,
      end,
      kind: "root",
      coord: { w: 3, z, y: parentY, x: parentX },
      scales: {
        glyph: moleculeSpan,
        atom: moleculeSpan,
        slot: moleculeSpan,
        molecule: moleculeSpan,
        enclosure: context.enclosure,
      },
    });

    // Checkmark / surd element
    const surdEl = rootEl.querySelector("mjx-surd");
    if (surdEl) {
      stampQuaternionElement(surdEl, {
        start: node.start,
        end,
        kind: "root",
        coord: { w: 1, z: rootZ, y: 0, x: 0 },
        scales: {
          glyph: { start: node.start, end: node.end },
          atom: moleculeSpan,
          slot: moleculeSpan,
          molecule: moleculeSpan,
          enclosure: context.enclosure,
        },
      });
    }

    // Verify expected child slot tags from layout blueprint (TAG_BOX, TAG_ROOT)
    const catEntry = lookupCatalog("\\sqrt");
    const expectedRadTag = catEntry ? getExpectedChildTag(catEntry, 0) : TAG_BOX;
    const expectedDegTag = catEntry ? getExpectedChildTag(catEntry, 1) : TAG_ROOT;
    const radSelector = expectedRadTag ? `${getTagName(expectedRadTag)}, mjx-box` : "mjx-box";
    const degSelector = expectedDegTag ? `${getTagName(expectedDegTag)}, mjx-root` : "mjx-root";

    // Radicand box: Z = rootZ, Y = 0
    const boxEl = rootEl.querySelector(radSelector);
    if (boxEl && radicandNodes.length > 0) {
      const radSpan = getNodeListSpan(radicandNodes) || moleculeSpan;
      const radContext: MultiScaleContext = {
        slot: radSpan,
        molecule: moleculeSpan,
        enclosure: context.enclosure,
      };
      stampQuaternionElement(boxEl, {
        start: radSpan.start,
        end: radSpan.end,
        kind: "root",
        coord: { w: 2, z: rootZ, y: 0, x: 0 },
        scales: {
          glyph: radSpan,
          atom: radSpan,
          slot: radSpan,
          molecule: moleculeSpan,
          enclosure: context.enclosure,
        },
      });
      this.reconcileSlot(boxEl, radicandNodes, rootZ, 0, radContext, 0);
    }

    // Indexed root degree: <mjx-root> at Z = rootZ, Y = +1
    // Degree Anti-Theft Guard: candidate degree cannot reside inside the radicand box subtree
    const degreeEl =
      Array.from(rootEl.querySelectorAll(degSelector)).find((cand) => !elementContains(boxEl, cand)) ||
      rootEl.querySelector(degSelector);
    if (degreeEl) {
      const degSpan = getNodeListSpan(degreeNodes) || degreeSpan || moleculeSpan;
      const degContext: MultiScaleContext = {
        slot: degSpan,
        molecule: moleculeSpan,
        enclosure: context.enclosure,
      };
      stampQuaternionElement(degreeEl, {
        start: degSpan.start,
        end: degSpan.end,
        kind: "script",
        coord: { w: 2, z: rootZ, y: 1, x: 0 },
        scales: {
          glyph: degSpan,
          atom: degSpan,
          slot: degSpan,
          molecule: moleculeSpan,
          enclosure: context.enclosure,
        },
      });
      if (degreeNodes.length > 0) {
        this.reconcileSlot(degreeEl, degreeNodes, rootZ, 1, degContext, 0);
      }
    }
    return consumedCount;
  }

  /**
   * Reconciles Script and Limit elements: <mjx-msup>, <mjx-msub>, <mjx-msubsup>, <mjx-munderover>, <mjx-munder>, <mjx-mover>.
   * Binds limits strictly by structural slot (Y = +1 superscript, Y = -1 subscript), immunizing against authoring order.
   */
  private reconcileScript(
    parentEl: Element,
    node: ScriptNode,
    z: number,
    parentY: number,
    parentX: number,
    context: MultiScaleContext
  ): void {
    const isSuper = node.scriptType === "superscript";
    const slotRoleY = isSuper ? 1 : -1;

    if (!node.base) {
      const nextItem = getNextSlotItem(parentEl);
      const isNextEmptyBaseScript =
        nextItem &&
        matchesSelector(nextItem, "mjx-msup, mjx-msub, mjx-msubsup") &&
        !getElementText(findDirectScriptBase(nextItem));
      if (!isNextEmptyBaseScript) {
        if (node.arg && node.arg.length > 0) {
          this.reconcileSlot(parentEl, node.arg, z, slotRoleY, context, 0);
        }
        return;
      }
    }

    // Search for script containers or limit containers
    const selector = "mjx-msup, mjx-msub, mjx-msubsup, mjx-munderover, mjx-munder, mjx-mover";
    const rawCandidates: Element[] = [];
    if (matchesSelector(parentEl, selector)) {
      rawCandidates.push(parentEl);
    }
    rawCandidates.push(...Array.from(parentEl.querySelectorAll(selector)));

    // Filter out internal <mjx-munder> layout wrappers inside <mjx-munderover>;
    // chained scripts whose parent is an outer <mjx-msup>/<mjx-msub> remain in candidates
    // so matchingCands can pair !isScriptBase with the inner container and isScriptBase with the outer container.
    const candidates = rawCandidates.filter((cand) => {
      if (cand === parentEl) return true;
      let curr = cand.parentElement;
      while (curr && curr !== parentEl) {
        if (matchesSelector(curr, "mjx-munderover")) {
          return false;
        }
        curr = curr.parentElement;
      }
      return true;
    });

    const scriptEls = candidates.filter((el) => {
      if (el !== parentEl && !isScriptInSlotScope(el, parentEl)) return false;
      if (el !== parentEl && el.classList.contains("cm-tensor-reconciled")) return false;
      if (el.matches("mjx-msubsup")) {
        const scriptContainer =
          Array.from(el.children).find((c) => matchesSelector(c, "mjx-script")) ||
          el.querySelector("mjx-script");
        const spacer = scriptContainer?.querySelector("mjx-spacer");
        if (spacer && scriptContainer) {
          const scriptChildren = Array.from(scriptContainer.children);
          const spacerIdx = scriptChildren.indexOf(spacer);
          const slotEl = isSuper
            ? (spacerIdx > 0 ? scriptChildren[0] : null)
            : (spacerIdx >= 0 && spacerIdx + 1 < scriptChildren.length ? scriptChildren[spacerIdx + 1] : null);
          if (slotEl && slotEl.classList.contains("cm-tensor-reconciled")) return false;
        } else {
          const directScripts = Array.from(el.children).filter((c) => matchesSelector(c, "mjx-script"));
          const slotEl = isSuper ? (directScripts.length > 1 ? directScripts[1] : directScripts[0]) : directScripts[0];
          if (slotEl && slotEl.classList.contains("cm-tensor-reconciled")) return false;
        }
      } else if (el.matches("mjx-munderover")) {
        const directCh = Array.from(el.children);
        const boxCh = directCh.find((c) => matchesSelector(c, "mjx-box"));
        const slotEl = isSuper
          ? (directCh.find((c) => matchesSelector(c, "mjx-over")) || el.querySelector("mjx-over"))
          : (directCh.find((c) => matchesSelector(c, "mjx-under")) ||
             (boxCh ? Array.from(boxCh.children).find((c) => matchesSelector(c, "mjx-munder"))?.querySelector("mjx-under") : null) ||
             el.querySelector("mjx-under"));
        if (slotEl && slotEl.classList.contains("cm-tensor-reconciled")) return false;
      }
      return true;
    });

    if (scriptEls.length === 0) {
      if (!node.base && node.arg && node.arg.length > 0) {
        this.reconcileSlot(parentEl, node.arg, z, slotRoleY, context, 0);
      }
      return;
    }

    // Unwrap chained script nodes to the primary root anchor base token
    let anchorBase = node.base;
    while (anchorBase && "base" in anchorBase && anchorBase.base) {
      anchorBase = anchorBase.base as CSTNode;
    }

    // Exact CST-to-DOM Base Type Alignment:
    // 1. If node.base is a ScriptNode: DOM base child must be a script container (or cand is a dual-slot mjx-msubsup/mjx-munderover sharing anchorBase).
    // 2. If anchorBase is a GroupNode: DOM base child must be a group row container (mjx-mrow) or a closing delimiter mjx-mo already reconciled by reconcileGroup.
    // 3. Otherwise: DOM base child must be an atomic leaf, accent container, or base wrapper.
    const isScriptBase = Boolean(node.base && node.base.kind === "script");
    const isGroupBase = Boolean((node.base && node.base.kind === "group") || (anchorBase && anchorBase.kind === "group"));

    let scriptEl = scriptEls[0];
    const expectedAnchorText = anchorBase && !isScriptBase && !isGroupBase ? this.getExpectedNodeText(anchorBase) : "";
    const matchingCands = scriptEls.filter((cand) => {
      const rawB = findDirectScriptBase(cand);
      if (!rawB) return false;
      const bEl = matchesSelector(rawB, "mjx-base") && rawB.firstElementChild ? rawB.firstElementChild : rawB;
      const isDualSlot = matchesSelector(cand, "mjx-msubsup, mjx-munderover");
      const hasInnerScriptEl = matchesSelector(bEl, "mjx-msup, mjx-msub, mjx-msubsup, mjx-munderover");
      if (hasInnerScriptEl && !bEl.classList.contains("cm-tensor-reconciled")) {
        return false;
      }
      const isCandScriptBase = hasInnerScriptEl && bEl.classList.contains("cm-tensor-reconciled");
      const isCandGroupBase =
        matchesSelector(bEl, "mjx-mrow") ||
        (matchesSelector(bEl, "mjx-mo") && (bEl.classList.contains("cm-tensor-reconciled") || rawB.classList.contains("cm-tensor-reconciled")));
      if (isScriptBase && !isDualSlot) return isCandScriptBase;
      if (isGroupBase) return isCandGroupBase;
      return !hasInnerScriptEl && !matchesSelector(bEl, "mjx-mrow");
    });

    if (matchingCands.length > 0) {
      const textMatchedCand = expectedAnchorText
        ? matchingCands.find((cand) => {
            const rawB = findDirectScriptBase(cand);
            const bEl = rawB && matchesSelector(rawB, "mjx-base") && rawB.firstElementChild ? rawB.firstElementChild : rawB;
            const domB = bEl ? getElementText(bEl) : "";
            return !domB || domB === expectedAnchorText;
          })
        : null;
      scriptEl = textMatchedCand || matchingCands[0];
    }

    const scriptStart = anchorBase ? anchorBase.start : (node.base ? node.base.start : node.start);
    const atomSpan = { start: scriptStart, end: node.end };
    const moleculeSpan = { start: scriptStart, end: node.end };
    const scriptZ = this.allocatePlaneZ(anchorBase);

    // Stamp script molecule container (W = 3)
    stampQuaternionElement(scriptEl, {
      start: moleculeSpan.start,
      end: moleculeSpan.end,
      kind: "script",
      coord: { w: 3, z: scriptZ, y: parentY, x: parentX },
      scales: {
        glyph: moleculeSpan,
        atom: atomSpan,
        slot: context.slot,
        molecule: moleculeSpan,
        enclosure: context.enclosure,
      },
    });

    // Stamp the base token if present and not already a composite script container
    if (anchorBase) {
      const rawBaseEl = findDirectScriptBase(scriptEl);
      const innerBaseEl =
        rawBaseEl && matchesSelector(rawBaseEl, "mjx-base") && rawBaseEl.firstElementChild
          ? rawBaseEl.firstElementChild
          : rawBaseEl;
      const isCompositeScript =
        innerBaseEl &&
        (matchesSelector(innerBaseEl, "mjx-script, mjx-under, mjx-over, mjx-msup, mjx-msub, mjx-msubsup, mjx-munderover") ||
          (isScriptBase && matchesSelector(innerBaseEl, "mjx-munder, mjx-mover")));
      if (rawBaseEl && innerBaseEl && !isCompositeScript && !innerBaseEl.classList.contains("cm-tensor-reconciled")) {
        if (anchorBase.kind === "group") {
          if (rawBaseEl !== innerBaseEl) {
            rawBaseEl.classList.add("cm-tensor-reconciled");
          }
          this.reconcileGroup(innerBaseEl, anchorBase, z, parentY, parentX, context);
        } else {
          // Final Unicode Gate on script base token before stamping
          const domBaseText = getElementText(innerBaseEl);
          const isBaseUnicodeValid = isLeafTextMatch(domBaseText, anchorBase, this.latex);
          if (isBaseUnicodeValid) {
            const baseLeafRange: QuaternionResolvedRange = {
              start: anchorBase.start,
              end: anchorBase.end,
              kind: "leaf",
              coord: { w: 1, z, y: parentY, x: parentX },
              scales: {
                glyph: { start: anchorBase.start, end: anchorBase.end },
                atom: atomSpan,
                slot: context.slot,
                molecule: context.molecule,
                enclosure: context.enclosure,
              },
            };
            const baseGlyphRange: QuaternionResolvedRange = {
              start: anchorBase.start,
              end: anchorBase.end,
              kind: "leaf",
              coord: { w: 0, z, y: parentY, x: parentX },
              scales: {
                glyph: { start: anchorBase.start, end: anchorBase.end },
                atom: atomSpan,
                slot: context.slot,
                molecule: context.molecule,
                enclosure: context.enclosure,
              },
            };
            const stampedInner = stampQuaternionElement(innerBaseEl, baseLeafRange);
            if (stampedInner) {
              rawBaseEl.classList.add("cm-tensor-reconciled");
              innerBaseEl.classList.add("cm-tensor-reconciled");
              this.reconciledNodes.add(anchorBase);
              if (innerBaseEl !== rawBaseEl) {
                stampQuaternionElement(rawBaseEl, baseLeafRange);
              }
              const descEls = Array.from(
                innerBaseEl.querySelectorAll("mjx-mi, mjx-mn, mjx-mo, mjx-mtext, mjx-over, mjx-under, mjx-base, mjx-box")
              );
              for (const dEl of descEls) {
                if (stampQuaternionElement(dEl, baseLeafRange)) {
                  dEl.classList.add("cm-tensor-reconciled");
                }
              }
              stampChildGlyphs(rawBaseEl, baseGlyphRange);
            }
          }
        }
      }
    }

    // Role-based script lookup:
    // Underscript / Subscript -> Y = -1
    // Overscript / Superscript -> Y = +1
    let targetScriptEl: Element | null = null;
    const directChildren = Array.from(scriptEl.children);

    if (scriptEl.matches("mjx-msubsup")) {
      const scriptContainer = directChildren.find((c) => matchesSelector(c, "mjx-script")) || scriptEl.querySelector("mjx-script");
      const spacer = scriptContainer?.querySelector("mjx-spacer");
      if (spacer && scriptContainer) {
        // MathJax 4: <mjx-script> contains superscript before spacer, subscript after spacer
        const scriptChildren = Array.from(scriptContainer.children);
        const spacerIdx = scriptChildren.indexOf(spacer);
        const targetEls = isSuper
          ? (spacerIdx > 0 ? scriptChildren.slice(0, spacerIdx) : [])
          : (spacerIdx >= 0 ? scriptChildren.slice(spacerIdx + 1) : []);

        const argSpan = getNodeListSpan(node.arg) || atomSpan;
        const scriptContext: MultiScaleContext = {
          slot: argSpan,
          molecule: context.molecule,
          enclosure: context.enclosure,
        };

        if (targetEls.length > 0) {
          if (
            targetEls.length === 1 &&
            !matchesSelector(
              targetEls[0],
              "mjx-mi, mjx-mn, mjx-mo, mjx-mtext, mjx-msub, mjx-msup, mjx-msubsup, mjx-munder, mjx-mover, mjx-munderover, mjx-mfrac, mjx-frac, mjx-sqrt, mjx-mroot"
            )
          ) {
            // Complex wrapper element (e.g. mjx-texatom, mjx-mrow)
            targetScriptEl = targetEls[0];
            targetScriptEl.classList.add("cm-tensor-reconciled");
            stampQuaternionElement(targetScriptEl, {
              start: argSpan.start,
              end: argSpan.end,
              kind: "script",
              coord: { w: 2, z: scriptZ, y: slotRoleY, x: 0 },
              scales: {
                glyph: argSpan,
                atom: atomSpan,
                slot: argSpan,
                molecule: context.molecule,
                enclosure: context.enclosure,
              },
            });
            this.reconcileSlot(targetScriptEl, node.arg, scriptZ, slotRoleY, scriptContext, 0);
          } else {
            // Reconcile targetEls inside scriptContainer via full reconcileSlot (supporting nested scripts like E^0_{Zn^{2+}/Zn})
            const otherEls = isSuper
              ? (spacerIdx >= 0 ? scriptChildren.slice(spacerIdx + 1) : [])
              : (spacerIdx > 0 ? scriptChildren.slice(0, spacerIdx) : []);
            const excludeSet = new Set<Element>();
            if (spacer) {
              excludeSet.add(spacer);
              for (const d of Array.from(spacer.querySelectorAll("*"))) excludeSet.add(d);
            }
            for (const oEl of otherEls) {
              excludeSet.add(oEl);
              for (const d of Array.from(oEl.querySelectorAll("*"))) excludeSet.add(d);
            }
            this.reconcileSlot(scriptContainer, node.arg, scriptZ, slotRoleY, scriptContext, 0, excludeSet);
            for (const tEl of targetEls) {
              tEl.classList.add("cm-tensor-reconciled");
            }
          }

          // Check if both super and sub slots are done to mark the outer mjx-msubsup
          const superDone = spacerIdx <= 0 || scriptChildren.slice(0, spacerIdx).every((c) => c.classList.contains("cm-tensor-reconciled"));
          const subDone = spacerIdx < 0 || scriptChildren.slice(spacerIdx + 1).every((c) => c.classList.contains("cm-tensor-reconciled"));
          if (superDone && subDone) {
            scriptEl.classList.add("cm-tensor-reconciled");
          }
          return;
        }
      } else {
        // MathJax 3 legacy: separate mjx-script direct children
        const directScripts = directChildren.filter((c) => matchesSelector(c, "mjx-script"));
        targetScriptEl = isSuper
          ? (directScripts.length > 1 ? directScripts[1] : directScripts[0] || null)
          : (directScripts[0] || null);
      }
    } else if (scriptEl.matches("mjx-munderover")) {
      targetScriptEl = isSuper
        ? (scriptEl.querySelector("mjx-over") || directChildren.find((c) => matchesSelector(c, "mjx-over")) || null)
        : (scriptEl.querySelector("mjx-under") || directChildren.find((c) => matchesSelector(c, "mjx-under")) || null);
    } else if (isSuper && scriptEl.matches("mjx-msup, mjx-mover")) {
      targetScriptEl = directChildren.find((c) => matchesSelector(c, "mjx-script, mjx-over")) || scriptEl.querySelector("mjx-over, mjx-script") || scriptEl.lastElementChild;
    } else if (!isSuper && scriptEl.matches("mjx-msub, mjx-munder")) {
      targetScriptEl = directChildren.find((c) => matchesSelector(c, "mjx-script, mjx-under")) || scriptEl.querySelector("mjx-under, mjx-script") || scriptEl.lastElementChild;
    }

    if (targetScriptEl) {
      targetScriptEl.classList.add("cm-tensor-reconciled");
      if (!scriptEl.matches("mjx-munderover, mjx-msubsup")) {
        scriptEl.classList.add("cm-tensor-reconciled");
      } else if (scriptEl.matches("mjx-msubsup")) {
        const scriptContainer = directChildren.find((c) => matchesSelector(c, "mjx-script")) || scriptEl.querySelector("mjx-script");
        const spacer = scriptContainer?.querySelector("mjx-spacer");
        if (spacer && scriptContainer) {
          const scriptChildren = Array.from(scriptContainer.children);
          const spacerIdx = scriptChildren.indexOf(spacer);
          const superDone = spacerIdx <= 0 || scriptChildren[0].classList.contains("cm-tensor-reconciled");
          const subDone = spacerIdx < 0 || spacerIdx + 1 >= scriptChildren.length || scriptChildren[spacerIdx + 1].classList.contains("cm-tensor-reconciled");
          if (superDone && subDone) {
            scriptEl.classList.add("cm-tensor-reconciled");
          }
        } else {
          const directScripts = directChildren.filter((c) => matchesSelector(c, "mjx-script"));
          const allDone = directScripts.every((c) => c.classList.contains("cm-tensor-reconciled"));
          if (allDone) scriptEl.classList.add("cm-tensor-reconciled");
        }
      } else if (scriptEl.matches("mjx-munderover")) {
        const underChild = scriptEl.querySelector("mjx-under");
        const overChild = scriptEl.querySelector("mjx-over");
        const isUnderDone = !underChild || underChild.classList.contains("cm-tensor-reconciled");
        const isOverDone = !overChild || overChild.classList.contains("cm-tensor-reconciled");
        if (isUnderDone && isOverDone) {
          scriptEl.classList.add("cm-tensor-reconciled");
          for (const child of Array.from(scriptEl.children)) {
            if (matchesSelector(child, "mjx-box, mjx-munder, mjx-mover")) {
              child.classList.add("cm-tensor-reconciled");
              for (const grandChild of Array.from(child.children)) {
                if (matchesSelector(grandChild, "mjx-munder, mjx-mover")) {
                  grandChild.classList.add("cm-tensor-reconciled");
                }
              }
            }
          }
        }
      }
      const argSpan = getNodeListSpan(node.arg) || atomSpan;
      const scriptContext: MultiScaleContext = {
        slot: argSpan,
        molecule: context.molecule,
        enclosure: context.enclosure,
      };
      stampQuaternionElement(targetScriptEl, {
        start: argSpan.start,
        end: argSpan.end,
        kind: "script",
        coord: { w: 2, z: scriptZ, y: slotRoleY, x: 0 },
        scales: {
          glyph: argSpan,
          atom: atomSpan,
          slot: argSpan,
          molecule: context.molecule,
          enclosure: context.enclosure,
        },
      });
      this.reconcileSlot(targetScriptEl, node.arg, scriptZ, slotRoleY, scriptContext, 0);
    }
  }

  /**
   * Resolves the matching closing delimiter element for a delimited frame sequence.
   * Uses strict delimiter depth balancing to distinguish the true closing fence from
   * internal operators or subsequent sibling expressions.
   */
  private findMatchingCloseMo(
    groupMos: Element[],
    openMo: Element,
    delimType?: string,
    closeText?: string
  ): Element | null {
  const openIdx = groupMos.indexOf(openMo);
  if (openIdx < 0) return null;

    const targetCloseChar = closeText ? closeText.replace(/^\\right\b/, "").trim() : "";
    const targetOpenChar = getElementText(openMo);

    // Paired delimiters requiring depth balancing
    const isPaired =
      (targetOpenChar === "(" && targetCloseChar === ")") ||
      (targetOpenChar === "[" && targetCloseChar === "]") ||
      (targetOpenChar === "{" && targetCloseChar === "}") ||
      delimType === "paren" ||
      delimType === "bracket" ||
      delimType === "brace";

    let depth = 1;
    for (let i = openIdx + 1; i < groupMos.length; i++) {
      const mo = groupMos[i];
      const text = getElementText(mo);

    if (isPaired) {
      if (text === "(" || text === "[" || text === "{" || text === targetOpenChar) {
        depth++;
      } else if (text === ")" || text === "]" || text === "}" || text === targetCloseChar) {
        depth--;
        if (depth === 0) {
          return mo;
        }
      }
    } else {
      // Symmetric delimiters (e.g. |x|, \|x\|)
      const isNormMatch =
        (targetCloseChar === "\\|" || targetCloseChar === "\\Vert") &&
        (text === "‖" || text === "∥" || text === "||" || text === "\\|");
      const isVertMatch =
        (targetCloseChar === "|" || targetCloseChar === "\\vert") &&
        (text === "|" || text === "∣" || text === "\\vert");
      if (
        text === targetCloseChar ||
        text === targetOpenChar ||
        isNormMatch ||
        isVertMatch ||
        (targetCloseChar && text.includes(targetCloseChar))
      ) {
        depth--;
        if (depth === 0) {
          return mo;
        }
      }
    }
  }

  return null;
}

  /**
   * Reconciles Delimited Groups and Matrices: (...), [...], { ... }, or <mjx-mtable>.
   */
  private reconcileGroup(
    parentEl: Element,
    node: GroupNode,
    z: number,
    parentY: number,
    parentX: number,
    context: MultiScaleContext
  ): void {
    // Check if this group wraps a matrix table: <mjx-mtable>
    const isMatrix =
      node.delimType === "matrix" ||
      node.children.some(
        (c) =>
          (c.kind === "punctuation" && (c as any).char === "&") ||
          (c.kind === "identifier" && (c as any).text === "&") ||
          (c.kind === "operator" && (c as any).text === "&") ||
          (c.kind === "command" && (c.name === "\\\\" || c.name === "\\cr" || c.name === "\\newline"))
      );
    if (isMatrix) {
      const tableEl = parentEl.querySelector("mjx-mtable:not(.cm-tensor-reconciled)");
      if (tableEl) {
        tableEl.classList.add("cm-tensor-reconciled");
        const matZ = this.allocatePlaneZ();
        const groupSpan = { start: node.start, end: node.end };

        // If MathJax wrapped the matrix and its fences (e.g. \begin{cases} `{` or \begin{pmatrix} `(` and `)`)
        // in an enclosing <mjx-mrow>, mark that wrapper and its fence <mjx-mo>s as reconciled so subsequent
        // sibling groups (like [t] or (t) after \end{cases}) never steal the matrix wrapper <mjx-mrow>.
        const wrapperRow = tableEl.parentElement;
        if (wrapperRow && wrapperRow !== parentEl && matchesSelector(wrapperRow, "mjx-mrow")) {
          wrapperRow.classList.add("cm-tensor-reconciled");
          const siblings = Array.from(wrapperRow.children);
          const tableIdx = siblings.indexOf(tableEl);
          for (let sIdx = 0; sIdx < siblings.length; sIdx++) {
            const sib = siblings[sIdx];
            if (sib === tableEl || !matchesSelector(sib, "mjx-mo")) continue;
            sib.classList.add("cm-tensor-reconciled");
            const isBefore = sIdx < tableIdx;
            const fenceSpan = isBefore
              ? { start: node.openStart, end: node.openEnd }
              : {
                  start: node.closeStart ?? node.end,
                  end: node.closeEnd ?? node.end,
                };
            if (fenceSpan.end > fenceSpan.start && getElementText(sib).length > 0) {
              const fenceRange: QuaternionResolvedRange = {
                start: fenceSpan.start,
                end: fenceSpan.end,
                kind: "leaf",
                coord: { w: 1, z, y: parentY, x: parentX },
                scales: {
                  glyph: fenceSpan,
                  atom: fenceSpan,
                  slot: groupSpan,
                  molecule: groupSpan,
                  enclosure: context.enclosure,
                },
              };
              stampQuaternionElement(sib, fenceRange);
              stampChildGlyphs(sib, fenceRange);
            }
          }
        }

        this.reconcileMatrix(tableEl, node, matZ, context);
        this.reconciledNodes.add(node);
        return;
      }
    }

    // Transparent grouping row (<mjx-mrow>) or general delimited children
    const groupSpan = { start: node.start, end: node.end };
    const groupContext: MultiScaleContext = {
      slot: groupSpan,
      molecule: groupSpan,
      enclosure: context.enclosure,
    };

    const normLimits = (node as any).normLimits as ScriptNode[] | undefined;
    const evaluationLimits = (node as any).evaluationLimits as ScriptNode[] | undefined;
    const allLimits: ScriptNode[] = [
      ...(Array.isArray(normLimits) ? normLimits : []),
      ...(Array.isArray(evaluationLimits) ? evaluationLimits : []),
    ];
    let groupRowEl: Element = parentEl;
    let limitScriptContainer: Element | null = null;

    const hasVisibleOpen =
      node.openText &&
      node.delimType !== "bare_brace" &&
      node.openStart < node.openEnd &&
      node.openText !== "{";

    const hasVisibleClose =
      node.closeText &&
      node.delimType !== "bare_brace" &&
      node.closeStart !== undefined &&
      node.closeEnd !== undefined &&
      node.closeStart < node.closeEnd &&
      node.closeText !== "}";

    const isInnerFencedMrow =
      node.delimType === "bare_brace" &&
      node.children.length > 0 &&
      node.children.some((c) => c.kind === "group" && c.delimType !== "bare_brace");

    if (parentEl.matches("mjx-mrow") && !parentEl.classList.contains("cm-tensor-reconciled")) {
      groupRowEl = parentEl;
      groupRowEl.classList.add("cm-tensor-reconciled");
    } else if (!isInnerFencedMrow) {
      const nextItem = getNextSlotItem(parentEl);
      if (nextItem) {
        if (matchesSelector(nextItem, "mjx-mrow")) {
          // Distinguish a full group mrow (e.g. \left[ ... \right] or { ... }) from a single-delimiter
          // size wrapper mrow (e.g. \biggl[ which wraps only the opening <mjx-mo>[</mjx-mo> in an <mjx-mrow>).
          const isSingleDelimiterWrapper =
            Boolean(hasVisibleOpen && hasVisibleClose) &&
            nextItem.querySelectorAll("mjx-mo").length < 2;
          if (!isSingleDelimiterWrapper) {
            groupRowEl = nextItem;
            groupRowEl.classList.add("cm-tensor-reconciled");
          }
        } else if (
          allLimits.length > 0 &&
          matchesSelector(nextItem, "mjx-msubsup, mjx-msub, mjx-msup, mjx-munderover, mjx-munder, mjx-mover")
        ) {
          const rawB = findDirectScriptBase(nextItem);
          const bEl = rawB && matchesSelector(rawB, "mjx-base") && rawB.firstElementChild ? rawB.firstElementChild : rawB;
          if (bEl && matchesSelector(bEl, "mjx-mrow") && (!hasVisibleOpen || !hasVisibleClose || bEl.querySelectorAll("mjx-mo").length >= 2)) {
            limitScriptContainer = nextItem;
            if (rawB) rawB.classList.add("cm-tensor-reconciled");
            groupRowEl = bEl;
            groupRowEl.classList.add("cm-tensor-reconciled");
          }
        }
      }
    }

    const findClosestInGroup = (el: Element, selector: string): Element | null => {
      let curr: Element | null = el.parentElement || null;
      while (curr && curr !== groupRowEl) {
        if (matchesSelector(curr, selector)) return curr;
        curr = curr.parentElement || null;
      }
      return null;
    };

    // 3-Part Frame Sequence: Frame = (OpenFence, Children..., CloseFence)
    const groupMos = Array.from(groupRowEl.querySelectorAll("mjx-mo")).filter((el) => {
      if (el.classList.contains("cm-tensor-reconciled")) return false;
      if (isElementInSlotScope(el, groupRowEl)) return true;
      const scriptAncestor = findClosestInGroup(el, "mjx-msubsup, mjx-msub, mjx-msup, mjx-munderover, mjx-munder, mjx-mover");
      if (scriptAncestor && isScriptInSlotScope(scriptAncestor, groupRowEl)) {
        const baseEl = findDirectScriptBase(scriptAncestor);
        if (
          baseEl &&
          elementContains(baseEl, el) &&
          !findClosestInGroup(el, "mjx-script, mjx-under, mjx-over")
        ) {
          return true;
        }
      }
      return false;
    });

    const isDelimiterTextMatch = (moEl: Element, rawDelimText?: string): boolean => {
      if (!rawDelimText) return true;
      const domText = getElementText(moEl);
      if (!domText) return true; // allow synthetic test mocks with empty textContent
      const cleanTarget = rawDelimText.replace(/^\\(?:left|right|middle)\b/, "").trim();
      if (!cleanTarget || cleanTarget === ".") return true;
      if (domText === cleanTarget) return true;
      if ((cleanTarget === "\\{" || cleanTarget === "\\lbrace") && domText === "{") return true;
      if ((cleanTarget === "\\}" || cleanTarget === "\\rbrace") && domText === "}") return true;
      if (cleanTarget === "\\lbrack" && domText === "[") return true;
      if (cleanTarget === "\\rbrack" && domText === "]") return true;
      if (cleanTarget === "\\langle" && (domText === "⟨" || domText === "<")) return true;
      if (cleanTarget === "\\rangle" && (domText === "⟩" || domText === ">")) return true;
      if ((cleanTarget === "|" || cleanTarget === "\\vert") && (domText === "|" || domText === "∣")) return true;
      if ((cleanTarget === "\\|" || cleanTarget === "\\Vert") && (domText === "‖" || domText === "∥" || domText === "||")) return true;
      const cat = lookupCatalog(cleanTarget);
      if (cat && (domText === cat.expectedText || domText === cat.unicode)) return true;
      return false;
    };

    let openMo: Element | null = null;
    let closeMo: Element | null = null;

    if (hasVisibleOpen && groupMos.length > 0) {
      const openSpan = { start: node.openStart, end: node.openEnd };
      const openRange: QuaternionResolvedRange = {
        start: node.openStart,
        end: node.openEnd,
        kind: "leaf",
        coord: { w: 1, z, y: parentY, x: parentX },
        scales: {
          glyph: openSpan,
          atom: openSpan,
          slot: groupSpan,
          molecule: groupSpan,
          enclosure: context.enclosure,
        },
      };
      // Feedback retry across groupMos candidates until one passes both delimiter text and the Final Stamp Gate
      for (const candMo of groupMos) {
        if (!isDelimiterTextMatch(candMo, node.openText)) continue;
        if (stampQuaternionElement(candMo, openRange)) {
          openMo = candMo;
          openMo.classList.add("cm-tensor-reconciled");
          if (
            openMo.parentElement &&
            matchesSelector(openMo.parentElement, "mjx-mrow") &&
            openMo.parentElement !== groupRowEl &&
            openMo.parentElement.querySelectorAll("mjx-mo").length === 1 &&
            openMo.parentElement.querySelectorAll("mjx-mi, mjx-mn, mjx-mtext, mjx-mfrac, mjx-frac").length === 0
          ) {
            if (stampQuaternionElement(openMo.parentElement, openRange)) {
              openMo.parentElement.classList.add("cm-tensor-reconciled");
            }
          }
          stampChildGlyphs(openMo, openRange);
          break;
        }
      }
    }
    if (hasVisibleClose && openMo) {
      closeMo = this.findMatchingCloseMo(groupMos, openMo, node.delimType, node.closeText);
    }
    if (hasVisibleClose && !closeMo && groupRowEl !== parentEl && groupMos.length > (hasVisibleOpen ? 1 : 0)) {
      // In a dedicated mrow container, fallback to the last operator in that container only if its Unicode matches closeText
      const lastMo = groupMos[groupMos.length - 1];
      if (isDelimiterTextMatch(lastMo, node.closeText)) {
        closeMo = lastMo;
      }
    }

    if (closeMo) {
      const scriptAnc = findClosestInGroup(closeMo, "mjx-msubsup, mjx-msub, mjx-msup, mjx-munderover, mjx-munder, mjx-mover");
      if (scriptAnc && isScriptInSlotScope(scriptAnc, groupRowEl)) {
        if (allLimits.length > 0 && !limitScriptContainer) {
          limitScriptContainer = scriptAnc;
        }
        const baseEl = findDirectScriptBase(scriptAnc);
        if (baseEl && matchesSelector(baseEl, "mjx-base")) {
          baseEl.classList.add("cm-tensor-reconciled");
        }
      }
    }

    const childExcludeSet = new Set<Element>();
    if (closeMo) {
      childExcludeSet.add(closeMo);
    }

    const groupInnerZ = hasVisibleOpen || hasVisibleClose ? this.allocatePlaneZ() : z;

    // Reconcile group children inside slot with closeMo protected in childExcludeSet
    this.reconcileSlot(groupRowEl, node.children, groupInnerZ, 0, groupContext, 1, childExcludeSet);

    // Reconcile closing delimiter strictly within group row (with candidate retry if first candidate fails Final Gate)
    if (hasVisibleClose) {
      const closeCandidates: Array<{ mo: Element; wrapper: Element | null; scriptAnc: Element | null }> = [];
      if (closeMo) {
        closeCandidates.push({ mo: closeMo, wrapper: null, scriptAnc: null });
      }
      const nextAfterChildren = getNextSlotItem(groupRowEl);
      if (nextAfterChildren) {
        if (matchesSelector(nextAfterChildren, "mjx-mo") && isDelimiterTextMatch(nextAfterChildren, node.closeText)) {
          closeCandidates.push({ mo: nextAfterChildren, wrapper: null, scriptAnc: null });
        } else if (matchesSelector(nextAfterChildren, "mjx-msubsup, mjx-msub, mjx-msup, mjx-munderover, mjx-munder, mjx-mover")) {
          const rawB = findDirectScriptBase(nextAfterChildren);
          const bEl = rawB && matchesSelector(rawB, "mjx-base") && rawB.firstElementChild ? rawB.firstElementChild : rawB;
          const innerMo = bEl && matchesSelector(bEl, "mjx-mo") ? bEl : bEl?.querySelector("mjx-mo") || null;
          if (innerMo && !innerMo.classList.contains("cm-tensor-reconciled") && isDelimiterTextMatch(innerMo, node.closeText)) {
            closeCandidates.push({ mo: innerMo, wrapper: rawB, scriptAnc: nextAfterChildren });
          }
        }
      }
      const remainingMos = Array.from(groupRowEl.querySelectorAll("mjx-mo")).filter(
        (el) =>
          !el.classList.contains("cm-tensor-reconciled") &&
          isElementInSlotScope(el, groupRowEl) &&
          isDelimiterTextMatch(el, node.closeText)
      );
      for (const remMo of remainingMos) {
        if (!closeCandidates.some((c) => c.mo === remMo)) {
          closeCandidates.push({ mo: remMo, wrapper: null, scriptAnc: null });
        }
      }

      const closeSpan = { start: node.closeStart!, end: node.closeEnd! };
      const closeRange: QuaternionResolvedRange = {
        start: node.closeStart!,
        end: node.closeEnd!,
        kind: "leaf",
        coord: { w: 1, z, y: parentY, x: parentX },
        scales: {
          glyph: closeSpan,
          atom: closeSpan,
          slot: groupSpan,
          molecule: groupSpan,
          enclosure: context.enclosure,
        },
      };

      for (const cand of closeCandidates) {
        const closeMoEl = cand.mo;
        if (stampQuaternionElement(closeMoEl, closeRange)) {
          closeMoEl.classList.add("cm-tensor-reconciled");
          if (cand.wrapper) {
            cand.wrapper.classList.add("cm-tensor-reconciled");
            if (cand.wrapper !== closeMoEl) {
              stampQuaternionElement(cand.wrapper, closeRange);
            }
          }
          if (cand.scriptAnc && !limitScriptContainer) {
            limitScriptContainer = cand.scriptAnc;
          }
          if (
            closeMoEl.parentElement &&
            matchesSelector(closeMoEl.parentElement, "mjx-mrow") &&
            closeMoEl.parentElement !== groupRowEl &&
            closeMoEl.parentElement.querySelectorAll("mjx-mo").length === 1 &&
            closeMoEl.parentElement.querySelectorAll("mjx-mi, mjx-mn, mjx-mtext, mjx-mfrac, mjx-frac").length === 0
          ) {
            if (stampQuaternionElement(closeMoEl.parentElement, closeRange)) {
              closeMoEl.parentElement.classList.add("cm-tensor-reconciled");
            }
          }
          stampChildGlyphs(closeMoEl, closeRange);
          break;
        }
      }
    }

    // Reconcile any attached norm or evaluation limits (e.g. \| x \|_2^2, |x|_p, or [F(x)]_a^b)
    if (allLimits.length > 0) {
      const targetScriptParent = limitScriptContainer || parentEl;
      for (const scriptNode of allLimits) {
        this.reconcileScript(targetScriptParent, scriptNode, z, parentY, parentX, context);
      }
    }
  }

  /**
   * Reconciles Matrix rows (<mjx-mtr>, <mjx-mlabeledtr>) and cells (<mjx-mtd>) with exact 2D (row, col) coordinates.
   * Performs Row-First 2D Alignment so consecutive row breaks (`\\ \\` empty spacer rows) never shift subsequent rows' columns.
   */
  private reconcileMatrix(
    tableEl: Element,
    groupNode: GroupNode,
    matZ: number,
    context: MultiScaleContext
  ): void {
    const allMtdEls = Array.from(tableEl.querySelectorAll("mjx-mtd, mjx-linebox")).filter((el) => {
      let curr = el.parentElement;
      while (curr && curr !== tableEl) {
        if (matchesSelector(curr, "mjx-mtable, mjx-linestack")) return false;
        curr = curr.parentElement;
      }
      return curr === tableEl;
    });

    for (const mtd of allMtdEls) {
      mtd.classList.add("color-math-cell-target", "cm-tensor-reconciled");
    }

    type MatrixCellSpec = { start: number; end: number; row: number; col: number; nodes: CSTNode[] };
    type MatrixRowSpec = { row: number; cells: MatrixCellSpec[]; hasContent: boolean };

    const cstRows: MatrixRowSpec[] = [];
    let currentRowCells: MatrixCellSpec[] = [];
    let currentCell: CSTNode[] = [];
    let currentRow = 0;
    let currentCol = 0;

    const flushCell = () => {
      if (currentCell.length > 0) {
        const lastNode = currentCell[currentCell.length - 1] as any;
        let maxEnd = lastNode.end;
        if (Array.isArray(lastNode.evaluationLimits)) {
          for (const lim of lastNode.evaluationLimits) {
            if (lim.end > maxEnd) maxEnd = lim.end;
          }
        }
        if (Array.isArray(lastNode.normLimits)) {
          for (const lim of lastNode.normLimits) {
            if (lim.end > maxEnd) maxEnd = lim.end;
          }
        }
        currentRowCells.push({
          start: currentCell[0].start,
          end: maxEnd,
          row: currentRow,
          col: currentCol,
          nodes: [...currentCell],
        });
        currentCell = [];
      } else {
        currentRowCells.push({
          start: groupNode.start,
          end: groupNode.start,
          row: currentRow,
          col: currentCol,
          nodes: [],
        });
      }
    };

    const flushRow = () => {
      flushCell();
      const hasContent = currentRowCells.some((c) => c.nodes.length > 0);
      cstRows.push({
        row: currentRow,
        cells: currentRowCells,
        hasContent,
      });
      currentRowCells = [];
      currentRow++;
      currentCol = 0;
    };

    for (const child of groupNode.children) {
      const isAmpersand =
        (child.kind === "punctuation" && child.char === "&") ||
        (child.kind === "identifier" && child.text === "&") ||
        (child.kind === "operator" && child.text === "&");
      const isRowBreak =
        child.kind === "command" &&
        (child.name === "\\\\" || child.name === "\\cr" || child.name === "\\newline");

      if (isAmpersand) {
        flushCell();
        currentCol++;
      } else if (isRowBreak) {
        flushRow();
      } else {
        currentCell.push(child);
      }
    }
    if (currentCell.length > 0 || currentRowCells.length > 0 || cstRows.length === 0) {
      flushRow();
    }

    // Collect direct <mjx-mtr> / <mjx-mlabeledtr> / <mjx-linebox> rows belonging to this tableEl (not nested tables)
    const mtrEls = Array.from(tableEl.querySelectorAll("mjx-mtr, mjx-mlabeledtr, mjx-linebox")).filter((el) => {
      let curr = el.parentElement;
      while (curr && curr !== tableEl) {
        if (matchesSelector(curr, "mjx-mtable, mjx-linestack")) return false;
        curr = curr.parentElement;
      }
      return curr === tableEl;
    });

    const reconcilePairedCell = (mtd: Element, cell: MatrixCellSpec) => {
      if (cell.nodes.length === 0) return;

      const cellBaseX = cell.col * 16;
      const cellCoord: SpatialCoordinate4D = { w: 2, z: matZ, y: -cell.row, x: cellBaseX };
      const cellSpan = { start: cell.start, end: cell.end };
      const cellContext: MultiScaleContext = {
        slot: cellSpan,
        molecule: context.molecule,
        enclosure: context.enclosure,
      };

      stampQuaternionElement(mtd, {
        start: cell.start,
        end: cell.end,
        kind: "matrix_cell",
        coord: cellCoord,
        scales: {
          glyph: cellSpan,
          atom: cellSpan,
          slot: cellSpan,
          molecule: context.molecule,
          enclosure: context.enclosure,
        },
      });

      this.reconcileSlot(mtd, cell.nodes, matZ, -cell.row, cellContext, cellBaseX);
    };

    if (mtrEls.length > 0) {
      const getDirectRowMtds = (mtr: Element): Element[] => {
        if (matchesSelector(mtr, "mjx-linebox")) {
          return [mtr];
        }
        return Array.from(mtr.querySelectorAll("mjx-mtd")).filter((el) => {
          let curr = el.parentElement;
          while (curr && curr !== mtr) {
            if (matchesSelector(curr, "mjx-mtr, mjx-mlabeledtr, mjx-mtable, mjx-linestack, mjx-linebox")) return false;
            curr = curr.parentElement;
          }
          return curr === mtr;
        });
      };

      const isDomRowNonEmpty = (mtr: Element): boolean => {
        const rowMtds = getDirectRowMtds(mtr);
        return rowMtds.some((mtd) => getElementText(mtd).length > 0 || mtd.querySelector("mjx-frac, mjx-mfrac, mjx-sqrt, mjx-mroot, mjx-mspace, mjx-mtable") !== null);
      };

      const nonEmptyCstRows = cstRows.filter((r) => r.hasContent);
      const nonEmptyMtrEls = mtrEls.filter(isDomRowNonEmpty);

      const isCellEmpty = (mtd: Element): boolean =>
        getElementText(mtd).trim() === "" &&
        mtd.querySelector("mjx-c, mjx-frac, mjx-mfrac, mjx-sqrt, mjx-mroot, mjx-mspace, mjx-mtable") === null;

      const pairRowCells = (rowMtds: Element[], cstCells: MatrixCellSpec[]): void => {
        // If DOM has extra perimeter padding cells (e.g. leading & or trailing &) while CST cells have content
        if (rowMtds.length > cstCells.length && cstCells.every((c) => c.nodes.length > 0)) {
          const contentMtds = rowMtds.filter((mtd) => !isCellEmpty(mtd));
          if (contentMtds.length === cstCells.length) {
            for (let c = 0; c < contentMtds.length; c++) {
              reconcilePairedCell(contentMtds[c], cstCells[c]);
            }
            for (const mtd of rowMtds) {
              if (isCellEmpty(mtd)) {
                mtd.classList.add("cm-tensor-reconciled", "color-math-cell-padding");
              }
            }
            return;
          }
        }

        const colCount = Math.min(rowMtds.length, cstCells.length);
        for (let c = 0; c < colCount; c++) {
          reconcilePairedCell(rowMtds[c], cstCells[c]);
        }
      };

      // If CST has empty spacer rows (from `\\ \\`) that caused row count mismatch or empty DOM rows,
      // pair non-empty CST rows 1:1 with non-empty DOM rows; otherwise pair row-by-row directly.
      if (
        (mtrEls.length !== cstRows.length || nonEmptyCstRows.length < cstRows.length) &&
        nonEmptyMtrEls.length === nonEmptyCstRows.length
      ) {
        for (let r = 0; r < nonEmptyCstRows.length; r++) {
          const cstRow = nonEmptyCstRows[r];
          const mtr = nonEmptyMtrEls[r];
          const rowMtds = getDirectRowMtds(mtr);
          pairRowCells(rowMtds, cstRow.cells);
        }
        return;
      }

      const rowCount = Math.min(mtrEls.length, cstRows.length);
      for (let r = 0; r < rowCount; r++) {
        const cstRow = cstRows[r];
        const mtr = mtrEls[r];
        const rowMtds = getDirectRowMtds(mtr);
        pairRowCells(rowMtds, cstRow.cells);
      }
      return;
    }

    // Fallback for flat <mjx-mtd> test mocks without <mjx-mtr> wrappers:
    // Filter out empty rows created by `\\ \\` if cell counts disagree
    const flatCells = cstRows.flatMap((r) => r.cells);
    const nonEmptyRowCells = cstRows.filter((r) => r.hasContent).flatMap((r) => r.cells);
    const activeCells =
      flatCells.length !== allMtdEls.length && nonEmptyRowCells.length === allMtdEls.length
        ? nonEmptyRowCells
        : flatCells;

    const count = Math.min(allMtdEls.length, activeCells.length);
    for (let c = 0; c < count; c++) {
      reconcilePairedCell(allMtdEls[c], activeCells[c]);
    }
  }

  /**
   * Computes the expected normalized text of any leaf CSTNode in O(1) time for neighbor verification.
   */
  private getExpectedNodeText(n?: CSTNode): string {
    return getExpectedLeafNodeText(n, this.latex);
  }

  /**
   * Reconciles a discrete leaf token (<mjx-mi>, <mjx-mn>, <mjx-mo>, <mjx-mtext>) in the current slot
   * using an 8-Point Neighbor-Contextual Constraint Intersection Matcher:
   * Target = argmax_{el} ( TextIdentity ∩ GlyphHex ∩ TagFamily ∩ ScopeSlot ∩ MonotonicSequence ∩ CompoundPartner ∩ NeighborBigram )
   */
  private stampMatchingLeaf(
    slotEl: Element,
    node: CSTNode,
    z: number,
    y: number,
    sequenceX: number,
    slotSpan: { start: number; end: number },
    context: MultiScaleContext,
    excludeSet?: ReadonlySet<Element>
  ): void {
    let expectedTag =
      node.kind === "text"
        ? "MJX-MTEXT"
        : node.kind === "number"
        ? "MJX-MN"
        : node.kind === "operator"
        ? "MJX-MO"
        : node.kind === "punctuation"
        ? "MJX-MO"
        : "MJX-MI";

    let expectedText = "";
    let expectedHex: number | undefined;
    let isFunction = false;
    let rawName = "";
    if (node.kind === "identifier") {
      const idText = node.text || "";
      if (idText.startsWith("\\")) {
        const catEntry = lookupCatalog(idText) || lookupCatalog(idText.slice(1));
        if (catEntry) {
          expectedText = catEntry.expectedText !== undefined ? catEntry.expectedText : (catEntry.unicode || idText.slice(1));
          expectedHex = catEntry.hexCode;
        } else {
          expectedText = idText.slice(1);
        }
      } else {
        expectedText = idText;
      }
    } else if (node.kind === "number") {
      expectedText = node.value || "";
    } else if (node.kind === "operator") {
      const opText = node.text || "";
      if (opText.startsWith("\\")) {
        const catEntry = lookupCatalog(opText) || lookupCatalog(opText.slice(1));
        if (catEntry) {
          expectedText = catEntry.expectedText !== undefined ? catEntry.expectedText : (catEntry.unicode || opText.slice(1));
          expectedHex = catEntry.hexCode;
        } else {
          expectedText = opText.slice(1);
        }
      } else {
        expectedText = normalizeMathOperatorChars(opText);
      }
    } else if (node.kind === "punctuation") {
      expectedText = node.char || "";
    } else if (node.kind === "text") {
      expectedText = (node.text || "").trim();
      expectedTag = "MJX-MTEXT";
    } else if (node.kind === "boundary") {
      expectedText = (node as any).rawText || (this.latex ? this.latex.slice(node.start, node.end) : "");
      expectedTag = "MJX-MO";
    } else if (node.kind === "command") {
      rawName = node.name || "";
      const bareName = rawName.startsWith("\\") ? rawName.slice(1) : rawName;
      const backslashName = rawName.startsWith("\\") ? rawName : "\\" + rawName;
      const catEntry = lookupCatalog(backslashName) || lookupCatalog(bareName);
      if (catEntry) {
        expectedText = catEntry.expectedText !== undefined ? catEntry.expectedText : (catEntry.unicode || bareName);
        expectedHex = catEntry.hexCode;
        isFunction = catEntry.roleId === ROLE_FUNCTION;
        if (
          catEntry.roleId === ROLE_OPERATOR ||
          catEntry.roleId === ROLE_RELATION ||
          catEntry.roleId === ROLE_DOT ||
          catEntry.roleId === ROLE_ARITHMETIC ||
          catEntry.roleId === ROLE_ARROW ||
          catEntry.roleId === ROLE_DELIMITER
        ) {
          expectedTag = "MJX-MO";
        } else if (catEntry.roleId === ROLE_SPACING || SPACING_COMMANDS.has(rawName)) {
          expectedTag = "MJX-MSPACE";
        } else {
          expectedTag = "MJX-MI";
        }
      } else {
        if (SPACING_COMMANDS.has(rawName)) {
          expectedTag = "MJX-MSPACE";
          expectedText = "";
        } else {
          expectedText = bareName;
        }
      }
    }

    const glyphSpan = { start: node.start, end: node.end };
    const atomSpan =
      node.compoundRole === "diff_op" && node.compoundPartner
        ? { start: node.start, end: node.compoundPartner.end }
        : node.compoundRole === "diff_var" && node.compoundPartner
        ? { start: node.compoundPartner.start, end: node.end }
        : glyphSpan;

    const range: QuaternionResolvedRange = {
      start: node.start,
      end: node.end,
      kind: node.kind === "text" ? "text" : "leaf",
      coord: { w: 1, z, y, x: sequenceX },
      scales: {
        glyph: glyphSpan,
        atom: atomSpan,
        slot: slotSpan,
        molecule: context.molecule,
        enclosure: context.enclosure,
      },
    };

    // Check if this leaf is a fused macro (e.g. \vec{V}, \overrightarrow{OP}, \hat{x}, \mathbb{R})
    const rawSlice = this.latex ? this.latex.slice(node.start, node.end).trim() : "";
    let innerMacroText = "";
    const fusedMacroMatch = expectedText.match(/^(\\[a-zA-Z]+)\{([\s\S]*)\}$/);
    if (fusedMacroMatch) {
      const macroCmd = fusedMacroMatch[1];
      innerMacroText = fusedMacroMatch[2].trim();
      const catEntry = lookupCatalog(macroCmd);
      const childTag = getExpectedChildTag(catEntry, 0);
      if (childTag === TAG_OVER || childTag === TAG_UNDER) {
        const nextItem = getNextSlotItem(slotEl);
        const targetTag = childTag === TAG_OVER ? "mjx-mover" : "mjx-munder";
        const accentCand =
          nextItem && matchesSelector(nextItem, targetTag)
            ? nextItem
            : null;
        if (accentCand) {
          accentCand.classList.add("cm-tensor-reconciled");
          this.reconciledNodes.add(node);
          stampQuaternionElement(accentCand, range);
          const descEls = Array.from(
            accentCand.querySelectorAll("mjx-mi, mjx-mn, mjx-mo, mjx-mtext, mjx-over, mjx-under, mjx-base, mjx-box, mjx-stretchy-h, mjx-stretchy-v")
          );
          for (const dEl of descEls) {
            dEl.classList.add("cm-tensor-reconciled");
            stampQuaternionElement(dEl, range);
          }
          stampChildGlyphs(accentCand, range);
          return;
        }
      }
    }

    const candidateEls = Array.from(
      slotEl.querySelectorAll("mjx-mi, mjx-mn, mjx-mo, mjx-mtext, mjx-mspace")
    ).filter(
      (el) => !el.classList.contains("cm-tensor-reconciled") && isElementInSlotScope(el, slotEl) && (!excludeSet || !excludeSet.has(el))
    );

    if (candidateEls.length === 0) return;

    // Ordered visible leaves in this slot (including already-reconciled left neighbors) for O(1) neighbor verification
    const allSlotLeaves = Array.from(
      slotEl.querySelectorAll("mjx-mi, mjx-mn, mjx-mo, mjx-mtext")
    ).filter((el) => isElementInSlotScope(el, slotEl) && (!excludeSet || !excludeSet.has(el)));

    const partnerExpectedText = node.compoundPartner ? this.getExpectedNodeText(node.compoundPartner) : "";
    const prevExpectedText = node.prevLeaf ? this.getExpectedNodeText(node.prevLeaf) : "";
    const nextExpectedText = node.nextLeaf ? this.getExpectedNodeText(node.nextLeaf) : "";

    const scoredCandidates: Array<{ el: Element; score: number }> = [];

    for (let idx = 0; idx < candidateEls.length; idx++) {
      const cand = candidateEls[idx];
      let score = 0;

      const candTag = cand.tagName.toUpperCase();
      const rawText = String(cand.textContent || "");
      const normText = normalizeMathOperatorChars(
        typeof rawText.normalize === "function" ? rawText.normalize("NFKD").trim() : rawText.trim()
      );

      // Decode all <mjx-c class="mjx-cHEX"> children (supports multi-character tokens like \cos, \sin, 12)
      const glyphEls = Array.from(cand.querySelectorAll("mjx-c"));
      let elHexCode = 0;
      let glyphChar = "";
      if (glyphEls.length > 0) {
        let decoded = "";
        for (let gIdx = 0; gIdx < glyphEls.length; gIdx++) {
          const gEl = glyphEls[gIdx];
          if (gEl && gEl.className) {
            const hexMatch = gEl.className.match(/mjx-c([0-9A-Fa-f]+)/);
            if (hexMatch) {
              try {
                const cp = parseInt(hexMatch[1], 16);
                if (gIdx === 0) elHexCode = cp;
                decoded += String.fromCodePoint(cp);
              } catch {
                // Ignore malformed hex codepoints
              }
            }
          }
        }
        if (decoded.length > 0) {
          glyphChar = normalizeMathOperatorChars(
            typeof decoded.normalize === "function" ? decoded.normalize("NFKD").trim() : decoded.trim()
          );
        }
      }

      const effectiveText = normText || glyphChar;

      // Fast O(1) Glyph Confirmation (for single-glyph symbols)
      if (expectedHex !== undefined && elHexCode !== 0 && glyphEls.length <= 1 && elHexCode === expectedHex) {
        score += 30;
      }

      // Fast Function Matching (e.g. sin, cos, ln)
      if (isFunction && (cand.classList.contains("mjx-n") || candTag === "MJX-MI")) {
        if (effectiveText === expectedText || rawText === expectedText) {
          score += 30;
        }
      }

      // 1. Text & Glyph Identity Matching
      if (expectedTag === "MJX-MSPACE" && candTag === "MJX-MSPACE") {
        score += 35;
      } else if (rawSlice && (rawText === rawSlice || effectiveText === rawSlice)) {
        score += 25;
      } else if (expectedText || rawName) {
        if (
          (expectedText && (normText === expectedText || glyphChar === expectedText)) ||
          (innerMacroText && (normText === innerMacroText || glyphChar === innerMacroText || rawText === innerMacroText)) ||
          (rawName && (rawText === rawName || effectiveText === rawName)) ||
          (expectedText && (rawText === "\\" + expectedText || effectiveText === "\\" + expectedText)) ||
          (expectedText && (rawText === "\\middle" + expectedText || effectiveText === "\\middle" + expectedText))
        ) {
          score += 20;
        } else if (rawText === expectedText) {
          score += 15;
        } else if (
          (expectedText && effectiveText.toLowerCase() === expectedText.toLowerCase()) ||
          (innerMacroText && effectiveText.toLowerCase() === innerMacroText.toLowerCase())
        ) {
          score += 10;
        }
      }

      // 2. Tag Family Identity Matching
      if (candTag === expectedTag) {
        score += 8;
      } else if (
        (expectedTag === "MJX-MI" && candTag === "MJX-MO") ||
        (expectedTag === "MJX-MO" && candTag === "MJX-MI")
      ) {
        score += 2;
      }

      // 3. Monotonic Left-to-Right Sequence Preference
      score += (candidateEls.length - idx) / candidateEls.length;

      // 4. MPHF-Style Anti-Corruption Gate: Contradictory text penalty
      // Works in both textContent DOMs and live MathJax 4 CHTML (<mjx-c> glyphChar DOMs)
      const isTextMatch =
        (expectedText && (normText === expectedText || glyphChar === expectedText || rawText === expectedText)) ||
        (innerMacroText && (normText === innerMacroText || glyphChar === innerMacroText || rawText === innerMacroText)) ||
        (rawName && (rawText === rawName || effectiveText === rawName)) ||
        (expectedText && (rawText === "\\" + expectedText || effectiveText === "\\" + expectedText)) ||
        (rawSlice && (rawText === rawSlice || effectiveText === rawSlice));

      if (effectiveText.length > 0 && (expectedText.length > 0 || rawName.length > 0) && !isTextMatch) {
        score -= 50;
      }

      // 5 & 6. Compound Differential Partner & Syntactic Neighbor Bigram Verification
      if (isTextMatch && allSlotLeaves.length > 1) {
        const slotIdx = allSlotLeaves.indexOf(cand);
        if (slotIdx >= 0) {
          const prevDomEl = slotIdx > 0 ? allSlotLeaves[slotIdx - 1] : null;
          const nextDomEl = slotIdx + 1 < allSlotLeaves.length ? allSlotLeaves[slotIdx + 1] : null;
          const prevDomText = prevDomEl ? getElementText(prevDomEl) : "";
          const nextDomText = nextDomEl ? getElementText(nextDomEl) : "";

          if (node.compoundRole === "diff_op" && partnerExpectedText) {
            if (nextDomText === partnerExpectedText) {
              score += 35;
            } else if (nextDomText.length > 0) {
              score -= 25;
            }
          } else if (node.compoundRole === "diff_var" && partnerExpectedText) {
            const prevRange = prevDomEl ? getMathJaxElementRange(prevDomEl) : undefined;
            if (
              (prevRange && node.compoundPartner && prevRange.start === node.compoundPartner.start) ||
              prevDomText === partnerExpectedText
            ) {
              score += 35;
            } else if (prevDomText.length > 0) {
              score -= 25;
            }
          }

          if (prevExpectedText && prevDomText === prevExpectedText) {
            score += 12;
          }
          if (nextExpectedText && nextDomText === nextExpectedText) {
            score += 12;
          }
        }
      }

      if (score > 0) {
        scoredCandidates.push({ el: cand, score });
      }
    }

    if (scoredCandidates.length === 0) {
      return;
    }

    // Sort candidates by score descending and retry across candidates until one passes the Final Stamp Gate
    scoredCandidates.sort((a, b) => b.score - a.score);
    for (const { el } of scoredCandidates) {
      if (stampQuaternionElement(el, range)) {
        el.classList.add("cm-tensor-reconciled");
        this.reconciledNodes.add(node);
        stampChildGlyphs(el, range);
        return;
      }
    }
  }
}

/**
 * Public Reconciler API: Synchronously executes 3D/4D Spatial Quaternion reconciliation on a container.
 * Returns the set of CSTNodes consumed and bound by Engine A so Engine B (fallback stamper) never re-consumes them.
 */
export function reconcileQuaternionSpatial(container: Element, ast: CSTNode[], latex: string): Set<CSTNode> {
  const reconciler = new QuaternionSpatialReconciler(latex);
  reconciler.reconcile(container, ast);
  return reconciler.reconciledNodes;
}

// Backwards-compatible alias for existing callers
export const reconcileSpatialTensor = reconcileQuaternionSpatial;
export const SpatialTensorReconciler = QuaternionSpatialReconciler;

/**
 * Pure-CST 3D Spatial Quaternion Extractor:
 * Computes exact 3D coordinates (Z, Y, X) and enclosing interval hierarchies directly from the CST AST
 * when the MathJax `<mjx-container>` DOM widget is unmounted (e.g. inline `$ ... $` editing or Source Mode).
 */
export function extractCSTQuaternionTokens(
  ast: CSTNode[],
  latexLength: number
): QuaternionResolvedRange[] {
  const results: QuaternionResolvedRange[] = [];
  if (!ast || ast.length === 0) return results;

  const formulaSpan = { start: 0, end: latexLength };
  let moleculeCounter = 0;
  const basePlaneMap = new Map<CSTNode, number>();

  const allocatePlaneZ = (anchorBase?: CSTNode): number => {
    if (anchorBase) {
      const existing = basePlaneMap.get(anchorBase);
      if (existing !== undefined) return existing;
      const nextZ = ++moleculeCounter;
      basePlaneMap.set(anchorBase, nextZ);
      return nextZ;
    }
    return ++moleculeCounter;
  };

  function walkSlot(
    nodes: CSTNode[],
    z: number,
    y: number,
    context: MultiScaleContext,
    initialX: number = 0
  ): void {
    if (!nodes || nodes.length === 0) return;
    const slotSpan = getNodeListSpan(nodes) || context.slot;
    const slotContext: MultiScaleContext = {
      slot: slotSpan,
      molecule: context.molecule,
      enclosure: context.enclosure,
    };

    const hasMatrixDelims = nodes.some(
      (c) =>
        (c.kind === "punctuation" && (c as any).char === "&") ||
        (c.kind === "identifier" && (c as any).text === "&") ||
        (c.kind === "operator" && (c as any).text === "&") ||
        (c.kind === "command" && (c.name === "\\\\" || c.name === "\\cr" || c.name === "\\newline"))
    );

    const activeZ = hasMatrixDelims && z === 0 ? allocatePlaneZ() : z;
    let activeY = y;
    let currentRow = 0;
    let currentCol = 0;
    let sequenceX = initialX;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      switch (node.kind) {
        case "fraction": {
          const fracZ = allocatePlaneZ();
          const moleculeSpan = { start: node.start, end: node.end };
          if (node.numerator.length > 0) {
            const numSpan = getNodeListSpan(node.numerator) || moleculeSpan;
            walkSlot(node.numerator, fracZ, 1, {
              slot: numSpan,
              molecule: moleculeSpan,
              enclosure: context.enclosure,
            }, 0);
          }
          if (node.denominator.length > 0) {
            const denSpan = getNodeListSpan(node.denominator) || moleculeSpan;
            walkSlot(node.denominator, fracZ, -1, {
              slot: denSpan,
              molecule: moleculeSpan,
              enclosure: context.enclosure,
            }, 0);
          }
          sequenceX++;
          break;
        }

        case "underover": {
          const uoZ = allocatePlaneZ();
          const moleculeSpan = { start: node.start, end: node.end };
          const scriptRoleY = node.targetRole === "underscript" ? -1 : 1;
          if (node.base.length > 0) {
            const baseSpan = getNodeListSpan(node.base) || { start: node.baseStart, end: node.baseEnd };
            walkSlot(node.base, uoZ, 0, {
              slot: baseSpan,
              molecule: moleculeSpan,
              enclosure: context.enclosure,
            }, 0);
          }
          if (node.script && node.script.length > 0) {
            const scriptSpan = getNodeListSpan(node.script) || moleculeSpan;
            walkSlot(node.script, uoZ, scriptRoleY, {
              slot: scriptSpan,
              molecule: moleculeSpan,
              enclosure: context.enclosure,
            }, 0);
          }
          sequenceX++;
          break;
        }

        case "script": {
          let anchorBase = node.base;
          while (anchorBase && "base" in anchorBase && anchorBase.base) {
            anchorBase = anchorBase.base as CSTNode;
          }
          const scriptZ = allocatePlaneZ(anchorBase);
          const scriptStart = anchorBase ? anchorBase.start : (node.base ? node.base.start : node.start);
          const atomSpan = { start: scriptStart, end: node.end };

          if (anchorBase && !results.some((r) => r.start === anchorBase.start && r.end === anchorBase.end)) {
            if (anchorBase.kind === "group") {
              walkSlot(anchorBase.children, activeZ, activeY, slotContext, sequenceX);
            } else {
              const baseSpan = { start: anchorBase.start, end: anchorBase.end };
              results.push({
                start: anchorBase.start,
                end: anchorBase.end,
                kind: "leaf",
                coord: { w: 1, z: activeZ, y: activeY, x: sequenceX },
                scales: {
                  glyph: baseSpan,
                  atom: atomSpan,
                  slot: slotSpan,
                  molecule: context.molecule,
                  enclosure: context.enclosure,
                },
              });
            }
          }

          const slotRoleY = node.scriptType === "superscript" ? 1 : -1;
          const argSpan = getNodeListSpan(node.arg) || atomSpan;
          walkSlot(node.arg, scriptZ, slotRoleY, {
            slot: argSpan,
            molecule: context.molecule,
            enclosure: context.enclosure,
          }, 0);
          sequenceX++;
          break;
        }

        case "group": {
          if (i + 1 < nodes.length && nodes[i + 1].kind === "script" && (nodes[i + 1] as ScriptNode).base === node) {
            break;
          }
          const isMatrix =
            node.delimType === "matrix" ||
            node.children.some(
              (c) =>
                (c.kind === "punctuation" && (c as any).char === "&") ||
                (c.kind === "identifier" && (c as any).text === "&") ||
                (c.kind === "operator" && (c as any).text === "&") ||
                (c.kind === "command" && (c.name === "\\\\" || c.name === "\\cr" || c.name === "\\newline"))
            );
          const groupSpan = { start: node.start, end: node.end };
          if (isMatrix) {
            const matZ = allocatePlaneZ();
            walkSlot(node.children, matZ, 0, {
              slot: groupSpan,
              molecule: groupSpan,
              enclosure: context.enclosure,
            }, 0);
          } else {
            const groupZ = node.delimType !== "bare_brace" ? allocatePlaneZ() : activeZ;
            walkSlot(node.children, groupZ, 0, {
              slot: groupSpan,
              molecule: groupSpan,
              enclosure: context.enclosure,
            }, 0);
          }
          sequenceX++;
          break;
        }

        case "command": {
          if (node.name === "\\sqrt") {
            const rootZ = allocatePlaneZ();
            let j = i + 1;
            let consumed = 0;
            let degNodes: CSTNode[] = [];
            let radNodes: CSTNode[] = [];
            let end = node.end;
            if (j < nodes.length && nodes[j].kind === "group" && (nodes[j] as GroupNode).delimType === "bracket") {
              degNodes = (nodes[j] as GroupNode).children;
              end = nodes[j].end;
              j++;
              consumed++;
            }
            if (j < nodes.length && nodes[j].kind === "group") {
              radNodes = (nodes[j] as GroupNode).children;
              end = nodes[j].end;
              consumed++;
            } else if (j < nodes.length) {
              radNodes = [nodes[j]];
              end = nodes[j].end;
              consumed++;
            }
            const molSpan = { start: node.start, end };
            if (degNodes.length > 0) {
              const degSpan = getNodeListSpan(degNodes) || molSpan;
              walkSlot(degNodes, rootZ, 1, { slot: degSpan, molecule: molSpan, enclosure: context.enclosure }, 0);
            }
            if (radNodes.length > 0) {
              const radSpan = getNodeListSpan(radNodes) || molSpan;
              walkSlot(radNodes, rootZ, 0, { slot: radSpan, molecule: molSpan, enclosure: context.enclosure }, 0);
            }
            i += consumed;
            sequenceX++;
            break;
          }
          if (
            hasMatrixDelims &&
            (node.name === "\\\\" || node.name === "\\" || node.name === "\\cr" || node.name === "\\newline")
          ) {
            currentRow++;
            currentCol = 0;
            activeY = -currentRow;
            sequenceX = 0;
            break;
          }
          if (SPACING_COMMANDS.has(node.name)) {
            break;
          }
          if (i + 1 < nodes.length && nodes[i + 1].kind === "script" && (nodes[i + 1] as ScriptNode).base === node) {
            break;
          }
          const span = { start: node.start, end: node.end };
          results.push({
            start: node.start,
            end: node.end,
            kind: "leaf",
            coord: { w: 1, z: activeZ, y: activeY, x: sequenceX },
            scales: {
              glyph: span,
              atom: span,
              slot: slotSpan,
              molecule: context.molecule,
              enclosure: context.enclosure,
            },
          });
          sequenceX++;
          break;
        }

        case "text":
        case "identifier":
        case "number":
        case "operator":
        case "punctuation":
        case "boundary": {
          if (
            (node.kind === "punctuation" && (node as any).char === "&") ||
            (node.kind === "identifier" && (node as any).text === "&") ||
            (node.kind === "operator" && (node as any).text === "&")
          ) {
            currentCol++;
            sequenceX = currentCol * 16;
            break;
          }
          if (i + 1 < nodes.length && nodes[i + 1].kind === "script" && (nodes[i + 1] as ScriptNode).base === node) {
            break;
          }
          const span = { start: node.start, end: node.end };
          results.push({
            start: node.start,
            end: node.end,
            kind: node.kind === "text" ? "text" : "leaf",
            coord: { w: 1, z: activeZ, y: activeY, x: sequenceX },
            scales: {
              glyph: span,
              atom: span,
              slot: slotSpan,
              molecule: context.molecule,
              enclosure: context.enclosure,
            },
          });
          sequenceX++;
          break;
        }

        default:
          break;
      }
    }
  }

  walkSlot(ast, 0, 0, {
    slot: formulaSpan,
    molecule: formulaSpan,
    enclosure: formulaSpan,
  }, 0);

  return results;
}

// Backwards-compatible alias for existing callers
export const extractCSTTensorTokens = extractCSTQuaternionTokens;
