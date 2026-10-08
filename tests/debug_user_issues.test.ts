import { describe, it, expect } from "vitest";
import katex from "katex";
import { colorLatexBody, computeSemanticMathSpans } from "../src/converters/generic";
import { DEFAULT_PALETTE } from "../src/config";
import { matchBareSymbol, lookupCatalog, matchBareFunction } from "../src/parsers/catalog";
import { collectVariableSpans } from "../src/parsers/variable_hash";
import { normalizeMathSyntax, normalizeBareGreekInMath, normalizeBareFunctions } from "../src/utils/latex_helpers";
import { collectScannerSpans } from "../src/parsers/scanner";
import { collectTaxonomySpans } from "../src/parsers/taxonomy";
import { collectDelimiterSpans } from "../src/parsers/delimiters";
import { selectColorSpans } from "../src/utils/spans";

describe("Typst Standards & User Issues Diagnostics", () => {
  it("recognizes zeta as Greek parameter matching \\zeta, without splitting into z + eta", () => {
    const text = "zeta + eta";
    const bareZeta = matchBareSymbol(text, 0);
    expect(bareZeta).not.toBeNull();
    expect(bareZeta?.entry.canonical).toBe("\\zeta");
    expect(bareZeta?.entry.role).toBe("parameter");

    const varSpans = collectVariableSpans(text, DEFAULT_PALETTE);
    // zeta should be a single span of length 4 (0 to 4), NOT split into z (0 to 1) and eta (1 to 4)
    expect(varSpans[0].start).toBe(0);
    expect(varSpans[0].end).toBe(4);
  });

  it("unifies nabla and \\nabla as operator with identical color", () => {
    const bareNabla = lookupCatalog("nabla");
    const macroNabla = lookupCatalog("\\nabla");
    expect(bareNabla?.role).toBe("operator");
    expect(macroNabla?.role).toBe("operator");
    expect(bareNabla?.priority).toBe(macroNabla?.priority);

    const colored = colorLatexBody("nabla + \\nabla", DEFAULT_PALETTE);
    // Both should receive the exact same color wrapper or none
    expect(colored).toBe(colorLatexBody("\\nabla + \\nabla", DEFAULT_PALETTE));
  });

  it("unifies partial and \\partial as differential with identical color", () => {
    const barePartial = lookupCatalog("partial");
    const macroPartial = lookupCatalog("\\partial");
    expect(barePartial?.role).toBe("differential");
    expect(macroPartial?.role).toBe("differential");
    expect(barePartial?.priority).toBe(macroPartial?.priority);

    const colored = colorLatexBody("partial + \\partial", DEFAULT_PALETTE);
    expect(colored).toBe(colorLatexBody("\\partial + \\partial", DEFAULT_PALETTE));
  });

  it("normalizes bare operators (sin x, cos(x)) to canonical LaTeX macros for upright rendering", () => {
    expect(normalizeBareFunctions("sin x")).toBe("\\sin x");
    expect(normalizeBareFunctions("cos(x)")).toBe("\\cos(x)");
    expect(normalizeBareFunctions("ln 2")).toBe("\\ln 2");
    expect(normalizeBareFunctions("det(M)")).toBe("\\det(M)");
    expect(normalizeMathSyntax("sin x + cos(x)")).toBe("\\sin x + \\cos(x)");
  });

  it("converts bare Greek letters and constants to canonical macros via MPHF", () => {
    expect(normalizeBareGreekInMath("alpha + beta = pi")).toBe("\\alpha + \\beta = \\pi");
    expect(normalizeBareGreekInMath("zeta + eta")).toBe("\\zeta + \\eta");
    expect(normalizeBareGreekInMath("hbar omega")).toBe("\\hbar \\omega");
    expect(normalizeBareGreekInMath("oo")).toBe("\\infty");
  });

  it("renders {∂f}/{∂x} and \\frac{∂f}{∂x} with identical fraction derivative structure", () => {
    const norm = normalizeMathSyntax("{∂f}/{∂x}+\\frac{∂f}{∂x}");
    expect(norm).toBe("\\frac{∂f}{∂x}+\\frac{∂f}{∂x}");
    const colored = colorLatexBody("{∂f}/{∂x}", DEFAULT_PALETTE);
    const expected = colorLatexBody("\\frac{∂f}{∂x}", DEFAULT_PALETTE);
    expect(colored).toBe(expected);
  });

  it("preserves \\underbrace and \\overbrace without severing macro arguments", () => {
    const eq1 = "\\underbrace{a+b+c}_{\\text{ three terms}} \\qquad \\overbrace{x_{1}+x_{2}+\\cdots+x_{n}}^{\\text{sum}}";
    const colored = colorLatexBody(eq1, DEFAULT_PALETTE, { variableDataFlow: true });
    // \underbrace and \overbrace must NOT be wrapped in \textcolor
    expect(colored).not.toContain("\\textcolor{#7aa2f7}{\\underbrace}");
    expect(colored).not.toContain("\\textcolor{#7aa2f7}{\\overbrace}");
    expect(colored).toContain("\\underbrace{");
    expect(colored).toContain("\\overbrace{");
    expect(() => katex.renderToString(colored, { throwOnError: true, displayMode: true })).not.toThrow();
  });

  it("handles matrix delimiters in Equation 2 properly", () => {
    // Equation 2 with invisible zero-width spaces (\u200B\u200B), Typst quotes, slash fractions, and arrow
    const eq2 = '"matrices:"|\\begin{pmatrix} \\cfrac{1}{2} & \\cfrac{3}{4} \\\\ \\cfrac{5}{6} & \\cfrac{7}{8} \\end{pmatrix}|\u200B\u200B+ {21}/{12} ->  bb()';
    const norm = normalizeMathSyntax(eq2);
    expect(norm).toContain("\\text{matrices:}");
    expect(norm).toContain("\\Biggl|");
    expect(norm).toContain("\\Biggr|");
    expect(norm).toContain("\\to");
    expect(norm).toContain("\\mathbb{}");
    expect(norm).not.toContain("\u200B");

    const colored = colorLatexBody(norm, DEFAULT_PALETTE);
    expect(() => katex.renderToString(colored, { throwOnError: true, displayMode: true })).not.toThrow();
  });

  it("diagnoses the 4 user report equations", () => {
    // 1. Underbrace
    const eq1 = "\\underbrace{a+b+c}_{\\text{ three terms}}";
    const res1 = colorLatexBody(eq1, DEFAULT_PALETTE, { variableDataFlow: true, enableTaxonomy: true });
    console.log("DIAG 1: underbrace colored ->", res1);

    // 2. Eta and eta
    const eq2 = "\\eta \\text{ and } eta";
    const res2 = colorLatexBody(eq2, DEFAULT_PALETTE, { variableDataFlow: true, enableTaxonomy: true });
    console.log("DIAG 2: eta colored ->", res2);

    // 3. Integral bounds
    const eq3 = "\\int_{a}^{b}";
    const res3 = colorLatexBody(eq3, DEFAULT_PALETTE, { variableDataFlow: true, enableTaxonomy: true });
    console.log("DIAG 3: int colored ->", res3);

    // 4. Matrix unclosed brace
    const eq4 = "\\begin{pmatrix} 1 & 2 & {3 \\\\ 4 & 5 & 6 \\end{pmatrix}";
    const res4 = colorLatexBody(eq4, DEFAULT_PALETTE, { variableDataFlow: true, enableTaxonomy: true });
    console.log("DIAG 4: matrix unclosed brace colored ->", res4);
  });

  it("simulates Live Preview span collection for the 4 user equations", () => {
    const simulateLivePreview = (body: string, options: any = { enableTaxonomy: true, variableDataFlow: true }) => {
      const palette = DEFAULT_PALETTE;
      const allSpans = computeSemanticMathSpans(body, palette, options, false);
      const selected = selectColorSpans(body, allSpans);
      const nonOverlapping: any[] = [];
      let currentEnd = -1;
      for (const span of selected) {
        if (span.start >= currentEnd) {
          nonOverlapping.push(span);
          currentEnd = span.end;
        }
      }
      return nonOverlapping.map((s) => ({
        token: body.slice(s.start, s.end),
        start: s.start,
        end: s.end,
        color: s.color,
        priority: s.priority,
      }));
    };

    // 1. Underbrace: \underbrace command is NOT wrapped in color; inner variables colored
    const live1 = simulateLivePreview("\\underbrace{a+b+c}_{\\text{ three terms}}");
    expect(live1.some((s) => s.token === "\\underbrace")).toBe(false);
    expect(live1.some((s) => s.token === "a")).toBe(true);

    // 2. Eta and eta: both receive the exact same color
    const live2 = simulateLivePreview("\\eta \\text{ and } eta");
    const macroEta = live2.find((s) => s.token === "\\eta");
    const bareEta = live2.find((s) => s.token === "eta");
    expect(macroEta).toBeDefined();
    expect(bareEta).toBeDefined();
    expect(macroEta?.color).toBe(bareEta?.color);

    // 3. Integral bounds: \int is colored as operator, but 'a' and 'b' bounds are NOT swallowed!
    const live3 = simulateLivePreview("\\int_{a}^{b}");
    const intOp = live3.find((s) => s.token === "\\int");
    const boundA = live3.find((s) => s.token === "a");
    const boundB = live3.find((s) => s.token === "b");
    expect(intOp).toBeDefined();
    expect(boundA).toBeDefined();
    expect(boundB).toBeDefined();
    expect(boundA?.color).not.toBe(intOp?.color);

    // 4. Matrix unclosed brace: '{' is marked as unmatched syntax error with priority 99
    const live4 = simulateLivePreview("\\begin{pmatrix} 1 & 2 & {3 \\\\ 4 & 5 & 6 \\end{pmatrix}");
    const unclosedBrace = live4.find((s) => s.token === "{" && s.priority >= 90);
    expect(unclosedBrace).toBeDefined();
    expect(unclosedBrace?.color).toBe("#f7768e");

    // 5. Stray closing brace '}' is also highlighted as unmatched syntax error with priority 99
    const live5 = simulateLivePreview("\\begin{pmatrix} 1 & 2 & 3} \\\\ 4 & 5 & 6 \\end{pmatrix}");
    const strayBrace = live5.find((s) => s.token === "}" && s.priority >= 90);
    expect(strayBrace).toBeDefined();
    expect(strayBrace?.color).toBe("#f7768e");
  });

  it("preserves KaTeX display limits on sum and prod with Approach A", () => {
    const expr = "\\sum_{k=0}^{n} \\quad \\prod_{k=1}^{n}";
    const colored = colorLatexBody(expr, DEFAULT_PALETTE, { variableDataFlow: true, enableTaxonomy: true });
    // In KaTeX display mode, colored sum and prod must preserve op-limits (limits on top & bottom)
    const html = katex.renderToString(colored, { displayMode: true, throwOnError: true });
    expect(html).toContain("op-limits");
  });

  it("applies matrix padding with extra & delimiters when enabled", () => {
    const input = "\\begin{pmatrix}\n1 & 2 & 3 \\\\\n3 & \\sin x & 4 \\\\\n1 & 4 & 4\n\\end{pmatrix}";
    const normalized = normalizeMathSyntax(input, { padMatrixPadding: true });
    expect(normalized).toContain("& 1 & 2 & 3");
    expect(normalized).toContain("& 3 & \\sin x & 4");
    expect(normalized).toContain("& 1 & 4 & 4 &");
    expect(() => katex.renderToString(normalized, { displayMode: true, throwOnError: true })).not.toThrow();
  });

  it("protects and heals cross-cell curly braces inside matrices from crashing", () => {
    const brokenMatrix = "\\begin{pmatrix}\n1 & 2 & 3 \\\\\n3 & \\sin x { & 5\\\\\n1 & 4 } & 4\n\\end{pmatrix}";
    const normalized = normalizeMathSyntax(brokenMatrix);
    // Unclosed '{' in row 2 is sealed before '&', and stray '}' in row 3 is balanced
    expect(() => katex.renderToString(normalized, { displayMode: true, throwOnError: true })).not.toThrow();

    const colored = colorLatexBody(brokenMatrix, DEFAULT_PALETTE);
    expect(() => katex.renderToString(colored, { displayMode: true, throwOnError: true })).not.toThrow();
  });

  it("heals stray closing brace in Basel sum by balancing as empty group {}", () => {
    const input = "\\sum_{n=1}^{\\infty}}\\frac{1}{n^{2}}\n=\\frac{\\pi^{2}}{6}";
    const normalized = normalizeMathSyntax(input, { crashImmunityAutoSeal: true });
    expect(normalized).toBe("\\sum_{n=1}^{\\infty}{}\\frac{1}{n^{2}}\n=\\frac{\\pi^{2}}{6}");
    expect(() => katex.renderToString(normalized, { displayMode: true, throwOnError: true })).not.toThrow();

    const colored = colorLatexBody(input, DEFAULT_PALETTE, { crashImmunityAutoSeal: true });
    expect(() => katex.renderToString(colored, { displayMode: true, throwOnError: true })).not.toThrow();
  });

  it("heals unclosed quote and stray brace like x = 1 \" if } y = 0", () => {
    const input = 'x = 1 " if } y = 0';
    const normalized = normalizeMathSyntax(input, { crashImmunityAutoSeal: true });
    expect(normalized).toBe("x = 1 \\text{ if {} y = 0}");
    expect(() => katex.renderToString(normalized, { throwOnError: true })).not.toThrow();

    const colored = colorLatexBody(input, DEFAULT_PALETTE, { crashImmunityAutoSeal: true });
    expect(() => katex.renderToString(colored, { throwOnError: true })).not.toThrow();
  });

  it("heals lone unclosed quote like x = 1 \" if y = 0", () => {
    const input = 'x = 1 " if y = 0';
    const normalized = normalizeMathSyntax(input, { crashImmunityAutoSeal: true });
    expect(normalized).toBe("x = 1 \\text{ if y = 0}");
    expect(() => katex.renderToString(normalized, { throwOnError: true })).not.toThrow();

    const doubleSpace = 'x = 1 " if  y = 0';
    const normDouble = normalizeMathSyntax(doubleSpace, { crashImmunityAutoSeal: true });
    expect(normDouble).toBe("x = 1 \\text{ if\\ \\ y = 0}");
    expect(() => katex.renderToString(normDouble, { throwOnError: true })).not.toThrow();
  });

  it("provides squiggly warning spans for both unclosed quote and stray brace", () => {
    const input = 'x = 1 " if } y = 0';
    const spans = collectDelimiterSpans(input, { highlightUnmatched: true, includeBareBraces: true });
    // Index 6 is '"' and index 11 is '}'
    const quoteWarning = spans.find((s) => s.priority === 99 && s.start === 6 && s.end === 7);
    const braceWarning = spans.find((s) => s.priority === 99 && s.start === 11 && s.end === 12);
    expect(quoteWarning).toBeDefined();
    expect(braceWarning).toBeDefined();
  });

  it("preserves squiggly warning spans in Live Preview for unclosed quotes and stray braces", async () => {
    const body = 'x = 1 " if } y = 0';
    const allSpans = computeSemanticMathSpans(body, DEFAULT_PALETTE, { rainbowDelimiters: true, highlightUnmatchedBraces: true }, false);
    
    // Simulate live_preview.ts pipeline
    let activeSpans = allSpans;
    const quoteSpans: { start: number; end: number }[] = [];
    let qi = 0;
    while (qi < body.length) {
      if (body.charCodeAt(qi) === 34) {
        let qj = qi + 1;
        let depth = 0;
        let closed = false;
        while (qj < body.length) {
          if (body.startsWith("$$", qj)) break;
          if (body[qj] === "\\") {
            qj += 2;
            continue;
          }
          if (body.charCodeAt(qj) === 34) {
            qj++;
            closed = true;
            break;
          }
          if (body[qj] === "{") {
            depth++;
          } else if (body[qj] === "}") {
            if (depth > 0) {
              depth--;
            } else {
              break;
            }
          }
          qj++;
        }
        if (closed) {
          quoteSpans.push({ start: qi, end: qj });
        }
        qi = qj;
        continue;
      }
      qi++;
    }
    if (quoteSpans.length > 0) {
      activeSpans = allSpans.filter((s) => {
        if ((s.priority ?? 0) >= 90) return true;
        if (s.priority === 10 && quoteSpans.some((q) => s.start <= q.start && s.end >= q.end)) return true;
        return !quoteSpans.some((q) => s.start < q.end && s.end > q.start);
      });
    }
    const selected = selectColorSpans(body, activeSpans);
    const nonOverlapping: ColorSpan[] = [];
    let currentEnd = -1;
    for (const span of selected) {
      if (span.start >= currentEnd) {
        nonOverlapping.push(span);
        currentEnd = span.end;
      }
    }

    const quoteWarning = nonOverlapping.find(s => (s.priority ?? 0) >= 90 && s.start === 6 && s.end === 7);
    const braceWarning = nonOverlapping.find(s => (s.priority ?? 0) >= 90 && s.start === 11 && s.end === 12);
    expect(quoteWarning).toBeDefined();
    expect(braceWarning).toBeDefined();

    // Lone unclosed quote:
    const lone = 'x = 1 "';
    const loneSpans = computeSemanticMathSpans(lone, DEFAULT_PALETTE, { rainbowDelimiters: true, highlightUnmatchedBraces: true }, false);
    const loneSelected = selectColorSpans(lone, loneSpans);
    expect(loneSelected.find(s => (s.priority ?? 0) >= 90 && s.start === 6)).toBeDefined();

    // Balanced quotes do not emit unmatched warning:
    const balanced = 'x = 1 "text" + y';
    const balancedSpans = computeSemanticMathSpans(balanced, DEFAULT_PALETTE, { rainbowDelimiters: true, highlightUnmatchedBraces: true }, false);
    expect(balancedSpans.find(s => (s.priority ?? 0) >= 90 && s.start === 6)).toBeUndefined();
  });

  it("handles \\lim_{x\\to 0} and \\lim_{x→0} without breaking extensible annotations or baseline", () => {
    const expr1 = "\\lim_{x \\to 0} \\frac{\\sin x}{x}";
    const colored1 = colorLatexBody(expr1, DEFAULT_PALETTE, { variableDataFlow: true, enableTaxonomy: true });
    expect(() => katex.renderToString(colored1, { displayMode: true, throwOnError: true })).not.toThrow();

    const expr2 = "\\lim_{x→0} f(x)";
    const colored2 = colorLatexBody(expr2, DEFAULT_PALETTE, { variableDataFlow: true, enableTaxonomy: true });
    expect(() => katex.renderToString(colored2, { displayMode: true, throwOnError: true })).not.toThrow();
    // \lim must remain plain and uncolored
    expect(colored2.startsWith("\\lim_{")).toBe(true);
    expect(colored2).not.toContain("\\textcolor{#7aa2f7}{\\lim");
  });

  it("handles extensible annotations like \\underbrace without mono-coloring the inner expression", () => {
    const expr = "\\underbrace{a+b+c}_{\\text{ three terms}}";
    const colored = colorLatexBody(expr, DEFAULT_PALETTE, { variableDataFlow: true, enableTaxonomy: true });
    expect(() => katex.renderToString(colored, { displayMode: true, throwOnError: true })).not.toThrow();
    // \underbrace must not wrap {a+b+c} into a single \textcolor
    expect(colored.startsWith("\\underbrace{")).toBe(true);
    expect(colored).not.toContain("\\textcolor{#7aa2f7}{\\underbrace");
  });
});

