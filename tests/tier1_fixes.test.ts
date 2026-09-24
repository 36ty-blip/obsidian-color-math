import { describe, it, expect } from "vitest";
import { colorLatexBody } from "../src/converters/generic";
import { collectDelimiterSpans } from "../src/parsers/delimiters";
import { findBoundarySpans } from "../src/parsers/differentials";
import { hashStringToColor, COLORS } from "../src/config";

describe("Tier 1 Bugfixes Verification", () => {
  describe("Item 1: Sized Delimiters KaTeX Safety", () => {
    it("wraps entire \\left( ... \\right) expression for LaTeX output to preserve KaTeX grouping", () => {
      const input = "\\left( x + y \\right)";
      const spans = collectDelimiterSpans(input, { forLatexWrap: true });
      expect(spans.length).toBe(1);
      expect(spans[0].start).toBe(0);
      expect(spans[0].end).toBe(input.length);
      expect(spans[0].priority).toBe(24);

      const rendered = colorLatexBody(input, undefined, { rainbowDelimiters: true });
      expect(rendered).toMatch(/^\\textcolor\{#[0-9a-fA-F]{6}\}\{\\left\( x \+ y \\right\)\}$/);
    });

    it("keeps discrete open/close spans when forLatexWrap is false", () => {
      const input = "\\left( x + y \\right)";
      const spans = collectDelimiterSpans(input, { forLatexWrap: false });
      expect(spans.length).toBe(2);
      expect(spans[0].text === undefined).toBe(true);
      expect(spans[0].start).toBe(0);
      expect(spans[0].end).toBe(6); // "\\left(" is 6 characters (indices 0..6)
      expect(spans[1].start).toBe(input.indexOf("\\right)"));
    });
  });

  describe("Item 2: Option A Domain Boundary Operator Isolation", () => {
    it("finds boundary operator spans isolated from the target manifold", () => {
      const input = "\\partial \\Omega + \\partial V + \\partial D";
      const spans = findBoundarySpans(input);
      expect(spans.length).toBe(3);
      for (const s of spans) {
        expect(s.text).toBe("\\partial");
      }
    });

    it("styles operator in palette.chain (#9ece6a) and colors manifolds with individual variable hashes", () => {
      const input = "∂Ω,∂V,∂D,∂M,∂Σ,∂D,∂U,∂B";
      const rendered = colorLatexBody(input, undefined, {
        variableDataFlow: true,
        enableTaxonomy: true,
      });

      const colorOmega = hashStringToColor("Ω");
      const colorV = hashStringToColor("V");
      const colorD = hashStringToColor("D");
      const colorM = hashStringToColor("M");
      const colorSigma = hashStringToColor("Σ");
      const colorU = hashStringToColor("U");
      const colorB = hashStringToColor("B");

      const expected =
        `\\textcolor{#9ece6a}{∂}\\textcolor{${colorOmega}}{Ω},` +
        `\\textcolor{#9ece6a}{∂}\\textcolor{${colorV}}{V},` +
        `\\textcolor{#9ece6a}{∂}\\textcolor{${colorD}}{D},` +
        `\\textcolor{#9ece6a}{∂}\\textcolor{${colorM}}{M},` +
        `\\textcolor{#9ece6a}{∂}\\textcolor{${colorSigma}}{Σ},` +
        `\\textcolor{#9ece6a}{∂}\\textcolor{${colorD}}{D},` +
        `\\textcolor{#9ece6a}{∂}\\textcolor{${colorU}}{U},` +
        `\\textcolor{#9ece6a}{∂}\\textcolor{${colorB}}{B}`;

      expect(rendered).toBe(expected);
    });

    it("correctly isolates LaTeX boundary commands like \\partial \\Omega and \\partial V", () => {
      const input = "\\partial \\Omega";
      const rendered = colorLatexBody(input, undefined, {
        variableDataFlow: true,
        enableTaxonomy: true,
      });

      const colorOmega = hashStringToColor("Omega");
      expect(rendered).toContain(`\\textcolor{#9ece6a}{\\partial}`);
      expect(rendered).toContain(`\\textcolor{${colorOmega}}{\\Omega}`);
    });
  });

  describe("Item 3: Greek Variable Hash Ranking", () => {
    it("hashes Greek macro variables at priority 26 outranking taxonomy parameters", () => {
      const input = "\\alpha + \\beta = \\theta";
      const rendered = colorLatexBody(input, undefined, {
        variableDataFlow: true,
        enableTaxonomy: true,
      });

      const colorAlpha = hashStringToColor("alpha");
      const colorBeta = hashStringToColor("beta");
      const colorTheta = hashStringToColor("theta");

      expect(rendered).toContain(`\\textcolor{${colorAlpha}}{\\alpha}`);
      expect(rendered).toContain(`\\textcolor{${colorBeta}}{\\beta}`);
      expect(rendered).toContain(`\\textcolor{${colorTheta}}{\\theta}`);
    });

    it("gives distinct colors to distinct Greek variables", () => {
      const colorAlpha = hashStringToColor("alpha");
      const colorTheta = hashStringToColor("theta");
      expect(colorAlpha).not.toBe(colorTheta);
    });
  });

  describe("Item 4: LaTeX Macro Command Boundary & \\triangleleft Safety", () => {
    it("never shreds \\triangleleft into \\tr + iangleleft", () => {
      const input = "\\triangleleft";
      // Normal mode: untouched
      const normal = colorLatexBody(input);
      expect(normal).toBe("\\triangleleft");

      // Algebra mode: recognized as whole operator, never shredded into \tr
      const algebra = colorLatexBody(input, undefined, { activeMode: "algebra" });
      expect(algebra).toBe("\\textcolor{#e0af68}{\\triangleleft}");
      expect(algebra).not.toContain("{\\tr}");
      expect(algebra).not.toContain("\\tr}");
    });

    it("handles \\le \\left without \\le matching inside \\left", () => {
      const input = "a \\le \\left( b \\right)";
      const rendered = colorLatexBody(input, undefined, { rainbowDelimiters: true });
      expect(rendered).toContain("\\le");
      expect(rendered).toContain("\\left");
      expect(rendered).not.toContain("{\\le}ft");
    });

    it("handles standalone Greek letters like \\Psi without requiring trailing space", () => {
      const input = "\\Psi";
      const rendered = colorLatexBody(input, undefined, { variableDataFlow: true });
      const colorPsi = hashStringToColor("\\Psi");
      expect(rendered).toBe(`\\textcolor{${colorPsi}}{\\Psi}`);
    });

    it("handles Greek letter followed by digit like \\psi2", () => {
      const input = "\\psi2";
      const rendered = colorLatexBody(input, undefined, { variableDataFlow: true });
      const colorPsi = hashStringToColor("\\psi");
      expect(rendered).toBe(`\\textcolor{${colorPsi}}{\\psi}2`);
    });
  });
});
