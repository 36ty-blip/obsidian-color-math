// tests/sprint2_cst.test.ts
import { describe, it, expect } from "vitest";
import {
  MathCSTParser,
  collectSpansFromCST,
  parseMathWithCST,
  BoundaryNode,
  GroupNode,
  FractionNode,
  ScriptNode,
  IdentifierNode,
  OperatorNode,
} from "../src/parsers/cst_parser";
import { findDifferentialSpans } from "../src/parsers/differentials";
import { DEFAULT_COLORS } from "../src/config";

describe("Sprint 2: Analysis, Calculus & PDEs (Super-Families 1 & 2)", () => {
  // 1. Boundary Surface Isolation (0.4 & 2.1)
  describe("0.4 & 2.1 Boundary Surface Isolation", () => {
    it("parses domain boundaries (\\partial\\Omega, \\partial V, \\partial D) as BoundaryNode", () => {
      const formula = "\\oint_{\\partial\\Omega} (\\rho \\mathbf{u}) \\cdot \\mathbf{n} \\, dS = \\int_{\\Omega} \\nabla \\cdot (\\rho \\mathbf{u}) \\, dV";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();

      // Find boundary node
      function findBoundary(nodes: any[]): BoundaryNode | null {
        for (const n of nodes) {
          if (n.kind === "boundary") return n;
          if (n.children) {
            const res = findBoundary(n.children);
            if (res) return res;
          }
          if (n.arg) {
            const res = findBoundary(n.arg);
            if (res) return res;
          }
        }
        return null;
      }

      const boundary = findBoundary(ast);
      expect(boundary).not.toBeNull();
      expect(boundary?.operatorText).toBe("\\partial");
      expect(boundary?.targetText).toBe("\\Omega");

      // Verify operator span is emitted with palette.chain (green) and priority 25
      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const opEnd = (boundary?.start ?? 0) + (boundary?.operatorText.length ?? 0);
      const boundarySpan = spans.find((s) => s.start === boundary?.start && s.end === opEnd);
      expect(boundarySpan).toBeDefined();
      expect(boundarySpan?.color).toBe(DEFAULT_COLORS.chain);
      expect(boundarySpan?.priority).toBe(25);
    });

    it("protects boundary surfaces from being captured by findDifferentialSpans", () => {
      const formula = "\\oint_{\\partial\\Omega} \\mathbf{F} \\cdot d\\mathbf{S} + \\partial V + \\partial D";
      const diffSpans = findDifferentialSpans(formula);

      // Ensure \partial\Omega, \partial V, \partial D are NOT in differential spans
      expect(diffSpans.some((d) => d.text.includes("\\Omega"))).toBe(false);
      expect(diffSpans.some((d) => d.text.includes("V"))).toBe(false);
      expect(diffSpans.some((d) => d.text.includes("D"))).toBe(false);
    });

    it("handles braced domain surfaces and subscripts (\\partial{\\Omega}, \\partial\\Omega_1)", () => {
      const formula1 = "\\partial{\\Omega}";
      const ast1 = new MathCSTParser(formula1).parse();
      expect(ast1[0].kind).toBe("boundary");

      const formula2 = "\\partial\\Omega_1";
      const ast2 = new MathCSTParser(formula2).parse();
      expect(ast2[0].kind).toBe("boundary");
      expect((ast2[0] as BoundaryNode).subscript).toBe("_1");
    });
  });

  // 2. Calculus Enhancements (1.1)
  describe("1.1 Calculus Enhancements", () => {
    it("recognizes higher-order derivatives with symbolic orders f^{(n)}(x), f^{(k)}(x), f'''(x)", () => {
      const formula = "f^{(n)}(x) + g^{(k+1)}(x) + y'''(x)";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();

      const scripts = ast.filter((n) => n.kind === "script") as ScriptNode[];
      expect(scripts.length).toBe(3);
      expect(scripts[0].isHigherOrderDerivative).toBe(true);
      expect(scripts[1].isHigherOrderDerivative).toBe(true);
      expect(scripts[2].isHigherOrderDerivative).toBe(true);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const derivSpans = spans.filter((s) => s.priority === 26 && s.color === DEFAULT_COLORS.derivative);
      expect(derivSpans.length).toBe(3);
    });

    it("distinguishes higher-order derivative f^{(3)}(x) from regular exponent power (f(x))^3", () => {
      const formula = "(f(x))^3";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();

      const scripts = ast.filter((n) => n.kind === "script") as ScriptNode[];
      expect(scripts.length).toBe(1);
      expect(scripts[0].isHigherOrderDerivative).toBe(false);
    });

    it("styles evaluation limit bars: [F(x)]_a^b and \\left. \\frac{df}{dx} \\right|_{x=0}", () => {
      // 1. Bracket evaluation limits: [F(x)]_a^b
      const formula1 = "[F(x)]_a^b";
      const parser1 = new MathCSTParser(formula1);
      const ast1 = parser1.parse();
      const group1 = ast1[0] as GroupNode;
      expect(group1.isEvaluationBar).toBe(true);
      expect(group1.evaluationLimits?.length).toBe(2);

      const spans1 = collectSpansFromCST(ast1, { palette: DEFAULT_COLORS });
      const evalSpans1 = spans1.filter((s) => s.priority === 26 && s.color === DEFAULT_COLORS.derivative);
      expect(evalSpans1.length).toBe(3); // close bracket + 2 limits

      // 2. Sized evaluation limit bar: \\left. \\frac{df}{dx} \\right|_{x=0}
      const formula2 = "\\left. \\frac{df}{dx} \\right|_{x=0}";
      const parser2 = new MathCSTParser(formula2);
      const ast2 = parser2.parse();
      const group2 = ast2[0] as GroupNode;
      expect(group2.isEvaluationBar).toBe(true);
    });
  });

  // 3. Complex Analysis (1.2)
  describe("1.2 Complex Analysis", () => {
    it("identifies holomorphic and anti-holomorphic Wirtinger differentials", () => {
      const formula = "\\frac{\\partial f}{\\partial z} + \\frac{\\partial f}{\\partial \\bar{z}}";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();

      const fractions = ast.filter((n) => n.kind === "fraction") as FractionNode[];
      expect(fractions.length).toBe(2);

      // Holomorphic: \partial / \partial z
      expect(fractions[0].isWirtinger).toBe(true);
      expect(fractions[0].isHolomorphic).toBe(true);

      // Anti-holomorphic: \partial / \partial \bar{z}
      expect(fractions[1].isWirtinger).toBe(true);
      expect(fractions[1].isHolomorphic).toBe(false);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const wirtingerSpans = spans.filter((s) => s.priority === 28);
      expect(wirtingerSpans.length).toBe(2);
    });

    it("recognizes Residue operator and styles isolated singularity pole z_0 distinctly", () => {
      const formula = "\\operatorname{Res}(f, z_0)";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      // Residue operator
      const resSpan = spans.find((s) => s.color === DEFAULT_COLORS.orange && s.priority === 26);
      expect(resSpan).toBeDefined();

      // Singularity pole z_0
      const poleSpan = spans.find((s) => s.color === DEFAULT_COLORS.parameter && s.priority === 26);
      expect(poleSpan).toBeDefined();
    });

    it("preserves complex conjugation \\bar{z}, \\overline{w}, z^* in Tokyo Sky Cyan", () => {
      const formula = "\\bar{z} + \\overline{w} + z^*";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const conjSpans = spans.filter((s) => s.color === DEFAULT_COLORS.set && s.priority === 25);
      expect(conjSpans.length).toBe(3);
    });

    it("parses Cauchy Principal Value \\text{P.V.} \\int as unified singular contour operator", () => {
      const formula = "\\text{P.V.} \\int_{-\\infty}^{\\infty} \\frac{f(x)}{x} dx";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();

      const pvNode = ast.find((n) => n.kind === "operator" && (n as OperatorNode).operatorType === "principal_value");
      expect(pvNode).toBeDefined();

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const pvSpan = spans.find((s) => s.priority === 28);
      expect(pvSpan).toBeDefined();
      expect(pvSpan?.color).toBe(DEFAULT_COLORS.energyOperator);
    });

    it("identifies imaginary unit i in 2\\pi i and e^{i\\theta}", () => {
      const formula = "2\\pi i";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const iSpan = spans.find((s) => s.color === DEFAULT_COLORS.parameter && s.priority === 26);
      expect(iSpan).toBeDefined();
    });
  });

  // 4. Transport & Continuum Mechanics (2.1 & 2.2)
  describe("2.1 & 2.2 Transport & Continuum Mechanics", () => {
    it("recognizes nonlinear convective derivative (\\mathbf{u} \\cdot \\nabla)\\mathbf{u}", () => {
      const formula = "(\\mathbf{u} \\cdot \\nabla)\\mathbf{u}";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();

      const g = ast[0] as GroupNode;
      expect(g.isConvectiveAdvection).toBe(true);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const advSpan = spans.find((s) => s.priority === 27);
      expect(advSpan).toBeDefined();
      expect(advSpan?.color).toBe(DEFAULT_COLORS.derivative);
    });

    it("recognizes dimensionless numbers (\\mathrm{Re}, Ma, Pr, Kn) as atomic constants", () => {
      const formula = "\\mathrm{Re} + Ma + Pr + Kn";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();

      const ids = ast.filter((n) => n.kind === "identifier") as IdentifierNode[];
      expect(ids.every((id) => id.isDimensionless)).toBe(true);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const dimSpans = spans.filter((s) => s.color === DEFAULT_COLORS.parameter && s.priority === 26);
      expect(dimSpans.length).toBe(4);
    });

    it("parses interface jumps [[u]] and interface averages {{u}}", () => {
      const formula = "[[u]] + \\{\\{v\\}\\}";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();

      const groups = ast.filter((n) => n.kind === "group") as GroupNode[];
      expect(groups.length).toBe(2);
      expect(groups[0].isInterfaceJump).toBe(true);
      expect(groups[1].isInterfaceAverage).toBe(true);

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const jumpSpans = spans.filter((s) => s.priority === 26 && s.color === DEFAULT_COLORS.set);
      expect(jumpSpans.length).toBe(4); // 2 open, 2 close
    });

    it("styles colon in \\boldsymbol{\\sigma} : \\boldsymbol{\\varepsilon} as Frobenius double contraction", () => {
      const formula = "\\boldsymbol{\\sigma} : \\boldsymbol{\\varepsilon}";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();

      const op = ast.find((n) => n.kind === "operator" && (n as OperatorNode).text === ":") as OperatorNode;
      expect(op).toBeDefined();
      expect(op.operatorType).toBe("contraction");

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const colonSpan = spans.find((s) => s.start === op.start && s.end === op.end);
      expect(colonSpan).toBeDefined();
      expect(colonSpan?.color).toBe(DEFAULT_COLORS.main);
      expect(colonSpan?.priority).toBe(26);
    });

    it("styles \\Box as hyperbolic wave operator", () => {
      const formula = "\\Box \\phi = 0";
      const parser = new MathCSTParser(formula);
      const ast = parser.parse();

      const boxOp = ast.find((n) => n.kind === "operator" && (n as OperatorNode).operatorType === "wave");
      expect(boxOp).toBeDefined();

      const spans = collectSpansFromCST(ast, { palette: DEFAULT_COLORS });
      const boxSpan = spans.find((s) => s.priority === 26 && s.color === DEFAULT_COLORS.energyOperator);
      expect(boxSpan).toBeDefined();
    });
  });
});
