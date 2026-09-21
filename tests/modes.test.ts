import { describe, it, expect } from "vitest";
import { detectNoteMode } from "../src/parsers/frontmatter";
import { convertMathBlock } from "../src/converters/block";
import { DEFAULT_COLORS, hashStringToColor } from "../src/config";

describe("Mathematical Modes Detection", () => {
  it("detects granular modes from inline hashtags", () => {
    expect(detectNoteMode("Notes on fluids #pde and Navier-Stokes")).toBe("pde_transport");
    expect(detectNoteMode("Discussion of curvature and tensors #diffgeo")).toBe("geometry_tensors");
    expect(detectNoteMode("Lorenz attractor and chaos #ode")).toBe("ode_dynamics");
    expect(detectNoteMode("Wavefunctions and qubits #quantum")).toBe("quantum");
    expect(detectNoteMode("Brownian motion and martingales #stochastic")).toBe("stochastic");
    expect(detectNoteMode("Eigenvalues and vector spaces #linear-algebra")).toBe("linear_algebra");
    expect(detectNoteMode("Prime distribution #number-theory")).toBe("number_theory");
    expect(detectNoteMode("Simplicial complexes #topology")).toBe("topology");
  });

  it("detects modes from YAML frontmatter metadata properties", () => {
    const yamlPde = `---
subject: Partial Differential Equations
topic: Fluid Dynamics
---
# Fluid Notes`;
    expect(detectNoteMode(yamlPde)).toBe("pde_transport");

    const yamlGR = `---
field: General Relativity
topic: Curved Spacetime
---
# Einstein Equations`;
    expect(detectNoteMode(yamlGR)).toBe("geometry_tensors");

    const yamlODE = `---
subject: Dynamical Systems
category: Chaos Theory
---
# Bifurcations`;
    expect(detectNoteMode(yamlODE)).toBe("ode_dynamics");

    const yamlIto = `---
topic: Stochastic Calculus
subject: Mathematical Finance
---
# Black Scholes`;
    expect(detectNoteMode(yamlIto)).toBe("stochastic");
  });

  it("detects modes from frontmatter tags array including nested tags", () => {
    const yamlTags = `---
tags:
  - math/differential-geometry
  - physics/gr
---`;
    expect(detectNoteMode(yamlTags)).toBe("geometry_tensors");

    const yamlPdeTags = `---
tags:
  - physics/fluid-dynamics
  - math/pde
---`;
    expect(detectNoteMode(yamlPdeTags)).toBe("pde_transport");
  });

  it("falls back to user-configured default mode when no metadata is present", () => {
    expect(detectNoteMode("Just some general text without tags", undefined, "analysis")).toBe("analysis");
    expect(detectNoteMode("Untagged note", undefined, "geometry")).toBe("geometry");
  });
});

describe("Mode-Aware Derivative & Operator Rendering", () => {
  const palette = { ...DEFAULT_COLORS };

  it("Geometry mode: colors coordinate tangent vectors by their coordinate colors", () => {
    const raw = "$$\\frac{\\partial}{\\partial t} + \\frac{\\partial}{\\partial p}$$";
    const converted = convertMathBlock(raw, palette, { activeMode: "geometry_tensors" });
    const tColor = hashStringToColor("t");
    const pColor = hashStringToColor("p");

    expect(converted).toContain(`\\textcolor{${tColor}}{\\frac{\\partial}{\\partial t}}`);
    expect(converted).toContain(`\\textcolor{${pColor}}{\\frac{\\partial}{\\partial p}}`);
  });

  it("Geometry mode: highlights Christoffel symbols and wedge products", () => {
    const raw = "$$\\Gamma^\\lambda_{\\mu\\nu} + \\omega \\wedge \\eta$$";
    const converted = convertMathBlock(raw, palette, { activeMode: "geometry_tensors" });
    expect(converted).toContain("\\textcolor{#e0af68}{\\Gamma}");
    expect(converted).toContain("\\textcolor{#f7768e}{\\wedge}");
  });

  it("PDE mode: highlights material derivative D/Dt and distinguishes temporal vs spatial derivatives", () => {
    const raw = "$$\\frac{D\\mathbf{u}}{Dt} = -\\frac{1}{\\rho}\\nabla p + \\nu \\nabla^2 \\mathbf{u}$$";
    const converted = convertMathBlock(raw, palette, { activeMode: "pde_transport" });
    expect(converted).toContain(`\\textcolor{${palette.orange}}{\\frac{D\\mathbf{u}}{Dt}}`);
    expect(converted).toContain("\\textcolor{#2ac3de}{\\nabla}");
  });

  it("ODE mode: applies Numerator Target Tracking so numerator state variables pop", () => {
    const raw = "$$\\frac{dx}{dt} + \\frac{dy}{dt}$$";
    const converted = convertMathBlock(raw, palette, { activeMode: "ode_dynamics" });
    const xColor = hashStringToColor("x");
    const yColor = hashStringToColor("y");

    expect(converted).toContain(`\\textcolor{${xColor}}{x}`);
    expect(converted).toContain(`\\textcolor{${yColor}}{y}`);
  });

  it("Calculus mode: performs symmetric 1-form quotient split", () => {
    const raw = "$$\\frac{\\partial x}{\\partial t}$$";
    const converted = convertMathBlock(raw, palette, { activeMode: "calculus" });
    const xColor = hashStringToColor("x");
    const tColor = hashStringToColor("t");

    expect(converted).toContain(`\\textcolor{${xColor}}{\\partial x}`);
    expect(converted).toContain(`\\textcolor{${tColor}}{\\partial t}`);
  });

  it("Complex Analysis mode: recognizes Wirtinger derivatives", () => {
    const raw = "$$\\frac{\\partial f}{\\partial z} = 0$$";
    const converted = convertMathBlock(raw, palette, { activeMode: "complex" });
    expect(converted).toContain("\\textcolor{#7aa2f7}{\\frac{\\partial f}{\\partial z}}");
  });

  it("Stochastic mode: highlights Itô differentials dW_t", () => {
    const raw = "$$dX_t = \\mu X_t dt + \\sigma X_t dW_t$$";
    const converted = convertMathBlock(raw, palette, { activeMode: "stochastic" });
    expect(converted).toContain("\\textcolor{#73daca}{dW_{t}}");
  });
});
