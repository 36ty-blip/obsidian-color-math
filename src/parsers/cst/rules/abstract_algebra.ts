// src/parsers/cst/rules/abstract_algebra.ts
//! Super-Family 5, Discipline 5.2: Abstract Algebra.
//! Subgroup Indices, Normal Subgroup Relations, Injective/Surjective Morphisms.

import { CSTNode, CSTCollectorOptions } from "../types";
import { ColorSpan } from "../../../utils/spans";

export function matchAbstractAlgebraRules(node: CSTNode, options?: CSTCollectorOptions): ColorSpan[] | null {
  const palette = options?.palette;

  // 5.2 Subgroup Index Delimiters: [G : H], [L : K] -> palette.orange (amber)
  if (node.kind === "group" && node.isSubgroupIndex) {
    const spans: ColorSpan[] = [];
    const indexColor = palette?.orange || "#e0af68";
    spans.push({
      start: node.openStart,
      end: node.openEnd,
      color: indexColor,
      priority: 26,
    });
    if (node.closeStart !== undefined && node.closeEnd !== undefined) {
      spans.push({
        start: node.closeStart,
        end: node.closeEnd,
        color: indexColor,
        priority: 26,
      });
    }
    return spans;
  }

  // 5.2 Normal Subgroups: \triangleleft, \triangleright, \trianglelefteq, \trianglerighteq -> palette.arrow (coral)
  if (node.kind === "operator" && node.operatorType === "subgroup") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.arrow || "#f7768e",
        priority: 26,
      },
    ];
  }

  // 5.2 Algebraic Morphisms: \hookrightarrow, \twoheadrightarrow -> palette.arrow (coral)
  if (node.kind === "operator" && node.operatorType === "morphism") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.arrow || "#f7768e",
        priority: 26,
      },
    ];
  }

  return null;
}
