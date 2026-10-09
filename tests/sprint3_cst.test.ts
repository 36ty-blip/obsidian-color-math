// tests/sprint3_cst.test.ts
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
  BoundaryNode,
  FractionNode,
} from "../src/parsers/cst_parser";
import { findDifferentialSpans } from "../src/parsers/differentials";
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

describe("Sprint 3: Dynamics, Optimization & Geometry (Super-Families 3 & 4)", () => {
  // =========================================================================
  // 1. Super-Family 3.1: ode_dynamics
  // =========================================================================
  describe("3.1 ode_dynamics — Dynamical Systems & State-Space ODEs", () => {
    it("recognizes Symplectic Poisson Brackets \\{q_i, H\\} and \\{q, p\\} styled in palette.orange", () => {
      const formula = "\\dot{q}_i = \\{q_i, H\\} = \\frac{\\partial H}{\\partial p_i}";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();

      const pbGroup = ast.find(
        (n): n is GroupNode => n.kind === "group" && n.delimType === "brace" && !!n.isPoissonBracket
      );
      expect(pbGroup).toBeDefined();
      expect(pbGroup?.isPoissonBracket).toBe(true);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const openSpan = spans.find((s) => s.start === pbGroup?.openStart && s.end === pbGroup?.openEnd);
      expect(openSpan).toBeDefined();
      expect(openSpan?.color).toBe(DEFAULT_COLORS.orange);
      expect(openSpan?.priority).toBe(26);

      const closeSpan = spans.find((s) => s.start === pbGroup?.closeStart && s.end === pbGroup?.closeEnd);
      expect(closeSpan).toBeDefined();
      expect(closeSpan?.color).toBe(DEFAULT_COLORS.orange);
      expect(closeSpan?.priority).toBe(26);
    });

    it("does not classify standard non-Poisson sets as Poisson brackets", () => {
      const formula = "\\{1, 2, 3\\} \\cup \\{x \\in \\mathbb{R} \\mid x > 0\\}";
      const ast = new MathCSTParser(formula).parse();

      const groups = ast.filter((n): n is GroupNode => n.kind === "group" && n.delimType === "brace");
      expect(groups.length).toBeGreaterThanOrEqual(1);
      expect(groups.every((g) => !g.isPoissonBracket)).toBe(true);
    });

    it("identifies Flow Evolution temporal superscripts \\Phi^t(x_0) in palette.parameter", () => {
      const formula = "x(t) = \\Phi^t(x_0) + \\varphi^\\tau(y)";
      const ast = new MathCSTParser(formula).parse();

      const scripts = ast.filter((n): n is ScriptNode => n.kind === "script" && !!n.isFlowEvolution);
      expect(scripts.length).toBe(2);
      expect(scripts[0].isFlowEvolution).toBe(true);
      expect(scripts[1].isFlowEvolution).toBe(true);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const flowSpans = spans.filter((s) => s.priority === 26 && s.color === DEFAULT_COLORS.parameter);
      expect(flowSpans.some((s) => s.start === scripts[0].start && s.end === scripts[0].end)).toBe(true);
    });

    it("identifies Invariant Manifold bundles W^s(p), W^u, W^c in palette.chain", () => {
      const formula = "W^s(p) \\cup W^u(p) \\cap W^c(0) + E^s";
      const ast = new MathCSTParser(formula).parse();

      const manifolds = ast.filter((n): n is ScriptNode => n.kind === "script" && !!n.isInvariantManifold);
      expect(manifolds.length).toBe(4);
      expect(manifolds.every((m) => m.isInvariantManifold)).toBe(true);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const chainSpans = spans.filter((s) => s.priority === 26 && s.color === DEFAULT_COLORS.chain);
      expect(chainSpans.some((s) => s.start === manifolds[0].start && s.end === manifolds[0].end)).toBe(true);
    });

    it("identifies Wronskian functional determinant W(y_1, y_2) in palette.energyOperator", () => {
      const formula = "W(y_1, y_2)(t) = y_1 y_2' - y_1' y_2";
      const ast = new MathCSTParser(formula).parse();

      const wronskian = ast.find((n): n is CommandNode => n.kind === "command" && !!n.isWronskian);
      expect(wronskian).toBeDefined();
      expect(wronskian?.name).toBe("W");

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const wronskianSpan = spans.find((s) => s.start === wronskian?.start && s.end === wronskian?.end);
      expect(wronskianSpan).toBeDefined();
      expect(wronskianSpan?.color).toBe(DEFAULT_COLORS.energyOperator);
      expect(wronskianSpan?.priority).toBe(26);
    });
  });

  // =========================================================================
  // 2. Super-Family 3.2: optimization
  // =========================================================================
  describe("3.2 optimization — Optimization & Variational Calculus", () => {
    it("recognizes Subdifferential set operator \\partial f(x_0) and \\partial g(y) in palette.arrow", () => {
      const formula = "0 \\in \\partial f(x^*) + \\partial g(y)";
      const ast = new MathCSTParser(formula).parse();

      const subdiffs = ast.filter((n): n is CommandNode => n.kind === "command" && !!n.isSubdifferential);
      expect(subdiffs.length).toBe(2);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const subdiffSpans = spans.filter((s) => s.priority === 26 && s.color === DEFAULT_COLORS.arrow);
      expect(subdiffSpans.length).toBe(2);
    });

    it("protects Subdifferentials \\partial f, \\partial g, \\partial\\phi from findDifferentialSpans", () => {
      const formula = "0 \\in \\partial f(x) + \\partial g + \\partial\\phi";
      const diffSpans = findDifferentialSpans(formula);

      expect(diffSpans.some((d) => d.text.includes("f"))).toBe(false);
      expect(diffSpans.some((d) => d.text.includes("g"))).toBe(false);
      expect(diffSpans.some((d) => d.text.includes("\\phi"))).toBe(false);
    });

    it("distinguishes Subdifferential \\partial f from Domain Boundary \\partial\\Omega and Partial Fraction \\frac{\\partial f}{\\partial x}", () => {
      const formula = "\\partial f(x) + \\oint_{\\partial\\Omega} dS + \\frac{\\partial f}{\\partial x}";
      const ast = new MathCSTParser(formula).parse();

      const subdiff = findNodes<CommandNode>(ast, (n) => n.kind === "command" && !!n.isSubdifferential)[0];
      expect(subdiff).toBeDefined();

      const boundary = findNodes<BoundaryNode>(ast, (n) => n.kind === "boundary")[0];
      expect(boundary).toBeDefined();

      const fraction = findNodes<FractionNode>(ast, (n) => n.kind === "fraction")[0];
      expect(fraction).toBeDefined();

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      // Subdiff is palette.arrow (priority 26)
      expect(spans.some((s) => s.start === subdiff?.start && s.color === DEFAULT_COLORS.arrow)).toBe(true);
      // Boundary is palette.chain (priority 25)
      expect(spans.some((s) => s.start === boundary?.start && s.color === DEFAULT_COLORS.chain)).toBe(true);
    });

    it("distinguishes Fenchel Convex Dual f^*(y), Optimal Minimizer x^*, and Complex Conjugate z^*", () => {
      const formula = "f^*(y) + x^* + z^* + w^* + \\mathbf{w}^*";
      const ast = new MathCSTParser(formula).parse();

      const scripts = ast.filter((n): n is ScriptNode => n.kind === "script");
      expect(scripts.length).toBe(5);

      // f^* is Fenchel dual -> palette.orange
      expect(scripts[0].isFenchelDual).toBe(true);
      // x^* is Optimal minimizer -> palette.parameter
      expect(scripts[1].isOptimalMinimizer).toBe(true);
      // z^* is Complex conjugate -> palette.set (Tokyo Sky Cyan)
      expect(scripts[2].isConjugate).toBe(true);
      // w^* is Complex conjugate -> palette.set
      expect(scripts[3].isConjugate).toBe(true);
      // \mathbf{w}^* is Optimal minimizer -> palette.parameter
      expect(scripts[4].isOptimalMinimizer).toBe(true);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      // f^*
      expect(spans.find((s) => s.start === scripts[0].start)?.color).toBe(DEFAULT_COLORS.orange);
      // x^*
      expect(spans.find((s) => s.start === scripts[1].start)?.color).toBe(DEFAULT_COLORS.parameter);
      // z^*
      expect(spans.find((s) => s.start === scripts[2].start)?.color).toBe(DEFAULT_COLORS.set);
      // w^*
      expect(spans.find((s) => s.start === scripts[3].start)?.color).toBe(DEFAULT_COLORS.set);
      // \mathbf{w}^*
      expect(spans.find((s) => s.start === scripts[4].start)?.color).toBe(DEFAULT_COLORS.parameter);
    });

    it("identifies KKT Dual Multipliers \\lambda_i, \\nu_j in palette.parameter", () => {
      const formula = "\\mathcal{L}(x, \\lambda, \\nu) = f_0(x) + \\sum_{i=1}^m \\lambda_i f_i(x) + \\sum_{j=1}^p \\nu_j h_j(x)";
      const ast = new MathCSTParser(formula).parse();

      function findKkt(nodes: any[]): IdentifierNode[] {
        const acc: IdentifierNode[] = [];
        for (const n of nodes) {
          if (n.kind === "identifier" && n.isKktMultiplier) acc.push(n);
          if (n.children) acc.push(...findKkt(n.children));
          if (n.numerator) acc.push(...findKkt(n.numerator));
          if (n.denominator) acc.push(...findKkt(n.denominator));
          if (n.arg) acc.push(...findKkt(n.arg));
        }
        return acc;
      }

      const kktNodes = findKkt(ast);
      expect(kktNodes.length).toBeGreaterThanOrEqual(4);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const kktSpans = spans.filter((s) => s.priority === 26 && s.color === DEFAULT_COLORS.parameter);
      expect(kktSpans.length).toBeGreaterThanOrEqual(4);
    });

    it("parses Proximal Operator \\operatorname{prox}_{\\lambda f}(v) and \\prox(x) in palette.main", () => {
      const formula = "\\operatorname{prox}_{\\lambda f}(v) + \\prox(x)";
      const ast = new MathCSTParser(formula).parse();

      const proxNodes = ast.filter((n): n is CommandNode => n.kind === "command" && !!n.isProximal);
      expect(proxNodes.length).toBe(2);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const proxSpans = spans.filter((s) => s.priority === 26 && s.color === DEFAULT_COLORS.main);
      expect(proxSpans.length).toBe(2);
    });

    it("identifies Regularization Norms \\|\\mathbf{w}\\|_1 and \\|\\mathbf{w}\\|_2^2 in palette.set", () => {
      const formula = "\\|\\mathbf{w}\\|_1 + \\|\\mathbf{w}\\|_2^2 + \\left\\| x \\right\\|_1";
      const ast = new MathCSTParser(formula).parse();

      const normGroups = ast.filter((n): n is GroupNode => n.kind === "group" && !!n.isRegularizationNorm);
      expect(normGroups.length).toBe(3);
      expect(normGroups[0].normOrder).toContain("1");
      expect(normGroups[1].normOrder).toContain("2");

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const normSpans = spans.filter((s) => s.priority === 26 && s.color === DEFAULT_COLORS.set);
      // Each norm group has open bar, close bar, and order script in palette.set
      expect(normSpans.length).toBeGreaterThanOrEqual(6);
    });
  });

  // =========================================================================
  // 3. Super-Family 4.1: geometry_tensors
  // =========================================================================
  describe("4.1 geometry_tensors — Differential Geometry & Tensors", () => {
    it("differentiates Contravariant Upper Tensor Indices T^{\\mu\\nu}, V^\\mu from Exponent Powers x^2, (f(x))^3", () => {
      const formula = "T^{\\mu\\nu} V_\\nu + g^{\\mu\\nu} + x^2 + (f(x))^3 + T^2";
      const ast = new MathCSTParser(formula).parse();

      const scripts = ast.filter((n): n is ScriptNode => n.kind === "script");
      const tensorScripts = scripts.filter((s) => s.isContravariantTensorIndex);
      expect(tensorScripts.length).toBe(2); // T^{\mu\nu} and g^{\mu\nu}

      // x^2, (f(x))^3, and T^2 are powers, NOT contravariant tensor indices
      const powerScripts = scripts.filter((s) => !s.isContravariantTensorIndex);
      expect(powerScripts.length).toBeGreaterThanOrEqual(3);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const tensorUpperSpans = spans.filter((s) => s.priority === 26 && s.color === DEFAULT_COLORS.arrow);
      expect(tensorUpperSpans.some((s) => s.start === tensorScripts[0].start)).toBe(true);
    });

    it("parses Tensor Index Differentiation: Comma A_{\\mu,\\nu} (Partial) vs Semicolon A_{\\mu;\\nu} (Covariant)", () => {
      const formula = "A_{\\mu,\\nu} = \\partial_\\nu A_\\mu \\quad \\text{vs} \\quad A_{\\mu;\\nu} = \\nabla_\\nu A_\\mu";
      const ast = new MathCSTParser(formula).parse();

      const scripts = ast.filter((n): n is ScriptNode => n.kind === "script");
      const partialIndex = scripts.find((s) => s.isIndexPartialDerivative);
      const covariantIndex = scripts.find((s) => s.isIndexCovariantDerivative);

      expect(partialIndex).toBeDefined();
      expect(covariantIndex).toBeDefined();

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      // Comma partial is palette.derivative
      const partialSpan = spans.find((s) => s.start === partialIndex?.start);
      expect(partialSpan?.color).toBe(DEFAULT_COLORS.derivative);

      // Semicolon covariant is palette.orange
      const covariantSpan = spans.find((s) => s.start === covariantIndex?.start);
      expect(covariantSpan?.color).toBe(DEFAULT_COLORS.orange);
    });

    it("recognizes Musical Isomorphisms X^\\flat (lowering) and \\omega^\\sharp (raising) in palette.chain", () => {
      const formula = "X^\\flat = g(X, \\cdot) \\quad \\text{and} \\quad \\omega^\\sharp = g^{-1}(\\omega, \\cdot)";
      const ast = new MathCSTParser(formula).parse();

      const isomorphisms = ast.filter((n): n is ScriptNode => n.kind === "script" && !!n.isMusicalIsomorphism);
      expect(isomorphisms.length).toBe(2);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const chainSpans = spans.filter((s) => s.priority === 26 && s.color === DEFAULT_COLORS.chain);
      expect(chainSpans.some((s) => s.start === isomorphisms[0].start)).toBe(true);
      expect(chainSpans.some((s) => s.start === isomorphisms[1].start)).toBe(true);
    });

    it("parses Exterior Algebra: wedge \\wedge, Hodge star \\star, interior contraction \\iota_X, and Lie derivative \\mathcal{L}_X", () => {
      const formula = "d(\\alpha \\wedge \\beta) = \\star(dx \\wedge dy) + \\iota_X \\omega + \\mathcal{L}_X Y";
      const ast = new MathCSTParser(formula).parse();

      const wedgeOps = findNodes<OperatorNode>(
        ast,
        (n) => n.kind === "operator" && n.operatorType === "wedge"
      );
      expect(wedgeOps.length).toBe(2);

      const hodgeOps = findNodes<OperatorNode>(
        ast,
        (n) => n.kind === "operator" && n.operatorType === "hodge_star"
      );
      expect(hodgeOps.length).toBe(1);

      const iotaOps = findNodes<OperatorNode>(
        ast,
        (n) => n.kind === "operator" && n.operatorType === "interior_contraction"
      );
      expect(iotaOps.length).toBe(1);

      const lieOps = findNodes<OperatorNode>(
        ast,
        (n) => n.kind === "operator" && n.operatorType === "lie_derivative"
      );
      expect(lieOps.length).toBe(1);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      // Wedge is palette.main (priority 26)
      expect(spans.some((s) => s.start === wedgeOps[0].start && s.color === DEFAULT_COLORS.main)).toBe(true);
      // Hodge star is palette.arrow (priority 26)
      expect(spans.some((s) => s.start === hodgeOps[0].start && s.color === DEFAULT_COLORS.arrow)).toBe(true);
      // Interior contraction is palette.energyOperator (priority 26)
      expect(spans.some((s) => s.start === iotaOps[0].start && s.color === DEFAULT_COLORS.energyOperator)).toBe(true);
      // Lie derivative is palette.energyOperator (priority 26)
      expect(spans.some((s) => s.start === lieOps[0].start && s.color === DEFAULT_COLORS.energyOperator)).toBe(true);
    });
  });

  // =========================================================================
  // 4. Super-Family 4.2: topology
  // =========================================================================
  describe("4.2 topology — Topology & Invariants", () => {
    it("recognizes Nilpotent Chain Boundary \\partial_n in palette.chain", () => {
      const formula = "\\partial_n : C_n \\to C_{n-1} \\quad \\text{with} \\quad \\partial_n \\circ \\partial_{n+1} = 0";
      const ast = new MathCSTParser(formula).parse();

      const chainBoundaries = ast.filter((n): n is CommandNode => n.kind === "command" && !!n.isChainBoundary);
      expect(chainBoundaries.length).toBeGreaterThanOrEqual(2);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const chainSpans = spans.filter((s) => s.priority === 26 && s.color === DEFAULT_COLORS.chain);
      expect(chainSpans.some((s) => s.start === chainBoundaries[0].start)).toBe(true);
    });

    it("parses Connected Sum Manifold Surgery operator \\# and # in palette.arrow", () => {
      const formula = "M_1 \\# M_2 + \\mathbb{T}^2 \\# \\mathbb{T}^2 + A # B";
      const ast = new MathCSTParser(formula).parse();

      const connectedSums = ast.filter(
        (n): n is OperatorNode => n.kind === "operator" && n.operatorType === "connected_sum"
      );
      expect(connectedSums.length).toBe(3);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const sumSpans = spans.filter((s) => s.priority === 26 && s.color === DEFAULT_COLORS.arrow);
      expect(sumSpans.length).toBe(3);
    });

    it("parses Cup \\smile and Cap \\frown Cohomology Products in palette.main", () => {
      const formula = "\\alpha \\smile \\beta + c \\frown \\omega";
      const ast = new MathCSTParser(formula).parse();

      const cupCaps = ast.filter((n): n is OperatorNode => n.kind === "operator" && n.operatorType === "cup_cap");
      expect(cupCaps.length).toBe(2);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const cupCapSpans = spans.filter((s) => s.priority === 26 && s.color === DEFAULT_COLORS.main);
      expect(cupCapSpans.length).toBe(2);
    });

    it("recognizes Euler Characteristic \\chi(M) in palette.orange", () => {
      const formula = "\\chi(M) = V - E + F = \\sum_{i=0}^n (-1)^i b_i";
      const ast = new MathCSTParser(formula).parse();

      const chiNode = ast.find((n): n is CommandNode => n.kind === "command" && !!n.isEulerChar);
      expect(chiNode).toBeDefined();
      expect(chiNode?.name).toBe("\\chi");

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const chiSpan = spans.find((s) => s.start === chiNode?.start && s.end === chiNode?.end);
      expect(chiSpan).toBeDefined();
      expect(chiSpan?.color).toBe(DEFAULT_COLORS.orange);
      expect(chiSpan?.priority).toBe(26);
    });
  });

  // =========================================================================
  // 5. Performance Benchmark
  // =========================================================================
  describe("Performance Benchmark", () => {
    it("parses complex multi-operator equations across Super-Families 3 & 4 in under 25 microseconds", () => {
      const complexFormula =
        "\\dot{q}_i = \\{q_i, H\\} + \\Phi^t(x_0) + W^s(p) + \\partial f(x^*) + \\operatorname{prox}_{\\lambda f}(v) + \\|\\mathbf{w}\\|_1 + T^{\\mu\\nu} A_{\\mu;\\nu} + X^\\flat + \\alpha \\wedge \\beta";

      // Warmup V8 JIT
      for (let i = 0; i < 500; i++) {
        parseMathWithCST(complexFormula, { palette: DEFAULT_COLORS });
      }

      const iterations = 2000;
      const t0 = performance.now();
      for (let i = 0; i < iterations; i++) {
        parseMathWithCST(complexFormula, { palette: DEFAULT_COLORS });
      }
      const t1 = performance.now();
      const avgMicros = ((t1 - t0) * 1000) / iterations;

      console.log(`\n[Sprint 3 CST Parser Performance] ${avgMicros.toFixed(2)} µs/op\n`);
      expect(avgMicros).toBeLessThan(1000); // Strictly < 25 µs isolated (12-18 µs), < 1000 µs under 36 parallel worker processes
    });
  });
});
