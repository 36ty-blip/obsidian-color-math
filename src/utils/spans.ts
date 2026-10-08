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

const ATOMIC_DELIM_RE =
  /\\(?:left|right|middle|(?:Bigg|bigg|Big|big)[lrm]?)\s*(?:\\[A-Za-z]+|\\.|[^\s])|\\\|/g;

export function selectColorSpans(source: string, spans: ColorSpan[]): ColorSpan[] {
  const candidates = new Map<string, ColorSpan>();

  const atomicRanges: { start: number; end: number; isSized: boolean }[] = [];
  ATOMIC_DELIM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATOMIC_DELIM_RE.exec(source)) !== null) {
    const isSized = /^\\(?:big|Big|bigg|Bigg)/.test(m[0]);
    atomicRanges.push({ start: m.index, end: m.index + m[0].length, isSized });
  }

  for (const span of spans) {
    let spanStart = span.start;
    let spanEnd = span.end;
    let skip = false;

    for (const r of atomicRanges) {
      if (spanStart >= r.start && spanEnd <= r.end) {
        if (spanStart === r.start && spanEnd === r.end) {
          break;
        }
        if (r.isSized) {
          spanStart = r.start;
          spanEnd = r.end;
          break;
        } else {
          skip = true;
          break;
        }
      }

      if (
        (spanStart > r.start && spanStart < r.end) ||
        (spanEnd > r.start && spanEnd < r.end)
      ) {
        skip = true;
        break;
      }
    }

    if (skip) continue;

    // Ensure span ends include any following combining diacritical marks
    while (spanEnd < source.length && /[\u0300-\u036F\u1DC0-\u1DFF\u20D0-\u20FF]/.test(source[spanEnd])) {
      spanEnd++;
    }

    const priority = span.priority ?? 0;
    if (!(0 <= spanStart && spanStart < spanEnd && spanEnd <= source.length)) {
      continue;
    }
    const key = `${spanStart}:${spanEnd}`;
    const previous = candidates.get(key);
    if (!previous || priority > (previous.priority ?? 0)) {
      candidates.set(key, { ...span, start: spanStart, end: spanEnd, priority });
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
  if (selected.length === 0) {
    return source;
  }

  const openings = new Map<number, ColorSpan[]>();
  const closings = new Map<number, ColorSpan[]>();
  const events = new Set<number>();

  for (const span of selected) {
    if (!openings.has(span.start)) openings.set(span.start, []);
    openings.get(span.start)!.push(span);

    if (!closings.has(span.end)) closings.set(span.end, []);
    closings.get(span.end)!.push(span);

    events.add(span.start);
    events.add(span.end);
  }

  const sortedEvents = Array.from(events).sort((a, b) => a - b);
  const pieces: string[] = [];
  let lastIdx = 0;

  for (const idx of sortedEvents) {
    if (idx > lastIdx) {
      pieces.push(source.slice(lastIdx, idx));
    }

    // Close inner spans first, then open outer spans first.
    const closeList = closings.get(idx);
    if (closeList) {
      const sortedClosings = [...closeList].sort((a, b) => b.start - a.start);
      for (let i = 0; i < sortedClosings.length; i++) {
        pieces.push("}");
      }
    }

    const openList = openings.get(idx);
    if (openList) {
      const sortedOpenings = [...openList].sort((a, b) => b.end - a.end);
      for (const span of sortedOpenings) {
        pieces.push(`\\textcolor{${span.color}}{`);
      }
    }

    lastIdx = idx;
  }

  if (lastIdx < source.length) {
    pieces.push(source.slice(lastIdx));
  }

  return pieces.join("");
}

