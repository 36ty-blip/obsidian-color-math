// benchmarks/cst_engine.bench.ts
import { bench, describe } from "vitest";
import { parseMathWithCST } from "../src/parsers/cst/index";
import { DEFAULT_COLORS } from "../src/config";
import { getCachedOrComputedSpans } from "../src/parsers/engine_bridge";
import { colorLatexBody } from "../src/converters/generic";

describe("CST Parser Throughput & Latency Benchmarks", () => {
  const shortEq = "(x + y)";
  const mediumEq = "\\vec{F} = m \\cdot \\left[ \\frac{d\\vec{v}}{dt} + (\\omega \\times \\vec{r}) \\right]";
  const largeEq = `\\begin{pmatrix}
    \\frac{\\partial f_1}{\\partial x_1} & \\cdots & \\frac{\\partial f_1}{\\partial x_n} \\\\
    \\vdots & \\ddots & \\vdots \\\\
    \\frac{\\partial f_m}{\\partial x_1} & \\cdots & \\frac{\\partial f_m}{\\partial x_n}
  \\end{pmatrix} = \\left[ \\sum_{i=1}^n \\left( \\int_0^1 \\frac{dx}{1+x^2} \\right) \\right]`;

  const quantumEq = "\\langle \\psi | \\hat{H} | \\psi \\rangle = E, \\quad [\\hat{x}, \\hat{p}] = i \\hbar";
  const stochasticEq = "dX_t = b(t, X_t) dt + \\sigma(t, X_t) dW_t, \\quad [X]_t = \\int_0^t \\sigma^2 ds";
  const geometryEq = "d \\star F = 4\\pi \\star J, \\quad \\nabla_X Y - \\nabla_Y X = [X, Y]";
  const pdeEq = "\\rho \\left( \\frac{\\partial \\vec{u}}{\\partial t} + (\\vec{u} \\cdot \\nabla)\\vec{u} \\right) = -\\nabla p + \\mu \\nabla^2 \\vec{u}";

  // 1. Cold Parse Benchmarks
  bench("Cold Parse - Short Formula (x + y)", () => {
    parseMathWithCST(shortEq, { palette: DEFAULT_COLORS });
  });

  bench("Cold Parse - Medium Formula (Newton-Euler)", () => {
    parseMathWithCST(mediumEq, { palette: DEFAULT_COLORS });
  });

  bench("Cold Parse - Large Formula (Jacobian & Integrals)", () => {
    parseMathWithCST(largeEq, { palette: DEFAULT_COLORS });
  });

  // 2. Disciplinary Stress Benchmarks
  bench("Discipline Stress - Quantum Mechanics", () => {
    parseMathWithCST(quantumEq, { palette: DEFAULT_COLORS, activeMode: "quantum" });
  });

  bench("Discipline Stress - Stochastic Calculus", () => {
    parseMathWithCST(stochasticEq, { palette: DEFAULT_COLORS, activeMode: "quantum_stochastic" });
  });

  bench("Discipline Stress - Differential Geometry", () => {
    parseMathWithCST(geometryEq, { palette: DEFAULT_COLORS, activeMode: "geometry" });
  });

  bench("Discipline Stress - Navier-Stokes PDE", () => {
    parseMathWithCST(pdeEq, { palette: DEFAULT_COLORS, activeMode: "pde" });
  });

  // 3. Cache Hit (Typing Keystroke Simulation)
  // Pre-seed cache
  getCachedOrComputedSpans(mediumEq, DEFAULT_COLORS, undefined, () => []);
  bench("LRU Cache Hit - Keystroke Latency", () => {
    getCachedOrComputedSpans(mediumEq, DEFAULT_COLORS, undefined, () => []);
  });

  // 4. End-to-End LaTeX Colorizer Baking (Reading View)
  bench("LaTeX Colorizer Baking - Sized Delimiters", () => {
    colorLatexBody(mediumEq, DEFAULT_COLORS, { useCST: true, rainbowDelimiters: true });
  });

  // 5. Document Viewport Simulation (50 mixed equations)
  const docEquations = [
    shortEq, mediumEq, quantumEq, stochasticEq, geometryEq, pdeEq,
    "\\int_{-\\infty}^\\infty e^{-x^2} dx = \\sqrt{\\pi}",
    "\\left( \\frac{\\partial u}{\\partial x} - i \\frac{\\partial u}{\\partial y} \\right)",
    "\\sum_{k=1}^n k = \\frac{n(n+1)}{2}",
    "E = m c^2",
  ];
  bench("Viewport Simulation - 50 Equations", () => {
    for (let i = 0; i < 5; i++) {
      for (const eq of docEquations) {
        parseMathWithCST(eq, { palette: DEFAULT_COLORS });
      }
    }
  });
});
