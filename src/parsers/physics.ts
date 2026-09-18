// src/parsers/physics.ts

import { ColorPalette, ColorMathOptions, CUSTOM_QUANTUM_OPERATORS } from "../config";
import { ColorSpan } from "../utils/spans";

/**
 * Regex for quantum energy operator:
 * i\hbar\frac{\partial}{\partial t}, i\hbar\dfrac{\partial}{\partial t},
 * i\hbar\partial_t, \mathrm{i}\hbar\frac{\partial}{\partial t},
 * Unicode iℏ\frac{∂}{∂t}, iℏ∂_t, etc.
 */
const ENERGY_OPERATOR_REGEX =
  /(?:\\mathrm\{i\}|i)\s*(?:\\hbar|\\hslash|ℏ)\s*(?:\\(?:d|t)?frac\{\s*(?:\\partial|∂)\s*\}\{\s*(?:\\partial|∂)\s*t\s*\}|\\partial_\{?t\}?|∂_\{?t\}?)/g;

/**
 * Regex for quantum momentum operator:
 * -i\hbar\nabla, -i\hbar\vec{\nabla}, -i\hbar\frac{\partial}{\partial x},
 * -i\hbar\partial_x, and Unicode -iℏ∇, -iℏ∂_x
 */
const MOMENTUM_OPERATOR_REGEX =
  /-\s*(?:\\mathrm\{i\}|i)\s*(?:\\hbar|\\hslash|ℏ)\s*(?:\\(?:d|t)?frac\{\s*(?:\\partial|∂)\s*\}\{\s*(?:\\partial|∂)\s*[xyz]\s*\}|\\partial_\{?[xyz]\}?|∂_\{?[xyz]\}?|\\nabla|\\vec\{\\nabla\}|∇)/g;

/**
 * Regex for quantum kinetic energy operator:
 * -\frac{\hbar^2}{2m}\nabla^2, -\frac{\hbar^2}{2m}\Delta, -\frac{\hbar^2}{2m}\frac{\partial^2}{\partial x^2}
 */
const KINETIC_OPERATOR_REGEX =
  /-\s*\\(?:d|t)?frac\{\s*(?:\\hbar|\\hslash|ℏ)\^\{?2\}?\s*\}\{\s*2\s*m\s*\}\s*(?:\\nabla\^\{?2\}?|∇\^\{?2\}?|\\Delta|\\(?:d|t)?frac\{\s*(?:\\partial|∂)\^\{?2\}?\s*\}\{\s*(?:\\partial|∂)\s*[xyz]\^\{?2\}?\s*\})/g;

/**
 * Regex for ladder creation/annihilation operator:
 * \hat{a}^\dagger, \hat{a}^{\dagger}, a^\dagger
 */
const LADDER_OPERATOR_REGEX =
  /(?:\\hat\{a\}|a)\s*\^\s*\{?\\dagger\}?/g;

export function collectQuantumOperatorSpans(
  body: string,
  palette: ColorPalette,
  _options?: ColorMathOptions
): ColorSpan[] {
  const spans: ColorSpan[] = [];
  const color = palette.energyOperator || "#2ac3de";
  const priority = 45; // Higher than standard derivatives (20) and constants (10)

  let match: RegExpExecArray | null;

  // 1. Energy Operator
  ENERGY_OPERATOR_REGEX.lastIndex = 0;
  while ((match = ENERGY_OPERATOR_REGEX.exec(body)) !== null) {
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      color,
      priority,
    });
  }

  // 2. Momentum Operator
  MOMENTUM_OPERATOR_REGEX.lastIndex = 0;
  while ((match = MOMENTUM_OPERATOR_REGEX.exec(body)) !== null) {
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      color,
      priority,
    });
  }

  // 3. Kinetic Energy Operator
  KINETIC_OPERATOR_REGEX.lastIndex = 0;
  while ((match = KINETIC_OPERATOR_REGEX.exec(body)) !== null) {
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      color,
      priority,
    });
  }

  // 4. Ladder Operators
  LADDER_OPERATOR_REGEX.lastIndex = 0;
  while ((match = LADDER_OPERATOR_REGEX.exec(body)) !== null) {
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      color,
      priority,
    });
  }

  // 5. Custom Quantum Operators (longest first to prioritize e.g. \hat{a}^\dagger over \hat{a})
  const sortedCustom = Array.from(CUSTOM_QUANTUM_OPERATORS).sort((a, b) => b.length - a.length);
  for (const qOp of sortedCustom) {
    if (!qOp) continue;
    let qIdx = body.indexOf(qOp);
    while (qIdx !== -1) {
      const qEnd = qIdx + qOp.length;
      const overlaps = spans.some((s) => Math.max(s.start, qIdx) < Math.min(s.end, qEnd));
      if (!overlaps) {
        spans.push({
          start: qIdx,
          end: qEnd,
          color,
          priority,
        });
      }
      qIdx = body.indexOf(qOp, qEnd);
    }
  }

  return spans;
}
