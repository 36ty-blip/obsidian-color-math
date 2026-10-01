// src/parsers/cst/rules/stochastic.ts
//! Super-Family 6, Discipline 6.3: Stochastic Calculus.
//! Wiener Processes, Stratonovich Differentials, Quadratic Variations.

import { CSTNode, CSTCollectorOptions } from "../types";
import { ColorSpan } from "../../../utils/spans";

export function matchStochasticRules(node: CSTNode, options?: CSTCollectorOptions): ColorSpan[] | null {
  const palette = options?.palette;

  // 6.3 Stochastic Differentials: dW_t, dB_t, dW(t) -> palette.parameter (orange)
  if (node.kind === "identifier" && node.isStochasticDifferential) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.parameter || "#ff9e64",
        priority: 27,
      },
    ];
  }

  // 6.3 Stratonovich Circ Operator: \circ dW_t -> palette.energyOperator (cyan)
  if (node.kind === "operator" && node.operatorType === "stratonovich") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.energyOperator || "#2ac3de",
        priority: 27,
      },
    ];
  }

  // 6.3 Stochastic Quadratic Variations: [X]_t, \langle M \rangle_t -> palette.energyOperator (cyan)
  if (node.kind === "group" && node.isStochasticVariation) {
    const spans: ColorSpan[] = [];
    const stochColor = palette?.energyOperator || "#2ac3de";
    spans.push({
      start: node.openStart,
      end: node.openEnd,
      color: stochColor,
      priority: 26,
    });
    if (node.closeStart !== undefined && node.closeEnd !== undefined) {
      spans.push({
        start: node.closeStart,
        end: node.closeEnd,
        color: stochColor,
        priority: 26,
      });
    }
    return spans;
  }

  // 6.3 Trailing Time Index in Quadratic Variation: [X]_t
  if (node.kind === "script" && node.isStochasticVariation) {
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
