// src/parsers/cst/rules/optimization.ts
//! Super-Family 3, Discipline 3.2: Optimization & Variational Analysis.
//! Subdifferentials, Fenchel Duals, KKT Multipliers, Proximal Operators, Regularization Norms.

import { CSTNode, CSTCollectorOptions } from "../types";
import { ColorSpan } from "../../../utils/spans";

export function matchOptimizationRules(node: CSTNode, options?: CSTCollectorOptions): ColorSpan[] | null {
  const palette = options?.palette;

  // 3.2 Subdifferential Set Operator: \partial f -> palette.arrow (Tokyo Coral #f7768e)
  if (node.kind === "command" && node.isSubdifferential) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.arrow || "#f7768e",
        priority: 26,
      },
    ];
  }

  // 3.2 Fenchel Conjugate Dual: f^*(y) -> palette.orange (amber)
  if (node.kind === "script" && node.isFenchelDual) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.orange || "#e0af68",
        priority: 26,
      },
    ];
  }

  // 3.2 Optimal Minimizer: x^*, p^* -> palette.parameter
  if (node.kind === "script" && node.isOptimalMinimizer) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.parameter || "#ff9e64",
        priority: 26,
      },
    ];
  }

  // 3.2 KKT Multipliers: \lambda_i, \nu_j -> palette.parameter
  if (node.kind === "identifier" && node.isKktMultiplier) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.parameter || "#ff9e64",
        priority: 26,
      },
    ];
  }

  // 3.2 Proximal Operator: \operatorname{prox} -> palette.main (blue)
  if (node.kind === "command" && node.isProximal) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.main || "#7aa2f7",
        priority: 26,
      },
    ];
  }

  // 3.2 Regularization Norms: \|\mathbf{w}\|_1, \|\mathbf{w}\|_2, \|\mathbf{w}\|_0 -> palette.set (cyan)
  if (node.kind === "group" && node.isRegularizationNorm) {
    const spans: ColorSpan[] = [];
    const normColor = palette?.set || "#7dcfff";
    spans.push({
      start: node.openStart,
      end: node.openEnd,
      color: normColor,
      priority: 26,
    });
    if (node.closeStart !== undefined && node.closeEnd !== undefined) {
      spans.push({
        start: node.closeStart,
        end: node.closeEnd,
        color: normColor,
        priority: 26,
      });
    }
    if (node.normLimits) {
      for (const limit of node.normLimits) {
        spans.push({
          start: limit.start,
          end: limit.end,
          color: normColor,
          priority: 26,
        });
      }
    }
    return spans;
  }

  return null;
}
