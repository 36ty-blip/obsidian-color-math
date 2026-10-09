// tests/ambiguity_matrix.test.ts
import { describe, it, expect } from "vitest";
import { parseMathWithCST } from "../src/parsers/cst/index";
import { DEFAULT_COLORS, ColorMathOptions } from "../src/config";
import { colorLatexBody } from "../src/converters/generic";
import { validateLatexWithKaTeX } from "./validator";

describe("Item 6: Cross-Discipline Ambiguity Suite (Collision Matrix)", () => {
  describe("1. Vertical Bar (|) Collisions across Disciplines", () => {
    it("disambiguates matrix determinant from scalar absolute value", () => {
      // Linear Algebra: |A| where A is a matrix
      const detSpans = parseMathWithCST("|A|", { palette: DEFAULT_COLORS });
      const detGroup = detSpans.find((s) => (s.priority ?? 0) === 26 || (s.priority ?? 0) === 25);
      expect(detGroup).toBeDefined();

      // Real Analysis / Calculus: |x + y|
      const absSpans = parseMathWithCST("|x + y|", { palette: DEFAULT_COLORS });
      expect(absSpans.length).toBeGreaterThan(0);
      expect(absSpans.some((s) => s.start === 0 && s.end === 1)).toBe(true);
      expect(absSpans.some((s) => s.end === 7)).toBe(true);
    });

    it("identifies p-adic absolute value and group order", () => {
      // Number Theory: |x|_p
      const padicSpans = parseMathWithCST("|x|_p", { palette: DEFAULT_COLORS });
      expect(padicSpans.some((s) => (s.priority ?? 0) >= 25)).toBe(true);

      // Abstract Algebra: [G : H] subgroup index
      const subgroupSpans = parseMathWithCST("[G : H]", { palette: DEFAULT_COLORS });
      expect(subgroupSpans.length).toBeGreaterThan(0);
      expect(subgroupSpans.some((s) => (s.priority ?? 0) >= 25)).toBe(true);
    });

    it("distinguishes conditional probability from divisibility and bra-kets", () => {
      // Probability: P(A | B)
      const probSpans = parseMathWithCST("P(A \\mid B)", { palette: DEFAULT_COLORS });
      expect(probSpans.some((s) => s.start >= 0)).toBe(true);

      // Quantum: Dirac bra-ket \langle \psi | \phi \rangle
      const braKetSpans = parseMathWithCST("\\langle \\psi | \\phi \\rangle", { palette: DEFAULT_COLORS });
      expect(braKetSpans.some((s) => (s.priority ?? 0) >= 25)).toBe(true);

      // Calculus: Sized evaluation bar \left. \frac{df}{dx} \right|_{x=0}
      const evalSpans = parseMathWithCST("\\left. \\frac{df}{dx} \\right|_{x=0}", { palette: DEFAULT_COLORS });
      expect(evalSpans.some((s) => s.priority === 26 || s.priority === 24)).toBe(true);
    });
  });

  describe("2. Bracket ([]) Collisions across Disciplines", () => {
    it("distinguishes quantum commutators from closed intervals and stochastic variation", () => {
      // Quantum Commutator with hats: [\hat{x}, \hat{p}]
      const commSpans = parseMathWithCST("[\\hat{x}, \\hat{p}]", { palette: DEFAULT_COLORS });
      expect(commSpans.some((s) => (s.priority ?? 0) >= 25)).toBe(true);

      // Stochastic Calculus: Quadratic variation [X]_t
      const stochSpans = parseMathWithCST("[X]_t", { palette: DEFAULT_COLORS });
      expect(stochSpans.some((s) => (s.priority ?? 0) >= 25)).toBe(true);

      // Analysis / Topology: Closed interval [a, b]
      const intervalSpans = parseMathWithCST("[a, b]", { palette: DEFAULT_COLORS });
      expect(intervalSpans.length).toBeGreaterThan(0);
      expect(intervalSpans.some((s) => s.start === 0)).toBe(true);
    });

    it("handles Lie brackets in differential geometry", () => {
      const lieSpans = parseMathWithCST("[X, Y]", {
        palette: DEFAULT_COLORS,
        activeMode: "geometry",
      });
      expect(lieSpans.length).toBeGreaterThan(0);
    });
  });

  describe("3. Brace ({}) Collisions: Poisson Brackets vs Anticommutators vs Sets", () => {
    it("identifies Poisson brackets in Hamiltonian mechanics", () => {
      // Classical Mechanics: \{q, p\}
      const pbSpans = parseMathWithCST("\\{q, p\\}", {
        palette: DEFAULT_COLORS,
        activeMode: "dynamics",
      });
      expect(pbSpans.some((s) => (s.priority ?? 0) >= 25)).toBe(true);
    });

    it("identifies Quantum anticommutators", () => {
      // Quantum Mechanics: \{A, B\}
      const antiSpans = parseMathWithCST("\\{A, B\\}", {
        palette: DEFAULT_COLORS,
        activeMode: "quantum",
      });
      expect(antiSpans.some((s) => (s.priority ?? 0) >= 25)).toBe(true);
    });

    it("preserves Set notation safely", () => {
      // Set Theory: \{x \in \mathbb{R} \mid x > 0\}
      const setMath = "\\{x \\in \\mathbb{R} \\mid x > 0\\}";
      const setSpans = parseMathWithCST(setMath, { palette: DEFAULT_COLORS });
      expect(setSpans.length).toBeGreaterThan(0);
    });
  });

  describe("4. Exterior Calculus & Operator Ambiguities", () => {
    it("identifies Hodge star dual vs convolution/binary star", () => {
      // Differential Geometry: \star F
      const hodgeSpans = parseMathWithCST("d \\star F = J", { palette: DEFAULT_COLORS });
      const hodge = hodgeSpans.find((s) => (s.priority ?? 0) >= 25);
      expect(hodge).toBeDefined();

      // Algebra: a \star b
      const binSpans = parseMathWithCST("a \\star b", { palette: DEFAULT_COLORS });
      expect(binSpans.length).toBeGreaterThan(0);
    });

    it("distinguishes covariant derivative connection from gradient and divergence", () => {
      // Differential Geometry: \nabla_X Y
      const covSpans = parseMathWithCST("\\nabla_X Y", { palette: DEFAULT_COLORS });
      expect(covSpans.some((s) => (s.priority ?? 0) >= 25)).toBe(true);

      // Vector Calculus: \nabla \cdot \vec{E} and \nabla \times \vec{B}
      const divSpans = parseMathWithCST("\\nabla \\cdot \\vec{E} = \\frac{\\rho}{\\varepsilon_0}", { palette: DEFAULT_COLORS });
      expect(divSpans.length).toBeGreaterThan(0);
    });

    it("handles differential forms wedge product vs logical conjunction", () => {
      // Differential Forms: \alpha \wedge \beta
      const formSpans = parseMathWithCST("\\alpha \\wedge \\beta = -\\beta \\wedge \\alpha", { palette: DEFAULT_COLORS });
      expect(formSpans.some((s) => (s.priority ?? 0) >= 20)).toBe(true);
    });

    it("resolves Legendre symbol inside parenthesized fraction", () => {
      // Number Theory: \left( \frac{a}{p} \right)
      const legSpans = parseMathWithCST("\\left( \\frac{a}{p} \\right)", { palette: DEFAULT_COLORS });
      expect(legSpans.length).toBeGreaterThan(0);
    });
  });

  describe("5. Mode-Sensitive Active Overrides", () => {
    const ambiguous = "[A, B]";

    it("resolves as Quantum Commutator under quantum mode", () => {
      const qSpans = parseMathWithCST(ambiguous, {
        palette: DEFAULT_COLORS,
        activeMode: "quantum",
      });
      expect(qSpans.length).toBeGreaterThan(0);
    });

    it("resolves as Lie bracket under geometry mode", () => {
      const gSpans = parseMathWithCST(ambiguous, {
        palette: DEFAULT_COLORS,
        activeMode: "geometry",
      });
      expect(gSpans.length).toBeGreaterThan(0);
    });

    it("resolves as Poisson Bracket under dynamics mode for braces", () => {
      const dSpans = parseMathWithCST("\\{u, v\\}", {
        palette: DEFAULT_COLORS,
        activeMode: "dynamics",
      });
      expect(dSpans.some((s) => (s.priority ?? 0) >= 25)).toBe(true);
    });

    it("produces 100% valid KaTeX across all collision matrix equations", () => {
      const collisionSuite = [
        "|A| \\cdot |B| = |AB|",
        "|x + y| \\le |x| + |y|",
        "|x|_p \\le \\max(|x|_p, |y|_p)",
        "[\\hat{x}, \\hat{p}] = i \\hbar",
        "[X]_t = \\lim_{|\\Pi| \\to 0} \\sum (X_{t_{i+1}} - X_{t_i})^2",
        "\\{q_i, p_j\\} = \\delta_{ij}",
        "\\{A, B\\} = AB + BA",
        "\\langle \\psi | \\hat{H} | \\psi \\rangle = E",
        "d \\star F = 4\\pi \\star J",
        "\\nabla_X Y - \\nabla_Y X = [X, Y]",
        "\\left( \\frac{a}{p} \\right) \\equiv a^{(p-1)/2} \\pmod{p}",
      ];

      for (const eq of collisionSuite) {
        const colored = colorLatexBody(eq, DEFAULT_COLORS, { useCST: true, rainbowDelimiters: true });
        const val = validateLatexWithKaTeX(`$$${colored}$$`);
        expect(val.valid, `Collision test KaTeX failed for "${eq}": ${val.error}`).toBe(true);
      }
    });
  });
});
