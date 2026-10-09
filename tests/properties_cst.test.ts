// tests/properties_cst.test.ts
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { parseMathWithCST } from "../src/parsers/cst/index";
import { DEFAULT_COLORS } from "../src/config";
import { colorLatexBody } from "../src/converters/generic";
import { uncolorFragment } from "../src/undo";
import { validateLatexWithKaTeX } from "./validator";

// --- Fast-Check Generators for LaTeX AST Construction ---

const fcIdentifier = fc.constantFrom(
  "x", "y", "z", "t", "a", "b", "c", "n", "k", "M", "N", "V", "W", "A", "B",
  "\\alpha", "\\beta", "\\gamma", "\\theta", "\\lambda", "\\mu", "\\nu", "\\omega", "\\psi", "\\phi"
);

const fcNumber = fc.constantFrom(
  "0", "1", "2", "3", "5", "10", "42", "0.5", "3.14"
);

const fcOperator = fc.constantFrom(
  "+", "-", "=", "\\cdot", "\\times", "\\in", "\\le", "\\ge", "\\equiv", "\\wedge", "\\star"
);

const fcFunction = fc.constantFrom(
  "\\sin", "\\cos", "\\tan", "\\ln", "\\exp", "\\det", "\\dim"
);

const fcAccent = fc.constantFrom(
  "\\vec", "\\hat", "\\bar", "\\dot", "\\ddot"
);

// Recursive generator for balanced, valid LaTeX expressions up to depth 3
const fcLatexLeaf = fc.oneof(fcIdentifier, fcNumber);

const fcLatexExpr: fc.Memo<string> = fc.memo((n) => {
  if (n <= 1) return fcLatexLeaf;

  return fc.oneof(
    fcLatexLeaf,
    // Binary operator: A + B
    fc.tuple(fcLatexExpr(n - 1), fcOperator, fcLatexExpr(n - 1)).map(
      ([left, op, right]) => `${left} ${op} ${right}`
    ),
    // Standard Parentheses: (A)
    fcLatexExpr(n - 1).map((inner) => `(${inner})`),
    // Sized Parentheses: \left( A \right)
    fcLatexExpr(n - 1).map((inner) => `\\left( ${inner} \\right)`),
    // Brackets: [A]
    fcLatexExpr(n - 1).map((inner) => `[${inner}]`),
    // Fraction: \frac{A}{B}
    fc.tuple(fcLatexExpr(n - 1), fcLatexExpr(n - 1)).map(
      ([num, den]) => `\\frac{${num}}{${den}}`
    ),
    // Subscript / Superscript: A_i, A^2
    fc.tuple(fcLatexLeaf, fcLatexLeaf).map(
      ([base, script]) => `${base}_{${script}}`
    ),
    fc.tuple(fcLatexLeaf, fcLatexLeaf).map(
      ([base, script]) => `${base}^{${script}}`
    ),
    // Function call: \sin(A)
    fc.tuple(fcFunction, fcLatexExpr(n - 1)).map(
      ([fn, arg]) => `${fn}(${arg})`
    ),
    // Accent: \vec{A}
    fc.tuple(fcAccent, fcLatexLeaf).map(
      ([acc, arg]) => `${acc}{${arg}}`
    )
  );
});

describe("Item 7: Property-Based Fuzzing with fast-check", () => {
  it("Property 1: Crash-Freedom & Termination under arbitrary strings", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (rawInput) => {
        // Must never throw an unhandled exception or enter an infinite loop
        const spans = parseMathWithCST(rawInput, {
          palette: DEFAULT_COLORS,
          strictBracketWarnings: true,
          highlightUnmatched: true,
        });
        expect(Array.isArray(spans)).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  it("Property 1b: Crash-Freedom under adversarial LaTeX patterns", () => {
    const adversarialFragments = [
      "\\", "\\left", "\\right", "\\frac", "\\frac{", "\\frac{}{",
      "_", "^", "{", "}", "{{{", "}}}", "^{", "_{",
      "\\left(", "\\right)", "\\left[", "\\right]",
      "\\left\\{", "\\right\\}", "\\left.", "\\right|",
      "\\begin{matrix}", "\\end{matrix}", "% comment\n",
    ];

    const fcAdversarial = fc
      .array(fc.constantFrom(...adversarialFragments), { minLength: 1, maxLength: 10 })
      .map((chunks) => chunks.join(""));

    fc.assert(
      fc.property(fcAdversarial, (badLatex) => {
        const spans = parseMathWithCST(badLatex, { palette: DEFAULT_COLORS });
        expect(Array.isArray(spans)).toBe(true);
      }),
      { numRuns: 300 }
    );
  });

  it("Property 2: Strict Coordinate Bounding on all emitted spans", () => {
    fc.assert(
      fc.property(fcLatexExpr(3), (expr) => {
        const spans = parseMathWithCST(expr, { palette: DEFAULT_COLORS });
        for (const s of spans) {
          expect(s.start).toBeGreaterThanOrEqual(0);
          expect(s.end).toBeGreaterThan(s.start);
          expect(s.end).toBeLessThanOrEqual(expr.length);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("Property 3: Non-Crossing Spans (Strict Nesting or Disjoint)", () => {
    fc.assert(
      fc.property(fcLatexExpr(3), (expr) => {
        const spans = parseMathWithCST(expr, { palette: DEFAULT_COLORS });
        // In the final span set, any two spans A and B must not partially overlap
        for (let i = 0; i < spans.length; i++) {
          for (let j = i + 1; j < spans.length; j++) {
            const a = spans[i];
            const b = spans[j];
            const aContainsB = a.start <= b.start && b.end <= a.end;
            const bContainsA = b.start <= a.start && a.end <= b.end;
            const areDisjoint = a.end <= b.start || b.end <= a.start;

            const isValidNestingOrDisjoint = aContainsB || bContainsA || areDisjoint;
            expect(
              isValidNestingOrDisjoint,
              `Crossing spans detected in "${expr}": [${a.start}, ${a.end}] vs [${b.start}, ${b.end}]`
            ).toBe(true);
          }
        }
      }),
      { numRuns: 200 }
    );
  });

  it("Property 4: KaTeX/MathJax Grouping Preservation on valid formulas", () => {
    fc.assert(
      fc.property(fcLatexExpr(2), (expr) => {
        // If the expression was valid in KaTeX initially
        const initial = validateLatexWithKaTeX(`$$${expr}$$`);
        if (initial.valid) {
          const colored = colorLatexBody(expr, DEFAULT_COLORS, {
            useCST: true,
            rainbowDelimiters: true,
          });
          const validated = validateLatexWithKaTeX(`$$${colored}$$`);
          expect(
            validated.valid,
            `Coloring broke valid KaTeX! Original: "${expr}", Colored: "${colored}", Error: ${validated.error}`
          ).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("Property 5: Uncolor Roundtrip Invariance", () => {
    fc.assert(
      fc.property(fcLatexExpr(2), (expr) => {
        const colored = colorLatexBody(expr, DEFAULT_COLORS, { useCST: true });
        const uncolored = uncolorFragment(colored);
        expect(uncolored).toBe(expr);
      }),
      { numRuns: 150 }
    );
  });

  it("Property 6: Determinism across multiple executions", () => {
    fc.assert(
      fc.property(fcLatexExpr(3), (expr) => {
        const spans1 = parseMathWithCST(expr, { palette: DEFAULT_COLORS });
        const spans2 = parseMathWithCST(expr, { palette: DEFAULT_COLORS });
        expect(spans1).toEqual(spans2);
      }),
      { numRuns: 100 }
    );
  });
});
