// tests/ide_styler_parity.test.ts

import { describe, it, expect } from "vitest";
import { DEFAULT_COLORS, ColorPalette } from "../src/config";
import { computeSemanticMathSpans, colorLatexBody } from "../src/converters/generic";

describe("IDE Styler & Rendered Math Parity", () => {
  it("extracts identical semantic role colors for raw multi-dialect operators in IDE Styler (CodeMirror 6)", () => {
    const customPalette: ColorPalette = {
      ...DEFAULT_COLORS,
      arithmetic: "#f7768e",
      dot: "#e0af68",
      set: "#7dcfff",
      orange: "#ff9e64",
    };

    // 1. Shorthand multi-dialect operators in IDE Styler (forLatexWrap = false)
    const rawEquation = "A xxx B xx C vvv D vv E uuu F uu G nnn H nn I ^^ J ox K o. L o+ M +- N -+ P";
    const ideSpans = computeSemanticMathSpans(rawEquation, customPalette, {
      enableTaxonomy: true,
      variableDataFlow: true,
    }, false);

    // Verify xxx -> big operator (orange)
    const xxxSpan = ideSpans.find((s) => rawEquation.slice(s.start, s.end) === "xxx");
    expect(xxxSpan).toBeDefined();
    expect(xxxSpan!.color).toBe("#ff9e64");

    // Verify xx -> dot
    const xxSpan = ideSpans.find((s) => rawEquation.slice(s.start, s.end) === "xx");
    expect(xxSpan).toBeDefined();
    expect(xxSpan!.color).toBe("#e0af68");

    // Verify vvv -> big operator (orange)
    const vvvSpan = ideSpans.find((s) => rawEquation.slice(s.start, s.end) === "vvv");
    expect(vvvSpan).toBeDefined();
    expect(vvvSpan!.color).toBe("#ff9e64");

    // Verify vv -> set
    const vvSpan = ideSpans.find((s) => rawEquation.slice(s.start, s.end) === "vv");
    expect(vvSpan).toBeDefined();
    expect(vvSpan!.color).toBe("#7dcfff");

    // Verify uuu -> big operator (orange)
    const uuuSpan = ideSpans.find((s) => rawEquation.slice(s.start, s.end) === "uuu");
    expect(uuuSpan).toBeDefined();
    expect(uuuSpan!.color).toBe("#ff9e64");

    // Verify uu -> set
    const uuSpan = ideSpans.find((s) => rawEquation.slice(s.start, s.end) === "uu");
    expect(uuSpan).toBeDefined();
    expect(uuSpan!.color).toBe("#7dcfff");

    // Verify nnn -> big operator (orange)
    const nnnSpan = ideSpans.find((s) => rawEquation.slice(s.start, s.end) === "nnn");
    expect(nnnSpan).toBeDefined();
    expect(nnnSpan!.color).toBe("#ff9e64");

    // Verify nn -> set
    const nnSpan = ideSpans.find((s) => rawEquation.slice(s.start, s.end) === "nn");
    expect(nnSpan).toBeDefined();
    expect(nnSpan!.color).toBe("#7dcfff");

    // Verify ^^ -> set
    const wedgeSpan = ideSpans.find((s) => rawEquation.slice(s.start, s.end) === "^^");
    expect(wedgeSpan).toBeDefined();
    expect(wedgeSpan!.color).toBe("#7dcfff");

    // Verify ox -> dot
    const oxSpan = ideSpans.find((s) => rawEquation.slice(s.start, s.end) === "ox");
    expect(oxSpan).toBeDefined();
    expect(oxSpan!.color).toBe("#e0af68");

    // Verify o. -> dot
    const odotSpan = ideSpans.find((s) => rawEquation.slice(s.start, s.end) === "o.");
    expect(odotSpan).toBeDefined();
    expect(odotSpan!.color).toBe("#e0af68");

    // Verify o+ -> arithmetic
    const oplusSpan = ideSpans.find((s) => rawEquation.slice(s.start, s.end) === "o+");
    expect(oplusSpan).toBeDefined();
    expect(oplusSpan!.color).toBe("#f7768e");

    // Verify +- -> arithmetic
    const pmSpan = ideSpans.find((s) => rawEquation.slice(s.start, s.end) === "+-");
    expect(pmSpan).toBeDefined();
    expect(pmSpan!.color).toBe("#f7768e");

    // Verify -+ -> arithmetic
    const mpSpan = ideSpans.find((s) => rawEquation.slice(s.start, s.end) === "-+");
    expect(mpSpan).toBeDefined();
    expect(mpSpan!.color).toBe("#f7768e");
  });

  it("does not falsely match alphabetic operators inside larger words (e.g. approx, box)", () => {
    const customPalette: ColorPalette = {
      ...DEFAULT_COLORS,
      dot: "#e0af68",
    };

    // 'approx' should NOT match 'ox' as a tensor product
    const text = "\\text{approx} + x";
    const spans = computeSemanticMathSpans(text, customPalette, {
      enableTaxonomy: true,
      variableDataFlow: false,
    }, false);

    const oxMatch = spans.find((s) => text.slice(s.start, s.end) === "ox");
    expect(oxMatch).toBeUndefined();
  });

  it("disambiguates spaced variables x x x from shorthand operator xxx", () => {
    const customPalette: ColorPalette = {
      ...DEFAULT_COLORS,
      orange: "#ff9e64",
    };

    const text = "x x x \\quad (x x x)";
    const spans = computeSemanticMathSpans(text, customPalette, {
      enableTaxonomy: true,
      variableDataFlow: true,
    }, false);

    // None of the spans should cover 3 characters 'x x x' as a big operator (orange)
    const orangeSpans = spans.filter((s) => s.color === "#ff9e64");
    expect(orangeSpans.length).toBe(0);

    const rendered = colorLatexBody(text, customPalette, {
      enableTaxonomy: true,
      variableDataFlow: false,
    });
    expect(rendered).not.toContain("\\bigtimes");
  });

  it("ensures ^^ works stand-alone without requiring other symbols to trigger fast-path gating", () => {
    const customPalette: ColorPalette = {
      ...DEFAULT_COLORS,
      set: "#7dcfff",
    };

    const standAlone = "A ^^ B";
    const rendered = colorLatexBody(standAlone, customPalette, {
      enableTaxonomy: true,
      variableDataFlow: false,
    });
    expect(rendered).toContain("\\textcolor{#7dcfff}{\\wedge}");
  });

  it("ensures Rendered Math produces matching LaTeX colors for the normalized counterparts", () => {
    const customPalette: ColorPalette = {
      ...DEFAULT_COLORS,
      arithmetic: "#f7768e",
      dot: "#e0af68",
      set: "#7dcfff",
      orange: "#ff9e64",
    };

    const rendered = colorLatexBody(
      "A xxx B xx C vvv D vv E uuu F uu G nnn H nn I ^^ J ox K o. L o+ M +- N -+ P",
      customPalette,
      {
        enableTaxonomy: true,
        variableDataFlow: false,
      }
    );

    expect(rendered).toContain("\\textcolor{#ff9e64}{\\bigtimes}");
    expect(rendered).toContain("\\textcolor{#e0af68}{\\times}");
    expect(rendered).toContain("\\textcolor{#ff9e64}{\\bigvee}");
    expect(rendered).toContain("\\textcolor{#7dcfff}{\\vee}");
    expect(rendered).toContain("\\textcolor{#ff9e64}{\\bigcup}");
    expect(rendered).toContain("\\textcolor{#7dcfff}{\\cup}");
    expect(rendered).toContain("\\textcolor{#ff9e64}{\\bigcap}");
    expect(rendered).toContain("\\textcolor{#7dcfff}{\\cap}");
    expect(rendered).toContain("\\textcolor{#7dcfff}{\\wedge}");
    expect(rendered).toContain("\\textcolor{#e0af68}{\\otimes}");
    expect(rendered).toContain("\\textcolor{#e0af68}{\\odot}");
    expect(rendered).toContain("\\textcolor{#f7768e}{\\oplus}");
    expect(rendered).toContain("\\textcolor{#f7768e}{\\pm}");
    expect(rendered).toContain("\\textcolor{#f7768e}{\\mp}");
  });
});
