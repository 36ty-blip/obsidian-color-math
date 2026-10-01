// src/parsers/cst/rules/topology.ts
//! Super-Family 4, Discipline 4.2: Algebraic Topology.
//! Nilpotent Chain Boundaries, Connected Sums, Cup/Cap Products, Topological Invariants.

import { CSTNode, CSTCollectorOptions } from "../types";
import { ColorSpan } from "../../../utils/spans";

export function matchTopologyRules(node: CSTNode, options?: CSTCollectorOptions): ColorSpan[] | null {
  const palette = options?.palette;

  // 4.2 Nilpotent Chain Boundary Operator: \partial_n : C_n \to C_{n-1} -> palette.chain (green)
  if (node.kind === "command" && node.isChainBoundary) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.chain || "#9ece6a",
        priority: 26,
      },
    ];
  }

  // 4.2 Connected Sum Topological Operator: \# -> palette.arrow (coral)
  if (node.kind === "operator" && node.operatorType === "connected_sum") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.arrow || "#f7768e",
        priority: 26,
      },
    ];
  }

  // 4.2 Cup and Cap Topological Products: \smile, \frown -> palette.main (blue)
  if (node.kind === "operator" && node.operatorType === "cup_cap") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.main || "#7aa2f7",
        priority: 26,
      },
    ];
  }

  // 4.2 Euler Characteristic Command: \chi(M) -> palette.orange (amber)
  if (node.kind === "command" && node.isEulerChar) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.orange || "#e0af68",
        priority: 26,
      },
    ];
  }

  // 4.2 Topological Invariants: \chi, \pi_1, b_i -> palette.orange (amber)
  if (node.kind === "identifier" && node.isTopologicalInvariant) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.orange || "#e0af68",
        priority: 26,
      },
    ];
  }

  return null;
}
