// src/parsers/cst/rules/number_theory.ts
//! Super-Family 5, Discipline 5.3: Number Theory & Arithmetic.
//! Legendre Symbols, Modular Congruences, p-Adic Norms, Divisibility Relations, Arithmetic Functions.

import { CSTNode, CSTCollectorOptions } from "../types";
import { ColorSpan } from "../../../utils/spans";

export function matchNumberTheoryRules(node: CSTNode, options?: CSTCollectorOptions): ColorSpan[] | null {
  const palette = options?.palette;

  // 5.3 Legendre Symbol Delimiters: (\frac{a}{p}) -> palette.energyOperator (cyan)
  if (node.kind === "group" && node.isLegendreSymbol) {
    const spans: ColorSpan[] = [];
    const legColor = palette?.energyOperator || "#2ac3de";
    spans.push({
      start: node.openStart,
      end: node.openEnd,
      color: legColor,
      priority: 27,
    });
    if (node.closeStart !== undefined && node.closeEnd !== undefined) {
      spans.push({
        start: node.closeStart,
        end: node.closeEnd,
        color: legColor,
        priority: 27,
      });
    }
    return spans;
  }

  // 5.3 Legendre Symbol Fraction Body: \frac{a}{p} inside Legendre -> palette.energyOperator
  if (node.kind === "fraction" && node.isLegendreSymbol) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.energyOperator || "#2ac3de",
        priority: 27,
      },
    ];
  }

  // 5.3 Modular Congruence Modulus: \pmod{m}, \mod{m} -> palette.orange (amber)
  if (node.kind === "command" && node.isModulus) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.orange || "#e0af68",
        priority: 26,
      },
    ];
  }

  // 5.3 p-Adic Norm: |x|_p -> palette.set (cyan)
  if (node.kind === "group" && node.isPadicNorm) {
    const spans: ColorSpan[] = [];
    const padicColor = palette?.set || "#7dcfff";
    spans.push({
      start: node.openStart,
      end: node.openEnd,
      color: padicColor,
      priority: 26,
    });
    if (node.closeStart !== undefined && node.closeEnd !== undefined) {
      spans.push({
        start: node.closeStart,
        end: node.closeEnd,
        color: padicColor,
        priority: 26,
      });
    }
    return spans;
  }

  // 5.3 Divisibility Relations: \mid, \nmid -> palette.arrow (coral)
  if (node.kind === "operator" && node.operatorType === "divisibility") {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.arrow || "#f7768e",
        priority: 26,
      },
    ];
  }

  // 5.3 Arithmetic Functions: \phi(n), \mu(n) -> palette.parameter
  if (node.kind === "identifier" && node.isArithmeticFunction) {
    return [
      {
        start: node.start,
        end: node.end,
        color: palette?.parameter || "#ff9e64",
        priority: 26,
      },
    ];
  }

  return null;
}
