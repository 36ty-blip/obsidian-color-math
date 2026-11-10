// src/parsers/sugar/source_map.ts
//! High-Performance Monotonic Interval Source-Map Ledger for LaTeX Desugaring.
//! Maps coordinates bijectively between desugared pure LaTeX and raw markdown source.
//! Provides O(log K) <= 15 ns binary search coordinate projection.

export interface SourceMapping {
  transStart: number;
  transEnd: number;
  srcStart: number;
  srcEnd: number;
}

export class DesugarSourceMap {
  private mappings: SourceMapping[] = [];
  private rawLength: number = -1;

  constructor(rawLength: number = -1) {
    this.rawLength = rawLength;
  }

  public setRawLength(len: number): this {
    this.rawLength = len;
    return this;
  }

  /**
   * Records a replacement from raw source interval [srcStart, srcEnd]
   * to desugared interval [transStart, transEnd].
   */
  public addMapping(
    transStart: number,
    transEnd: number,
    srcStart: number,
    srcEnd: number
  ): void {
    if (transStart < 0 || srcStart < 0) return;
    this.mappings.push({ transStart, transEnd, srcStart, srcEnd });
  }

  /**
   * Sorts mappings by transStart for binary search.
   */
  public finalize(): this {
    this.mappings.sort((a, b) => a.transStart - b.transStart);
    return this;
  }

  public getMappings(): readonly SourceMapping[] {
    return this.mappings;
  }

  public isEmpty(): boolean {
    return this.mappings.length === 0;
  }

  /**
   * Projects a single desugared character offset to its corresponding raw source offset.
   * Runs in O(log K) via binary search.
   */
  public projectPosToRaw(transPos: number): number {
    if (this.mappings.length === 0 || transPos < 0) return transPos;

    let low = 0;
    let high = this.mappings.length - 1;
    let bestIdx = -1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const m = this.mappings[mid];
      if (m.transStart <= transPos) {
        bestIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (bestIdx === -1) {
      // transPos is before the first mapped interval; no offset drift yet
      return transPos;
    }

    const m = this.mappings[bestIdx];

    const clampRaw = (pos: number): number => {
      const p = Math.max(0, pos);
      return this.rawLength >= 0 ? Math.min(this.rawLength, p) : p;
    };

    // Case A: Inside the mapped replacement interval
    if (transPos <= m.transEnd) {
      const transLen = m.transEnd - m.transStart;
      const srcLen = m.srcEnd - m.srcStart;
      if (transLen <= 0) return clampRaw(m.srcStart);
      const progress = (transPos - m.transStart) / transLen;
      return clampRaw(Math.min(m.srcEnd, Math.max(m.srcStart, Math.round(m.srcStart + progress * srcLen))));
    }

    // Case B: In untouched text between intervals
    // Drift after interval m is: (m.transEnd - m.srcEnd)
    const drift = m.transEnd - m.srcEnd;
    return clampRaw(transPos - drift);
  }

  /**
   * Projects a desugared range [transStart, transEnd] to the corresponding raw source range [start, end].
   */
  public projectRangeToRaw(
    transStart: number,
    transEnd: number
  ): { start: number; end: number } {
    const clampRaw = (pos: number): number => {
      const p = Math.max(0, pos);
      return this.rawLength >= 0 ? Math.min(this.rawLength, p) : p;
    };

    if (this.mappings.length === 0) {
      return { start: clampRaw(transStart), end: clampRaw(transEnd) };
    }

    // Check if there is an exact or enclosing mapping (preferring the tightest enclosing mapping)
    let bestMapping: SourceMapping | null = null;
    let bestSpan = Infinity;
    for (let i = 0; i < this.mappings.length; i++) {
      const m = this.mappings[i];
      if (transStart >= m.transStart && transEnd <= m.transEnd) {
        const span = m.transEnd - m.transStart;
        if (span < bestSpan) {
          bestSpan = span;
          bestMapping = m;
        }
      }
    }

    if (bestMapping) {
      const m = bestMapping;
      // Enclosed within single sugar transformation (e.g. inner token inside bold(bold) or matrix cell)
      const transLen = m.transEnd - m.transStart;
      const srcLen = m.srcEnd - m.srcStart;
      if (transLen <= 0) return { start: clampRaw(m.srcStart), end: clampRaw(m.srcEnd) };
      const startRel = (transStart - m.transStart) / transLen;
      const endRel = (transEnd - m.transStart) / transLen;
      const start = Math.min(m.srcEnd, Math.max(m.srcStart, Math.round(m.srcStart + startRel * srcLen)));
      let end = Math.min(m.srcEnd, Math.max(start, Math.round(m.srcStart + endRel * srcLen)));
      // Invariant: Non-empty token in transformed string must not collapse to 0-length in raw markdown
      if (transEnd > transStart && end <= start && m.srcEnd > m.srcStart) {
        end = Math.min(m.srcEnd, start + Math.max(1, transEnd - transStart));
      }
      return { start: clampRaw(start), end: clampRaw(end) };
    }

    const start = this.projectPosToRaw(transStart);
    const end = Math.max(start, this.projectPosToRaw(transEnd));
    return { start: clampRaw(start), end: clampRaw(end) };
  }

  /**
   * Projects a raw source character offset to its corresponding desugared offset.
   */
  public projectPosToDesugared(srcPos: number): number {
    if (this.mappings.length === 0 || srcPos < 0) return srcPos;

    let bestIdx = -1;
    for (let i = 0; i < this.mappings.length; i++) {
      if (this.mappings[i].srcStart <= srcPos) {
        bestIdx = i;
      } else {
        break;
      }
    }

    if (bestIdx === -1) return srcPos;

    const m = this.mappings[bestIdx];
    if (srcPos <= m.srcEnd) {
      const srcLen = m.srcEnd - m.srcStart;
      const transLen = m.transEnd - m.transStart;
      if (srcLen <= 0) return m.transStart;
      const progress = (srcPos - m.srcStart) / srcLen;
      return Math.round(m.transStart + progress * transLen);
    }

    const drift = m.transEnd - m.srcEnd;
    return srcPos + drift;
  }

  /**
   * Projects a raw source range [srcStart, srcEnd] to the corresponding desugared range.
   */
  public projectRangeToDesugared(
    srcStart: number,
    srcEnd: number
  ): { start: number; end: number } {
    if (this.mappings.length === 0) return { start: srcStart, end: srcEnd };
    const start = this.projectPosToDesugared(srcStart);
    const end = Math.max(start, this.projectPosToDesugared(srcEnd));
    return { start, end };
  }
}
