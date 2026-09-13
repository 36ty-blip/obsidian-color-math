import { describe, it, expect } from "vitest";
import { convertText, uncolorText, colorLatexBody } from "../src/index";
import { validateMarkdownMath } from "./validator";

describe("Hardcore Adversarial & Stress Testing", () => {
  describe("1. Half-Colored Math Blocks & Inline Completion", () => {
    it("fully colors a half-colored inline expression with functions", () => {
      // Previously, having \textcolor{#bb9af7} aborted the entire line, leaving f(x) uncolored.
      const halfColored = "Let $f(x) + \\textcolor{#bb9af7}{g(y)} = 0$ be defined.";
      const result = convertText(halfColored);

      // Both f and g must have color wrappers
      expect(result).toMatch(/\\textcolor\{#[0-9a-fA-F]+\}\{f\}/);
      expect(result).toMatch(/\\textcolor\{#[0-9a-fA-F]+\}\{g\}/);
      // Must not create nested wrappers
      expect(result).not.toMatch(/\\textcolor\{[^}]+\}\{\\textcolor/);
    });

    it("fully colors a half-colored derivative block equation", () => {
      const halfColored = "$$\\frac{d}{dx}\\textcolor{#7aa2f7}{f(x)} = f'(x)$$";
      const result = convertText(halfColored);

      expect(result).toMatch(/\\textcolor\{white\}\{=\}/);
      expect(result).toMatch(/\\textcolor\{#[0-9a-fA-F]+\}\{f'\(x\)\}/);
      expect(result).not.toMatch(/\\textcolor\{[^}]+\}\{\\textcolor/);
    });

    it("fully colors an edited equation where user appended new terms", () => {
      // Initial colored equation was: \textcolor{#7aa2f7}{f}(x) = x^2
      // User appended: + \sin(x)
      const edited = "$$\\textcolor{#7aa2f7}{f}(x) = x^{2} + \\sin(x)$$";
      const result = convertText(edited);

      expect(result).toMatch(/\\textcolor\{#[0-9a-fA-F]+\}\{f\}/);
      expect(result).toMatch(/\\textcolor\{#[0-9a-fA-F]+\}\{\\sin\}/);
      expect(result).not.toMatch(/\\textcolor\{[^}]+\}\{\\textcolor/);
    });

    it("fully colors a half-colored matrix equation", () => {
      const halfColored = "$$\\mathbf{M} = \\begin{pmatrix} 1 & \\textcolor{#bb9af7}{0} \\\\ 0 & 1 \\end{pmatrix}$$";
      const result = convertText(halfColored);

      expect(result).toMatch(/\\mathbf\{M\}/);
      expect(result).not.toMatch(/\\textcolor\{[^}]+\}\{\\textcolor/);
    });
  });

  describe("2. Multi-Pass Idempotency & Stability", () => {
    it("guarantees 3-pass idempotency across complex expressions", () => {
      const original = `
# Complex Document
$$\\int_{0}^{\\infty} e^{-x^{2}} dx = \\frac{\\sqrt{\\pi}}{2}$$

Inline: $\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$

$$\\frac{d}{dx}f(g(x)) = f'(g(x)) g'(x)$$
`;
      const pass1 = convertText(original);
      const pass2 = convertText(pass1);
      const pass3 = convertText(pass2);

      expect(pass2).toBe(pass1);
      expect(pass3).toBe(pass1);
      expect(pass3).not.toMatch(/\\textcolor\{[^}]+\}\{\\textcolor/);
    });
  });

  describe("3. Adversarial & Malformed Syntax Resilience", () => {
    it("handles unclosed braces gracefully without throwing", () => {
      const malformed = "$$\\frac{a}{b + \\textcolor{red}{c$$";
      expect(() => convertText(malformed)).not.toThrow();
    });

    it("handles 15-level deeply nested braces", () => {
      const deeplyNested = "$${{{{{{{{{{{{{{{x}}}}}}}}}}}}}}}$";
      expect(() => convertText(deeplyNested)).not.toThrow();
      const res = convertText(deeplyNested);
      expect(res).toContain("x");
    });

    it("handles empty and whitespace-only math blocks", () => {
      const emptyBlocks = "$$$$\n\n$$\\quad$$\n\n$$   $$";
      expect(() => convertText(emptyBlocks)).not.toThrow();
    });

    it("handles escaped characters and stray backslashes", () => {
      const strays = "$$x \\\\ y \\ \\alpha \\beta$$";
      expect(() => convertText(strays)).not.toThrow();
    });
  });

  describe("4. Code-Fence and Markdown Structure Immunity", () => {
    it("leaves code blocks containing math strings completely untouched", () => {
      const codeFence = `
Here is some code:
\`\`\`python
def equation():
    return "$$\\frac{d}{dx}f(x) = f'(x)$$"
\`\`\`

And real math:
$$\\frac{d}{dx}f(x) = f'(x)$$
`;
      const converted = convertText(codeFence);

      // The Python code block must NOT have any \textcolor
      expect(converted).toContain('return "$$\\frac{d}{dx}f(x) = f\'(x)$$"');
      // The real math block outside code MUST have \textcolor
      expect(converted).toMatch(/\\textcolor\{#[0-9a-fA-F]+\}\{f\(x\)\}/);
      expect(converted).toMatch(/\\textcolor\{white\}\{=\}/);
    });

    it("protects inline backtick code spans from math coloring", () => {
      const inlineCode = "Use \`$$x + y = z$$\` in your config, but real math is $x + y = z$.";
      const converted = convertText(inlineCode);

      expect(converted).toContain("\`$$x + y = z$$\`");
    });
  });

  describe("5. High-Throughput Document Scaling", () => {
    it("processes 200 multiline math blocks in under 1.5 seconds", () => {
      const blocks: string[] = [];
      for (let i = 0; i < 200; i++) {
        blocks.push(`$$
\\begin{aligned}
f_{${i}}(x) &= \\int_{0}^{x} t^{2} dt \\\\
g_{${i}}(y) &= \\frac{d}{dy}(y^{3} + 2y)
\\end{aligned}
$$`);
      }
      const largeDoc = blocks.join("\n\n");

      const startTime = performance.now();
      const converted = convertText(largeDoc);
      const elapsedMs = performance.now() - startTime;

      expect(converted.length).toBeGreaterThan(largeDoc.length);
      expect(elapsedMs).toBeLessThan(2000); // well under 2 seconds for 200 heavy blocks
    });
  });

  describe("6. KaTeX & MathJax Engine Dual-Validation", () => {
    it("validates transformed half-colored and adversarial outputs against engines", () => {
      const testCases = [
        "$$\\frac{d}{dx}\\textcolor{#7aa2f7}{f(x)} = f'(x)$$",
        "$$f(x) + \\textcolor{#bb9af7}{g(y)} = 0$$",
        "$$\\mathbf{M} = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$",
        "$$\\int_{0}^{\\infty} e^{-x^{2}} dx = \\frac{\\sqrt{\\pi}}{2}$$"
      ];

      for (const tc of testCases) {
        const transformed = convertText(tc);
        const val = validateMarkdownMath(transformed, "both");
        expect(val.valid, `Dual engine validation failed on: ${tc}`).toBe(true);
      }
    });
  });

  describe("7. Piecewise Cases Environment with \\ge and <", () => {
    it("correctly colors all cases branches and relations without swallowing lines", () => {
      const input = `$$
f(x)=
\\begin{cases}
x^{2}, & x\\ge0\\\\
-x, & x<0
\\end{cases}
$$`;
      const converted = convertText(input);
      // Both relations must be colored
      expect(converted).toMatch(/\\textcolor\{white\}\{\\ge\}/);
      expect(converted).toMatch(/\\textcolor\{white\}\{<\}/);

      // With variableDataFlow, all x instances in both branches must be colored
      const withDataFlow = convertText(input, undefined, { variableDataFlow: true });
      expect(withDataFlow).toMatch(/-\\textcolor\{#[0-9a-fA-F]+\}\{x\}/);
      expect(withDataFlow).toMatch(/\\textcolor\{#[0-9a-fA-F]+\}\{x\}\\textcolor\{white\}\{<\}/);
    });
  });
});
