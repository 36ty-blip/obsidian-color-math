// tests/tri_engine_harness.ts
//! Tri-Engine Navigation Invariant Testing & Grid Disagreement Benchmarking Harness.
//! Operationalizes the Mathematical Invariant Oracle, Tri-Parity Consensus Telemetry,
//! and Bijective Isomorphism assertions across mathematical taxonomies.

import { ResolvedRange } from "../src/editor/lazy_navigation";

export interface FakeElement {
  tagName: string;
  className: string;
  textContent: string;
  classList: {
    add: (cls: string) => void;
    remove: (cls: string) => void;
    contains: (cls: string) => boolean;
  };
  children: FakeElement[];
  parentElement: FakeElement | null;
  firstElementChild: FakeElement | null;
  lastElementChild: FakeElement | null;
  querySelector: (sel: string) => FakeElement | null;
  querySelectorAll: (sel: string) => FakeElement[];
  closest: (sel: string) => FakeElement | null;
  contains: (el: FakeElement) => boolean;
  matches: (sel: string) => boolean;
  cloneNode: (deep?: boolean) => FakeElement;
}

/**
 * Creates a deterministic, memory-efficient fake DOM element mirroring MathJax CHTML layout.
 */
export function createFakeElement(tagName: string, children: FakeElement[] = [], textContent: string = ""): FakeElement {
  const classes = new Set<string>();
  let text = textContent;

  const el: FakeElement = {
    tagName: tagName.toUpperCase(),
    get className() {
      return Array.from(classes).join(" ");
    },
    set className(val: string) {
      classes.clear();
      val.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
    },
    get textContent() {
      if (text) return text;
      return children.map((c) => c.textContent).join("");
    },
    set textContent(val: string) {
      text = val;
    },
    classList: {
      add: (...tokens: string[]) => { for (const t of tokens) classes.add(t); },
      remove: (...tokens: string[]) => { for (const t of tokens) classes.delete(t); },
      contains: (cls: string) => classes.has(cls),
    },
    children: [...children],
    parentElement: null,
    get firstElementChild() {
      return this.children[0] || null;
    },
    get lastElementChild() {
      return this.children.length > 0 ? this.children[this.children.length - 1] : null;
    },
    querySelector: (sel: string) => {
      const results = el.querySelectorAll(sel);
      return results[0] || null;
    },
    querySelectorAll: (sel: string) => {
      const matchTargets = sel.split(/,\s*/).map((s) => s.trim().toUpperCase());
      const matched: FakeElement[] = [];

      function walk(curr: FakeElement) {
        for (const child of curr.children) {
          const tag = child.tagName;
          const isMatched = matchTargets.some((target) => {
            if (target.startsWith(".")) {
              return child.classList.contains(target.slice(1).toLowerCase());
            }
            if (target.includes(":NOT(")) {
              const base = target.replace(/:NOT\(.*\)/, "");
              const notCls = target.match(/:NOT\(\.(.*)\)/)?.[1]?.toLowerCase();
              return (base === "*" || tag === base) && (!notCls || !child.classList.contains(notCls));
            }
            if (target.includes(">")) {
              // Direct child combinator (e.g. :scope > mjx-row > mjx-base)
              const parts = target.replace(":SCOPE > ", "").split(/\s*>\s*/);
              if (parts.length === 1 && tag === parts[0]) return true;
              return false;
            }
            return tag === target || target === "*";
          });

          if (isMatched) {
            matched.push(child);
          }
          walk(child);
        }
      }

      walk(el);
      return matched;
    },
    closest: (sel: string) => {
      const isCmSrc = sel.toLowerCase().includes("cm-src");
      const matchTargets = sel.split(/,\s*/).map((s) => s.trim().toUpperCase());
      let curr: FakeElement | null = el;
      while (curr) {
        if (isCmSrc && curr.className.includes("cm-src-")) {
          return curr;
        }
        const tag = curr.tagName;
        const matches = matchTargets.some((target) => {
          if (target.startsWith(".")) {
            return curr!.classList.contains(target.slice(1).toLowerCase());
          }
          return tag === target;
        });
        if (matches) return curr;
        curr = curr.parentElement;
      }
      return null;
    },
    contains: (other: FakeElement) => {
      let curr: FakeElement | null = other;
      while (curr) {
        if (curr === el) return true;
        curr = curr.parentElement;
      }
      return false;
    },
    matches: (sel: string) => {
      const matchTargets = sel.split(/,\s*/).map((s) => s.trim().toUpperCase());
      return matchTargets.some((target) => {
        if (target.startsWith(".")) {
          return el.classList.contains(target.slice(1).toLowerCase());
        }
        return el.tagName === target;
      });
    },
    cloneNode: (deep: boolean = true) => {
      const clonedChildren = deep ? el.children.map((c) => c.cloneNode(true)) : [];
      const clone = createFakeElement(el.tagName, clonedChildren, text);
      clone.className = el.className;
      return clone;
    },
  };

  for (const child of children) {
    child.parentElement = el;
  }

  function linkParents(parent: FakeElement) {
    for (const child of parent.children) {
      child.parentElement = parent;
      linkParents(child);
    }
  }
  linkParents(el);

  return el;
}

/**
 * Mathematical Invariant Oracle:
 * Validates that extracted source slice strictly matches ground-truth mathematical node text.
 * Zero-tolerance for false positives, empty slices, or unclosed delimiters.
 */
export function assertMathematicalInvariant(
  latex: string,
  range: { start: number; end: number },
  expectedToken: string
): void {
  if (range.start < 0 || range.end > latex.length || range.start >= range.end) {
    throw new Error(
      `Mathematical Invariant Violation: Invalid bounds [${range.start}, ${range.end}] on LaTeX string length ${latex.length}`
    );
  }

  const slice = latex.slice(range.start, range.end).trim();
  if (slice !== expectedToken.trim()) {
    throw new Error(
      `Mathematical Invariant Violation: Sliced text "${slice}" does not strictly match expected ground-truth "${expectedToken.trim()}" at [${range.start}, ${range.end}] in "${latex}"`
    );
  }
}

/**
 * Ground-Truth Semantic Oracle:
 * Prevents Common-Mode Failures where all 3 engines falsely agree on the wrong AST node.
 * Cross-checks the clicked DOM element's semantic identity against the resolved text.
 */
export function assertSemanticOracle(
  clickedDOMNode: FakeElement,
  range: { start: number; end: number },
  latex: string,
  expectedSemanticText: string
): void {
  const actualSlice = latex.slice(range.start, range.end).trim();
  const normalizedExpected = expectedSemanticText.trim();

  if (actualSlice !== normalizedExpected) {
    throw new Error(
      `CRITICAL COMMON-MODE FAILURE: Engine consensus resolved [${range.start}, ${range.end}] -> "${actualSlice}", ` +
      `but user clicked DOM element <${clickedDOMNode.tagName}> with expected content "${normalizedExpected}"!`
    );
  }
}

/**
 * Tri-Engine Telemetry Collector:
 * Tracks consensus rates, disagreement rates, and execution latencies across test passes.
 */
export class GridDisagreementTelemetry {
  public totalElementsTested = 0;
  public triParityConsensusCount = 0;
  public hierarchicalContainmentCount = 0;
  public disagreementCount = 0;
  public semanticOraclePassCount = 0;
  public latenciesM1: number[] = []; // Microseconds
  public latenciesM2: number[] = []; // Nanoseconds
  public latenciesM3: number[] = []; // Microseconds

  public recordMatch(
    m1: { start: number; end: number } | null,
    m2: ResolvedRange | undefined,
    m3: ResolvedRange | null,
    isLeaf: boolean = true
  ): void {
    this.totalElementsTested++;

    if (!m1 || !m2 || !m3) {
      this.disagreementCount++;
      return;
    }

    const exactMatch =
      m1.start === m2.start &&
      m2.start === m3.start &&
      m1.end === m2.end &&
      m2.end === m3.end;

    if (exactMatch) {
      this.triParityConsensusCount++;
    } else if (!isLeaf) {
      // Container level: check hierarchical containment (M1/M2/M3 inside each other)
      const isContained =
        m1.start <= m2.start && m2.end <= m1.end &&
        m1.start <= m3.start && m3.end <= m1.end;
      if (isContained) {
        this.hierarchicalContainmentCount++;
      } else {
        this.disagreementCount++;
      }
    } else {
      this.disagreementCount++;
    }
  }

  public recordOraclePass(): void {
    this.semanticOraclePassCount++;
  }

  public get disagreementRate(): number {
    if (this.totalElementsTested === 0) return 0;
    return (this.disagreementCount / this.totalElementsTested) * 100;
  }

  public get consensusRate(): number {
    if (this.totalElementsTested === 0) return 100;
    return (this.triParityConsensusCount / this.totalElementsTested) * 100;
  }

  public summary(): {
    totalElementsTested: number;
    triParityConsensusCount: number;
    consensusRate: string;
    disagreementCount: number;
    disagreementRate: string;
    oraclePassRate: string;
  } {
    return {
      totalElementsTested: this.totalElementsTested,
      triParityConsensusCount: this.triParityConsensusCount,
      consensusRate: `${this.consensusRate.toFixed(2)}%`,
      disagreementCount: this.disagreementCount,
      disagreementRate: `${this.disagreementRate.toFixed(2)}%`,
      oraclePassRate: `${((this.semanticOraclePassCount / this.totalElementsTested) * 100).toFixed(2)}%`,
    };
  }
}

// ----------------------------------------------------------------------------
// FULL-CORPUS SYNTHETIC CHTML DOM SYNTHESIZER
// ----------------------------------------------------------------------------

import { CSTNode, FractionNode, GroupNode, ScriptNode, UnderOverNode } from "../src/parsers/cst/types";
import { SPACING_COMMANDS, FONT_ACCENT_COMMANDS } from "../src/editor/lazy_navigation";

export interface TargetElement {
  element: FakeElement;
  node: CSTNode;
  expectedText: string;
}

export interface SynthesizedMathJaxDOM {
  root: FakeElement;
  targets: TargetElement[];
}

/**
 * Automatically synthesizes a faithful MathJax CHTML DOM tree (<mjx-container>)
 * from any parsed CST node hierarchy.
 */
export function synthesizeMathJaxDOM(ast: CSTNode[], latex: string): SynthesizedMathJaxDOM {
  const targets: TargetElement[] = [];

  function buildNodeList(nodes: CSTNode[], parentEl?: FakeElement): FakeElement[] {
    const elements: FakeElement[] = [];
    let i = 0;

    while (i < nodes.length) {
      const node = nodes[i];

      // 0. Spacing commands (\quad, \;, \,, etc.) produce <mjx-mspace> and are not leaf targets
      if (node.kind === "command" && (SPACING_COMMANDS.has(node.name) || node.name === "\\\\" || node.name === "\\cr" || node.name === "\\newline")) {
        const mspace = createFakeElement("mjx-mspace");
        elements.push(mspace);
        i++;
        continue;
      }

      // Matrix ampersand tabs (&) produce zero DOM leaf elements
      if ((node.kind === "punctuation" && (node as any).char === "&") || (node.kind === "identifier" && (node as any).text === "&")) {
        i++;
        continue;
      }

      // If an isolated script node appears without a base, process its arguments directly
      if (node.kind === "script") {
        const scriptArgEls = buildNodeList((node as ScriptNode).arg);
        elements.push(...scriptArgEls);
        i++;
        continue;
      }

      // 1. Build the base element for this node
      let baseEl: FakeElement;
      let consumed = 1;

      if (node.kind === "fraction") {
        const fracNode = node as FractionNode;
        const numEls = buildNodeList(fracNode.numerator);
        const denEls = buildNodeList(fracNode.denominator);
        const numEl = createFakeElement("mjx-num", numEls);
        const denEl = createFakeElement("mjx-den", denEls);
        baseEl = createFakeElement("mjx-frac", [numEl, denEl]);
      } else if (node.kind === "underover") {
        const uoNode = node as UnderOverNode;
        const baseEls = buildNodeList(uoNode.base);
        const baseBox = createFakeElement("mjx-box", baseEls);
        const braceGlyph = createFakeElement("mjx-c");
        const scriptEls = uoNode.script ? buildNodeList(uoNode.script) : [];
        const isUnder = uoNode.targetRole === "underscript";
        const scriptContainer = isUnder
          ? createFakeElement("mjx-under", [braceGlyph, ...scriptEls])
          : createFakeElement("mjx-over", [braceGlyph, ...scriptEls]);
        baseEl = isUnder
          ? createFakeElement("mjx-munder", [baseBox, scriptContainer])
          : createFakeElement("mjx-mover", [baseBox, scriptContainer]);
      } else if (node.kind === "command" && (node.name === "\\sqrt" || node.name === "\\mroot")) {
        const surdEl = createFakeElement("mjx-surd");
        let j = i + 1;
        let radicandNodes: CSTNode[] = [];
        let degreeNodes: CSTNode[] = [];

        if (j < nodes.length && nodes[j].kind === "group" && (nodes[j] as GroupNode).delimType === "bracket") {
          degreeNodes = (nodes[j] as GroupNode).children;
          j++;
        }
        if (j < nodes.length && nodes[j].kind === "group") {
          radicandNodes = (nodes[j] as GroupNode).children;
          j++;
        } else if (j < nodes.length) {
          radicandNodes = [nodes[j]];
          j++;
        }

        const boxEls = buildNodeList(radicandNodes);
        const boxEl = createFakeElement("mjx-box", boxEls);

        if (degreeNodes.length > 0) {
          const degEls = buildNodeList(degreeNodes);
          const rootEl = createFakeElement("mjx-root", degEls);
          baseEl = createFakeElement("mjx-mroot", [surdEl, boxEl, rootEl]);
        } else {
          baseEl = createFakeElement("mjx-sqrt", [surdEl, boxEl]);
        }
        consumed = j - i;
      } else if (node.kind === "group") {
        const groupNode = node as GroupNode;
        const hasMatrix = groupNode.children.some(
          (c) => (c.kind === "punctuation" && (c as any).char === "&") ||
                 (c.kind === "command" && (c.name === "\\\\" || c.name === "\\cr"))
        );

        if (hasMatrix) {
          const mtds: FakeElement[] = [];
          let currentCell: CSTNode[] = [];

          const flushCell = () => {
            const cellEls = buildNodeList(currentCell);
            mtds.push(createFakeElement("mjx-mtd", cellEls));
            currentCell = [];
          };

          for (const child of groupNode.children) {
            const isDelim =
              (child.kind === "punctuation" && (child as any).char === "&") ||
              (child.kind === "command" && (child.name === "\\\\" || child.name === "\\cr"));
            if (isDelim) {
              flushCell();
            } else {
              currentCell.push(child);
            }
          }
          flushCell();
          const mtr = createFakeElement("mjx-mtr", mtds);
          baseEl = createFakeElement("mjx-mtable", [mtr]);
        } else {
          const groupEls = buildNodeList(groupNode.children);
          const hasOpen =
            Boolean(groupNode.openText) &&
            groupNode.delimType !== "bare_brace" &&
            groupNode.openText !== "{" &&
            groupNode.openStart < groupNode.openEnd;
          const hasClose =
            Boolean(groupNode.closeText) &&
            groupNode.delimType !== "bare_brace" &&
            groupNode.closeText !== "}" &&
            groupNode.closeStart < groupNode.closeEnd;

          const innerEls: FakeElement[] = [];
          if (hasOpen) {
            const openMo = createFakeElement("mjx-mo", [createFakeElement("mjx-c", [], groupNode.openText)]);
            innerEls.push(openMo);
          }
          innerEls.push(...groupEls);
          if (hasClose) {
            const closeMo = createFakeElement("mjx-mo", [createFakeElement("mjx-c", [], groupNode.closeText)]);
            innerEls.push(closeMo);
          }
          baseEl = createFakeElement("mjx-mrow", innerEls);
        }
      } else if (node.kind === "command" && FONT_ACCENT_COMMANDS.has(node.name) && i + 1 < nodes.length && nodes[i + 1].kind === "group") {
        const fusedNode: CSTNode = {
          kind: node.name === "\\text" ? "text" : "identifier",
          start: node.start,
          end: nodes[i + 1].end,
        } as CSTNode;
        baseEl = buildLeafElement(fusedNode);
        consumed = 2;
      } else {
        baseEl = buildLeafElement(node);
      }

      // 2. Check if one or more scripts attach to this base (x_i, x^2, \mathbb{R}^n, \{0,1\}^n, \|x\|_2^2, etc.)
      let nextIdx = i + consumed;
      const scripts: ScriptNode[] = [];
      const normLimits = (node as any).normLimits as ScriptNode[] | undefined;
      if (normLimits && Array.isArray(normLimits)) {
        scripts.push(...normLimits);
      }
      const evaluationLimits = (node as any).evaluationLimits as ScriptNode[] | undefined;
      if (evaluationLimits && Array.isArray(evaluationLimits)) {
        scripts.push(...evaluationLimits);
      }
      while (nextIdx < nodes.length && nodes[nextIdx].kind === "script") {
        scripts.push(nodes[nextIdx] as ScriptNode);
        nextIdx++;
      }

      if (scripts.length > 0) {
        const isBigOp = node.kind === "command" && ["\\sum", "\\prod", "\\coprod", "\\bigcup", "\\bigcap", "\\lim"].includes(node.name);
        let currentBase = baseEl;
        let sIdx = 0;

        while (sIdx < scripts.length) {
          const s1 = scripts[sIdx];
          const s2 = sIdx + 1 < scripts.length ? scripts[sIdx + 1] : null;

          if (s2 && s1.scriptType !== s2.scriptType) {
            const subScript = s1.scriptType === "subscript" ? s1 : s2;
            const superScript = s1.scriptType === "superscript" ? s1 : s2;
            const subEls = buildNodeList(subScript.arg);
            const superEls = buildNodeList(superScript.arg);
            if (isBigOp && sIdx === 0) {
              const underEl = createFakeElement("mjx-under", subEls);
              const overEl = createFakeElement("mjx-over", superEls);
              const baseMo = createFakeElement("mjx-base", [currentBase]);
              const munder = createFakeElement("mjx-munder", [baseMo, underEl]);
              const box = createFakeElement("mjx-box", [munder]);
              currentBase = createFakeElement("mjx-munderover", [overEl, box]);
            } else {
              // MathJax 4: unified mjx-script with superscript, mjx-spacer, and subscript
              const spacerEl = createFakeElement("mjx-spacer");
              const scriptEl = createFakeElement("mjx-script", [...superEls, spacerEl, ...subEls]);
              currentBase = createFakeElement("mjx-msubsup", [currentBase, scriptEl]);
            }
            sIdx += 2;
          } else {
            const els = buildNodeList(s1.arg);
            if (isBigOp && sIdx === 0) {
              if (s1.scriptType === "superscript") {
                const overEl = createFakeElement("mjx-over", els);
                currentBase = createFakeElement("mjx-mover", [currentBase, overEl]);
              } else {
                const underEl = createFakeElement("mjx-under", els);
                currentBase = createFakeElement("mjx-munder", [currentBase, underEl]);
              }
            } else {
              const scriptEl = createFakeElement("mjx-script", els);
              const tag = s1.scriptType === "superscript" ? "mjx-msup" : "mjx-msub";
              currentBase = createFakeElement(tag, [currentBase, scriptEl]);
            }
            sIdx++;
          }
        }
        elements.push(currentBase);
        i = nextIdx;
      } else {
        elements.push(baseEl);
        i += consumed;
      }
    }

    if (parentEl) {
      for (const el of elements) {
        el.parentElement = parentEl;
      }
    }
    return elements;
  }

  function buildLeafElement(node: CSTNode): FakeElement {
    let tagName = "mjx-mo";
    let text = latex.slice(node.start, node.end);

    if (node.kind === "identifier") {
      tagName = "mjx-mi";
    } else if (node.kind === "number") {
      tagName = "mjx-mn";
    } else if (node.kind === "text") {
      tagName = "mjx-mtext";
    } else if (node.kind === "operator") {
      tagName = "mjx-mo";
    } else if (node.kind === "command") {
      if (node.name.startsWith("\\alpha") || node.name.startsWith("\\beta") || node.name.startsWith("\\gamma") ||
          node.name.startsWith("\\theta") || node.name.startsWith("\\lambda") || node.name.startsWith("\\mu") ||
          node.name.startsWith("\\pi") || node.name.startsWith("\\sigma") || node.name.startsWith("\\omega")) {
        tagName = "mjx-mi";
      } else {
        tagName = "mjx-mo";
      }
    }

    const glyph = createFakeElement("mjx-c", [], text);
    const leaf = createFakeElement(tagName, [glyph], text);
    glyph.parentElement = leaf;

    targets.push({
      element: leaf,
      node,
      expectedText: text,
    });

    return leaf;
  }

  const childEls = buildNodeList(ast);
  const mathEl = createFakeElement("mjx-math", childEls);
  for (const c of childEls) c.parentElement = mathEl;
  const root = createFakeElement("mjx-container", [mathEl]);
  mathEl.parentElement = root;

  return { root, targets };
}
