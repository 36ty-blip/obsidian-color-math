import { describe, it, expect } from "vitest";
import { convertText } from "../src/index";
import { DEFAULT_COLORS } from "../src/config";
import { validateLatexDual, validateMarkdownMath } from "./validator";

describe("Dual-Engine MathJax & KaTeX Validation Suite", () => {
  const allFeaturesEnabled = {
    enableTaxonomy: true,
    rainbowDelimiters: true,
    variableDataFlow: true,
    colorUnits: true,
    colorDifferentials: true,
    colorBraKet: true,
    colorDimensionless: true,
    extendedFunctions: true,
  };

  const testCases = [
    // 1. Quantum Mechanics & Bra-Ket
    {
      name: "Dirac Bra-Ket inner product with Hamiltonian operator",
      input: "$$\\langle \\phi | \\hat{H} | \\psi \\rangle = \\int_{-\\infty}^{\\infty} \\phi^*(x) \\left( -\\frac{\\hbar^2}{2m} \\frac{d^2}{dx^2} + V(x) \\right) \\psi(x) \\, dx$$",
    },
    {
      name: "Quantum superposition state projection",
      input: "$$|\\psi\\rangle = \\frac{1}{\\sqrt{2}} (|0\\rangle + |1\\rangle), \\quad \\rho = |\\psi\\rangle\\langle\\psi|$$",
    },

    // 2. Matrices and Linear Algebra
    {
      name: "2x2 rotation matrix with trigonometric functions",
      input: "$$\\mathbf{R}(\\theta) = \\begin{pmatrix} \\cos\\theta & -\\sin\\theta \\\\ \\sin\\theta & \\cos\\theta \\end{pmatrix}$$",
    },
    {
      name: "Matrix eigenvalue determinant equation",
      input: "$$\\det(\\mathbf{A} - \\lambda \\mathbf{I}) = \\begin{vmatrix} a_{11} - \\lambda & a_{12} \\\\ a_{21} & a_{22} - \\lambda \\end{vmatrix} = 0$$",
    },
    {
      name: "Block matrix with array environment",
      input: "$$\\mathbf{M} = \\left[ \\begin{array}{cc|c} 1 & 0 & 2 \\\\ 0 & 1 & 3 \\end{array} \\right]$$",
    },

    // 3. Calculus & Field Theory
    {
      name: "Maxwell's curl equations",
      input: "$$\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}, \\qquad \\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}$$",
    },
    {
      name: "Multivariable chain rule",
      input: "$$\\frac{dz}{dt} = \\frac{\\partial z}{\\partial x} \\frac{dx}{dt} + \\frac{\\partial z}{\\partial y} \\frac{dy}{dt}$$",
    },
    {
      name: "Closed contour surface integral",
      input: "$$\\oint_{\\partial \\Sigma} \\mathbf{F} \\cdot d\\mathbf{r} = \\iint_{\\Sigma} (\\nabla \\times \\mathbf{F}) \\cdot d\\mathbf{S}$$",
    },

    // 4. Physical Units & Constants
    {
      name: "Photon responsivity and wavelength with units",
      input: "$$\\mathcal{R} = \\frac{I_{ph}}{P_{opt}} = \\eta \\frac{q\\lambda}{hc} = 0.85 \\, \\text{A/W} \\quad \\text{at} \\quad \\lambda = 1.55 \\, \\mu\\text{m}$$",
    },
    {
      name: "Stefan-Boltzmann radiation law",
      input: "$$P = \\sigma A T^4, \\quad \\sigma = 5.670 \\times 10^{-8} \\, \\text{W}/(\\text{m}^2 \\cdot \\text{K}^4)$$",
    },

    // 5. Engineering Dimensionless Numbers
    {
      name: "Reynolds and Mach numbers in fluid dynamics",
      input: "$$\\mathrm{Re} = \\frac{\\rho v L}{\\mu}, \\qquad \\mathrm{Ma} = \\frac{v}{c} = \\frac{v}{\\sqrt{\\gamma R T}}$$",
    },
    {
      name: "Nusselt and Prandtl heat transfer numbers",
      input: "$$\\mathrm{Nu} = 0.023 \\cdot \\mathrm{Re}^{0.8} \\cdot \\mathrm{Pr}^{0.4}$$",
    },

    // 6. Deep Nested Delimiters & Grouping
    {
      name: "Nested parentheses, brackets, and braces",
      input: "$$f(x) = \\left[ 1 + \\left( 2 + \\left\\{ 3 + (4 + x)^2 \\right\\}^3 \\right)^4 \\right]^{1/5}$$",
    },

    // 7. Boxed equations
    {
      name: "Boxed fundamental theorem of calculus",
      input: "$$\\boxed{\\int_a^b f'(x) \\, dx = f(b) - f(a)}$$",
    },
    {
      name: "Boxed Einstein mass-energy equivalence",
      input: "$$\\boxed{E = mc^2 = \\frac{m_0 c^2}{\\sqrt{1 - v^2/c^2}}}$$",
    },
  ];

  for (const tc of testCases) {
    it(`validates "${tc.name}" in both KaTeX and MathJax under default options`, () => {
      const converted = convertText(tc.input, DEFAULT_COLORS);
      const res = validateLatexDual(converted);
      if (!res.valid) {
        console.error(`Dual Validation Error for [${tc.name}]:`, res.error);
        console.error("Converted LaTeX:", converted);
      }
      expect(res.valid, `Dual engine validation failed: ${res.error}`).toBe(true);
      expect(res.katex.valid).toBe(true);
      expect(res.mathjax.valid).toBe(true);
    });

    it(`validates "${tc.name}" in both KaTeX and MathJax with ALL features active`, () => {
      const converted = convertText(tc.input, DEFAULT_COLORS, allFeaturesEnabled);
      const res = validateLatexDual(converted);
      if (!res.valid) {
        console.error(`All-features Validation Error for [${tc.name}]:`, res.error);
        console.error("Converted LaTeX:", converted);
      }
      expect(res.valid, `Dual engine validation failed: ${res.error}`).toBe(true);
      expect(res.katex.valid).toBe(true);
      expect(res.mathjax.valid).toBe(true);
    });
  }

  it("validates that markdown with multiple mixed blocks passes dual-engine scan", () => {
    const doc = `
# Physics Summary Note

Here is Euler's formula:
$$e^{i\\pi} + 1 = 0$$

And Schrödinger equation:
$$i\\hbar \\frac{\\partial}{\\partial t} \\psi(\\mathbf{r}, t) = \\left( -\\frac{\\hbar^2}{2m} \\nabla^2 + V(\\mathbf{r}, t) \\right) \\psi(\\mathbf{r}, t)$$

And a 2x2 matrix:
$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$
`;
    const converted = convertText(doc, DEFAULT_COLORS, allFeaturesEnabled);
    const result = validateMarkdownMath(converted, "both");
    expect(result.valid).toBe(true);
    expect(result.failures).toHaveLength(0);
  });
});
