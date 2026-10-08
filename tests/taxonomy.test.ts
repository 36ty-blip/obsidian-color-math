import { describe, it, expect } from "vitest";
import { collectTaxonomySpans } from "../src/parsers/taxonomy";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_COLORS } from "../src/config";

describe("Mathematical Symbol Taxonomy", () => {
  it("tags mathematical constants with orange role", () => {
    const spans = collectTaxonomySpans("\\pi + \\hbar + \\infty");
    expect(spans.length).toBe(3);
    for (const span of spans) {
      expect(span.color).toBe(DEFAULT_COLORS.orange);
    }
  });

  it("tags mathematical parameters (Greek letters) with parameter role", () => {
    const spans = collectTaxonomySpans("\\alpha + \\theta + \\lambda");
    expect(spans.length).toBe(3);
    for (const span of spans) {
      expect(span.color).toBe(DEFAULT_COLORS.parameter);
    }
  });

  it("tags standard math functions with main role", () => {
    const spans = collectTaxonomySpans("\\sin(x) + \\ln(y)");
    expect(spans.length).toBe(2);
    for (const span of spans) {
      expect(span.color).toBe(DEFAULT_COLORS.main);
    }
  });

  it("tags summation/limit bound iteration indices with chain role", () => {
    const spans = collectTaxonomySpans("\\sum_{i=1}^{n} i");
    const indexSpan = spans.find((s) => s.priority === 23);
    expect(indexSpan).toBeDefined();
    expect(indexSpan!.color).toBe(DEFAULT_COLORS.chain);
  });

  it("colors math latex with taxonomy when enabled", () => {
    const input = "\\sin(\\theta) = \\pi";
    const result = colorLatexBody(input, DEFAULT_COLORS, { enableTaxonomy: true });
    // \sin is main, \theta is parameter, = is relation, \pi is orange
    expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.main}}{\\sin}`);
    expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.parameter}}{\\theta}`);
    expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.orange}}{\\pi}`);
  });

  it("skips macro definitions like \\def and \\newcommand without coloring macro internals", () => {
    const input1 = "\\def \\dom{\\text{dom}\\,}";
    const result1 = colorLatexBody(input1, DEFAULT_COLORS, { enableTaxonomy: true });
    expect(result1).toBe(input1);

    const input2 = "\\def\\by#1{#1 \\times #1}\\by n";
    const result2 = colorLatexBody(input2, DEFAULT_COLORS, { enableTaxonomy: true });
    expect(result2.startsWith("\\def\\by#1{#1 \\times #1}")).toBe(true);
    expect(result2).toContain("\\by{");
  });

  it("does not wrap \\underbrace with arity-1 wide span", () => {
    const input = "\\underbrace{a+b+c}_{\\text{three terms}}";
    const spans = collectTaxonomySpans(input);
    // Should NOT have a span covering index 0 to 18 (spanning over the body)
    const wideSpan = spans.find((s) => s.start === 0 && s.end >= 18);
    expect(wideSpan).toBeUndefined();
  });

  it("resolves mathematical functions directly through the Lemire MPHF catalog", () => {
    const input = "\\sin(x)";
    const spans = collectTaxonomySpans(input, DEFAULT_COLORS);
    // \sin is in the MPHF catalog, resolving with priority 22
    expect(spans.some((s) => s.color === DEFAULT_COLORS.main && s.priority === 22)).toBe(true);
  });
});

