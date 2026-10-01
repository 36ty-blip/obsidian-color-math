// src/parsers/cst/rules/calculus.ts
//! Super-Family 1, Discipline 1.1: Calculus Foundations.
//! Intervals, Evaluation Bars, and Higher-Order Derivatives.

import { CSTNode, CSTCollectorOptions } from "../types";
import { ColorSpan } from "../../../utils/spans";

export function matchCalculusRules(node: CSTNode, options?: CSTCollectorOptions): ColorSpan[] | null {
  const palette = options?.palette;

  // 1.1 Half-Open Intervals: [a, b) and (a, b] -> palette.chain (Tokyo Green #9ece6a)
  if (node.kind === "group" && node.isHalfOpenInterval) {
    const spans: ColorSpan[] = [];
    const intColor = palette?.chain || "#9ece6a";
    spans.push({
      start: node.openStart,
      end: node.openEnd,
      color: intColor,
      priority: 26,
    });
    if (node.closeStart !== undefined && node.closeEnd !== undefined) {
      spans.push({
        start: node.closeStart,
        end: node.closeEnd,
        color: intColor,
        priority: 26,
      });
    }
    return spans;
  }

  // 1.1 Evaluation Bars: [F(x)]_a^b or \left. \frac{df}{dx} \right|_{x=0}
  if (node.kind === "group" && node.isEvaluationBar) {
    const spans: ColorSpan[] = [];
    const evalColor = palette?.derivative || "#bb9af7";
    if (node.closeStart !== undefined && node.closeEnd !== undefined) {
      spans.push({
        start: node.closeStart,
        end: node.closeEnd,
        color: evalColor,
        priority: 26,
      });
    }
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
    return spans;
  }

  // 1.1 Higher-Order Derivatives: f^{(n)}(x) or f''(x) -> palette.derivative (Tokyo Purple #bb9af7)
  if (node.kind === "script" && node.scriptType === "superscript" && node.isHigherOrderDerivative) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.derivative || "#bb9af7",
        priority: 26,
      },
    ];
  }

  return null;
}
