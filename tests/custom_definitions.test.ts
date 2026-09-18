// tests/custom_definitions.test.ts
import { describe, it, expect } from "vitest";
import { sanitizeDefinition, USER_CUSTOM_DEFINITIONS } from "../src/custom_definitions";
import {
  COLOR_COMMANDS,
  MATH_FUNCTIONS,
  BARE_FUNCTIONS,
  MATH_CONSTANTS,
  RELATIONS,
  CUSTOM_QUANTUM_OPERATORS,
} from "../src/config";
import { colorLatexBody } from "../src/converters/generic";
import { collectQuantumOperatorSpans } from "../src/parsers/physics";
import { DEFAULT_PALETTE } from "../src/config";

describe("Custom Math Definitions & Sanitization", () => {
  it("sanitizes macro with backslash correctly", () => {
    const res = sanitizeDefinition("\\sinc");
    expect(res.macro).toBe("\\sinc");
    expect(res.bare).toBe("sinc");
  });

  it("sanitizes bare word without backslash correctly", () => {
    const res = sanitizeDefinition("relu");
    expect(res.macro).toBe("\\relu");
    expect(res.bare).toBe("relu");
  });

  it("strips accidental trailing empty parentheses ()", () => {
    const res = sanitizeDefinition("sinc()");
    expect(res.macro).toBe("\\sinc");
    expect(res.bare).toBe("sinc");
  });

  it("strips accidental trailing argument parentheses (x)", () => {
    const res = sanitizeDefinition("\\softmax(x)");
    expect(res.macro).toBe("\\softmax");
    expect(res.bare).toBe("softmax");
  });

  it("trims excess whitespace", () => {
    const res = sanitizeDefinition("   kB   ");
    expect(res.macro).toBe("\\kB");
    expect(res.bare).toBe("kB");
  });
});

describe("Custom Definitions Registration", () => {
  it("registers custom functions in MATH_FUNCTIONS and BARE_FUNCTIONS", () => {
    expect(MATH_FUNCTIONS.has("\\sinc")).toBe(true);
    expect(MATH_FUNCTIONS.has("\\relu")).toBe(true);
    expect(BARE_FUNCTIONS.has("sinc")).toBe(true);
    expect(BARE_FUNCTIONS.has("relu")).toBe(true);
  });

  it("registers custom constants in MATH_CONSTANTS", () => {
    expect(MATH_CONSTANTS.has("\\kB") || MATH_CONSTANTS.has("kB")).toBe(true);
  });

  it("registers custom operators in COLOR_COMMANDS", () => {
    expect(COLOR_COMMANDS.has("\\grad")).toBe(true);
    expect(COLOR_COMMANDS.has("\\laplacian")).toBe(true);
  });

  it("registers custom relations in RELATIONS and COLOR_COMMANDS", () => {
    expect(RELATIONS.has("\\coloneqq")).toBe(true);
    expect(COLOR_COMMANDS.has("\\coloneqq")).toBe(true);
  });

  it("registers custom quantum operators in CUSTOM_QUANTUM_OPERATORS", () => {
    expect(CUSTOM_QUANTUM_OPERATORS.has("\\hat{a}^\\dagger") || CUSTOM_QUANTUM_OPERATORS.has("\\hat{a}")).toBe(true);
    expect(CUSTOM_QUANTUM_OPERATORS.has("\\hat{\\rho}")).toBe(true);
  });
});

describe("Custom Definitions Color Rendering", () => {
  it("colors custom LaTeX function macro in colorLatexBody", () => {
    const rendered = colorLatexBody("\\relu(x)");
    expect(rendered).toContain("\\textcolor{#7aa2f7}{\\relu}");
  });

  it("colors custom bare function call in colorLatexBody", () => {
    const rendered = colorLatexBody("relu(x)");
    expect(rendered).toContain("\\textcolor{#7aa2f7}{relu}");
  });

  it("colors custom relational operator \\coloneqq", () => {
    const rendered = colorLatexBody("x \\coloneqq 5");
    expect(rendered).toContain("\\textcolor{white}{\\coloneqq}");
  });

  it("colors custom quantum operators when quantum operators are enabled", () => {
    const spans = collectQuantumOperatorSpans("\\hat{a}^\\dagger \\vert 0 \\rangle", DEFAULT_PALETTE);
    expect(spans.length).toBeGreaterThan(0);
    const found = spans.some((s) => s.start === 0 && s.color === (DEFAULT_PALETTE.energyOperator || "#2ac3de"));
    expect(found).toBe(true);
  });
});
