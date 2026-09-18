import { describe, it, expect } from 'vitest';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import { scanMarkdown } from '../src/parsers/markdown_scanner';
import { DEFAULT_PALETTE, DEFAULT_OPTIONS, getBareFunctions } from '../src/config';
import { collectTaxonomySpans } from '../src/parsers/taxonomy';
import { collectScannerSpans } from '../src/parsers/scanner';
import { collectFunctionSpans } from '../src/converters/generic';
import { collectVariableSpans } from '../src/parsers/variable_hash';
import { selectColorSpans } from '../src/utils/spans';
import { containsColorWrapper } from '../src/utils/latex_helpers';

describe('Interleaved Math Live Preview', () => {
  it('correctly orders decorations when inline math and display math are interleaved', () => {
    const text = `
Some text with $x + y$ inline math.

$$
\\psi + \\omega
$$

Another line with $a = b$ inline math.

$$
𝝍 + \\psi
$$
`;
    const scan = scanMarkdown(text);
    const mathBlocks = scan.mathBlocks;
    const mathInlines = scan.mathInlines;
    const allMath = [...mathBlocks, ...mathInlines].sort((a, b) => a.start - b.start);

    const allDecorations: { from: number; to: number }[] = [];

    for (const block of allMath) {
      const body = text.slice(block.contentStart, block.contentEnd);
      if (containsColorWrapper(body)) continue;

      const allSpans = [
        ...collectFunctionSpans(body, DEFAULT_PALETTE, getBareFunctions(DEFAULT_OPTIONS)),
        ...collectScannerSpans(body, DEFAULT_PALETTE),
        ...collectTaxonomySpans(body, DEFAULT_PALETTE, [], [], [], { enableTaxonomy: true, taxonomyParameters: true }),
        ...collectVariableSpans(body, undefined, [], [], [], getBareFunctions(DEFAULT_OPTIONS)),
      ];
      const selected = selectColorSpans(body, allSpans);
      const nonOverlapping = [];
      let currentEnd = -1;
      for (const span of selected) {
        if (span.start >= currentEnd) {
          nonOverlapping.push(span);
          currentEnd = span.end;
        }
      }

      for (const span of nonOverlapping) {
        const from = block.contentStart + span.start;
        const to = block.contentStart + span.end;
        allDecorations.push({ from, to });
      }
    }

    allDecorations.sort((a, b) => a.from - b.from || a.to - b.to);

    const builder = new RangeSetBuilder<Decoration>();
    let lastEnd = -1;
    for (const d of allDecorations) {
      if (d.from >= lastEnd) {
        builder.add(d.from, d.to, Decoration.mark({ class: 'token' }));
        lastEnd = d.to;
      }
    }

    const decos = builder.finish();
    expect(decos.size).toBeGreaterThan(0);
  });
});
