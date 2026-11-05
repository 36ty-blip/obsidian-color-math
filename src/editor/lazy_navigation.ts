// src/editor/lazy_navigation.ts
//! Method 3: Pure On-Demand (Lazy) Structural Coordinate Resolver.
//! Computes exact source ranges [start, end] on the fly at click/hover time with zero persistent RAM.

import { MathCSTParser } from "../parsers/cst/parser";
import { CSTNode, FractionNode, ScriptNode, SpatialCoordinate4D, UnderOverNode } from "../parsers/cst/types";
import { getMathJaxElementRange } from "./weakmap_index";
import { getElementText, getExpectedLeafNodeText, isLeafTextMatch } from "./quaternion_reconciler";

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

function getNodeListSpan(nodes: CSTNode[]): { start: number; end: number } | null {
  if (!nodes || nodes.length === 0) return null;
  return {
    start: nodes[0].start,
    end: nodes[nodes.length - 1].end,
  };
}

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
]);

export function collectLeaves(nodes: CSTNode[], acc: CSTNode[] = []): CSTNode[] {
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i];
    switch (node.kind) {
      case "identifier":
      case "number":
      case "operator":
      case "punctuation":
      case "boundary":
      case "text":
        // Ampersands (&) in matrices are layout delimiters and produce zero DOM leaf elements
        if (
          (node.kind === "punctuation" && node.char === "&") ||
          (node.kind === "identifier" && node.text === "&") ||
          (node.kind === "operator" && node.text === "&")
        ) {
          i++;
          break;
        }
        acc.push(node);
        i++;
        break;
      case "command":
        if (
          SPACING_COMMANDS.has(node.name) ||
          node.name === "\\\\" ||
          node.name === "\\" ||
          node.name === "\\cr" ||
          node.name === "\\newline" ||
          node.name === "\\frac" ||
          node.name === "\\dfrac" ||
          node.name === "\\sqrt"
        ) {
          i++;
          break;
        }

        // Font and styling commands with a braced argument (e.g. \mathbb{R}, \mathbf{x}, \text{foo})
        // produce a single leaf element in MathJax CHTML rather than two disconnected elements
        if (FONT_ACCENT_COMMANDS.has(node.name) && i + 1 < nodes.length && nodes[i + 1].kind === "group") {
          acc.push({
            kind: node.name === "\\text" ? "text" : "identifier",
            start: node.start,
            end: nodes[i + 1].end,
          } as CSTNode);
          i += 2;
          break;
        }

        // Big operators with limits (\sum, \prod, \lim, etc.)
        // MathJax CHTML renders <mjx-munderover> with <mjx-over> (superscript) FIRST,
        // then <mjx-box> wrapping <mjx-munder> (<mjx-base> command, then <mjx-under> subscript).
        const BIG_OPS = new Set(["\\sum", "\\prod", "\\coprod", "\\bigcup", "\\bigcap", "\\lim"]);
        if (BIG_OPS.has(node.name)) {
          let s1: ScriptNode | null = null;
          let s2: ScriptNode | null = null;
          if (i + 1 < nodes.length && nodes[i + 1].kind === "script") {
            s1 = nodes[i + 1] as ScriptNode;
          }
          if (i + 2 < nodes.length && nodes[i + 2].kind === "script") {
            s2 = nodes[i + 2] as ScriptNode;
          }
          if (s1 && s2 && s1.scriptType !== s2.scriptType) {
            const superScript = s1.scriptType === "superscript" ? s1 : s2;
            const subScript = s1.scriptType === "subscript" ? s1 : s2;
            collectLeaves(superScript.arg, acc);
            acc.push(node);
            collectLeaves(subScript.arg, acc);
            i += 3;
            break;
          }
        }

        acc.push(node);
        i++;
        break;
      case "fraction":
        collectLeaves(node.numerator, acc);
        collectLeaves(node.denominator, acc);
        i++;
        break;
      case "script": {
        const isBigOp =
          node.base &&
          node.base.kind === "command" &&
          ["\\sum", "\\prod", "\\coprod", "\\bigcup", "\\bigcap", "\\lim"].includes(node.base.name);

        // In MathJax 4 CHTML DOM (<mjx-msubsup>), superscripts strictly precede subscripts inside <mjx-script>.
        // For big operators (<mjx-munderover>), lower limits (<mjx-under>) precede upper limits (<mjx-over>).
        if (!isBigOp) {
          if (
            node.scriptType === "subscript" &&
            i + 1 < nodes.length &&
            nodes[i + 1].kind === "script" &&
            (nodes[i + 1] as ScriptNode).scriptType === "superscript"
          ) {
            const superNode = nodes[i + 1] as ScriptNode;
            collectLeaves(superNode.arg, acc);
            collectLeaves(node.arg, acc);
            i += 2;
            break;
          }
          if (
            node.scriptType === "superscript" &&
            i + 1 < nodes.length &&
            nodes[i + 1].kind === "script" &&
            (nodes[i + 1] as ScriptNode).scriptType === "subscript"
          ) {
            const subNode = nodes[i + 1] as ScriptNode;
            collectLeaves(node.arg, acc);
            collectLeaves(subNode.arg, acc);
            i += 2;
            break;
          }
        }
        collectLeaves(node.arg, acc);
        i++;
        break;
      }
      case "underover":
        collectLeaves(node.base, acc);
        if (node.script) {
          collectLeaves(node.script, acc);
        }
        i++;
        break;
      case "group": {
        const isMatrix =
          node.delimType === "matrix" ||
          node.children.some(
            (c) =>
              (c.kind === "punctuation" && (c as any).char === "&") ||
              (c.kind === "identifier" && (c as any).text === "&") ||
              (c.kind === "operator" && (c as any).text === "&") ||
              (c.kind === "command" && (c.name === "\\\\" || c.name === "\\cr" || c.name === "\\newline"))
          );
        const hasOpen =
          !isMatrix &&
          Boolean(node.openText) &&
          node.delimType !== "bare_brace" &&
          node.openText !== "{" &&
          node.openStart < node.openEnd;
        if (hasOpen) {
          acc.push({
            kind: "operator",
            start: node.openStart,
            end: node.openEnd,
            text: node.openText,
          } as CSTNode);
        }
        collectLeaves(node.children, acc);
        const hasClose =
          !isMatrix &&
          Boolean(node.closeText) &&
          node.delimType !== "bare_brace" &&
          node.closeText !== "}" &&
          node.closeStart < node.closeEnd;
        if (hasClose) {
          acc.push({
            kind: "operator",
            start: node.closeStart,
            end: node.closeEnd,
            text: node.closeText,
          } as CSTNode);
        }
        const normLimits = (node as any).normLimits as ScriptNode[] | undefined;
        const evaluationLimits = (node as any).evaluationLimits as ScriptNode[] | undefined;
        const allGroupLimits = [
          ...(Array.isArray(normLimits) ? normLimits : []),
          ...(Array.isArray(evaluationLimits) ? evaluationLimits : []),
        ];
        if (allGroupLimits.length > 0) {
          // MathJax 4 CHTML <mjx-msubsup> strictly renders superscript before subscript
          const superScript = allGroupLimits.find((s) => s.scriptType === "superscript");
          const subScript = allGroupLimits.find((s) => s.scriptType === "subscript");
          if (superScript) collectLeaves(superScript.arg, acc);
          if (subScript) collectLeaves(subScript.arg, acc);
        }
        i++;
        break;
      }
      default:
        i++;
        break;
    }
  }
  return acc;
}

export function collectFractions(nodes: CSTNode[], acc: FractionNode[] = []): FractionNode[] {
  for (const node of nodes) {
    if (node.kind === "fraction") {
      acc.push(node);
      collectFractions(node.numerator, acc);
      collectFractions(node.denominator, acc);
    } else if (node.kind === "script") {
      collectFractions(node.arg, acc);
    } else if (node.kind === "group") {
      collectFractions(node.children, acc);
    }
  }
  return acc;
}

export function collectScripts(nodes: CSTNode[], acc: ScriptNode[] = []): ScriptNode[] {
  for (const node of nodes) {
    if (node.kind === "script") {
      acc.push(node);
      collectScripts(node.arg, acc);
    } else if (node.kind === "fraction") {
      collectScripts(node.numerator, acc);
      collectScripts(node.denominator, acc);
    } else if (node.kind === "group") {
      collectScripts(node.children, acc);
      const normLimits = (node as any).normLimits as ScriptNode[] | undefined;
      if (normLimits && Array.isArray(normLimits)) {
        for (const lim of normLimits) {
          acc.push(lim);
          collectScripts(lim.arg, acc);
        }
      }
      const evaluationLimits = (node as any).evaluationLimits as ScriptNode[] | undefined;
      if (evaluationLimits && Array.isArray(evaluationLimits)) {
        for (const lim of evaluationLimits) {
          acc.push(lim);
          collectScripts(lim.arg, acc);
        }
      }
    }
  }
  return acc;
}

export function collectUnderOvers(nodes: CSTNode[], acc: UnderOverNode[] = []): UnderOverNode[] {
  for (const node of nodes) {
    if (node.kind === "underover") {
      acc.push(node);
      collectUnderOvers(node.base, acc);
      if (node.script) {
        collectUnderOvers(node.script, acc);
      }
    } else if (node.kind === "fraction") {
      collectUnderOvers(node.numerator, acc);
      collectUnderOvers(node.denominator, acc);
    } else if (node.kind === "script") {
      collectUnderOvers(node.arg, acc);
    } else if (node.kind === "group") {
      collectUnderOvers(node.children, acc);
    }
  }
  return acc;
}

export interface RootSpan {
  start: number;
  end: number;
  radicandStart: number;
  radicandEnd: number;
}

export function collectRoots(nodes: CSTNode[], acc: RootSpan[] = []): RootSpan[] {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.kind === "command" && node.name === "\\sqrt") {
      let end = node.end;
      let radicandStart = node.end;
      let radicandEnd = node.end;

      // Lookahead for optional [degree] and mandatory {radicand}
      let j = i + 1;
      while (j < nodes.length) {
        const next = nodes[j];
        if (next.kind === "group") {
          radicandStart = next.start;
          radicandEnd = next.end;
          end = next.end;
          break;
        } else if (next.kind === "identifier" || next.kind === "number") {
          radicandStart = next.start;
          radicandEnd = next.end;
          end = next.end;
          break;
        }
        j++;
      }

      acc.push({ start: node.start, end, radicandStart, radicandEnd });
    } else if (node.kind === "fraction") {
      collectRoots(node.numerator, acc);
      collectRoots(node.denominator, acc);
    } else if (node.kind === "script") {
      collectRoots(node.arg, acc);
    } else if (node.kind === "group") {
      collectRoots(node.children, acc);
    }
  }
  return acc;
}

export interface MatrixCellSpan {
  start: number;
  end: number;
}

export function collectMatrixCells(nodes: CSTNode[]): MatrixCellSpan[] {
  const cells: MatrixCellSpan[] = [];
  let currentStart = -1;
  let currentEnd = -1;

  function flush() {
    if (currentStart >= 0 && currentEnd >= currentStart) {
      cells.push({ start: currentStart, end: currentEnd });
      currentStart = -1;
      currentEnd = -1;
    }
  }

  function walk(list: CSTNode[]) {
    for (const node of list) {
      if (node.kind === "group") {
        const isMatrixGroup =
          node.delimType === "matrix" ||
          node.children.some(
            (c) =>
              (c.kind === "punctuation" && (c as any).char === "&") ||
              (c.kind === "identifier" && (c as any).text === "&") ||
              (c.kind === "operator" && (c as any).text === "&") ||
              (c.kind === "command" && (c.name === "\\\\" || c.name === "\\" || c.name === "\\cr" || c.name === "\\newline"))
          );
        if (isMatrixGroup) {
          walk(node.children);
          continue;
        }
      }
      const isAmpersand =
        (node.kind === "punctuation" && node.char === "&") ||
        (node.kind === "identifier" && node.text === "&") ||
        (node.kind === "operator" && node.text === "&");
      const isRowBreak =
        node.kind === "command" &&
        (node.name === "\\\\" || node.name === "\\" || node.name === "\\cr" || node.name === "\\newline");

      if (isAmpersand || isRowBreak) {
        flush();
      } else {
        if (currentStart === -1) {
          currentStart = node.start;
        }
        let maxEnd = node.end;
        const anyNode = node as any;
        if (Array.isArray(anyNode.evaluationLimits)) {
          for (const lim of anyNode.evaluationLimits) {
            if (lim.end > maxEnd) maxEnd = lim.end;
          }
        }
        if (Array.isArray(anyNode.normLimits)) {
          for (const lim of anyNode.normLimits) {
            if (lim.end > maxEnd) maxEnd = lim.end;
          }
        }
        currentEnd = maxEnd;
      }
    }
  }

  walk(nodes);
  flush();
  return cells;
}

/**
 * Resolves the clicked DOM element to an exact source code range [start, end]
 * purely on-demand using zero persistent memory.
 *
 * @param target The directly clicked or hovered DOM element (event.target)
 * @param container The root MathJax element (<mjx-container>)
 * @param latex The raw LaTeX formula for the active math block
 */
export function resolveOnDemandRange(
  target: Element,
  container: Element,
  latex: string,
  skipWeakMap: boolean = false
): ResolvedRange | null {
  if (!target || !container || !latex) return null;

  try {
    // 0. Method 2 Fast Path: Direct WeakMap Object-Identity Hit (~20 ns)
    if (!skipWeakMap) {
      const directRange = getMathJaxElementRange(target);
      if (directRange) return directRange;
    }

    const parser = new MathCSTParser(latex);
    const ast = parser.parse();
    if (!ast || ast.length === 0) return null;

    // 1. Direct Leaf Token Hit-Test (identifier, symbol, operator, text, or number)
    const tokenContainerEl = target.closest("mjx-mi, mjx-mn, mjx-mo, mjx-mtext");
    if (tokenContainerEl && container.contains(tokenContainerEl)) {
      if (!skipWeakMap) {
        const containerRange = getMathJaxElementRange(tokenContainerEl);
        if (containerRange) return containerRange;
      }

      const allLeafEls = Array.from(container.querySelectorAll("mjx-mi, mjx-mn, mjx-mo, mjx-mtext"));
      const leafIdx = allLeafEls.indexOf(tokenContainerEl);
      if (leafIdx >= 0) {
        const leafNodes = collectLeaves(ast);
        const actualText = getElementText(tokenContainerEl);

        // Cell containment bounds if inside a matrix cell or linebox
        let cellStart = 0;
        let cellEnd = latex.length;
        const mtdEl = typeof tokenContainerEl.closest === "function" ? tokenContainerEl.closest("mjx-mtd, mjx-linebox") : null;
        if (mtdEl && container.contains(mtdEl)) {
          const rawMtds = Array.from(container.querySelectorAll("mjx-mtd, mjx-linebox"));
          const cells = collectMatrixCells(ast);
          const nonEmptyMtds = rawMtds.filter(
            (m) => getElementText(m).length > 0 || m.querySelector("mjx-c, mjx-frac, mjx-mfrac, mjx-sqrt, mjx-mroot, mjx-mspace, mjx-mtable, mjx-linestack") !== null
          );
          const mtds = rawMtds.length !== cells.length && nonEmptyMtds.length === cells.length ? nonEmptyMtds : rawMtds;
          const cellIdx = mtds.indexOf(mtdEl);
          if (cellIdx >= 0 && cellIdx < cells.length) {
            cellStart = cells[cellIdx].start;
            cellEnd = cells[cellIdx].end;
          }
        }

        // Fast-path: check if ordinal index matches both cell bounds and Unicode text
        if (leafIdx < leafNodes.length) {
          const directNode = leafNodes[leafIdx];
          if (
            directNode.start >= cellStart &&
            directNode.end <= cellEnd &&
            isLeafTextMatch(actualText, directNode, latex)
          ) {
            return { start: directNode.start, end: directNode.end, kind: directNode.kind === "text" ? "text" : "leaf" };
          }
        }

        // Unicode + Neighbor Bigram search within cell bounds when invisible glyphs or structural wrappers shift ordinal index
        const prevDomText = leafIdx > 0 ? getElementText(allLeafEls[leafIdx - 1]) : "";
        const nextDomText = leafIdx + 1 < allLeafEls.length ? getElementText(allLeafEls[leafIdx + 1]) : "";
        let bestNode: CSTNode | null = null;
        let bestScore = -Infinity;
        for (let i = 0; i < leafNodes.length; i++) {
          const cand = leafNodes[i];
          if (cand.start < cellStart || cand.end > cellEnd) continue;
          if (!isLeafTextMatch(actualText, cand, latex)) continue;
          let score = 20 - Math.min(18, Math.abs(i - leafIdx));
          if (cand.prevLeaf && prevDomText && isLeafTextMatch(prevDomText, cand.prevLeaf, latex)) {
            score += 20;
          }
          if (cand.nextLeaf && nextDomText && isLeafTextMatch(nextDomText, cand.nextLeaf, latex)) {
            score += 20;
          }
          if (score > bestScore) {
            bestScore = score;
            bestNode = cand;
          }
        }
        if (bestNode) {
          return { start: bestNode.start, end: bestNode.end, kind: bestNode.kind === "text" ? "text" : "leaf" };
        }
      }
    }

    // 2. Radical / Square Root Component Hit-Test (\sqrt{x})
    const sqrtEl = target.closest("mjx-sqrt");
    if (sqrtEl && container.contains(sqrtEl)) {
      const allRoots = Array.from(container.querySelectorAll("mjx-sqrt"));
      const rootIdx = allRoots.indexOf(sqrtEl);
      if (rootIdx >= 0) {
        const roots = collectRoots(ast);
        if (rootIdx < roots.length) {
          const rootSpan = roots[rootIdx];
          const isBox = target.closest("mjx-box");
          if (isBox) {
            // Clicked inside the radicand content box
            return { start: rootSpan.radicandStart, end: rootSpan.radicandEnd, kind: "root" };
          }
          // Clicked radical checkmark (mjx-surd) or radical bar
          return { start: rootSpan.start, end: rootSpan.end, kind: "root" };
        }
      }
    }

    // 3. Matrix / Table Cell Hit-Test (\begin{pmatrix} a & b \\ c & d \end{pmatrix} or <mjx-linebox>)
    const mtdEl = target.closest("mjx-mtd, mjx-linebox");
    if (mtdEl && container.contains(mtdEl)) {
      if (!skipWeakMap) {
        const cellRange = getMathJaxElementRange(mtdEl);
        if (cellRange) return cellRange;
      }
      const rawMtds = Array.from(container.querySelectorAll("mjx-mtd, mjx-linebox"));
      const cells = collectMatrixCells(ast);
      const nonEmptyMtds = rawMtds.filter(
        (m) => (m.textContent || "").trim().length > 0 || m.querySelector("mjx-c, mjx-frac, mjx-mfrac, mjx-sqrt, mjx-mroot, mjx-mspace, mjx-mtable, mjx-linestack") !== null
      );
      const allMtds = rawMtds.length !== cells.length && nonEmptyMtds.length === cells.length ? nonEmptyMtds : rawMtds;
      const cellIdx = allMtds.indexOf(mtdEl);
      if (cellIdx >= 0 && cellIdx < cells.length) {
        const cell = cells[cellIdx];
        return { start: cell.start, end: cell.end, kind: "matrix_cell" };
      }
    }

    // 4. Fraction Component Hit-Test (clicking in numerator or denominator slot/background)
    const numEl = target.closest("mjx-num");
    if (numEl && container.contains(numEl)) {
      const fracEl = target.closest("mjx-frac");
      const allFracs = Array.from(container.querySelectorAll("mjx-frac"));
      const fracIdx = fracEl ? allFracs.indexOf(fracEl) : -1;
      if (fracIdx >= 0) {
        const fracs = collectFractions(ast);
        if (fracIdx < fracs.length) {
          const span = getNodeListSpan(fracs[fracIdx].numerator);
          if (span) return { start: span.start, end: span.end, kind: "numerator" };
        }
      }
    }

    const denEl = target.closest("mjx-den");
    if (denEl && container.contains(denEl)) {
      const fracEl = target.closest("mjx-frac");
      const allFracs = Array.from(container.querySelectorAll("mjx-frac"));
      const fracIdx = fracEl ? allFracs.indexOf(fracEl) : -1;
      if (fracIdx >= 0) {
        const fracs = collectFractions(ast);
        if (fracIdx < fracs.length) {
          const span = getNodeListSpan(fracs[fracIdx].denominator);
          if (span) return { start: span.start, end: span.end, kind: "denominator" };
        }
      }
    }

    // 5. Whole Fraction Hit-Test (clicking fraction line/divider)
    const fracEl = target.closest("mjx-frac");
    if (fracEl && container.contains(fracEl)) {
      const allFracs = Array.from(container.querySelectorAll("mjx-frac"));
      const fracIdx = allFracs.indexOf(fracEl);
      if (fracIdx >= 0) {
        const fracs = collectFractions(ast);
        if (fracIdx < fracs.length) {
          return { start: fracs[fracIdx].start, end: fracs[fracIdx].end, kind: "fraction" };
        }
      }
    }

    // 6. Script Component Hit-Test (clicking exponent/subscript slot)
    const scriptEl = target.closest("mjx-script");
    if (scriptEl && container.contains(scriptEl)) {
      // Disambiguate subscripts vs superscripts in mjx-msubsup
      const msubsupParent = target.closest("mjx-msubsup");
      if (msubsupParent && container.contains(msubsupParent)) {
        const scriptChildren = Array.from(msubsupParent.children).filter((c) => c.matches("mjx-script"));
        const isSubscript = scriptChildren.length >= 2 && scriptChildren[0] === scriptEl;
        const allMsubsups = Array.from(container.querySelectorAll("mjx-msubsup"));
        const parentIdx = allMsubsups.indexOf(msubsupParent);
        if (parentIdx >= 0) {
          const scripts = collectScripts(ast);
          const targetType = isSubscript ? "subscript" : "superscript";
          const matched = scripts.filter((s) => s.scriptType === targetType);
          if (parentIdx < matched.length) {
            const span = getNodeListSpan(matched[parentIdx].arg);
            if (span) return { start: span.start, end: span.end, kind: "script" };
          }
        }
      }

      const scriptParent = target.closest("mjx-msup, mjx-msub, mjx-msubsup");
      const allScripts = Array.from(container.querySelectorAll("mjx-msup, mjx-msub, mjx-msubsup"));
      const scriptIdx = scriptParent ? allScripts.indexOf(scriptParent) : -1;
      if (scriptIdx >= 0) {
        const scripts = collectScripts(ast);
        if (scriptIdx < scripts.length) {
          const span = getNodeListSpan(scripts[scriptIdx].arg);
          if (span) return { start: span.start, end: span.end, kind: "script" };
        }
      }
    }

    // 7. Extensible Under/Over Molecule Hit-Test (\underbrace{...}_{...}, \overbrace{...}^{...})
    const uoEl = target.closest("mjx-munder, mjx-mover, mjx-munderover");
    if (uoEl && container.contains(uoEl)) {
      const allUos = Array.from(container.querySelectorAll("mjx-munder, mjx-mover, mjx-munderover"));
      const uoIdx = allUos.indexOf(uoEl);
      if (uoIdx >= 0) {
        const uos = collectUnderOvers(ast);
        if (uoIdx < uos.length) {
          const uo = uos[uoIdx];
          const isScript = target.closest("mjx-under, mjx-over");
          if (isScript && uo.script) {
            const span = getNodeListSpan(uo.script);
            if (span) return { start: span.start, end: span.end, kind: "script" };
          }
          const isBase = target.closest("mjx-base");
          if (isBase) {
            const span = getNodeListSpan(uo.base);
            if (span) return { start: span.start, end: span.end, kind: "leaf" };
          }
          return { start: uo.start, end: uo.end, kind: "underover" };
        }
      }
    }

    return null;
  } catch (err) {
    console.debug("Color Math: resolveOnDemandRange non-fatal resolution error:", err);
    return null;
  }
}
