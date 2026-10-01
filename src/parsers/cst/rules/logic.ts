// src/parsers/cst/rules/logic.ts
//! Super-Family 5, Discipline 5.4: Mathematical Logic & Set Theory.
//! Quantifiers, Turnstiles, Set Difference.

import { CSTNode, CSTCollectorOptions } from "../types";
import { ColorSpan } from "../../../utils/spans";

export function matchLogicRules(node: CSTNode, options?: CSTCollectorOptions): ColorSpan[] | null {
  const palette = options?.palette;

  // 5.4 Quantifiers: \forall, \exists, \nexists -> palette.main (blue)
  if (node.kind === "operator" && node.operatorType === "quantifier") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.main || "#7aa2f7",
        priority: 26,
      },
    ];
  }

  // 5.4 Turnstiles: \vdash, \models, \Vdash -> palette.orange (amber)
  if (node.kind === "operator" && node.operatorType === "turnstile") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.orange || "#e0af68",
        priority: 26,
      },
    ];
  }

  // 5.4 Set Difference: \setminus -> palette.set (cyan)
  if (node.kind === "operator" && node.operatorType === "set_diff") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.set || "#7dcfff",
        priority: 26,
      },
    ];
  }

  return null;
}
