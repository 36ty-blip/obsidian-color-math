import { describe, it, expect } from "vitest";
import {
  convertLatexToUnicode,
  convertUnicodeToLatex,
  convertDocumentMath,
} from "../src/converters/unicode_converter";

describe("Unicode Math Converter", () => {
  it("converts Greek letters bidirectionally (Plane 1 and Standard)", () => {
    // Default Plane 1 mathematical italic
    expect(convertLatexToUnicode("\\psi")).toBe("𝜓");
    expect(convertUnicodeToLatex("𝜓")).toBe("\\psi");
    expect(convertUnicodeToLatex("𝝍")).toBe("\\psi"); // supported alias

    // Standard Greek
    expect(convertLatexToUnicode("\\psi", { greekStyle: "standard" })).toBe("ψ");
    expect(convertUnicodeToLatex("ψ")).toBe("\\psi");

    // Uppercase
    expect(convertLatexToUnicode("\\Psi")).toBe("Ψ");
    expect(convertUnicodeToLatex("Ψ")).toBe("\\Psi");
  });

  it("converts differentials and constants with proper spacing", () => {
    expect(convertLatexToUnicode("i\\hbar \\frac{\\partial}{\\partial t}\\Psi")).toBe("iℏ \\frac{∂}{∂t}Ψ");
    expect(convertUnicodeToLatex("iℏ \\frac{∂}{∂t}Ψ")).toBe("i\\hbar \\frac{\\partial}{\\partial t}\\Psi");
  });

  it("handles indefinite integrals correctly", () => {
    expect(convertLatexToUnicode("\\int f(x) dx")).toBe("∫ f(x) dx");
    expect(convertUnicodeToLatex("∫ f(x) dx")).toBe("\\int f(x) dx");
  });

  it("handles definite integrals according to user options", () => {
    // Default: preserves bounded integrals for TeX vertical positioning
    expect(convertLatexToUnicode("\\int_0^1 x dx")).toBe("\\int_0^1 x dx");
    expect(convertLatexToUnicode("\\int_{a}^{b} f(x) dx")).toBe("\\int_{a}^{b} f(x) dx");

    // With convertDefiniteIntegrals = true
    expect(convertLatexToUnicode("\\int_0^1 x dx", { convertDefiniteIntegrals: true })).toBe("∫_0^1 x dx");
    expect(convertLatexToUnicode("\\int_{a}^{b} f(x) dx", { convertDefiniteIntegrals: true })).toBe("∫_{a}^{b} f(x) dx");

    // Reverse always restores \int
    expect(convertUnicodeToLatex("∫_0^1 x dx")).toBe("\\int_0^1 x dx");
  });

  it("protects delimiters in sizing macros from conversion", () => {
    // \left\langle must NOT convert to \left⟨ (which breaks MathJax)
    const angle = "\\left\\langle \\frac{a}{b} \\right\\rangle";
    expect(convertLatexToUnicode(angle)).toBe(angle);

    const ceil = "\\Bigl\\lceil x \\Bigr\\rceil";
    expect(convertLatexToUnicode(ceil)).toBe(ceil);
  });

  it("auto-repairs broken delimiter macros in convertUnicodeToLatex", () => {
    const broken = "\\left⟨ \\frac{a}{b} \\right⟩";
    const expected = "\\left\\langle \\frac{a}{b} \\right\\rangle";
    expect(convertUnicodeToLatex(broken)).toBe(expected);
  });

  it("strictly scopes document conversion to math blocks and inlines", () => {
    const doc = [
      "# Physics Note",
      "",
      "The wave function is $\\psi(x, t)$ with probability density.",
      "",
      "```python",
      "psi = 42",
      "```",
      "",
      "$$",
      "i\\hbar \\frac{\\partial}{\\partial t} \\Psi = \\hat{H}\\Psi",
      "$$",
    ].join("\n");

    const toUni = convertDocumentMath(doc, "to-unicode");
    expect(toUni).toContain("psi = 42");
    expect(toUni).toContain("# Physics Note");
    expect(toUni).toContain("$𝜓(x, t)$");
    expect(toUni).toContain("iℏ \\frac{∂}{∂t} Ψ = \\hat{H}Ψ");

    const toTex = convertDocumentMath(toUni, "to-latex");
    expect(toTex).toContain("$\\psi(x, t)$");
    expect(toTex).toContain("i\\hbar \\frac{\\partial}{\\partial t} \\Psi = \\hat{H}\\Psi");
  });

  it("protects prose by default, but allows prose conversion when convertProseToUnicode is true", () => {
    const doc = [
      "Here \\psi is in prose, and $\\psi$ is in math.",
      "Code block with `\\psi`:",
      "```",
      "\\psi in code",
      "```",
    ].join("\n");

    // to-unicode by default: leaves prose \psi untouched, converts inside math
    const toUni = convertDocumentMath(doc, "to-unicode");
    expect(toUni).toContain("Here \\psi is in prose");
    expect(toUni).toContain("$𝜓$ is in math");
    expect(toUni).toContain("`\\psi`");
    expect(toUni).toContain("\\psi in code");

    // to-unicode with convertProseToUnicode = true: converts both inside and outside math, but NOT inside code
    const toUniProse = convertDocumentMath(doc, "to-unicode", {
      convertProseToUnicode: true,
    });
    expect(toUniProse).toContain("Here 𝜓 is in prose");
    expect(toUniProse).toContain("$𝜓$ is in math");
    expect(toUniProse).toContain("`\\psi`");
    expect(toUniProse).toContain("\\psi in code");

    // to-latex with convertProseToLatex = true: converts prose 𝜓 back to \psi
    const toTexProse = convertDocumentMath(toUniProse, "to-latex", {
      convertProseToLatex: true,
    });
    expect(toTexProse).toContain("Here \\psi is in prose");
    expect(toTexProse).toContain("$\\psi$ is in math");
  });
});
