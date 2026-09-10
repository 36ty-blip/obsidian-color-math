import { describe, it, expect } from "vitest";
import { colorLatexBody } from "../src/converters/generic";
import { convertText } from "../src/converters/block";
import { DEFAULT_COLORS } from "../src/config";
import { validateLatexWithKaTeX } from "./validator";

describe("User Formula Test", () => {
  it("colors user formula with arrow, parameter lambda, mu, and relation", () => {
    const input = "\\boxed{^{4}F_{3/2}\\rightarrow{}^{4}I_{11/2}, \\qquad\\lambda=1.064\\, \\mu\\text{m}}";
    const result = colorLatexBody(input, DEFAULT_COLORS, {
      enableTaxonomy: true,
      rainbowDelimiters: true,
      variableDataFlow: false,
    });
    console.log("Transformed User Formula:\n", result);
    // \rightarrow colored with arrow color
    expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.arrow}}{\\rightarrow}`);
    // \lambda colored with parameter color
    expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.parameter}}{\\lambda}`);
    // \mu\text{m} colored with physical unit color (not parameter!)
    expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.unit}}{\\mu\\text{m}}`);
    expect(result).not.toContain(`\\textcolor{${DEFAULT_COLORS.parameter}}{\\mu}`);
    // = colored with relation color
    expect(result).toContain(`\\textcolor{white}{=}`);
  });

  it("checks dot N = P lambda / hc with taxonomy", () => {
    const input = "\\dot N = \\frac{P\\lambda}{hc}";
    const result = colorLatexBody(input, DEFAULT_COLORS, {
      enableTaxonomy: true,
      rainbowDelimiters: true,
      variableDataFlow: false,
    });
    console.log("Transformed dot N (taxonomy):\n", result);
    // Should wrap the whole \dot N together as derivative, never \dot \textcolor
    expect(result).toContain(`\\textcolor{${DEFAULT_COLORS.derivative}}{\\dot N}`);
    expect(result).not.toContain("\\dot \\textcolor");
  });

  it("checks dot N = P lambda / hc with variable data-flow hashing", () => {
    const input = "\\dot N = \\frac{P\\lambda}{hc}";
    const result = colorLatexBody(input, DEFAULT_COLORS, {
      enableTaxonomy: true,
      rainbowDelimiters: true,
      variableDataFlow: true,
    });
    console.log("Transformed dot N (variable hashing):\n", result);
    // Should wrap the whole \dot N together in the variable color, never \dot \textcolor
    expect(result).not.toContain("\\dot \\textcolor");
    expect(result).toContain("{\\dot N}");
  });

  it("converts inline math with single dollar signs", () => {
    const text = "Rate is $\\dot N = \\frac{P\\lambda}{hc}$ for laser.";
    const result = convertText(text, DEFAULT_COLORS, {
      enableTaxonomy: true,
      rainbowDelimiters: true,
      variableDataFlow: true,
    });
    console.log("Transformed inline math markdown:\n", result);
    expect(result).toContain("$");
    expect(result).not.toContain("$$");
    expect(result).toContain("{\\dot N}");
    expect(result).not.toContain("\\dot \\textcolor");
  });

  it("handles physics and metric unit formulas accurately without false positives", () => {
    const opts = { enableTaxonomy: true };

    // 1. Responsivity with A/W unit and \mathcal R
    const eq1 = "# $$\\boxed{\\mathcal R=\\frac{I_{ph}}{P_{opt}}=\\eta\\frac{q}{h\\nu}=\\eta\\frac{q\\lambda}{hc}\\quad(\\text{A/W})}$$";
    const res1 = convertText(eq1, DEFAULT_COLORS, opts);
    expect(res1).toContain(`\\textcolor{${DEFAULT_COLORS.unit}}{\\text{A/W}}`);
    expect(res1).toContain(`\\textcolor{${DEFAULT_COLORS.main}}{\\mathcal R}`);

    // 2. Inline boxed responsivity with value
    const eq2 = "$\\mathcal R=\\boxed{0.315\\,\\text{A/W}}$";
    const res2 = convertText(eq2, DEFAULT_COLORS, opts);
    expect(res2).toContain(`\\textcolor{${DEFAULT_COLORS.unit}}{\\text{A/W}}`);
    expect(res2).toContain(`\\textcolor{${DEFAULT_COLORS.main}}{\\mathcal R}`);

    // 3. Four-point probe resistivity
    const eq3 = "$$\\rho=2\\pi s\\frac VI$$";
    const res3 = convertText(eq3, DEFAULT_COLORS, opts);
    expect(res3).toContain(`\\textcolor{${DEFAULT_COLORS.parameter}}{\\rho}`);
    expect(res3).toContain(`\\textcolor{${DEFAULT_COLORS.orange}}{\\pi}`);

    // 4. Infinite potential well (8mL^2 should NOT match mL as milliliters)
    const eq4 = "$$\\boxed{E_n=\\frac{n^2h^2}{8mL^2},\\qquad \\psi_n=\\sqrt{\\frac2L}\\sin\\!\\left(\\frac{n\\pi x}{L}\\right)}$$";
    const res4 = convertText(eq4, DEFAULT_COLORS, opts);
    expect(res4).not.toContain(`\\textcolor{${DEFAULT_COLORS.unit}}{mL}`);
    expect(res4).toContain("8mL");
    expect(res4).toContain(`\\textcolor{${DEFAULT_COLORS.main}}{\\sin}`);

    // 5. de Broglie wavelength (2mK should NOT match mK as milliKelvin)
    const eq5 = "# $$\\boxed{\\lambda=\\frac hp=\\frac{h}{mv}=\\frac{h}{\\sqrt{2mK}}=\\frac{h}{\\sqrt{2mqV}}}$$";
    const res5 = convertText(eq5, DEFAULT_COLORS, opts);
    expect(res5).not.toContain(`\\textcolor{${DEFAULT_COLORS.unit}}{mK}`);
    const eq6 = "$$\\boxed{\\lambda=\\frac{12.27}{\\sqrt V}\\ \\text{Å}}$$";
    const equations = [eq1, eq2, eq3, eq4, eq5, eq6];
    const optsUser = {
      ...opts,
      variableDataFlow: true,
      rainbowDelimiters: true,
    };
    // Test unbraced fractions, roots, and subscripts are properly enclosed with braces
    const unbracedFrac = "$$\\frac2L$$";
    const coloredFrac = convertText(unbracedFrac, DEFAULT_COLORS, optsUser);
    expect(coloredFrac).not.toContain("\\frac2\\textcolor");
    expect(coloredFrac).toMatch(/\\frac\{2\}\{\\textcolor\{#[0-9a-fA-F]+\}\{L\}\}/);

    const unbracedVI = "$$\\frac VI$$";
    const coloredVI = convertText(unbracedVI, DEFAULT_COLORS, optsUser);
    expect(coloredVI).not.toContain("\\frac \\textcolor");
    expect(coloredVI).toMatch(/\\frac\{\\textcolor\{#[0-9a-fA-F]+\}\{V\}\}\{\\textcolor\{#[0-9a-fA-F]+\}\{I\}\}/);

    const unbracedSqrt = "$$\\sqrt V$$";
    const coloredSqrt = convertText(unbracedSqrt, DEFAULT_COLORS, optsUser);
    expect(coloredSqrt).not.toContain("\\sqrt \\textcolor");
    expect(coloredSqrt).toMatch(/\\sqrt\{\\textcolor\{#[0-9a-fA-F]+\}\{V\}\}/);

    // Test that all other font styles and accents wrap cleanly from the outside
    const fontStyles = [
      "$\\mathbf F$",
      "$\\mathbb R$",
      "$\\mathfrak g$",
      "$\\boldsymbol x$",
      "$\\mathsf T$",
      "$\\vec v$",
      "$\\hat p$",
      "$\\bar z$",
      "$\\tilde y$"
    ];
    for (const fs of fontStyles) {
      const out = convertText(fs, DEFAULT_COLORS, optsUser);
      // Ensure \textcolor is on the OUTSIDE of the macro, never between macro and letter
      expect(out).not.toMatch(/\\[a-zA-Z]+\s*\\textcolor/);
      expect(out).toMatch(/\\textcolor\{#[0-9a-fA-F]+\}\{\\[a-zA-Z]+/);
    }

    const ravOut = convertText("$\\mathcal RAV$", DEFAULT_COLORS, optsUser);
    expect(ravOut).toContain("\\mathcal R");
    expect(ravOut).not.toContain("\\mathcal RAV");
    expect(ravOut).not.toContain("\\mathcal{RAV}");
  });

  it("validates all converted formulas using KaTeX math engine", () => {
    const opts = {
      enableTaxonomy: true,
      variableDataFlow: true,
      rainbowDelimiters: true,
      colorUnits: true,
      colorDifferentials: true,
      colorBraKet: true,
      colorDimensionless: true,
    };

    const formulas = [
      "# $$\\boxed{\\mathcal R=\\frac{I_{ph}}{P_{opt}}=\\eta\\frac{q}{h\\nu}=\\eta\\frac{q\\lambda}{hc}\\quad(\\text{A/W})}$$",
      "$\\mathcal R=\\boxed{0.315\\,\\text{A/W}}$",
      "$$\\rho=2\\pi s\\frac VI$$",
      "$$\\boxed{E_n=\\frac{n^2h^2}{8mL^2},\\qquad \\psi_n=\\sqrt{\\frac2L}\\sin\\!\\left(\\frac{n\\pi x}{L}\\right)}$$",
      "# $$\\boxed{\\lambda=\\frac hp=\\frac{h}{mv}=\\frac{h}{\\sqrt{2mK}}=\\frac{h}{\\sqrt{2mqV}}}$$",
      "$$\\boxed{\\lambda=\\frac{12.27}{\\sqrt V}\\ \\text{Å}}$$",
      "$$\\frac2L$$",
      "$$\\frac VI$$",
      "$$\\sqrt V$$",
      "$\\mathcal RAV$"
    ];

    for (const f of formulas) {
      const converted = convertText(f, DEFAULT_COLORS, opts);
      const validation = validateLatexWithKaTeX(converted);
      if (!validation.valid) {
        console.error(`KaTeX Validation Failed for: ${f}\nConverted: ${converted}\nError: ${validation.error}`);
      }
      expect(validation.valid, `KaTeX error for "${converted}": ${validation.error}`).toBe(true);
    }
  });
});
