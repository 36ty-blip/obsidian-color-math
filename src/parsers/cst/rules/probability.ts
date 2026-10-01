// src/parsers/cst/rules/probability.ts
//! Super-Family 6, Discipline 6.2: Probability Theory & Statistics.
//! Conditioning Bars, Probability & Expectation Operators.

import { CSTNode, CSTCollectorOptions } from "../types";
import { ColorSpan } from "../../../utils/spans";

export function matchProbabilityRules(node: CSTNode, options?: CSTCollectorOptions): ColorSpan[] | null {
  const palette = options?.palette;

  // 6.2 Conditioning Bars: P(A \mid B) or E[X | Y] -> palette.orange (amber)
  if (node.kind === "operator" && node.operatorType === "conditioning") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.orange || "#e0af68",
        priority: 26,
      },
    ];
  }

  // 6.2 Probability Operators: \mathbb{P}, \mathbb{E}, \operatorname{Var}, \operatorname{Cov} -> palette.energyOperator (cyan)
  if (node.kind === "command" && node.isProbabilityOperator) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.energyOperator || "#2ac3de",
        priority: 26,
      },
    ];
  }

  return null;
}
