// src/editor/weakmap_index.ts
//! Method 2: High-Speed In-Memory WeakMap Object-Identity Indexer + Clone-Proof L2 Attribute Hydration.
//! Maps MathJax CHTML DOM elements directly to their CST source ranges in ~20 ns.
//! Survives MathJaxInterceptor `cloneNode(true)` cache hits via `data-cm-tensor` hydration (~180 ns).

import { ResolvedRange } from "./lazy_navigation";

// Ephemeral WeakMap mapping native Element references to pre-computed coordinate ranges.
// V8 unlinks and garbage-collects records as soon as DOM nodes leave memory.
const mathjaxRangeMap = new WeakMap<Element, ResolvedRange>();

export const TENSOR_ATTR = "data-cm-tensor";

/**
 * Serializes a ResolvedRange (including 3D coord and multi-scale hierarchy)
 * into a compact comma-delimited attribute string that survives C++ `cloneNode(true)`.
 */
export function serializeTensorRange(range: ResolvedRange): string {
  const { start, end, kind, coord, scales } = range;
  if (!coord || !scales) {
    return `${start},${end},${kind}`;
  }
  return [
    start,
    end,
    kind,
    coord.w ?? 1,
    coord.z,
    coord.y,
    coord.x,
    scales.glyph.start,
    scales.glyph.end,
    scales.atom.start,
    scales.atom.end,
    scales.slot.start,
    scales.slot.end,
    scales.molecule.start,
    scales.molecule.end,
    scales.enclosure.start,
    scales.enclosure.end,
  ].join(",");
}

/**
 * Deserializes a `data-cm-tensor` attribute string back into a full ResolvedRange.
 */
export function deserializeTensorRange(raw: string): ResolvedRange | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",");
  if (parts.length < 3) return undefined;

  const start = parseInt(parts[0], 10);
  const end = parseInt(parts[1], 10);
  const kind = parts[2] as ResolvedRange["kind"];
  if (isNaN(start) || isNaN(end)) return undefined;

  if (parts.length >= 17) {
    return {
      start,
      end,
      kind,
      coord: {
        w: parseInt(parts[3], 10),
        z: parseInt(parts[4], 10),
        y: parseInt(parts[5], 10),
        x: parseInt(parts[6], 10),
      },
      scales: {
        glyph: { start: parseInt(parts[7], 10), end: parseInt(parts[8], 10) },
        atom: { start: parseInt(parts[9], 10), end: parseInt(parts[10], 10) },
        slot: { start: parseInt(parts[11], 10), end: parseInt(parts[12], 10) },
        molecule: { start: parseInt(parts[13], 10), end: parseInt(parts[14], 10) },
        enclosure: { start: parseInt(parts[15], 10), end: parseInt(parts[16], 10) },
      },
    };
  }

  return { start, end, kind };
}

/**
 * Indexes a MathJax CHTML element into the ephemeral WeakMap cache and stamps
 * the clone-proof `data-cm-tensor` attribute onto the DOM element.
 */
export function indexMathJaxElement(el: Element, range: ResolvedRange): void {
  if (el && range) {
    mathjaxRangeMap.set(el, range);
    if (typeof (el as any).setAttribute === "function") {
      try {
        (el as any).setAttribute(TENSOR_ATTR, serializeTensorRange(range));
      } catch {
        // Ignore read-only mock elements
      }
    }
  }
}

/**
 * Retrieves ONLY the direct source code range stamped specifically on this element,
 * without resolving upwards to parent matrix cells or structural containers.
 */
export function getDirectMathJaxElementRange(target: Element): ResolvedRange | undefined {
  if (!target) return undefined;
  const direct = mathjaxRangeMap.get(target);
  if (direct) return direct;
  if (typeof (target as any).getAttribute === "function") {
    const rawAttr = (target as any).getAttribute(TENSOR_ATTR);
    if (typeof rawAttr === "string" && rawAttr) {
      return deserializeTensorRange(rawAttr);
    }
  }
  return undefined;
}

/**
 * Retrieves the source code range for a MathJax CHTML element via direct pointer lookup (~20 ns),
 * or hydrates from `data-cm-tensor` (~180 ns) if the element was cloned via `cloneNode(true)`.
 */
export function getMathJaxElementRange(target: Element): ResolvedRange | undefined {
  if (!target) return undefined;

  // 1. Direct WeakMap object identity hit (~20 ns)
  const direct = mathjaxRangeMap.get(target);
  if (direct) return direct;

  // 2. Direct hydration from `data-cm-tensor` (when cloned from MathJaxInterceptor renderCache)
  if (typeof (target as any).getAttribute === "function") {
    const rawAttr = (target as any).getAttribute(TENSOR_ATTR);
    if (typeof rawAttr === "string" && rawAttr) {
      const hydrated = deserializeTensorRange(rawAttr);
      if (hydrated) {
        mathjaxRangeMap.set(target, hydrated);
        return hydrated;
      }
    }
  }

  // 3. Resolve upwards through immediate token or structural parent
  let curr: Element | null = target.parentElement;
  while (curr) {
    if (typeof (curr as any).matches === "function") {
      if ((curr as any).matches(".MathJax, mjx-container, mjx-linebox, mjx-linestack")) {
        break;
      }
      // Boundary Isolation: Stop at structural molecule boundaries (W=3); never leak whole-molecule spans onto child glyphs
      if ((curr as any).matches("mjx-msub, mjx-msup, mjx-msubsup, mjx-mfrac, mjx-munderover")) {
        break;
      }
    }
    const parentRange = mathjaxRangeMap.get(curr);
    if (parentRange) {
      if ((parentRange.coord && parentRange.coord.w >= 3) || parentRange.kind === "matrix_cell") {
        break;
      }
      // Backfill target for future direct hits
      mathjaxRangeMap.set(target, parentRange);
      return parentRange;
    }
    if (typeof (curr as any).getAttribute === "function") {
      const rawParentAttr = (curr as any).getAttribute(TENSOR_ATTR);
      if (typeof rawParentAttr === "string" && rawParentAttr) {
        const hydratedParent = deserializeTensorRange(rawParentAttr);
        if (hydratedParent) {
          if (hydratedParent.coord && hydratedParent.coord.w >= 3) {
            break;
          }
          mathjaxRangeMap.set(curr, hydratedParent);
          mathjaxRangeMap.set(target, hydratedParent);
          return hydratedParent;
        }
      }
    }
    curr = curr.parentElement;
  }

  return undefined;
}
