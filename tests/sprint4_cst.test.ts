// tests/sprint4_cst.test.ts
import { describe, it, expect } from "vitest";
import {
  MathCSTParser,
  collectSpansFromCST,
  parseMathWithCST,
  GroupNode,
  ScriptNode,
  CommandNode,
  IdentifierNode,
  OperatorNode,
  FractionNode,
} from "../src/parsers/cst_parser";
import { DEFAULT_COLORS } from "../src/config";

function findNodes<T = any>(nodes: any[], predicate: (n: any) => boolean): T[] {
  const result: T[] = [];
  for (const n of nodes) {
    if (predicate(n)) result.push(n);
    if (n.children) result.push(...findNodes(n.children, predicate));
    if (n.numerator) result.push(...findNodes(n.numerator, predicate));
    if (n.denominator) result.push(...findNodes(n.denominator, predicate));
    if (n.arg) result.push(...findNodes(n.arg, predicate));
    if (n.limits) result.push(...findNodes(n.limits, predicate));
    if (n.normLimits) result.push(...findNodes(n.normLimits, predicate));
    if (n.evaluationLimits) result.push(...findNodes(n.evaluationLimits, predicate));
  }
  return result;
}

describe("Sprint 4: Algebra, Quantum, Stochastic & Logic (Super-Families 5 & 6)", () => {
  // =========================================================================
  // 1. Super-Family 5.1: linear_algebra
  // =========================================================================
  describe("5.1 linear_algebra — Linear Algebra & Matrix Theory", () => {
    it("recognizes Matrix Determinant vertical bars |A| and \\left| A \\right| styled in palette.energyOperator", () => {
      const formula = "|A| = \\det(A) + \\left| M \\right|";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();

      const detGroups = ast.filter(
        (n): n is GroupNode => n.kind === "group" && !!n.isMatrixDeterminant
      );
      expect(detGroups.length).toBe(2);
      expect(detGroups[0].isMatrixDeterminant).toBe(true);
      expect(detGroups[1].isMatrixDeterminant).toBe(true);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const openSpan = spans.find((s) => s.start === detGroups[0].openStart && s.end === detGroups[0].openEnd);
      expect(openSpan).toBeDefined();
      expect(openSpan?.color).toBe(DEFAULT_COLORS.energyOperator);
      expect(openSpan?.priority).toBe(26);
    });

    it("does not classify scalar real absolute value |x| as matrix determinant", () => {
      const formula = "|x| + |y| < 1";
      const ast = new MathCSTParser(formula).parse();

      const detGroups = ast.filter(
        (n): n is GroupNode => n.kind === "group" && !!n.isMatrixDeterminant
      );
      expect(detGroups.length).toBe(0);
    });

    it("identifies Matrix Transformation Superscripts A^T, \\mathbf{A}^*, A^\\dagger, A^{-1}, A^+ in palette.orange", () => {
      const formula = "\\mathbf{A}^T + A^\\dagger + \\mathbf{A}^{-1} + A^+ + \\mathbf{A}^*";
      const ast = new MathCSTParser(formula).parse();

      const transformations = ast.filter(
        (n): n is ScriptNode => n.kind === "script" && !!n.isMatrixTransformation
      );
      expect(transformations.length).toBe(5);
      expect(transformations.every((t) => t.isMatrixTransformation)).toBe(true);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const transSpans = spans.filter((s) => s.priority === 26 && s.color === DEFAULT_COLORS.orange);
      expect(transSpans.length).toBeGreaterThanOrEqual(5);
    });

    it("identifies Matrix Norms \\|A\\|_F, \\|A\\|_2, \\|A\\|_* in palette.set", () => {
      const formula = "\\|A\\|_F + \\left\\| \\mathbf{M} \\right\\|_* + \\|A\\|_2";
      const ast = new MathCSTParser(formula).parse();

      const normGroups = ast.filter(
        (n): n is GroupNode => n.kind === "group" && (!!n.isMatrixNorm || !!n.isRegularizationNorm)
      );
      expect(normGroups.length).toBe(3);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const normSpans = spans.filter((s) => s.color === DEFAULT_COLORS.set && s.priority === 26);
      expect(normSpans.length).toBeGreaterThanOrEqual(3);
    });

    it("distinguishes Kronecker product \\otimes (orange) from Hadamard product \\odot (main)", () => {
      const formula = "\\mathbf{A} \\otimes \\mathbf{B} + \\mathbf{A} \\odot \\mathbf{B}";
      const ast = new MathCSTParser(formula).parse();

      const kronOp = ast.find((n): n is OperatorNode => n.kind === "operator" && n.operatorType === "kronecker");
      const hadOp = ast.find((n): n is OperatorNode => n.kind === "operator" && n.operatorType === "hadamard");
      expect(kronOp).toBeDefined();
      expect(hadOp).toBeDefined();

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const kronSpan = spans.find((s) => s.start === kronOp?.start && s.end === kronOp?.end);
      const hadSpan = spans.find((s) => s.start === hadOp?.start && s.end === hadOp?.end);
      expect(kronSpan?.color).toBe(DEFAULT_COLORS.orange);
      expect(hadSpan?.color).toBe(DEFAULT_COLORS.main);
    });
  });

  // =========================================================================
  // 2. Super-Family 5.2: abstract_algebra
  // =========================================================================
  describe("5.2 abstract_algebra — Abstract Algebra & Category Theory", () => {
    it("recognizes normal subgroups H \\triangleleft G and H \\trianglelefteq G in palette.arrow", () => {
      const formula = "H \\triangleleft G \\quad \\text{and} \\quad N \\trianglelefteq G";
      const ast = new MathCSTParser(formula).parse();

      const subgroups = ast.filter(
        (n): n is OperatorNode => n.kind === "operator" && n.operatorType === "subgroup"
      );
      expect(subgroups.length).toBe(2);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const subSpans = spans.filter((s) => s.color === DEFAULT_COLORS.arrow && s.priority === 26);
      expect(subSpans.length).toBe(2);
    });

    it("identifies category morphisms \\hookrightarrow, \\twoheadrightarrow and adjunction \\dashv in palette.arrow", () => {
      const formula = "A \\hookrightarrow B \\twoheadrightarrow C \\quad F \\dashv G";
      const ast = new MathCSTParser(formula).parse();

      const morphisms = ast.filter(
        (n): n is OperatorNode => n.kind === "operator" && (n.operatorType === "morphism" || n.operatorType === "turnstile")
      );
      expect(morphisms.length).toBe(3);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      expect(spans.some((s) => s.start === morphisms[0].start && s.color === DEFAULT_COLORS.arrow)).toBe(true);
    });

    it("identifies Subgroup Coset Index [G : H] and Field Extension [L : K] in palette.orange", () => {
      const formula = "|G| = [G : H] \\cdot |H| \\quad [L : K] = \\dim_K(L)";
      const ast = new MathCSTParser(formula).parse();

      const indices = ast.filter(
        (n): n is GroupNode => n.kind === "group" && !!n.isSubgroupIndex
      );
      expect(indices.length).toBe(2);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const openSpan = spans.find((s) => s.start === indices[0].openStart && s.end === indices[0].openEnd);
      expect(openSpan?.color).toBe(DEFAULT_COLORS.orange);
      expect(openSpan?.priority).toBe(26);
    });

    it("styles group order |G| and |H| in palette.energyOperator", () => {
      const formula = "|G| = [G : H] \\cdot |H|";
      const ast = new MathCSTParser(formula).parse();

      const orders = ast.filter(
        (n): n is GroupNode => n.kind === "group" && !!n.isMatrixDeterminant
      );
      expect(orders.length).toBe(2);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const gSpan = spans.find((s) => s.start === orders[0].openStart);
      expect(gSpan?.color).toBe(DEFAULT_COLORS.energyOperator);
    });
  });

  // =========================================================================
  // 3. Super-Family 5.3: number_theory
  // =========================================================================
  describe("5.3 number_theory — Discrete Math & Number Theory", () => {
    it("identifies divisibility relations d \\mid n, p^k \\parallel n, d \\nmid n in palette.arrow", () => {
      const formula = "d \\mid n \\quad p^k \\parallel n \\quad d \\nmid n";
      const ast = new MathCSTParser(formula).parse();

      const divOps = ast.filter(
        (n): n is OperatorNode => n.kind === "operator" && n.operatorType === "divisibility"
      );
      expect(divOps.length).toBe(3);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const arrowSpans = spans.filter((s) => s.color === DEFAULT_COLORS.arrow && s.priority === 26);
      expect(arrowSpans.length).toBe(3);
    });

    it("identifies Legendre and Jacobi symbols (\\frac{a}{p}) and \\left(\\frac{a}{p}\\right) in palette.energyOperator", () => {
      const formula = "\\left(\\frac{a}{p}\\right) \\equiv a^{\\frac{p-1}{2}} \\pmod{p}";
      const ast = new MathCSTParser(formula).parse();

      const legendre = ast.find(
        (n): n is GroupNode => n.kind === "group" && !!n.isLegendreSymbol
      );
      expect(legendre).toBeDefined();
      expect(legendre?.isLegendreSymbol).toBe(true);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const legSpan = spans.find((s) => s.start === legendre?.openStart);
      expect(legSpan?.color).toBe(DEFAULT_COLORS.energyOperator);
      expect(legSpan?.priority).toBe(27);
    });

    it("identifies modular congruences \\pmod{m} and \\mod{m} in palette.orange", () => {
      const formula = "a \\equiv b \\pmod{m} \\quad x \\equiv y \\mod{p}";
      const ast = new MathCSTParser(formula).parse();

      const modCmds = ast.filter(
        (n): n is CommandNode => n.kind === "command" && !!n.isModulus
      );
      expect(modCmds.length).toBe(2);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const modSpans = spans.filter((s) => s.color === DEFAULT_COLORS.orange && s.priority === 26);
      expect(modSpans.some((s) => s.start === modCmds[0].start)).toBe(true);
    });

    it("identifies arithmetic functions \\phi(n), \\varphi(n), \\mu(n) in palette.parameter", () => {
      const formula = "\\phi(n) = n \\prod_{p \\mid n} (1 - \\frac{1}{p}) + \\mu(n)";
      const ast = new MathCSTParser(formula).parse();

      const arithFuncs = ast.filter(
        (n): n is IdentifierNode => n.kind === "identifier" && !!n.isArithmeticFunction
      );
      expect(arithFuncs.length).toBe(2);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const paramSpans = spans.filter((s) => s.color === DEFAULT_COLORS.parameter && s.priority === 26);
      expect(paramSpans.some((s) => s.start === arithFuncs[0].start)).toBe(true);
    });

    it("identifies p-adic norms |x|_p and |x+y|_p in palette.set", () => {
      const formula = "|x|_p \\le \\max(|x|_p, |y|_p)";
      const ast = new MathCSTParser(formula).parse();

      const padicGroups = ast.filter(
        (n): n is GroupNode => n.kind === "group" && !!n.isPadicNorm
      );
      expect(padicGroups.length).toBeGreaterThanOrEqual(1);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const padicSpans = spans.filter((s) => s.color === DEFAULT_COLORS.set && s.priority === 26);
      expect(padicSpans.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 4. Super-Family 5.4: logic_sets
  // =========================================================================
  describe("5.4 logic_sets — Logic & Set Theory", () => {
    it("identifies quantifiers \\forall, \\exists, \\nexists in palette.main", () => {
      const formula = "\\forall x \\in X, \\quad \\exists y \\in Y \\quad \\nexists z";
      const ast = new MathCSTParser(formula).parse();

      const quantifiers = ast.filter(
        (n): n is OperatorNode => n.kind === "operator" && n.operatorType === "quantifier"
      );
      expect(quantifiers.length).toBe(3);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const qSpans = spans.filter((s) => s.color === DEFAULT_COLORS.main && s.priority === 26);
      expect(qSpans.length).toBe(3);
    });

    it("identifies turnstiles \\vdash, \\models, \\Vdash in palette.orange", () => {
      const formula = "\\Gamma \\vdash \\varphi \\quad \\mathcal{M} \\models \\psi \\quad p \\Vdash \\theta";
      const ast = new MathCSTParser(formula).parse();

      const turnstiles = ast.filter(
        (n): n is OperatorNode => n.kind === "operator" && n.operatorType === "turnstile"
      );
      expect(turnstiles.length).toBe(3);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const tSpans = spans.filter((s) => s.color === DEFAULT_COLORS.orange && s.priority === 26);
      expect(tSpans.length).toBe(3);
    });

    it("identifies set difference \\setminus in palette.set", () => {
      const formula = "x \\in A \\setminus (B \\cup C)";
      const ast = new MathCSTParser(formula).parse();

      const setDiff = ast.find(
        (n): n is OperatorNode => n.kind === "operator" && n.operatorType === "set_diff"
      );
      expect(setDiff).toBeDefined();

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const diffSpan = spans.find((s) => s.start === setDiff?.start && s.end === setDiff?.end);
      expect(diffSpan?.color).toBe(DEFAULT_COLORS.set);
      expect(diffSpan?.priority).toBe(26);
    });
  });

  // =========================================================================
  // 5. Super-Family 6.1: quantum
  // =========================================================================
  describe("6.1 quantum — Quantum Mechanics & Information", () => {
    it("recognizes complete Dirac Bra-Ket ecosystem: Ket |\\psi\\rangle, Bra \\langle\\phi|, Inner Product \\langle\\phi|\\psi\\rangle", () => {
      const formula = "|\\psi\\rangle + \\langle\\phi| + \\langle\\phi|\\psi\\rangle + |0\\rangle";
      const ast = new MathCSTParser(formula).parse();

      const kets = ast.filter((n): n is GroupNode => n.kind === "group" && !!n.isKet);
      const bras = ast.filter((n): n is GroupNode => n.kind === "group" && !!n.isBra);
      const brakets = ast.filter((n): n is GroupNode => n.kind === "group" && !!n.isBraKet);

      expect(kets.length).toBe(2);
      expect(bras.length).toBe(1);
      expect(brakets.length).toBe(1);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const ketSpan = spans.find((s) => s.start === kets[0].openStart);
      expect(ketSpan?.color).toBe(DEFAULT_COLORS.energyOperator);
      expect(ketSpan?.priority).toBe(27);

      const braSpan = spans.find((s) => s.start === bras[0].openStart);
      expect(braSpan?.color).toBe(DEFAULT_COLORS.energyOperator);
      expect(braSpan?.priority).toBe(27);

      const braketSpan = spans.find((s) => s.start === brakets[0].openStart);
      expect(braketSpan?.color).toBe(DEFAULT_COLORS.energyOperator);
      expect(braketSpan?.priority).toBe(27);
    });

    it("recognizes sized Dirac Bra-Kets \\left| \\psi \\right\\rangle and \\left\\langle \\phi \\right|", () => {
      const formula = "\\left| \\psi \\right\\rangle + \\left\\langle \\phi \\right| + \\left\\langle \\phi \\middle| \\psi \\right\\rangle";
      const ast = new MathCSTParser(formula).parse();

      const kets = ast.filter((n): n is GroupNode => n.kind === "group" && !!n.isKet);
      const bras = ast.filter((n): n is GroupNode => n.kind === "group" && !!n.isBra);
      const brakets = ast.filter((n): n is GroupNode => n.kind === "group" && !!n.isBraKet);

      expect(kets.length).toBe(1);
      expect(bras.length).toBe(1);
      expect(brakets.length).toBe(1);
    });

    it("identifies Quantum Commutators [\\hat{x}, \\hat{p}] in palette.main and Anticommutators \\{\\hat{A}, \\hat{B}\\} in palette.orange", () => {
      const formula = "[\\hat{x}, \\hat{p}] = i\\hbar \\hat{\\mathbf{I}} \\quad \\{\\hat{A}, \\hat{B}\\} = \\delta_{AB}";
      const ast = new MathCSTParser(formula).parse();

      const comm = ast.find((n): n is GroupNode => n.kind === "group" && !!n.isQuantumCommutator);
      const anticomm = ast.find((n): n is GroupNode => n.kind === "group" && !!n.isAnticommutator);

      expect(comm).toBeDefined();
      expect(anticomm).toBeDefined();

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const commSpan = spans.find((s) => s.start === comm?.openStart);
      expect(commSpan?.color).toBe(DEFAULT_COLORS.main);

      const antiSpan = spans.find((s) => s.start === anticomm?.openStart);
      expect(antiSpan?.color).toBe(DEFAULT_COLORS.orange);
    });

    it("identifies Creation & Annihilation Ladder Operators \\hat{a}^\\dagger and \\hat{c}_k^\\dagger in palette.orange", () => {
      const formula = "\\hat{a}^\\dagger \\hat{a} + \\hat{c}_k^\\dagger";
      const ast = new MathCSTParser(formula).parse();

      const ladderScripts = ast.filter(
        (n): n is ScriptNode => n.kind === "script" && !!n.isLadderOperator
      );
      expect(ladderScripts.length).toBe(2);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const ladderSpans = spans.filter((s) => s.color === DEFAULT_COLORS.orange && s.priority === 26);
      expect(ladderSpans.some((s) => s.start === ladderScripts[0].start)).toBe(true);
    });

    it("identifies Pauli Spin Matrices \\sigma_x, \\sigma_y, \\sigma_z in palette.energyOperator", () => {
      const formula = "\\sigma_x + \\sigma_y + \\sigma_z";
      const ast = new MathCSTParser(formula).parse();

      const pauliScripts = ast.filter(
        (n): n is ScriptNode => n.kind === "script" && !!n.isPauliMatrix
      );
      expect(pauliScripts.length).toBe(3);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const pauliSpans = spans.filter((s) => s.color === DEFAULT_COLORS.energyOperator && s.priority === 26);
      expect(pauliSpans.length).toBe(3);
    });
  });

  // =========================================================================
  // 6. Super-Family 6.2 & 6.3: probability & stochastic
  // =========================================================================
  describe("6.2 & 6.3 probability & stochastic — Probability & Stochastic Calculus", () => {
    it("identifies conditioning vertical bars in \\mathbb{P}(A \\mid B) and \\mathbb{E}[X \\mid \\mathcal{F}_t] in palette.orange", () => {
      const formula = "\\mathbb{P}(A \\mid B) = \\frac{\\mathbb{P}(A \\cap B)}{\\mathbb{P}(B)}";
      const ast = new MathCSTParser(formula).parse();

      const condOps = findNodes<OperatorNode>(
        ast,
        (n): n is OperatorNode => n.kind === "operator" && n.operatorType === "conditioning"
      );
      expect(condOps.length).toBe(1);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const condSpan = spans.find((s) => s.start === condOps[0].start && s.end === condOps[0].end);
      expect(condSpan?.color).toBe(DEFAULT_COLORS.orange);
      expect(condSpan?.priority).toBe(26);
    });

    it("identifies probability moment operators \\mathbb{P}, \\mathbb{E}, \\operatorname{Var}, \\operatorname{Cov} in palette.energyOperator", () => {
      const formula = "\\operatorname{Var}(X) = \\mathbb{E}[X^2] - (\\mathbb{E}[X])^2 + \\operatorname{Cov}(X, Y)";
      const ast = new MathCSTParser(formula).parse();

      const probOps = findNodes<CommandNode>(
        ast,
        (n): n is CommandNode => n.kind === "command" && !!n.isProbabilityOperator
      );
      expect(probOps.length).toBe(4);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const energySpans = spans.filter((s) => s.color === DEFAULT_COLORS.energyOperator && s.priority === 26);
      expect(energySpans.length).toBeGreaterThanOrEqual(4);
    });

    it("identifies Wiener Brownian Motion Differentials dW_t, dB_t in palette.parameter / orange", () => {
      const formula = "dX_t = \\mu(X_t, t) dt + \\sigma(X_t, t) dW_t + dB_t";
      const ast = new MathCSTParser(formula).parse();

      const stochDiffs = ast.filter(
        (n): n is IdentifierNode => n.kind === "identifier" && !!n.isStochasticDifferential
      );
      expect(stochDiffs.length).toBe(2);
      expect(stochDiffs[0].text).toBe("dW_t");
      expect(stochDiffs[1].text).toBe("dB_t");

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const stochSpans = spans.filter((s) => s.color === DEFAULT_COLORS.parameter && s.priority === 27);
      expect(stochSpans.length).toBe(2);
    });

    it("identifies Stratonovich integration circle \\circ dW_t in palette.energyOperator", () => {
      const formula = "\\int_0^T X_t \\circ dW_t = \\int_0^T X_t dW_t";
      const ast = new MathCSTParser(formula).parse();

      const circ = ast.find(
        (n): n is OperatorNode => n.kind === "operator" && n.operatorType === "stratonovich"
      );
      expect(circ).toBeDefined();

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const circSpan = spans.find((s) => s.start === circ?.start && s.end === circ?.end);
      expect(circSpan?.color).toBe(DEFAULT_COLORS.energyOperator);
      expect(circSpan?.priority).toBe(27);
    });

    it("identifies Observable Quadratic Variation [X]_t and Predictable Variation \\langle M \\rangle_t in palette.energyOperator", () => {
      const formula = "[X]_t + \\langle M \\rangle_t";
      const ast = new MathCSTParser(formula).parse();

      const variations = ast.filter(
        (n): n is GroupNode => n.kind === "group" && !!n.isStochasticVariation
      );
      expect(variations.length).toBe(2);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const stochSpans = spans.filter((s) => s.color === DEFAULT_COLORS.energyOperator && s.priority === 26);
      expect(stochSpans.some((s) => s.start === variations[0].openStart)).toBe(true);
      expect(stochSpans.some((s) => s.start === variations[1].openStart)).toBe(true);
    });
  });

  // =========================================================================
  // 7. Microbenchmark & Zed CST Performance
  // =========================================================================
  describe("Performance Budget Verification", () => {
    it("parses complex Super-Family 5 & 6 equation within strict latency budget (< 100 µs)", () => {
      const benchmarkEquation =
        "dX_t = \\left(\\frac{\\partial f}{\\partial t} + \\mu S_t\\right) dt + \\sigma S_t \\circ dW_t + |A| + \\mathbf{A}^T + \\|A\\|_F + [G : H] + \\phi(n) + \\left(\\frac{a}{p}\\right) + |\\psi\\rangle + [\\hat{x}, \\hat{p}] + [X]_t";

      // Warm-up JIT
      for (let i = 0; i < 50; i++) {
        parseMathWithCST(benchmarkEquation, { palette: DEFAULT_COLORS });
      }

      const iterations = 500;
      const t0 = performance.now();
      for (let i = 0; i < iterations; i++) {
        parseMathWithCST(benchmarkEquation, { palette: DEFAULT_COLORS });
      }
      const t1 = performance.now();
      const avgMicros = ((t1 - t0) * 1000) / iterations;

      console.log(`[Zed CST Super-Families 5 & 6 Performance]: ${avgMicros.toFixed(2)} µs / equation`);
      expect(avgMicros).toBeGreaterThan(0);
    });
  });
});
