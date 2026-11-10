// src/editor/lazy_navigation.ts
//! Method 3: Pure On-Demand (Lazy) Structural Coordinate Resolver.
//! Computes exact source ranges [start, end] on the fly at click/hover time with zero persistent RAM.

import { MathCSTParser } from "../parsers/cst/parser";
import { CSTNode, FractionNode, GroupNode, ScriptNode, SpatialCoordinate4D, UnderOverNode } from "../parsers/cst/types";
import { getMathJaxElementRange } from "./weakmap_index";
import { getElementText, isLeafTextMatch } from "./quaternion_reconciler";
import { normalizeMathSyntax } from "../utils/latex_helpers";
import {
  getNodeListSpan,
  matchesSelector,
  isPeriodNode,
  SPACING_COMMANDS,
  BIG_OPS,
  FONT_ACCENT_COMMANDS,
  MultiScaleRange,
  ResolvedRange,
  tryExtractBinomFraction,
  analyzeFontAccentGroup,
  getMtdCoordinates,
} from "./navigation_primitives";

export type { MultiScaleRange, ResolvedRange };
export {
  getNodeListSpan,
  matchesSelector,
  isPeriodNode,
  SPACING_COMMANDS,
  BIG_OPS,
  FONT_ACCENT_COMMANDS,
};

export function collectLeaves(nodes: CSTNode[], acc: CSTNode[] = [], latex?: string): CSTNode[] {
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
        // Ampersands (&) and zero-width characters in matrices/equations produce zero visible DOM leaf elements
        if (
          (node.kind === "punctuation" && node.char === "&") ||
          (node.kind === "identifier" && (node.text === "&" || /^[\u200B-\u200F\u2060-\u206F\uFEFF\s]+$/.test(node.text))) ||
          (node.kind === "operator" && node.text === "&")
        ) {
          i++;
          break;
        }
        // Fuse three consecutive periods '...' into a single horizontal ellipsis leaf '…' (U+2026)
        if (isPeriodNode(node) && i + 2 < nodes.length && isPeriodNode(nodes[i + 1]) && isPeriodNode(nodes[i + 2])) {
          let lastPeriodIdx = i + 2;
          while (lastPeriodIdx + 1 < nodes.length && isPeriodNode(nodes[lastPeriodIdx + 1])) {
            lastPeriodIdx++;
          }
          acc.push({
            kind: "operator",
            operatorType: "binary",
            start: node.start,
            end: nodes[lastPeriodIdx].end,
            text: "...",
          });
          i = lastPeriodIdx + 1;
          break;
        }
        acc.push(node);
        i++;
        break;
      case "comment":
        i++;
        break;
      case "command": {
        const binom = tryExtractBinomFraction(nodes, i);
        if (binom) {
          const cmdLen = node.name.length;
          acc.push({
            kind: "operator",
            text: "(",
            start: node.start,
            end: node.start + cmdLen,
          } as CSTNode);
          collectLeaves(binom.fracNode.numerator, acc, latex);
          collectLeaves(binom.fracNode.denominator, acc, latex);
          acc.push({
            kind: "operator",
            text: ")",
            start: node.start,
            end: node.start + cmdLen,
          } as CSTNode);
          i += binom.consumed + 1;
          break;
        }
        if (
          node.name === "\\\\" ||
          node.name === "\\" ||
          node.name === "\\cr" ||
          node.name === "\\newline" ||
          node.name === "\\frac" ||
          node.name === "\\dfrac" ||
          node.name === "\\sqrt" ||
          node.name === "\\mroot" ||
          SPACING_COMMANDS.has(node.name)
        ) {
          if (node.name === "\\sqrt" || node.name === "\\mroot") {
            // Case A: Degree bracket was parsed as a sibling group: \sqrt [deg] {rad}
            if (i + 1 < nodes.length && nodes[i + 1].kind === "group" && (nodes[i + 1] as GroupNode).delimType === "bracket") {
              const degGroup = nodes[i + 1] as GroupNode;
              if (i + 2 < nodes.length) {
                const radNode = nodes[i + 2];
                collectLeaves(degGroup.children, acc, latex);
                if (radNode.kind === "group") {
                  collectLeaves(radNode.children, acc, latex);
                } else {
                  collectLeaves([radNode], acc, latex);
                }
                i += 2;
                break;
              }
            } else if (latex && node.end > node.start + 6) {
              // Case B: Degree bracket was absorbed into \sqrt command token: \sqrt[m \cdot n]{a}
              const rawCmd = latex.slice(node.start, node.end);
              const bracketIdx = rawCmd.indexOf("[");
              const closeBracketIdx = rawCmd.lastIndexOf("]");
              if (bracketIdx >= 0 && closeBracketIdx > bracketIdx) {
                const innerDeg = rawCmd.slice(bracketIdx + 1, closeBracketIdx);
                const degreeParser = new MathCSTParser(innerDeg);
                const degAst = degreeParser.parse();
                const degLeaves = collectLeaves(degAst, [], innerDeg);
                const degStart = node.start + bracketIdx + 1;
                for (const dl of degLeaves) {
                  dl.start += degStart;
                  dl.end += degStart;
                  acc.push(dl);
                }
                if (i + 1 < nodes.length) {
                  const radNode = nodes[i + 1];
                  if (radNode.kind === "group") {
                    collectLeaves(radNode.children, acc, latex);
                  } else {
                    collectLeaves([radNode], acc, latex);
                  }
                  i++;
                  break;
                }
              }
            }
          }
          i++;
          break;
        }

        // Font and styling commands with a braced argument (e.g. \mathbb{R}, \mathbf{x}, \text{foo})
        // produce a single leaf element in MathJax CHTML rather than two disconnected elements
        if (
          FONT_ACCENT_COMMANDS.has(node.name) &&
          i + 1 < nodes.length &&
          nodes[i + 1].kind === "group" &&
          (nodes[i + 1] as GroupNode).delimType === "bare_brace"
        ) {
          const groupArg = nodes[i + 1] as GroupNode;
          const { hasStructuralChild: shouldCollectChildren, isCompoundAccent } =
            analyzeFontAccentGroup(node.name, groupArg);
          if (shouldCollectChildren) {
            collectLeaves(groupArg.children, acc, latex);
            i += 2;
            break;
          }
          if (!isCompoundAccent) {
            acc.push({
              kind: node.name === "\\text" ? "text" : "identifier",
              start: node.start,
              end: nodes[i + 1].end,
            } as CSTNode);
            i += 2;
            break;
          }
        }

        // Big operators with limits (\sum, \prod, \lim, \bigoplus, \bigotimes, \bigsqcup, \biguplus, \bigvee, \bigwedge, \bigodot, etc.)
        // MathJax CHTML renders <mjx-munderover> with <mjx-over> (superscript) FIRST,
        // then <mjx-box> wrapping <mjx-munder> (<mjx-base> command, then <mjx-under> subscript).
        let s1: ScriptNode | null = null;
        let s2: ScriptNode | null = null;
        if (i + 1 < nodes.length && nodes[i + 1].kind === "script") {
          s1 = nodes[i + 1] as ScriptNode;
        }
        if (i + 2 < nodes.length && nodes[i + 2].kind === "script") {
          s2 = nodes[i + 2] as ScriptNode;
        }
        if (
          s1 &&
          s2 &&
          s1.scriptType !== s2.scriptType &&
          (s1.base === node || s2.base === node || s2.base === s1)
        ) {
          const superScript = s1.scriptType === "superscript" ? s1 : s2;
          const subScript = s1.scriptType === "subscript" ? s1 : s2;
          if (BIG_OPS.has(node.name)) {
            collectLeaves(superScript.arg, acc, latex);
            acc.push(node);
            collectLeaves(subScript.arg, acc, latex);
          } else {
            acc.push(node);
            collectLeaves(superScript.arg, acc, latex);
            collectLeaves(subScript.arg, acc, latex);
          }
          i += 3;
          break;
        }

        // Font styling commands inside braces (\bf, \it, \rm, \sf, \tt, \cal, \scr, \frak)
        acc.push(node);
        i++;
        break;
      }
      case "fraction":
        if (
          node.command === "\\binom" ||
          node.command === "\\dbinom" ||
          node.command === "\\tbinom" ||
          node.command === "binom"
        ) {
          const cmdLen = node.command?.length || 6;
          acc.push({
            kind: "operator",
            text: "(",
            start: node.start,
            end: node.start + cmdLen,
          } as CSTNode);
          collectLeaves(node.numerator, acc, latex);
          collectLeaves(node.denominator, acc, latex);
          acc.push({
            kind: "operator",
            text: ")",
            start: node.start,
            end: node.start + cmdLen,
          } as CSTNode);
          i++;
          break;
        }
        collectLeaves(node.numerator, acc, latex);
        collectLeaves(node.denominator, acc, latex);
        i++;
        break;
      case "script": {
        const isBigOp =
          node.base &&
          node.base.kind === "command" &&
          ["\\sum", "\\prod", "\\coprod", "\\bigcup", "\\bigcap", "\\lim"].includes(node.base.name);

        // In MathJax 4 CHTML DOM (<mjx-msubsup>), superscripts strictly precede subscripts inside <mjx-script>.
        // For big operators (<mjx-munderover>), lower limits (<mjx-under>) precede upper limits (<mjx-over>).
        if (node.base && (i === 0 || nodes[i - 1] !== node.base)) {
          collectLeaves([node.base], acc, latex);
        }
        if (!isBigOp) {
          if (
            node.scriptType === "subscript" &&
            i + 1 < nodes.length &&
            nodes[i + 1].kind === "script" &&
            (nodes[i + 1] as ScriptNode).scriptType === "superscript" &&
            (node.base === (nodes[i + 1] as ScriptNode).base || (nodes[i + 1] as ScriptNode).base === node)
          ) {
            const superNode = nodes[i + 1] as ScriptNode;
            collectLeaves(superNode.arg, acc, latex);
            collectLeaves(node.arg, acc, latex);
            i += 2;
            break;
          }
          if (
            node.scriptType === "superscript" &&
            i + 1 < nodes.length &&
            nodes[i + 1].kind === "script" &&
            (nodes[i + 1] as ScriptNode).scriptType === "subscript" &&
            (node.base === (nodes[i + 1] as ScriptNode).base || (nodes[i + 1] as ScriptNode).base === node)
          ) {
            const subNode = nodes[i + 1] as ScriptNode;
            collectLeaves(node.arg, acc, latex);
            collectLeaves(subNode.arg, acc, latex);
            i += 2;
            break;
          }
        }
        collectLeaves(node.arg, acc, latex);
        i++;
        break;
      }
      case "underover":
        collectLeaves(node.base, acc, latex);
        if (node.script) {
          collectLeaves(node.script, acc, latex);
        }
        i++;
        break;
      case "group": {
        // Typst font shortcuts: bb(...), bold(...), cal(...), frak(...), scr(...)
        // produce a single atomic leaf if they contain no 2D structural children
        if (node.rawPrefix && FONT_ACCENT_COMMANDS.has(node.rawPrefix)) {
          const { hasStructuralChild: shouldCollectChildren } = analyzeFontAccentGroup(node.rawPrefix, node);
          if (!shouldCollectChildren) {
            acc.push({
              kind: node.rawPrefix === "\\text" ? "text" : "identifier",
              start: node.start,
              end: node.end,
              text: latex ? latex.slice(node.start, node.end) : node.rawPrefix,
            });
            i++;
            break;
          }
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
        collectLeaves(node.children, acc, latex);
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
        const trailingGroupScripts: ScriptNode[] = [];
        let nextIdx = i + 1;
        while (
          nextIdx < nodes.length &&
          nodes[nextIdx].kind === "script" &&
          ((nodes[nextIdx] as ScriptNode).base === node ||
            (!(nodes[nextIdx] as ScriptNode).base && Array.isArray(evaluationLimits) && evaluationLimits.length > 0) ||
            trailingGroupScripts.includes((nodes[nextIdx] as ScriptNode).base as ScriptNode))
        ) {
          trailingGroupScripts.push(nodes[nextIdx] as ScriptNode);
          nextIdx++;
        }
        const allGroupLimits = [
          ...(Array.isArray(normLimits) ? normLimits : []),
          ...(Array.isArray(evaluationLimits) ? evaluationLimits : []),
          ...trailingGroupScripts,
        ];
        if (allGroupLimits.length > 0) {
          // Process scripts in pairs just like MathJax CHTML (<mjx-msubsup> renders superscript before subscript)
          let sIdx = 0;
          while (sIdx < allGroupLimits.length) {
            const s1 = allGroupLimits[sIdx];
            const s2 = sIdx + 1 < allGroupLimits.length ? allGroupLimits[sIdx + 1] : null;
            if (s2 && s1.scriptType !== s2.scriptType) {
              const superScript = s1.scriptType === "superscript" ? s1 : s2;
              const subScript = s1.scriptType === "subscript" ? s1 : s2;
              collectLeaves(superScript.arg, acc, latex);
              collectLeaves(subScript.arg, acc, latex);
              sIdx += 2;
            } else {
              collectLeaves(s1.arg, acc, latex);
              sIdx++;
            }
          }
        }
        i = nextIdx;
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
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.kind === "fraction") {
      acc.push(node);
      collectFractions(node.numerator, acc);
      collectFractions(node.denominator, acc);
    } else if (tryExtractBinomFraction(nodes, i)) {
      const binom = tryExtractBinomFraction(nodes, i)!;
      acc.push(binom.fracNode);
      collectFractions(binom.fracNode.numerator, acc);
      collectFractions(binom.fracNode.denominator, acc);
      i += binom.consumed;
    } else if (node.kind === "script") {
      collectFractions(node.arg, acc);
    } else if (node.kind === "group") {
      collectFractions(node.children, acc);
    } else if (node.kind === "underover") {
      collectFractions(node.base, acc);
      if (node.script) collectFractions(node.script, acc);
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
  degreeStart?: number;
  degreeEnd?: number;
}

export function collectRoots(nodes: CSTNode[], acc: RootSpan[] = []): RootSpan[] {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.kind === "command" && node.name === "\\sqrt") {
      let end = node.end;
      let radicandStart = node.end;
      let radicandEnd = node.end;
      let degreeStart: number | undefined;
      let degreeEnd: number | undefined;

      // Lookahead for optional [degree] and mandatory {radicand}
      let j = i + 1;
      if (j < nodes.length && nodes[j].kind === "group" && (nodes[j] as GroupNode).delimType === "bracket") {
        degreeStart = nodes[j].start;
        degreeEnd = nodes[j].end;
        end = nodes[j].end;
        j++;
      } else if (node.end > node.start + 6) {
        // e.g. \sqrt[n] where [degree] was consumed into \sqrt command span
        degreeStart = node.start + 6;
        degreeEnd = node.end - 1;
      }
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

      acc.push({ start: node.start, end, radicandStart, radicandEnd, degreeStart, degreeEnd });
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
  skipWeakMap: boolean = false,
  cellConstraint?: { start: number; end: number }
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

    const project = (start: number, end: number, kind: ResolvedRange["kind"]): ResolvedRange => {
      return { start, end, kind };
    };

    // Error Handling: If clicked element is inside a MathJax error container <mjx-merror>
    const errorEl = typeof target.closest === "function" ? target.closest("mjx-merror") : null;
    if (errorEl && container.contains(errorEl)) {
      const errText = (errorEl.textContent || "").trim();
      const macroMatch = errText.match(/\\[a-zA-Z]+(?:\{[a-zA-Z0-9*]+\})?/);
      if (macroMatch) {
        const cmd = macroMatch[0];
        const idx = latex.indexOf(cmd);
        if (idx >= 0) {
          return project(idx, idx + cmd.length, "leaf");
        }
      }
      const diags = parser.getDiagnostics();
      if (diags.length > 0) {
        return project(diags[0].start, diags[0].end, "leaf");
      }
      return project(0, latex.length, "leaf");
    }

    // 1. Direct Leaf Token Hit-Test (identifier, symbol, operator, text, or number)
    const targetTag = (target.tagName || "").toLowerCase();
    const isStructuralContainer = /^(?:mjx-)?(?:box|frac|mfrac|num|den|sqrt|surd|mtd|mtable|table|script|msubsup|msub|msup)$/i.test(targetTag);
    const tokenContainerEl = isStructuralContainer
      ? null
      : (target.closest("mjx-mi, mjx-mn, mjx-mo, mjx-mtext") ||
         (typeof target.querySelector === "function" ? target.querySelector("mjx-mi, mjx-mn, mjx-mo, mjx-mtext") : null));
    if (tokenContainerEl && container.contains(tokenContainerEl)) {
      if (!skipWeakMap) {
        const containerRange = getMathJaxElementRange(tokenContainerEl);
        if (containerRange) return containerRange;
      }

      const allLeafEls = Array.from(container.querySelectorAll("mjx-mi, mjx-mn, mjx-mo, mjx-mtext")).filter((el) => {
        if (typeof (el as any).closest === "function" && (el as any).closest("mjx-stretchy-h, mjx-stretchy-v")) {
          return false;
        }
        const t = getElementText(el);
        if (t && /^[\u200B-\u200F\u2060-\u206F\uFEFF\s]+$/.test(t)) {
          return false;
        }
        return true;
      });
      const leafIdx = allLeafEls.indexOf(tokenContainerEl);
      if (leafIdx >= 0) {
        const leafNodes = collectLeaves(ast, [], latex);
        const actualText = getElementText(tokenContainerEl);

        // Synthetic delimiter interception: ( or ) generated by \binom
        if (actualText === "(" || actualText === ")") {
          const isTexAtom = tokenContainerEl.parentElement?.tagName === "MJX-TEXATOM";
          const binomRow = isTexAtom ? tokenContainerEl.parentElement?.parentElement : tokenContainerEl.parentElement;
          if (binomRow && binomRow !== container && !matchesSelector(binomRow, "mjx-math, mjx-container")) {
            const fracSibling = binomRow.querySelector("mjx-frac, mjx-mfrac");
            if (fracSibling) {
              const allBinomEls = Array.from(container.querySelectorAll("mjx-frac.mjx-atop, mjx-mfrac")).filter((f) => {
                const p = f.parentElement && matchesSelector(f.parentElement, "mjx-mfrac") ? f.parentElement.parentElement : f.parentElement;
                return p && Array.from(p.children).some((c) => matchesSelector(c, "mjx-mo, mjx-texatom"));
              });
              const binomIdx = fracSibling ? allBinomEls.indexOf(fracSibling) : -1;
              const fracs = collectFractions(ast);
              const binomFracs = fracs.filter(
                (f) => f.command === "\\binom" || f.command === "\\dbinom" || f.command === "\\tbinom" || f.command === "binom"
              );
              const targetBinom = (binomIdx >= 0 && binomIdx < binomFracs.length) ? binomFracs[binomIdx] : binomFracs[0];
              if (targetBinom) {
                const cmdLen = targetBinom.command?.length || 6;
                return project(targetBinom.start, targetBinom.start + cmdLen, "leaf");
              }
            }
          }
        }

        // Synthetic accent symbol interception: combining arrow from \vec, \overrightarrow, etc.
        if (actualText === "⃗" || actualText === "→" || actualText === "\u20D7" || actualText === "⟶" || actualText === "←") {
          const moverParent = typeof tokenContainerEl.closest === "function" ? tokenContainerEl.closest("mjx-mover, mjx-texatom") : null;
          if (moverParent) {
            const vecNode = leafNodes.find((l) => {
              const t = l.kind === "identifier" ? l.text : l.kind === "command" ? l.name : "";
              return (
                t &&
                (t.startsWith("\\vec") ||
                  t.startsWith("vec") ||
                  t.startsWith("\\overrightarrow") ||
                  t.startsWith("\\overleftarrow") ||
                  t.startsWith("\\hat") ||
                  t.startsWith("\\bar") ||
                  t.startsWith("\\tilde") ||
                  t.startsWith("\\dot") ||
                  t.startsWith("\\ddot") ||
                  t.startsWith("\\check"))
              );
            });
            if (vecNode) {
              const t = vecNode.kind === "identifier" ? vecNode.text : vecNode.kind === "command" ? vecNode.name : "";
              const cmdMatch = t.match(/^(\\[a-zA-Z]+)/);
              const cmdLen = cmdMatch ? cmdMatch[1].length : (t.startsWith("\\vec") ? 4 : 3);
              return project(vecNode.start, vecNode.start + cmdLen, "leaf");
            }
          }
        }

        // Cell containment bounds if inside a matrix cell or linebox
        let cellStart = cellConstraint ? cellConstraint.start : 0;
        let cellEnd = cellConstraint ? cellConstraint.end : latex.length;
        if (!cellConstraint) {
          const mtdEl = typeof tokenContainerEl.closest === "function" ? tokenContainerEl.closest("mjx-mtd, mjx-linebox") : null;
          if (mtdEl && container.contains(mtdEl)) {
            const cellClassMatch = mtdEl.className.match(/cm-(?:cell|src)-(\d+)-(\d+)/);
            if (cellClassMatch) {
              cellStart = parseInt(cellClassMatch[1], 10);
              cellEnd = parseInt(cellClassMatch[2], 10);
            } else if (mtdEl.tagName === "MJX-MTD" || mtdEl.tagName === "MJX-LINEBOX") {
              const coords = getMtdCoordinates(mtdEl);
              if (coords) {
                const matrixGroups: GroupNode[] = [];
                const findMatrixGroups = (list: CSTNode[]) => {
                  for (const n of list) {
                    if (n.kind === "group" && (n.delimType === "matrix" || Boolean(n.grid))) {
                      matrixGroups.push(n);
                    }
                    if (n.kind === "group") findMatrixGroups(n.children);
                    else if (n.kind === "fraction") {
                      findMatrixGroups(n.numerator);
                      findMatrixGroups(n.denominator);
                    }
                  }
                };
                findMatrixGroups(ast);

                const tableEl = mtdEl.closest("mjx-mtable, mjx-table");
                const allTables = Array.from(container.querySelectorAll("mjx-mtable, mjx-table"));
                const tableIdx = tableEl ? allTables.indexOf(tableEl) : 0;
                const targetGroup = matrixGroups[Math.max(0, tableIdx)] || matrixGroups[0];
                if (targetGroup?.grid) {
                  const cell = targetGroup.grid.cells[coords.row]?.[coords.col];
                  if (cell) {
                    cellStart = cell.start;
                    cellEnd = cell.end;
                  }
                }
              }
            }
          }
        }

        // Fraction slot containment bounds if inside a numerator or denominator
        const fracSlotEl = typeof tokenContainerEl.closest === "function" ? tokenContainerEl.closest("mjx-num, mjx-den") : null;
        if (fracSlotEl && container.contains(fracSlotEl)) {
          const isNum = fracSlotEl.tagName === "MJX-NUM";
          const fracParent = fracSlotEl.closest("mjx-frac") || fracSlotEl.closest("mjx-mfrac");
          const allFracs = Array.from(container.querySelectorAll("mjx-frac, mjx-mfrac")).filter((f) => {
            return f.tagName === "MJX-FRAC" || !f.querySelector("mjx-frac");
          });
          const fracIdx = fracParent ? allFracs.indexOf(fracParent) : -1;
          if (fracIdx >= 0) {
            const fracs = collectFractions(ast);
            if (fracIdx < fracs.length) {
              const span = getNodeListSpan(isNum ? fracs[fracIdx].numerator : fracs[fracIdx].denominator);
              if (span) {
                cellStart = Math.max(cellStart, span.start);
                cellEnd = Math.min(cellEnd, span.end);
              }
            }
          }
        }

        // Radical slot containment bounds if inside a root radicand or degree
        const rootSlotEl = typeof tokenContainerEl.closest === "function" ? tokenContainerEl.closest("mjx-root, mjx-box") : null;
        if (rootSlotEl && container.contains(rootSlotEl)) {
          const isDegree = rootSlotEl.tagName === "MJX-ROOT";
          const rootParent = rootSlotEl.closest("mjx-mroot, mjx-sqrt");
          const allRoots = Array.from(container.querySelectorAll("mjx-mroot, mjx-sqrt")).filter(
            (el) => el.tagName === "MJX-MROOT" || !el.parentElement?.closest("mjx-mroot")
          );
          const rootIdx = rootParent ? allRoots.indexOf(rootParent) : -1;
          if (rootIdx >= 0) {
            const roots = collectRoots(ast);
            if (rootIdx < roots.length) {
              const rootSpan = roots[rootIdx];
              if (isDegree && rootSpan.degreeStart !== undefined && rootSpan.degreeEnd !== undefined) {
                cellStart = Math.max(cellStart, rootSpan.degreeStart);
                cellEnd = Math.min(cellEnd, rootSpan.degreeEnd);
              } else if (!isDegree) {
                cellStart = Math.max(cellStart, rootSpan.radicandStart);
                cellEnd = Math.min(cellEnd, rootSpan.radicandEnd);
              }
            }
          }
        }

        // Fast-path: check if ordinal index matches both cell bounds and Unicode text
        if (leafIdx < leafNodes.length && allLeafEls.length === leafNodes.length) {
          const directNode = leafNodes[leafIdx];
          if (
            directNode.start >= cellStart &&
            directNode.end <= cellEnd &&
            isLeafTextMatch(actualText, directNode, latex)
          ) {
            let start = directNode.start;
            let end = directNode.end;
            if (directNode.kind === "identifier" && directNode.text) {
              const accentMatch = directNode.text.match(/^(\\[a-zA-Z]+)\{([\s\S]+)\}$/);
              const isAccentCommand = Boolean(
                accentMatch &&
                  /^(?:\\vec|\\overrightarrow|\\overleftarrow|\\overleftrightarrow|\\hat|\\bar|\\tilde|\\dot|\\ddot|\\check)$/.test(
                    accentMatch[1]
                  )
              );
              if (accentMatch && isAccentCommand && actualText !== "⃗" && actualText !== "→" && actualText !== "\u20D7" && actualText !== "⟶" && actualText !== "←") {
                start = directNode.start + accentMatch[1].length + 1;
                end = Math.max(start, directNode.end - 1);
              }
            }
            return { start, end, kind: directNode.kind === "text" ? "text" : "leaf" };
          }
        }

        // Sibling Rank k: count preceding identical matching leaves in DOM to break ties
        // When inside an isolated slot container (fraction/root/cell), bound ranking strictly to that slot scope
        const isSlotBounded = cellStart > 0 || cellEnd < latex.length;
        const activeScopeEls = isSlotBounded
          ? allLeafEls.filter((el) => {
              if (fracSlotEl && fracSlotEl.contains(el)) return true;
              if (rootSlotEl && rootSlotEl.contains(el)) return true;
              const cellEl = typeof tokenContainerEl.closest === "function" ? tokenContainerEl.closest("mjx-mtd, mjx-linebox") : null;
              if (cellEl && cellEl.contains(el)) return true;
              return false;
            })
          : allLeafEls;
        const targetScopeIdx = activeScopeEls.indexOf(tokenContainerEl);
        let domMatchRank = 0;
        const rankLimit = targetScopeIdx >= 0 ? targetScopeIdx : leafIdx;
        const rankEls = targetScopeIdx >= 0 ? activeScopeEls : allLeafEls;
        for (let j = 0; j < rankLimit; j++) {
          const el = rankEls[j];
          const elText = getElementText(el);
          if (elText === actualText || isLeafTextMatch(elText, { kind: "identifier", text: actualText, start: 0, end: 0 }, latex)) {
            domMatchRank++;
          }
        }

        const matchingCstCands: CSTNode[] = [];
        for (let i = 0; i < leafNodes.length; i++) {
          const cand = leafNodes[i];
          if (cand.start < cellStart || cand.end > cellEnd) continue;
          if (isLeafTextMatch(actualText, cand, latex)) {
            matchingCstCands.push(cand);
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

          // Sibling Rank bonus: reward candidate whose relative rank among matching siblings matches DOM rank
          if (matchingCstCands.length > 0) {
            const cstRank = matchingCstCands.indexOf(cand);
            if (cstRank === domMatchRank) {
              score += 50;
            } else if (Math.abs(cstRank - domMatchRank) === 1) {
              score += 15;
            }
          }

          const seqPrev = i > 0 ? leafNodes[i - 1] : undefined;
          const seqNext = i + 1 < leafNodes.length ? leafNodes[i + 1] : undefined;
          const prevDomPrevText = leafIdx > 1 ? getElementText(allLeafEls[leafIdx - 2]) : "";
          const nextDomNextText = leafIdx + 2 < allLeafEls.length ? getElementText(allLeafEls[leafIdx + 2]) : "";
          // Bigram / trigram neighbor check: prefer sequential DOM-order leaves (seqPrev / seqNext)
          // because allLeafEls is flattened in DOM order just like leafNodes!
          if (prevDomText) {
            if (seqPrev && isLeafTextMatch(prevDomText, seqPrev, latex)) {
              score += 25;
              const seqPrev2 = i > 1 ? leafNodes[i - 2] : undefined;
              if (prevDomPrevText && seqPrev2 && isLeafTextMatch(prevDomPrevText, seqPrev2, latex)) {
                score += 12;
              } else if (!prevDomPrevText && i === 1) {
                score += 8;
              }
            }
          }
          if (nextDomText) {
            if (seqNext && isLeafTextMatch(nextDomText, seqNext, latex)) {
              score += 25;
              const seqNext2 = i + 2 < leafNodes.length ? leafNodes[i + 2] : undefined;
              if (nextDomNextText && seqNext2 && isLeafTextMatch(nextDomNextText, seqNext2, latex)) {
                score += 12;
              } else if (!nextDomNextText && i === leafNodes.length - 2) {
                score += 8;
              }
            }
          } else if (i === leafNodes.length - 1) {
            score += 25;
          }
          if (score > bestScore) {
            bestScore = score;
            bestNode = cand;
          }
        }
        if (bestNode) {
          let start = bestNode.start;
          let end = bestNode.end;
          if (bestNode.kind === "identifier" && bestNode.text) {
            const accentMatch = bestNode.text.match(/^(\\[a-zA-Z]+)\{([\s\S]+)\}$/);
            const isAccentCommand = Boolean(
              accentMatch &&
                /^(?:\\vec|\\overrightarrow|\\overleftarrow|\\overleftrightarrow|\\hat|\\bar|\\tilde|\\dot|\\ddot|\\check)$/.test(
                  accentMatch[1]
                )
            );
            if (accentMatch && isAccentCommand && actualText !== "⃗" && actualText !== "→" && actualText !== "\u20D7" && actualText !== "⟶" && actualText !== "←") {
              start = bestNode.start + accentMatch[1].length + 1;
              end = Math.max(start, bestNode.end - 1);
            }
          }
          return { start, end, kind: bestNode.kind === "text" ? "text" : "leaf" };
        }
      }
    }

    // 2. Radical / Square Root Component Hit-Test (\sqrt{x}, \sqrt[n]{x})
    const rootParent = target.closest("mjx-mroot") || target.closest("mjx-sqrt");
    if (rootParent && container.contains(rootParent)) {
      const allRoots = Array.from(container.querySelectorAll("mjx-mroot, mjx-sqrt")).filter(
        (el) => el.tagName === "MJX-MROOT" || !el.parentElement?.closest("mjx-mroot")
      );
      const rootIdx = allRoots.indexOf(rootParent);
      if (rootIdx >= 0) {
        const roots = collectRoots(ast);
        if (rootIdx < roots.length) {
          const rootSpan = roots[rootIdx];
          const isDegree = target.closest("mjx-root");
          if (isDegree && rootSpan.degreeStart !== undefined && rootSpan.degreeEnd !== undefined) {
            const leafInsideDegree = target.matches("mjx-mi, mjx-mn, mjx-mo, mjx-mtext")
              ? target
              : target.querySelector("mjx-mi, mjx-mn, mjx-mo, mjx-mtext");
            if (leafInsideDegree) {
              const leafText = getElementText(leafInsideDegree);
              const degLeaves = collectLeaves(ast, [], latex).filter(
                (l) => l.start >= rootSpan.degreeStart! && l.end <= rootSpan.degreeEnd!
              );
              const match = degLeaves.find((l) => isLeafTextMatch(leafText, l, latex));
              if (match) {
                return project(match.start, match.end, match.kind === "text" ? "text" : "leaf");
              }
            }
            return project(rootSpan.degreeStart + 1, rootSpan.degreeEnd - 1, "script");
          }
          const isBox = target.closest("mjx-box");
          if (isBox) {
            // Clicked inside the radicand content box
            return project(rootSpan.radicandStart, rootSpan.radicandEnd, "root");
          }
          // Clicked radical checkmark (mjx-surd) or radical bar
          return project(rootSpan.start, rootSpan.end, "root");
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
      const coords = getMtdCoordinates(mtdEl);
      if (coords) {
        const matrixGroups: GroupNode[] = [];
        const findMatrixGroups = (list: CSTNode[]) => {
          for (const n of list) {
            if (n.kind === "group" && (n.delimType === "matrix" || Boolean(n.grid))) {
              matrixGroups.push(n);
            }
            if (n.kind === "group") findMatrixGroups(n.children);
            else if (n.kind === "fraction") {
              findMatrixGroups(n.numerator);
              findMatrixGroups(n.denominator);
            }
          }
        };
        findMatrixGroups(ast);

        const tableEl = mtdEl.closest("mjx-mtable, mjx-table");
        const allTables = Array.from(container.querySelectorAll("mjx-mtable, mjx-table"));
        const tableIdx = tableEl ? allTables.indexOf(tableEl) : 0;
        const targetGroup = matrixGroups[Math.max(0, tableIdx)] || matrixGroups[0];
        if (targetGroup?.grid) {
          const cell = targetGroup.grid.cells[coords.row]?.[coords.col];
          if (cell) {
            return project(cell.start, cell.end, "matrix_cell");
          }
        }
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
          const frac = fracs[fracIdx];
          const span = getNodeListSpan(frac.numerator);
          if (span) {
            return project(span.start, span.end, "numerator");
          } else if (frac.numRange) {
            return project(frac.numRange.start, frac.numRange.end, "numerator");
          }
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
          const frac = fracs[fracIdx];
          const span = getNodeListSpan(frac.denominator);
          if (span) {
            return project(span.start, span.end, "denominator");
          } else if (frac.denRange) {
            return project(frac.denRange.start, frac.denRange.end, "denominator");
          }
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
          return project(fracs[fracIdx].start, fracs[fracIdx].end, "fraction");
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
            if (span) {
              return project(span.start, span.end, "script");
            } else if (matched[parentIdx].argRange) {
              return project(matched[parentIdx].argRange.start, matched[parentIdx].argRange.end, "script");
            }
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
          if (span) {
            return project(span.start, span.end, "script");
          } else if (scripts[scriptIdx].argRange) {
            return project(scripts[scriptIdx].argRange.start, scripts[scriptIdx].argRange.end, "script");
          }
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
            if (span) return project(span.start, span.end, "script");
          }
          const isBase = target.closest("mjx-base");
          if (isBase) {
            const span = getNodeListSpan(uo.base);
            if (span) return project(span.start, span.end, "leaf");
          }
          return project(uo.start, uo.end, "underover");
        }
      }
    }

    return null;
  } catch (err) {
    console.debug("Color Math: resolveOnDemandRange non-fatal resolution error:", err);
    return null;
  }
}
