// src/parsers/cst/rules/geometry.ts
//! Super-Family 4, Discipline 4.1: Differential Geometry & Tensor Calculus.
//! Contravariant Indices, Comma/Semicolon Index Differentiation, Musical Isomorphisms, Exterior Calculus.

import { CSTNode, CSTCollectorOptions } from "../types";
import { ColorSpan } from "../../../utils/spans";

export function matchGeometryRules(node: CSTNode, options?: CSTCollectorOptions): ColorSpan[] | null {
  const palette = options?.palette;

  // 4.1 Contravariant Upper Tensor Index: T^{\mu\nu}, V^\mu -> palette.arrow (coral)
  if (node.kind === "script" && node.scriptType === "superscript" && node.isContravariantTensorIndex) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.arrow || "#f7768e",
        priority: 26,
      },
    ];
  }

  // 4.1 Covariant Index Differentiation: A_{\mu;\nu} -> palette.orange
  if (node.kind === "script" && node.isIndexCovariantDerivative) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.orange || "#e0af68",
        priority: 26,
      },
    ];
  }

  // 4.1 Partial Index Differentiation: A_{\mu,\nu} -> palette.derivative
  if (node.kind === "script" && node.isIndexPartialDerivative) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.derivative || "#bb9af7",
        priority: 26,
      },
    ];
  }

  // 4.1 Musical Isomorphism: X^\flat, \omega^\sharp -> palette.chain (green)
  if (node.kind === "script" && node.isMusicalIsomorphism) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.chain || "#9ece6a",
        priority: 26,
      },
    ];
  }

  // 4.1 Exterior wedge product: \wedge -> palette.main (blue)
  if (node.kind === "operator" && node.operatorType === "wedge") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.main || "#7aa2f7",
        priority: 26,
      },
    ];
  }

  // 4.1 Hodge star dual: \star -> palette.arrow (coral)
  if (node.kind === "operator" && node.operatorType === "hodge_star") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.arrow || "#f7768e",
        priority: 26,
      },
    ];
  }

  // 4.1 Covariant connection: \nabla -> palette.derivative
  if (node.kind === "operator" && node.operatorType === "covariant_connection") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.derivative || "#bb9af7",
        priority: 26,
      },
    ];
  }

  // 4.1 Interior contraction: \iota_X -> palette.energyOperator (cyan)
  if (node.kind === "operator" && node.operatorType === "interior_contraction") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.energyOperator || "#2ac3de",
        priority: 26,
      },
    ];
  }

  // 4.1 Lie derivative: \mathcal{L}_X -> palette.energyOperator (cyan)
  if (node.kind === "operator" && node.operatorType === "lie_derivative") {
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
