// src/parsers/cst/rules/continuum.ts
//! Super-Family 2, Discipline 2.1 & 2.2: Continuum Mechanics & Transport.
//! Domain Boundaries, Interface Jumps/Averages, Convective Advection, Wave D'Alembertian, Contraction, Dimensionless.

import { CSTNode, CSTCollectorOptions } from "../types";
import { ColorSpan } from "../../../utils/spans";

export function matchContinuumRules(node: CSTNode, options?: CSTCollectorOptions): ColorSpan[] | null {
  const palette = options?.palette;

  // 0.4 & 2.1 Domain Boundary Surface Manifold: \partial\Omega, \partial V -> operator in palette.chain (green)
  if (node.kind === "boundary") {
    const opLen = node.operatorText.length;
    return [
      {
        start: node.start,
        end: node.start + opLen,
        color: palette?.chain || "#9ece6a",
        priority: 25,
      },
    ];
  }

  // 2.1 Interface jumps [[u]] and averages {{u}} -> palette.bracket / cyan (palette.set)
  if (node.kind === "group" && (node.isInterfaceJump || node.isInterfaceAverage)) {
    const spans: ColorSpan[] = [];
    const jumpColor = palette?.set || "#7dcfff";
    spans.push({
      start: node.openStart,
      end: node.openEnd,
      color: jumpColor,
      priority: 26,
    });
    if (node.closeStart !== undefined && node.closeEnd !== undefined) {
      spans.push({
        start: node.closeStart,
        end: node.closeEnd,
        color: jumpColor,
        priority: 26,
      });
    }
    return spans;
  }

  // 2.1 Convective nonlinear derivative: (\mathbf{u} \cdot \nabla)\mathbf{u} -> palette.derivative
  if (node.kind === "group" && node.isConvectiveAdvection) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.derivative || "#bb9af7",
        priority: 27,
      },
    ];
  }

  // 2.2 Hyperbolic wave D'Alembertian: \Box -> energy operator
  if (node.kind === "operator" && node.operatorType === "wave") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.energyOperator || "#2ac3de",
        priority: 26,
      },
    ];
  }

  // 2.2 Frobenius tensor double contraction: \sigma : \varepsilon -> palette.main
  if (node.kind === "operator" && node.operatorType === "contraction") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.main || "#7aa2f7",
        priority: 26,
      },
    ];
  }

  // 2.1 Dimensionless constant: Re, Ma, Pr -> palette.parameter (orange)
  if (node.kind === "identifier" && node.isDimensionless) {
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
