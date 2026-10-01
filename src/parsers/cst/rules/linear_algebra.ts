// src/parsers/cst/rules/linear_algebra.ts
//! Super-Family 5, Discipline 5.1: Linear & Multilinear Algebra.
//! Matrix Determinants, Matrix Transformations, Matrix Norms, Tensor Products (Kronecker & Hadamard).

import { CSTNode, CSTCollectorOptions } from "../types";
import { ColorSpan } from "../../../utils/spans";

export function matchLinearAlgebraRules(node: CSTNode, options?: CSTCollectorOptions): ColorSpan[] | null {
  const palette = options?.palette;

  // 5.1 Matrix Determinants: |A|, |M|, |B|, |G| -> palette.energyOperator (cyan)
  if (node.kind === "group" && node.isMatrixDeterminant) {
    const spans: ColorSpan[] = [];
    const detColor = palette?.energyOperator || "#2ac3de";
    spans.push({
      start: node.openStart,
      end: node.openEnd,
      color: detColor,
      priority: 26,
    });
    if (node.closeStart !== undefined && node.closeEnd !== undefined) {
      spans.push({
        start: node.closeStart,
        end: node.closeEnd,
        color: detColor,
        priority: 26,
      });
    }
    return spans;
  }

  // 5.1 Matrix Transformation: \mathbf{A}^T, A^T, \mathbf{A}^* -> palette.orange
  if (node.kind === "script" && node.isMatrixTransformation) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.orange || "#e0af68",
        priority: 26,
      },
    ];
  }

  // 5.1 Matrix Norms: \|A\|_F, \|A\|_2, \|A\|_* -> palette.set (cyan)
  if (node.kind === "group" && node.isMatrixNorm) {
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

  // 5.1 Kronecker Product: \mathbf{A} \otimes \mathbf{B} -> palette.orange
  if (node.kind === "operator" && node.operatorType === "kronecker") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.orange || "#e0af68",
        priority: 26,
      },
    ];
  }

  // 5.1 Hadamard Product: \mathbf{A} \odot \mathbf{B} -> palette.main
  if (node.kind === "operator" && node.operatorType === "hadamard") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.main || "#7aa2f7",
        priority: 26,
      },
    ];
  }

  return null;
}
