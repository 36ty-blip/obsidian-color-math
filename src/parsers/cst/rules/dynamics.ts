// src/parsers/cst/rules/dynamics.ts
//! Super-Family 3, Discipline 3.1: Dynamical Systems.
//! Symplectic Poisson Brackets, Flow Evolution, Invariant Manifolds, Wronskian Determinants.

import { CSTNode, CSTCollectorOptions } from "../types";
import { ColorSpan } from "../../../utils/spans";

export function matchDynamicsRules(node: CSTNode, options?: CSTCollectorOptions): ColorSpan[] | null {
  const palette = options?.palette;

  // 3.1 Symplectic Poisson Bracket: \{q_i, H\} -> palette.orange (amber)
  if (node.kind === "group" && node.isPoissonBracket) {
    const spans: ColorSpan[] = [];
    const pbColor = palette?.orange || "#e0af68";
    spans.push({
      start: node.openStart,
      end: node.openEnd,
      color: pbColor,
      priority: 26,
    });
    if (node.closeStart !== undefined && node.closeEnd !== undefined) {
      spans.push({
        start: node.closeStart,
        end: node.closeEnd,
        color: pbColor,
        priority: 26,
      });
    }
    return spans;
  }

  // 3.1 Flow Evolution Operator: \Phi^t(x_0) -> palette.parameter
  if (node.kind === "script" && node.isFlowEvolution) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.parameter || "#ff9e64",
        priority: 26,
      },
    ];
  }

  // 3.1 Invariant Manifolds: W^s, W^u, W^c -> palette.chain (green)
  if (node.kind === "script" && node.isInvariantManifold) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.chain || "#9ece6a",
        priority: 26,
      },
    ];
  }

  // 3.1 Wronskian Determinant: W(y_1, y_2) -> palette.energyOperator (cyan)
  if (node.kind === "command" && node.isWronskian) {
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
