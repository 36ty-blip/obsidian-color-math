// src/utils/spans.ts

export interface ColorSpan {
  start: number;
  end: number;
  color: string;
  priority?: number;
}

function crosses(left: ColorSpan, right: ColorSpan): boolean {
  return (
    (left.start < right.start && right.start < left.end && left.end < right.end) ||
    (right.start < left.start && left.start < right.end && right.end < left.end)
  );
}

export function selectColorSpans(source: string, spans: ColorSpan[]): ColorSpan[] {
  const candidates = new Map<string, ColorSpan>();

  for (const span of spans) {
    const priority = span.priority ?? 0;
    if (!(0 <= span.start && span.start < span.end && span.end <= source.length)) {
      continue;
    }
    const key = `${span.start}:${span.end}`;
    const previous = candidates.get(key);
    if (!previous || priority > (previous.priority ?? 0)) {
      candidates.set(key, { ...span, priority });
    }
  }

  const sortedCandidates = Array.from(candidates.values()).sort((a, b) => {
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    if (pa !== pb) return pb - pa; // -item.priority
    if (a.start !== b.start) return a.start - b.start; // item.start
    return (b.end - b.start) - (a.end - a.start); // -(item.end - item.start)
  });

  const accepted: ColorSpan[] = [];
  for (const span of sortedCandidates) {
    if (accepted.some((other) => crosses(span, other))) {
      continue;
    }
    accepted.push(span);
  }

  return accepted.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - a.end; // -item.end
  });
}

export function applyColorSpans(source: string, spans: ColorSpan[]): string {
  const selected = selectColorSpans(source, spans);
  const openings = new Map<number, ColorSpan[]>();
  const closings = new Map<number, ColorSpan[]>();

  for (const span of selected) {
    if (!openings.has(span.start)) openings.set(span.start, []);
    openings.get(span.start)!.push(span);

    if (!closings.has(span.end)) closings.set(span.end, []);
    closings.get(span.end)!.push(span);
  }

  const pieces: string[] = [];
  for (let index = 0; index <= source.length; index++) {
    // Close inner spans first, then open outer spans first.
    const closeList = closings.get(index);
    if (closeList) {
      const sortedClosings = [...closeList].sort((a, b) => b.start - a.start);
      for (let i = 0; i < sortedClosings.length; i++) {
        pieces.push("}");
      }
    }

    const openList = openings.get(index);
    if (openList) {
      const sortedOpenings = [...openList].sort((a, b) => b.end - a.end);
      for (const span of sortedOpenings) {
        pieces.push(`\\textcolor{${span.color}}{`);
      }
    }

    if (index < source.length) {
      pieces.push(source[index]);
    }
  }

  return pieces.join("");
}

