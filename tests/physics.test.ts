import { describe, it, expect } from "vitest";
import { convertMathBlock } from "../src/converters/block";
import { DEFAULT_COLORS } from "../src/config";

describe("Quantum Mechanics Operators", () => {
  const quantumPalette = {
    ...DEFAULT_COLORS,
    energyOperator: "#2ac3de",
  };

  const quantumOptions = {
    colorQuantumOperators: true,
    field: "quantum",
  };

  it("colors energy operator i\\hbar\\frac{\\partial}{\\partial t} with quantum color", () => {
    const raw = "$$i\\hbar\\frac{\\partial}{\\partial t}\\psi$$";
    const converted = convertMathBlock(raw, quantumPalette, quantumOptions);
    expect(converted).toContain("\\textcolor{#2ac3de}{i\\hbar\\frac{\\partial}{\\partial t}}");
  });

  it("colors energy operator with dfrac and spacing", () => {
    const raw = "$$i \\hbar \\dfrac{\\partial}{\\partial t}$$";
    const converted = convertMathBlock(raw, quantumPalette, quantumOptions);
    expect(converted).toContain("\\textcolor{#2ac3de}{i \\hbar \\dfrac{\\partial}{\\partial t}}");
  });

  it("colors energy operator with partial subscript i\\hbar\\partial_t", () => {
    const raw = "$$i\\hbar\\partial_t\\psi = \\hat{H}\\psi$$";
    const converted = convertMathBlock(raw, quantumPalette, quantumOptions);
    expect(converted).toContain("\\textcolor{#2ac3de}{i\\hbar\\partial_{t}}");
  });

  it("colors Unicode energy operator iℏ\\frac{∂}{∂t}", () => {
    const raw = "$$iℏ\\frac{∂}{∂t}𝜓$$";
    const converted = convertMathBlock(raw, quantumPalette, quantumOptions);
    expect(converted).toContain("\\textcolor{#2ac3de}{iℏ\\frac{∂}{∂t}}");
  });

  it("colors momentum operator -i\\hbar\\nabla and -i\\hbar\\frac{\\partial}{\\partial x}", () => {
    const raw3D = "$$\\hat{\\mathbf{p}} = -i\\hbar\\nabla$$";
    const converted3D = convertMathBlock(raw3D, quantumPalette, quantumOptions);
    expect(converted3D).toContain("\\textcolor{#2ac3de}{-i\\hbar\\nabla}");

    const raw1D = "$$\\hat{p}_x = -i\\hbar\\frac{\\partial}{\\partial x}$$";
    const converted1D = convertMathBlock(raw1D, quantumPalette, quantumOptions);
    expect(converted1D).toContain("\\textcolor{#2ac3de}{-i\\hbar\\frac{\\partial}{\\partial x}}");
  });

  it("colors kinetic energy operator -\\frac{\\hbar^2}{2m}\\nabla^2", () => {
    const raw = "$$\\hat{T} = -\\frac{\\hbar^2}{2m}\\nabla^2$$";
    const converted = convertMathBlock(raw, quantumPalette, quantumOptions);
    expect(converted).toContain("\\textcolor{#2ac3de}{-\\frac{\\hbar^{2}}{2m}\\nabla^{2}}");
  });

  it("colors ladder operator \\hat{a}^\\dagger", () => {
    const raw = "$$\\hat{a}^\\dagger\\hat{a}$$";
    const converted = convertMathBlock(raw, quantumPalette, quantumOptions);
    expect(converted).toContain("\\textcolor{#2ac3de}{\\hat{a}^{\\dagger}}");
  });

  it("does NOT color energy operator with quantum hue when quantum options are disabled", () => {
    const raw = "$$i\\hbar\\frac{\\partial}{\\partial t}\\psi$$";
    const standardConverted = convertMathBlock(raw, DEFAULT_COLORS, {
      colorQuantumOperators: false,
    });
    // Should NOT contain the quantum cyan wrapper
    expect(standardConverted).not.toContain("\\textcolor{#2ac3de}{i\\hbar\\frac{\\partial}{\\partial t}}");
  });
});
