// src/parsers/cst/rules/complex.ts
//! Super-Family 1, Discipline 1.2: Complex Analysis.
//! Wirtinger derivatives, Residues, Singularity Poles, Conjugates, Imaginary Unit, Principal Values.

import { CSTNode, CSTCollectorOptions } from "../types";
import { ColorSpan } from "../../../utils/spans";

export function matchComplexRules(node: CSTNode, options?: CSTCollectorOptions): ColorSpan[] | null {
  const palette = options?.palette;

  // 1.2 Wirtinger Differentials: \frac{\partial f}{\partial z}
  if (node.kind === "fraction" && node.isWirtinger) {
    const wirtingerColor = palette?.main || "#7aa2f7";
    return [
      {
        start: node.start,
        end: node.end,
        color: wirtingerColor,
        priority: 28,
      },
    ];
  }

  // 1.2 Residue Operator: \operatorname{Res} or \Res -> palette.orange
  if (
    (node.kind === "operator" && (node.text === "\\operatorname{Res}" || node.text === "\\Res")) ||
    (node.kind === "command" && (node.name === "\\operatorname{Res}" || node.name === "\\Res"))
  ) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.orange || "#e0af68",
        priority: 26,
      },
    ];
  }

  // 1.2 Singularity Poles: z_0 in \operatorname{Res}(f, z_0)
  if ((node.kind === "identifier" || node.kind === "script") && node.isSingularityPole) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.parameter || palette?.orange || "#ff9e64",
        priority: 26,
      },
    ];
  }

  // 1.2 Complex Conjugates: \bar{z}, \overline{z}, z^* -> Tokyo Sky Cyan
  if ((node.kind === "identifier" || node.kind === "script") && node.isConjugate) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.set || "#7dcfff",
        priority: 25,
      },
    ];
  }

  // 1.2 Cauchy Principal Value: P.V. \int -> cyan operator
  if (node.kind === "operator" && node.operatorType === "principal_value") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.energyOperator || "#2ac3de",
        priority: 28,
      },
    ];
  }

  // 1.2 Imaginary unit i or j -> palette.parameter
  if (node.kind === "identifier" && node.isImaginaryUnit) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.parameter || palette?.orange || "#ff9e64",
        priority: 26,
      },
    ];
  }

  return null;
}
