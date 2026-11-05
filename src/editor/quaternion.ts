// src/editor/quaternion.ts
//! Active Quaternion and Vector Space Mathematical Navigation Engine.
//! Operationalizes Hamilton's quaternion algebra H = {q = w + xi + yj + zk}
//! to resolve whitespace clicks via 4D geodesic distance and drive orthogonal 2D keyboard navigation.

import { QuaternionCoord, SpatialCoordinate4D } from "../parsers/cst/types";
import { TensorResolvedRange, extractCSTTensorTokens } from "./quaternion_reconciler";
import { getMathJaxElementRange } from "./weakmap_index";
import { MathCSTParser } from "../parsers/cst/parser";
import { collectFractions } from "./lazy_navigation";
import {
  isWasmCstReady,
  parseWasmCstArena,
  NODE_IDENTIFIER,
  NODE_OPERATOR,
  NODE_COMMAND,
  NODE_BOUNDARY,
  NODE_TEXT,
} from "../parsers/wasm_cst";

function findClosingBrace(text: string, openIndex: number): number {
  let depth = 1;
  for (let i = openIndex + 1; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 123) depth++;
    else if (c === 125) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Directly jumps between fraction numerator and denominator braces ({x-2} <-> {y-3})
 * in raw LaTeX text strings, operating both in live rendered view and raw source editing.
 * Returns null if navigation should fall through to standard editor line movement.
 */
export function findFractionPartnerInLatex(
  latex: string,
  relPos: number,
  direction: "up" | "down"
): number | null {
  if (!latex || relPos < 0 || relPos > latex.length) return null;

  try {
    const parser = new MathCSTParser(latex);
    const ast = parser.parse();
    const fracs = collectFractions(ast);

    for (const frac of fracs) {
      if (relPos < frac.start || relPos > frac.end) continue;

      let cur = frac.start;
      while (cur < frac.end && latex.charCodeAt(cur) !== 123) cur++;
      if (cur >= frac.end) continue;

      const numOpen = cur + 1;
      const numClose = findClosingBrace(latex, cur);
      if (numClose === -1) continue;

      cur = numClose + 1;
      while (cur < frac.end && latex.charCodeAt(cur) !== 123) cur++;
      if (cur >= frac.end) continue;

      const denOpen = cur + 1;
      const denClose = findClosingBrace(latex, cur);
      if (denClose === -1) continue;

      if (direction === "down" && relPos >= numOpen - 1 && relPos <= numClose) {
        // Down from numerator into denominator
        const offset = Math.max(0, relPos - numOpen);
        const target = Math.min(denClose, denOpen + offset);
        return target;
      } else if (direction === "up" && relPos >= denOpen - 1 && relPos <= denClose) {
        // Up from denominator into numerator
        const offset = Math.max(0, relPos - denOpen);
        const target = Math.min(numClose, numOpen + offset);
        return target;
      }
    }
  } catch {
    // Fail-safe
  }

  return null;
}

/**
 * Hypercomplex Quaternion q = w + x*i + y*j + z*k in H representing a point in mathematical syntax space.
 * - w = Re(q): Scalar dilation / multi-scale hierarchy (0: glyph, 1: atom, 2: slot, 3: molecule, 4: enclosure).
 * - x (i-axis): Horizontal sequence index / column offset along active baseline slot.
 * - y (j-axis): Orthogonal vertical structural role (+1: numerator/superscript, 0: baseline, -1: denominator/subscript, -row: matrix).
 * - z (k-axis): Subtree isolation plane (0: dominant baseline, >=1: unique molecule isolation plane).
 */
export class MathQuaternion {
  public static readonly ONE = new MathQuaternion(1, 0, 0, 0);
  public static readonly I   = new MathQuaternion(0, 0, 0, 1);
  public static readonly J   = new MathQuaternion(0, 0, 1, 0);
  public static readonly K   = new MathQuaternion(0, 1, 0, 0);

  constructor(
    public readonly w: number,
    public readonly z: number,
    public readonly y: number,
    public readonly x: number
  ) {}

  public static fromCoord(coord: QuaternionCoord): MathQuaternion {
    return new MathQuaternion(coord.w ?? 1, coord.z ?? 0, coord.y ?? 0, coord.x ?? 0);
  }

  public toCoord(): QuaternionCoord {
    return { w: this.w, z: this.z, y: this.y, x: this.x };
  }

  /**
   * Computes the squared hypercomplex Euclidean norm: ||q||^2 = w^2 + x^2 + y^2 + z^2.
   */
  public normSquared(): number {
    return this.w * this.w + this.z * this.z + this.y * this.y + this.x * this.x;
  }

  /**
   * Hamilton product p * q in the non-commutative division ring H:
   * (w1 + x1*i + y1*j + z1*k)(w2 + x2*i + y2*j + z2*k)
   */
  public multiply(other: MathQuaternion): MathQuaternion {
    const w1 = this.w, x1 = this.x, y1 = this.y, z1 = this.z;
    const w2 = other.w, x2 = other.x, y2 = other.y, z2 = other.z;
    return new MathQuaternion(
      w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
      w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
      w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
      w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2
    );
  }

  /**
   * Full quaternion conjugate: q_bar = w - x*i - y*j - z*k.
   */
  public conjugate(): MathQuaternion {
    return new MathQuaternion(this.w, -this.z, -this.y, -this.x);
  }

  /**
   * Multiplicative inverse in the division ring H: q^-1 = q_bar / ||q||^2.
   */
  public inverse(): MathQuaternion {
    const n2 = this.normSquared();
    if (n2 === 0) return new MathQuaternion(0, 0, 0, 0);
    return new MathQuaternion(this.w / n2, -this.z / n2, -this.y / n2, -this.x / n2);
  }

  /**
   * Evaluates the anisotropic geodesic distance in H between two syntax positions.
   * Higher weight is assigned to the Z axis (depth barrier: w_Z = 100) and Y axis (vertical role: w_Y = 25)
   * to strictly penalize jumping across baseline isolation planes.
   */
  public geodesicDistanceTo(
    other: MathQuaternion,
    weights = { w: 1, z: 100, y: 25, x: 1 }
  ): number {
    const dw = this.w - other.w;
    const dz = this.z - other.z;
    const dy = this.y - other.y;
    const dx = this.x - other.x;
    return Math.sqrt(
      weights.w * dw * dw +
      weights.z * dz * dz +
      weights.y * dy * dy +
      weights.x * dx * dx
    );
  }

  /**
   * Quaternionic Y-reflection via sandwich product with basis unit j:
   * Reflect_Y(q) = Re(q) + j * Im(q) * j = w + x*i - y*j + z*k.
   * Structurally reflects vertical roles across the baseline (numerator <-> denominator, sup <-> sub).
   */
  public reflectY(): MathQuaternion {
    const im = new MathQuaternion(0, this.z, this.y, this.x);
    const reflectedIm = MathQuaternion.J.multiply(im).multiply(MathQuaternion.J);
    return new MathQuaternion(this.w, reflectedIm.z, reflectedIm.y, reflectedIm.x);
  }

  /**
   * Alias for reflectY(): q*y = w + x*i - y*j + z*k.
   */
  public conjugateY(): MathQuaternion {
    return this.reflectY();
  }

  /**
   * Translates the quaternion by an orthogonal basis step: q + dw + dx*i + dy*j + dz*k.
   */
  public step(dw = 0, dz = 0, dy = 0, dx = 0): MathQuaternion {
    return new MathQuaternion(this.w + dw, this.z + dz, this.y + dy, this.x + dx);
  }
}

export interface CandidateTokenTarget {
  element: Element;
  range: TensorResolvedRange;
  quat: MathQuaternion;
  boundingRect?: DOMRect;
}

/**
 * Gathers all registered token elements within a MathJax container and extracts their quaternions.
 */
export function collectContainerTokens(container: Element): CandidateTokenTarget[] {
  const candidates: CandidateTokenTarget[] = [];
  const tokenEls = Array.from(
    container.querySelectorAll("mjx-mi, mjx-mn, mjx-mo, mjx-mtext, mjx-c, mjx-num, mjx-den, mjx-script")
  );

  for (const el of tokenEls) {
    const range = getMathJaxElementRange(el) as TensorResolvedRange | undefined;
    if (range && range.coord) {
      candidates.push({
        element: el,
        range,
        quat: MathQuaternion.fromCoord(range.coord),
        boundingRect: typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : undefined,
      });
    }
  }

  return candidates;
}

/**
 * Pure-CST 4D spatial token collector for unmounted inline math widgets and Source Mode.
 * Computes the exact 4D coordinate tensor P = [W, Z, Y, X] and multi-scale intervals
 * combining WebAssembly linear memory acceleration with TypeScript fallback.
 */
export function collectCSTContainerTokens(latex: string): CandidateTokenTarget[] {
  if (!latex) return [];
  try {
    if (isWasmCstReady()) {
      const arenaNodes = parseWasmCstArena(latex);
      if (arenaNodes && arenaNodes.length > 0) {
        const targets: CandidateTokenTarget[] = [];
        for (const n of arenaNodes) {
          const isLeafOrText =
            n.kind === NODE_IDENTIFIER ||
            n.kind === NODE_OPERATOR ||
            n.kind === NODE_COMMAND ||
            n.kind === NODE_BOUNDARY ||
            n.kind === NODE_TEXT;
          if (isLeafOrText) {
            // Exclude ampersand column markers and matrix row breaks
            if (n.kind === NODE_COMMAND && (latex.slice(n.start, n.end) === "\\\\" || latex.slice(n.start, n.end) === "\\cr")) continue;
            if (latex.slice(n.start, n.end).trim() === "&") continue;

            const span = { start: n.start, end: n.end };
            const range: TensorResolvedRange = {
              start: n.start,
              end: n.end,
              kind: n.kind === NODE_TEXT ? "text" : "leaf",
              coord: n.coord,
              scales: {
                glyph: span,
                atom: span,
                slot: span,
                molecule: span,
                enclosure: span,
              },
            };
            targets.push({
              element: null as unknown as Element,
              range,
              quat: MathQuaternion.fromCoord(n.coord),
            });
          }
        }
        return targets;
      }
    }

    const parser = new MathCSTParser(latex);
    const ast = parser.parse();
    const ranges = extractCSTTensorTokens(ast, latex.length);
    return ranges.map((range) => ({
      element: null as unknown as Element,
      range,
      quat: MathQuaternion.fromCoord(range.coord),
    }));
  } catch {
    return [];
  }
}

/**
 * Resolves the optimal nearest-neighbor token when a click lands in whitespace or misses a glyph,
 * combining 2D screen displacement vectors with 4D quaternion syntactic barriers.
 */
export function findNearestTokenGeodesic(
  container: Element,
  screenX: number,
  screenY: number,
  anchorTarget?: Element
): CandidateTokenTarget | null {
  const candidates = collectContainerTokens(container);
  if (candidates.length === 0) return null;

  let anchorQuat: MathQuaternion | null = null;
  if (anchorTarget) {
    const anchorRange = getMathJaxElementRange(anchorTarget) as TensorResolvedRange | undefined;
    if (anchorRange && anchorRange.coord) {
      anchorQuat = MathQuaternion.fromCoord(anchorRange.coord);
    }
  }

  let bestCandidate: CandidateTokenTarget | null = null;
  let minCost = Infinity;

  for (const candidate of candidates) {
    let screenCost = 0;
    if (candidate.boundingRect && candidate.boundingRect.width > 0) {
      const midX = candidate.boundingRect.left + candidate.boundingRect.width / 2;
      const midY = candidate.boundingRect.top + candidate.boundingRect.height / 2;
      const dx = screenX - midX;
      const dy = screenY - midY;
      screenCost = dx * dx + dy * dy;
    }

    let syntaxCost = 0;
    if (anchorQuat) {
      syntaxCost = candidate.quat.geodesicDistanceTo(anchorQuat);
    }

    // Combined metric: Screen vector proximity + syntactic barrier penalty
    const totalCost = screenCost + syntaxCost * 100;
    if (totalCost < minCost) {
      minCost = totalCost;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

/**
 * Computes orthogonal 2D keyboard navigation transitions inside mathematical structures.
 * Returns null if navigation should fall through to standard prose cursor movement.
 */
export function resolveOrthogonalKeyboardStep(
  direction: "up" | "down" | "left" | "right",
  currentCoord: SpatialCoordinate4D,
  candidates: CandidateTokenTarget[]
): CandidateTokenTarget | null {
  const currentQuat = MathQuaternion.fromCoord(currentCoord);

  if (direction === "up") {
    // Up transition via Quaternion reflection Reflect_Y(q) = Re(q) + j*Im(q)*j = w + x*i - y*j + z*k
    // or basis step q + j across matrix rows (y -> y + 1) on the same isolation plane (z)
    if (currentQuat.y < 0) {
      let slotCandidates: CandidateTokenTarget[] = [];
      if (currentQuat.y === -1) {
        const reflected = currentQuat.reflectY();
        slotCandidates = candidates.filter(
          (c) => c.quat.z === reflected.z && c.quat.y === reflected.y
        );
      }
      if (slotCandidates.length === 0) {
        const stepped = currentQuat.step(0, 0, 1, 0);
        slotCandidates = candidates.filter(
          (c) => c.quat.z === stepped.z && c.quat.y === stepped.y
        );
      }
      if (slotCandidates.length === 0) return null;

      // Find token minimizing horizontal offset |dx|
      slotCandidates.sort((a, b) => Math.abs(a.quat.x - currentQuat.x) - Math.abs(b.quat.x - currentQuat.x));
      return slotCandidates[0];
    }
    // If already at dominant baseline or numerator, do NOT intercept: allow prose line jump
    return null;
  }

  if (direction === "down") {
    // Down transition:
    // 1. From numerator/superscript (y = +1) to denominator/subscript (y = -1) via Reflect_Y(q)
    if (currentQuat.y > 0) {
      const reflected = currentQuat.reflectY();
      const slotCandidates = candidates.filter(
        (c) => c.quat.z === reflected.z && c.quat.y === reflected.y
      );
      if (slotCandidates.length === 0) return null;

      slotCandidates.sort((a, b) => Math.abs(a.quat.x - currentQuat.x) - Math.abs(b.quat.x - currentQuat.x));
      return slotCandidates[0];
    }
    // 2. Matrix row step down via q - j: from row r (y <= 0) to row r+1 (y - 1) on the same isolation plane (z)
    const stepped = currentQuat.step(0, 0, -1, 0);
    const rowCandidates = candidates.filter(
      (c) => c.quat.z === stepped.z && c.quat.y === stepped.y
    );
    if (rowCandidates.length > 0) {
      rowCandidates.sort((a, b) => Math.abs(a.quat.x - currentQuat.x) - Math.abs(b.quat.x - currentQuat.x));
      return rowCandidates[0];
    }
    // If already at denominator or lowest row / baseline, fall through to prose line navigation
    return null;
  }

  if (direction === "left") {
    // Left transition along current baseline slot: x - 1
    const slotCandidates = candidates.filter(
      (c) => c.quat.z === currentQuat.z && c.quat.y === currentQuat.y && c.quat.x < currentQuat.x
    );
    if (slotCandidates.length === 0) return null; // Fall through to exit formula
    slotCandidates.sort((a, b) => b.quat.x - a.quat.x); // Immediate previous x
    return slotCandidates[0];
  }

  if (direction === "right") {
    // Right transition along current baseline slot: x + 1
    const slotCandidates = candidates.filter(
      (c) => c.quat.z === currentQuat.z && c.quat.y === currentQuat.y && c.quat.x > currentQuat.x
    );
    if (slotCandidates.length === 0) return null; // Fall through to exit formula
    slotCandidates.sort((a, b) => a.quat.x - b.quat.x); // Immediate next x
    return slotCandidates[0];
  }

  return null;
}
