// src/parsers/cst/collector.ts
//! Tree-sitter style priority-cascade span collector for CST nodes.
//! Traverses CST, queries 14 discipline rules, and emits atomic non-overlapping ColorSpans.

import { CSTNode, CSTCollectorOptions } from "./types";
import { ColorSpan } from "../../utils/spans";
import { RAINBOW_DELIMITER_COLORS } from "../../config";

import { matchCalculusRules } from "./rules/calculus";
import { matchComplexRules } from "./rules/complex";
import { matchContinuumRules } from "./rules/continuum";
import { matchDynamicsRules } from "./rules/dynamics";
import { matchOptimizationRules } from "./rules/optimization";
import { matchGeometryRules } from "./rules/geometry";
import { matchTopologyRules } from "./rules/topology";
import { matchLinearAlgebraRules } from "./rules/linear_algebra";
import { matchAbstractAlgebraRules } from "./rules/abstract_algebra";
import { matchNumberTheoryRules } from "./rules/number_theory";
import { matchLogicRules } from "./rules/logic";
import { matchQuantumRules } from "./rules/quantum";
import { matchProbabilityRules } from "./rules/probability";
import { matchStochasticRules } from "./rules/stochastic";

export function collectSpansFromCST(
  nodes: CSTNode[],
  options?: CSTCollectorOptions
): ColorSpan[] {
  const spans: ColorSpan[] = [];
  const rainbowColors = options?.rainbowColors || RAINBOW_DELIMITER_COLORS;
  const errorColor = options?.errorColor || "#f7768e";
  const forLatexWrap = options?.forLatexWrap ?? false;
  const highlightUnmatched = options?.highlightUnmatched ?? true;
  const strict = options?.strictBracketWarnings === true;
  const palette = options?.palette;

  function walk(node: CSTNode): void {
    switch (node.kind) {
      case "boundary": {
        const r = matchContinuumRules(node, options);
        if (r) spans.push(...r);
        break;
      }

      case "command": {
        // Query discipline rules in cascade order
        const r =
          matchOptimizationRules(node, options) ||
          matchTopologyRules(node, options) ||
          matchDynamicsRules(node, options) ||
          matchNumberTheoryRules(node, options) ||
          matchProbabilityRules(node, options) ||
          matchComplexRules(node, options) ||
          matchGeometryRules(node, options);
        if (r) spans.push(...r);
        break;
      }

      case "group": {
        const isBare = node.delimType === "bare_brace";
        const color = rainbowColors[node.depth % rainbowColors.length];

        const sanitizeGroupSpansForLatex = (
          ruleSpans: ColorSpan[] | null
        ): ColorSpan[] | null => {
          if (!ruleSpans || !forLatexWrap || !node.isLeftRight || node.closeEnd === undefined) {
            return ruleSpans;
          }
          const hasOpen = ruleSpans.some((s) => s.start === node.openStart && s.end === node.openEnd);
          const hasClose = ruleSpans.some((s) => s.start === node.closeStart && s.end === node.closeEnd);
          if (hasOpen || hasClose) {
            const delimSpan = ruleSpans.find(
              (s) => (s.start === node.openStart && s.end === node.openEnd) ||
                     (s.start === node.closeStart && s.end === node.closeEnd)
            )!;
            const nonDelimSpans = ruleSpans.filter(
              (s) => !(s.start === node.openStart && s.end === node.openEnd) &&
                     !(s.start === node.closeStart && s.end === node.closeEnd)
            );
            return [
              {
                start: node.openStart,
                end: node.closeEnd,
                color: delimSpan.color,
                priority: delimSpan.priority,
              },
              ...nonDelimSpans,
            ];
          }
          return ruleSpans;
        };

        const handleGroupRule = (ruleResult: ColorSpan[] | null): boolean => {
          if (!ruleResult) return false;
          const safe = sanitizeGroupSpansForLatex(ruleResult);
          if (safe) spans.push(...safe);
          for (const child of node.children) walk(child);
          return true;
        };

        // 1. Check domain-specific group rules
        if (node.isKet || node.isBra || node.isBraKet) {
          if (handleGroupRule(matchQuantumRules(node, options))) break;
        }

        if (node.isMatrixDeterminant) {
          if (handleGroupRule(matchLinearAlgebraRules(node, options))) break;
        }

        if (node.isLegendreSymbol) {
          if (handleGroupRule(matchNumberTheoryRules(node, options))) break;
        }

        if (node.isSubgroupIndex) {
          if (handleGroupRule(matchAbstractAlgebraRules(node, options))) break;
        }

        if (node.isQuantumCommutator) {
          if (handleGroupRule(matchQuantumRules(node, options))) break;
        }

        if (node.isAnticommutator) {
          if (handleGroupRule(matchQuantumRules(node, options))) break;
        }

        if (node.isStochasticVariation) {
          if (handleGroupRule(matchStochasticRules(node, options))) break;
        }

        if (node.isPadicNorm) {
          if (handleGroupRule(matchNumberTheoryRules(node, options))) break;
        }

        if (node.isPoissonBracket) {
          if (handleGroupRule(matchDynamicsRules(node, options))) break;
        }

        if (node.isRegularizationNorm) {
          if (handleGroupRule(matchOptimizationRules(node, options))) break;
        }

        if (node.isMatrixNorm) {
          if (handleGroupRule(matchLinearAlgebraRules(node, options))) break;
        }

        if (node.isConvectiveAdvection) {
          const r = matchContinuumRules(node, options);
          if (r) spans.push(...r);
          break;
        }

        if (node.isInterfaceJump || node.isInterfaceAverage) {
          if (handleGroupRule(matchContinuumRules(node, options))) break;
        }

        // 2. Open delimiter / Whole \left...\right wrap for LaTeX
        if (node.isSyntaxError && highlightUnmatched && !forLatexWrap) {
          spans.push({
            start: node.openStart,
            end: node.openEnd,
            color: errorColor,
            priority: 99,
          });
        } else if (forLatexWrap && node.isLeftRight && node.closeEnd !== undefined) {
          if (node.isEvaluationBar) {
            const evalColor = palette?.derivative || "#bb9af7";
            spans.push({
              start: node.openStart,
              end: node.closeEnd,
              color: evalColor,
              priority: 24,
            });
            if (node.evaluationLimits) {
              for (const limit of node.evaluationLimits) {
                spans.push({
                  start: limit.start,
                  end: limit.end,
                  color: evalColor,
                  priority: 26,
                });
              }
            }
          } else {
            spans.push({
              start: node.openStart,
              end: node.closeEnd,
              color,
              priority: 24,
            });
          }
          // Walk interior children (their higher priority spans nest inside)
          for (const child of node.children) {
            walk(child);
          }
          break;
        } else if (!forLatexWrap || !isBare) {
          if (node.openEnd > node.openStart) {
            spans.push({
              start: node.openStart,
              end: node.openEnd,
              color,
              priority: 25,
            });
          }
        }

        // 3. Walk interior children
        for (const child of node.children) {
          walk(child);
        }

        // 4. Close delimiter & Evaluation Bars
        if (node.closeStart !== undefined && node.closeEnd !== undefined) {
          if (node.isEvaluationBar) {
            const evalColor = palette?.derivative || "#bb9af7";
            spans.push({
              start: node.closeStart,
              end: node.closeEnd,
              color: evalColor,
              priority: 26,
            });
            if (node.evaluationLimits) {
              for (const limit of node.evaluationLimits) {
                spans.push({
                  start: limit.start,
                  end: limit.end,
                  color: evalColor,
                  priority: 26,
                });
              }
            }
          } else if (!forLatexWrap || !isBare) {
            spans.push({
              start: node.closeStart,
              end: node.closeEnd,
              color,
              priority: 25,
            });
          }
        } else if (strict && highlightUnmatched && node.openEnd > node.openStart && !node.isSyntaxError && !forLatexWrap) {
          spans.push({
            start: node.openStart,
            end: node.openEnd,
            color: errorColor,
            priority: 99,
          });
        }
        break;
      }

      case "fraction": {
        const wirtinger = matchComplexRules(node, options);
        if (wirtinger) spans.push(...wirtinger);
        const legendre = matchNumberTheoryRules(node, options);
        if (legendre) spans.push(...legendre);

        for (const num of node.numerator) walk(num);
        for (const den of node.denominator) walk(den);
        break;
      }

      case "script": {
        const ruleSpans =
          matchCalculusRules(node, options) ||
          matchLinearAlgebraRules(node, options) ||
          matchQuantumRules(node, options) ||
          matchStochasticRules(node, options) ||
          matchGeometryRules(node, options) ||
          matchDynamicsRules(node, options) ||
          matchOptimizationRules(node, options) ||
          matchComplexRules(node, options) ||
          matchTopologyRules(node, options);

        if (ruleSpans) {
          spans.push(...ruleSpans);
        } else {
          for (const child of node.arg) walk(child);
        }
        break;
      }

      case "identifier": {
        const idSpans =
          matchComplexRules(node, options) ||
          matchContinuumRules(node, options) ||
          matchOptimizationRules(node, options) ||
          matchNumberTheoryRules(node, options) ||
          matchStochasticRules(node, options);
        if (idSpans) spans.push(...idSpans);
        break;
      }

      case "operator": {
        const opSpans =
          matchComplexRules(node, options) ||
          matchContinuumRules(node, options) ||
          matchStochasticRules(node, options) ||
          matchLinearAlgebraRules(node, options) ||
          matchAbstractAlgebraRules(node, options) ||
          matchLogicRules(node, options) ||
          matchNumberTheoryRules(node, options) ||
          matchProbabilityRules(node, options) ||
          matchGeometryRules(node, options) ||
          matchTopologyRules(node, options);
        if (opSpans) spans.push(...opSpans);
        break;
      }

      default:
        break;
    }
  }

  for (const node of nodes) {
    walk(node);
  }

  return spans.sort((a, b) => a.start - b.start);
}
