import { describe, it, expect } from "vitest";
import { collectVariableSpans } from "../src/parsers/variable_hash";
import { colorLatexBody } from "../src/converters/generic";
import {
  hashStringToColor,
  VARIABLE_HASH_PALETTE,
  FULL_BARE_FUNCTIONS,
  EXTENDED_BARE_FUNCTIONS,
  STANDARD_BARE_FUNCTIONS,
} from "../src/config";

describe("Variable Data-Flow Hashing", () => {
  it("deterministically hashes same variable to same color", () => {
    const spans = collectVariableSpans("x + 2x - 3x");
    expect(spans.length).toBe(3);
    const expectedColor = hashStringToColor("x");
    for (const span of spans) {
      expect(span.color).toBe(expectedColor);
    }
  });

  it("assigns different colors to different variables", () => {
    const spans = collectVariableSpans("x + y");
    expect(spans.length).toBe(2);
    const colorX = hashStringToColor("x");
    const colorY = hashStringToColor("y");
    expect(spans[0].color).toBe(colorX);
    expect(spans[1].color).toBe(colorY);
  });

  it("does not treat function names followed by '(' as variables", () => {
    // In f(x), f is function, x is variable
    const spans = collectVariableSpans("f(x)");
    expect(spans.length).toBe(1);
    expect(spans[0].color).toBe(hashStringToColor("x"));
  });

  it("colors math latex with variable data-flow hashing when enabled", () => {
    const input = "x + y = z";
    const result = colorLatexBody(input, undefined, { variableDataFlow: true });
    const colorX = hashStringToColor("x");
    const colorY = hashStringToColor("y");
    const colorZ = hashStringToColor("z");
    expect(result).toContain(`\\textcolor{${colorX}}{x}`);
    expect(result).toContain(`\\textcolor{${colorY}}{y}`);
    expect(result).toContain(`\\textcolor{${colorZ}}{z}`);
  });

  it("skips environment arguments in \\begin{bmatrix} and \\begin{cases}", () => {
    const input = "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}";
    const result = colorLatexBody(input, undefined, { variableDataFlow: true });
    expect(result).toContain("\\begin{bmatrix}");
    expect(result).toContain("\\end{bmatrix}");
    expect(result).not.toContain("\\begin{\\textcolor");
    expect(result).not.toContain("\\end{\\textcolor");
  });

  it("does not shred multi-letter function calls like rank(A) and nullity(A)", () => {
    const input = "rank(A) + nullity(A) = n";
    const result = colorLatexBody(input, undefined, { variableDataFlow: true, enableTaxonomy: true });
    expect(result).toContain("rank");
    expect(result).toContain("nullity");
    // Ensure 'rank' is not shredded into r, a, n, k
    expect(result).not.toContain("\\textcolor{#bb9af7}{r}");
    expect(result).not.toContain("\\textcolor{#2ac3de}{n}k");
    const colorA = hashStringToColor("A");
    const colorN = hashStringToColor("n");
    expect(result).toContain(`\\textcolor{${colorA}}{A}`);
    expect(result).toContain(`\\textcolor{${colorN}}{n}`);
  });

  it("treats 2-letter products like ax(y + z) as variable multiplication", () => {
    const input = "ax(y + z)";
    const result = colorLatexBody(input, undefined, { variableDataFlow: true });
    const colorA = hashStringToColor("a");
    const colorX = hashStringToColor("x");
    const colorY = hashStringToColor("y");
    const colorZ = hashStringToColor("z");
    expect(result).toContain(`\\textcolor{${colorA}}{a}`);
    expect(result).toContain(`\\textcolor{${colorX}}{x}`);
    expect(result).toContain(`\\textcolor{${colorY}}{y}`);
    expect(result).toContain(`\\textcolor{${colorZ}}{z}`);
  });

  it("shields canonical Greek letters and constants from variable shattering before parentheses (pi(x), mu(x), phi(x))", () => {
    const rawSpansPi = collectVariableSpans("pi(x)");
    // 'pi' is a constant, so collectVariableSpans does NOT shatter it into 'p' and 'i'
    expect(rawSpansPi.some(s => s.start === 0 && s.end === 1)).toBe(false);
    expect(rawSpansPi.some(s => s.start === 1 && s.end === 2)).toBe(false);

    // 'mu' is a parameter, so it hashes atomically as '\mu' across [0, 2]
    const rawSpansMu = collectVariableSpans("mu(x)");
    const muSpan = rawSpansMu.find(s => s.start === 0 && s.end === 2);
    expect(muSpan).toBeDefined();
    expect(muSpan?.color).toBe(hashStringToColor("\\mu"));

    // 'phi' is a parameter, so it hashes atomically as '\phi' across [0, 3]
    const rawSpansPhi = collectVariableSpans("phi(x)");
    const phiSpan = rawSpansPhi.find(s => s.start === 0 && s.end === 3);
    expect(phiSpan).toBeDefined();
    expect(phiSpan?.color).toBe(hashStringToColor("\\phi"));
  });

  it("does not shred \\operatorname{rank}(A) arguments into variables", () => {
    const input = "\\operatorname{rank}(A)";
    const result = colorLatexBody(input, undefined, { variableDataFlow: true, enableTaxonomy: true });
    expect(result).not.toContain("\\textcolor{#bb9af7}{r}");
    const colorA = hashStringToColor("A");
    expect(result).toContain(`\\textcolor{${colorA}}{A}`);
  });

  it("recognizes 3-letter functions like adj(A) and var(X)", () => {
    const input = "adj(A) + var(X)";
    const result = colorLatexBody(input, undefined, { variableDataFlow: true, enableTaxonomy: true });
    expect(result).toContain("adj");
    expect(result).toContain("var");
    // Ensure 'a', 'd', 'j' are not shredded into individual variables
    const colorA = hashStringToColor("a");
    expect(result).not.toContain(`\\textcolor{${colorA}}{a}d`);
    const colorCapA = hashStringToColor("A");
    const colorCapX = hashStringToColor("X");
    expect(result).toContain(`\\textcolor{${colorCapA}}{A}`);
    expect(result).toContain(`\\textcolor{${colorCapX}}{X}`);
  });

  it("respects extendedFunctions: false switch to treat 2-3 letter names as variable multiplication", () => {
    const input = "ch(x) + sp(v)";
    // When extendedFunctions is false, 'ch' and 'sp' are treated as variable multiplication
    const resultOff = colorLatexBody(input, undefined, {
      variableDataFlow: true,
      enableTaxonomy: true,
      extendedFunctions: false,
    });
    const colorC = hashStringToColor("c");
    const colorH = hashStringToColor("h");
    const colorS = hashStringToColor("s");
    const colorP = hashStringToColor("p");
    expect(resultOff).toContain(`\\textcolor{${colorC}}{c}`);
    expect(resultOff).toContain(`\\textcolor{${colorH}}{h}`);
    expect(resultOff).toContain(`\\textcolor{${colorS}}{s}`);
    expect(resultOff).toContain(`\\textcolor{${colorP}}{p}`);

    // But standard math functions like sin(x) remain functions even when switch is false!
    const sinResult = colorLatexBody("sin(x)", undefined, {
      variableDataFlow: true,
      enableTaxonomy: true,
      extendedFunctions: false,
    });
    expect(sinResult).not.toContain(`\\textcolor{${colorS}}{s}`);
    expect(sinResult).toContain("sin");

    // When extendedFunctions is true (default), ch and sp are unified functions
    const resultOn = colorLatexBody(input, undefined, {
      variableDataFlow: true,
      enableTaxonomy: true,
      extendedFunctions: true,
    });
    expect(resultOn).not.toContain(`\\textcolor{${colorC}}{c}`);
    expect(resultOn).not.toContain(`\\textcolor{${colorS}}{s}`);
  });

  it("supports FULL_BARE_FUNCTIONS and 16 newly added extended functions", () => {
    const newFuncs = ["jac", "hes", "wr", "vol", "rms", "fft", "dft", "ord", "val", "num", "den", "sn", "cn", "dn", "avg", "len"];
    for (const f of newFuncs) {
      expect(EXTENDED_BARE_FUNCTIONS.has(f)).toBe(true);
      expect(FULL_BARE_FUNCTIONS.has(f)).toBe(true);
    }
    expect(FULL_BARE_FUNCTIONS.size).toBe(STANDARD_BARE_FUNCTIONS.size + EXTENDED_BARE_FUNCTIONS.size);

    const input = "jac(f) + wr(y)";
    const resOn = colorLatexBody(input, undefined, {
      variableDataFlow: true,
      enableTaxonomy: true,
      extendedFunctions: true,
    });
    expect(resOn).toContain("jac");
    expect(resOn).toContain("wr");
    const colorW = hashStringToColor("w");
    expect(resOn).not.toContain(`\\textcolor{${colorW}}{w}`);
  });

  it("safely handles ColorPalette object as palette without returning undefined", () => {
    const objectPalette = {
      primary: "#ff0000",
      secondary: "#00ff00",
      accent: "#0000ff",
    };
    const spans = collectVariableSpans("x + y + z", objectPalette);
    expect(spans.length).toBe(3);
    for (const span of spans) {
      expect(span.color).toBeDefined();
      expect(typeof span.color).toBe("string");
      expect(Object.values(objectPalette)).toContain(span.color);
    }
  });

  it("assigns identical hash color to bare Greek letter and backslash command (eta vs \\eta)", () => {
    const spansBare = collectVariableSpans("eta");
    const spansCmd = collectVariableSpans("\\eta");
    expect(spansBare.length).toBe(1);
    expect(spansCmd.length).toBe(1);
    expect(spansBare[0].color).toBe(spansCmd[0].color);
  });

  it("supports user-customized variableHashPalette in options", () => {
    const customPalette = [
      "#000000", "#111111", "#222222", "#333333",
      "#444444", "#555555", "#666666", "#777777",
      "#888888", "#999999", "#aaaaaa", "#bbbbbb",
      "#cccccc", "#dddddd", "#eeeeee", "#ffffff",
    ];
    const result = colorLatexBody("x + a + d", undefined, {
      variableDataFlow: true,
      variableHashPalette: customPalette,
    });
    // x is slot 11 -> #bbbbbb
    expect(result).toContain("\\textcolor{#bbbbbb}{x}");
    // a is slot 2 -> #222222
    expect(result).toContain("\\textcolor{#222222}{a}");
    // d is slot 14 -> #eeeeee
    expect(result).toContain("\\textcolor{#eeeeee}{d}");
  });

  describe("Option A: Atomic State Qualifier Normalization & Data Flow Hashing", () => {
    it("atomically hashes state qualifier 'max' in A_{max} without shattering", () => {
      const spans = collectVariableSpans("A_{max}");
      expect(spans.length).toBe(2);
      expect(spans[0].color).toBe(hashStringToColor("A"));
      expect(spans[1].color).toBe(hashStringToColor("max"));
      expect(spans[1].end - spans[1].start).toBe(3); // Entire 'max' token atomically hashed
    });

    it("atomically hashes subscript state qualifier in A_{\\max} and A_{\\mathrm{rms}}", () => {
      const spansMax = collectVariableSpans("A_{\\max}");
      expect(spansMax.length).toBe(2);
      expect(spansMax[0].color).toBe(hashStringToColor("A"));
      expect(spansMax[1].color).toBe(hashStringToColor("max"));

      const spansRms = collectVariableSpans("V_{\\mathrm{rms}}");
      expect(spansRms.length).toBe(2);
      expect(spansRms[0].color).toBe(hashStringToColor("V"));
      expect(spansRms[1].color).toBe(hashStringToColor("rms"));
    });

    it("treats max(A) as function call: skips variable hash on max, hashes argument A", () => {
      const spans = collectVariableSpans("max(A)");
      expect(spans.length).toBe(1);
      expect(spans[0].color).toBe(hashStringToColor("A"));
    });

    it("atomically hashes all 4 canonical state qualifier families without collisions", () => {
      const expr = "W_{net} = P (V_{fin} - V_{init}) + T_{sat} + P_{crit}";
      const spans = collectVariableSpans(expr);
      const spanTexts = spans.map((s) => expr.slice(s.start, s.end));
      expect(spanTexts).toContain("W");
      expect(spanTexts).toContain("net");
      expect(spanTexts).toContain("P");
      expect(spanTexts).toContain("V");
      expect(spanTexts).toContain("fin");
      expect(spanTexts).toContain("init");
      expect(spanTexts).toContain("T");
      expect(spanTexts).toContain("sat");
      expect(spanTexts).toContain("crit");
    });
  });
});

