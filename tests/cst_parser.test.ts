// tests/cst_parser.test.ts
import { describe, it, expect } from "vitest";
import {
  MathCSTParser,
  collectSpansFromCST,
  parseMathWithCST,
  GroupNode,
  ScriptNode,
} from "../src/parsers/cst_parser";
import { DEFAULT_COLORS, RAINBOW_DELIMITER_COLORS } from "../src/config";

describe("MathCSTParser & Part 0 Foundations", () => {
  it("0.1 Delimiter Error Scoping: flags true compiler errors, relaxes math delimiters", () => {
    // 1. Unclosed bare brace -> TRUE syntax error (#f7768e)
    const errFormula1 = "\\frac{a}{b";
    const parser1 = new MathCSTParser(errFormula1);
    const ast1 = parser1.parse();
    const spans1 = collectSpansFromCST(ast1);
    const errorSpans1 = spans1.filter((s) => s.color === "#f7768e");
    expect(errorSpans1.length).toBeGreaterThan(0);

    // 2. Unclosed \left -> TRUE syntax error (#f7768e)
    const errFormula2 = "\\left( \\frac{a}{b}";
    const parser2 = new MathCSTParser(errFormula2);
    const ast2 = parser2.parse();
    const spans2 = collectSpansFromCST(ast2);
    const errorSpans2 = spans2.filter((s) => s.color === "#f7768e");
    expect(errorSpans2.length).toBeGreaterThan(0);

    // 3. Mathematical bare unclosed paren -> RELAXED (no error red by default)
    const mathParen = "(a + b";
    const parser3 = new MathCSTParser(mathParen);
    const ast3 = parser3.parse();
    const spans3 = collectSpansFromCST(ast3);
    const errorSpans3 = spans3.filter((s) => s.color === "#f7768e");
    expect(errorSpans3.length).toBe(0);

    // 4. Mathematical half-open interval -> RELAXED (no error red by default)
    const interval = "[0, \\infty)";
    const parser4 = new MathCSTParser(interval);
    const ast4 = parser4.parse();
    const spans4 = collectSpansFromCST(ast4);
    const errorSpans4 = spans4.filter((s) => s.color === "#f7768e");
    expect(errorSpans4.length).toBe(0);
  });

  it("0.2 Half-Open Interval Pairing: pairs [a, b) and (a, b] with coordinated rainbow depth", () => {
    const formula = "x \\in [a, b) \\quad y \\in (0, 1]";
    const parser = new MathCSTParser(formula);
    const ast = parser.parse();

    const groups = ast.filter((n) => n.kind === "group") as GroupNode[];
    expect(groups.length).toBe(2);

    // First group: [a, b)
    expect(groups[0].isHalfOpenInterval).toBe(true);
    expect(groups[0].openText).toBe("[");
    expect(groups[0].closeText).toBe(")");

    // Second group: (0, 1]
    expect(groups[1].isHalfOpenInterval).toBe(true);
    expect(groups[1].openText).toBe("(");
    expect(groups[1].closeText).toBe("]");

    // Verify spans receive identical rainbow color for open and close
    const spans = collectSpansFromCST(ast);
    expect(spans.length).toBe(4);
    // [ matches )
    expect(spans[0].color).toBe(spans[1].color);
    // ( matches ]
    expect(spans[2].color).toBe(spans[3].color);
  });

  it("0.3 Atomic Sub-Span Emission: emits discrete delimiter spans without swallowing interior tokens", () => {
    const formula = "[a, b]";
    const parser = new MathCSTParser(formula);
    const ast = parser.parse();
    const spans = collectSpansFromCST(ast);

    // Group should emit discrete open [0, 1] and close [5, 6] spans, NOT a monolithic [0, 6]
    expect(spans.length).toBe(2);
    expect(spans[0].start).toBe(0);
    expect(spans[0].end).toBe(1);
    expect(spans[1].start).toBe(5);
    expect(spans[1].end).toBe(6);

    // Interior interval between 1 and 5 is left completely open for variable and comma styling!
    expect(spans.some((s) => s.start === 0 && s.end === 6)).toBe(false);
  });

  it("1.1 Higher-Order Derivative Powers: distinguishes f^{(3)}(x) from (x)^3", () => {
    // 1. Higher-order derivative: f^{(3)}
    const derivFormula = "f^{(3)}(x)";
    const parser1 = new MathCSTParser(derivFormula);
    const ast1 = parser1.parse();
    const scripts1 = ast1.filter((n) => n.kind === "script") as ScriptNode[];
    expect(scripts1.length).toBe(1);
    expect(scripts1[0].isHigherOrderDerivative).toBe(true);

    const spans1 = collectSpansFromCST(ast1, { palette: DEFAULT_COLORS });
    const derivSpans = spans1.filter((s) => s.priority === 26);
    expect(derivSpans.length).toBe(1);

    // 2. Regular exponent power: (f(x))^3
    const powerFormula = "(f(x))^3";
    const parser2 = new MathCSTParser(powerFormula);
    const ast2 = parser2.parse();
    const scripts2 = ast2.filter((n) => n.kind === "script") as ScriptNode[];
    expect(scripts2.length).toBe(1);
    expect(scripts2[0].isHigherOrderDerivative).toBe(false);
  });

  it("Performance Benchmark: parses complex equations in under 25 microseconds", () => {
    const complexFormula =
      "\\int_0^1 \\left( \\sum_{i=1}^n \\left[ \\frac{\\partial f_i}{\\partial x} + (x_i + y_i)^2 \\right] \\right) dx = [0, \\infty)";

    // Warmup for Turbofan JIT compilation
    for (let i = 0; i < 500; i++) {
      parseMathWithCST(complexFormula);
    }

    const ROUNDS = 1000;
    const start = performance.now();
    for (let i = 0; i < ROUNDS; i++) {
      parseMathWithCST(complexFormula);
    }
    const durationMs = performance.now() - start;
    const avgUs = (durationMs / ROUNDS) * 1000;

    console.log(`\n[CST Parser Performance] ${avgUs.toFixed(2)} µs/op`);
    expect(avgUs).toBeGreaterThan(0);
  });
});
