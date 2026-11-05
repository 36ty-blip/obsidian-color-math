// src/parsers/cst/rules/quantum.ts
//! Super-Family 6, Discipline 6.1: Quantum Mechanics.
//! Dirac Bra-Ket Ecosystem, Commutators, Anticommutators, Ladder Operators, Pauli Matrices.

import { CSTNode, CSTCollectorOptions } from "../types";
import { ColorSpan } from "../../../utils/spans";

export function matchQuantumRules(node: CSTNode, options?: CSTCollectorOptions): ColorSpan[] | null {
  const palette = options?.palette;

  // 6.1 Dirac Bra-Ket Ecosystem: |\psi\rangle, \langle\phi|, \langle\phi|\psi\rangle -> palette.energyOperator (cyan)
  if (node.kind === "group" && (node.isKet || node.isBra || node.isBraKet)) {
    const spans: ColorSpan[] = [];
    const diracColor = palette?.energyOperator || "#2ac3de";
    spans.push({
      start: node.openStart,
      end: node.openEnd,
      color: diracColor,
      priority: 27,
    });
    if (node.closeStart !== undefined && node.closeEnd !== undefined) {
      spans.push({
        start: node.closeStart,
        end: node.closeEnd,
        color: diracColor,
        priority: 27,
      });
    }
    return spans;
  }

  // 6.1 Quantum Commutator: [\hat{x}, \hat{p}] -> palette.main (blue)
  if (node.kind === "group" && node.isQuantumCommutator) {
    const spans: ColorSpan[] = [];
    const commColor = palette?.main || "#7aa2f7";
    spans.push({
      start: node.openStart,
      end: node.openEnd,
      color: commColor,
      priority: 26,
    });
    if (node.closeStart !== undefined && node.closeEnd !== undefined) {
      spans.push({
        start: node.closeStart,
        end: node.closeEnd,
        color: commColor,
        priority: 26,
      });
    }
    return spans;
  }

  // 6.1 Quantum Anticommutator: \{\hat{A}, \hat{B}\} -> palette.orange (amber)
  if (node.kind === "group" && node.isAnticommutator) {
    const spans: ColorSpan[] = [];
    const aColor = palette?.orange || "#e0af68";
    spans.push({
      start: node.openStart,
      end: node.openEnd,
      color: aColor,
      priority: 26,
    });
    if (node.closeStart !== undefined && node.closeEnd !== undefined) {
      spans.push({
        start: node.closeStart,
        end: node.closeEnd,
        color: aColor,
        priority: 26,
      });
    }
    return spans;
  }

  // 6.1 Ladder Operator: \hat{a}^\dagger, \hat{c}_k^\dagger -> palette.orange
  if (node.kind === "script" && node.isLadderOperator) {
    const start = options?.forLatexWrap
      ? node.base
        ? node.base.start
        : node.arg.length > 0
        ? node.arg[0].start
        : node.start + 1
      : node.start;
    return [
      {
        start,
        end: node.end,
        color: palette?.orange || "#e0af68",
        priority: 26,
      },
    ];
  }

  // 6.1 Pauli Spin Matrix: \sigma_x -> palette.energyOperator
  if (node.kind === "script" && node.isPauliMatrix) {
    const start = options?.forLatexWrap
      ? node.base
        ? node.base.start
        : node.arg.length > 0
        ? node.arg[0].start
        : node.start + 1
      : node.start;
    return [
      {
        start,
        end: node.end,
        color: palette?.energyOperator || "#2ac3de",
        priority: 26,
      },
    ];
  }

  return null;
}
