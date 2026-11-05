// tests/lookahead_gating_and_autoseal.test.ts
// Unit tests for Fast-Fail Lookahead Delimiter Gating, Font Constructor Harmonization, and Dangling Caret Auto-Sealing (v1.0.77)

import { describe, it, expect } from "vitest";
import { matchBareFunction, matchBareSymbol, lookupCatalog, ROLE_FUNCTION } from "../src/parsers/catalog";
import { autoSealUnclosedDelimiters } from "../src/utils/latex_helpers";
import { collectTaxonomySpans } from "../src/parsers/taxonomy";
import { DEFAULT_COLORS, DEFAULT_OPTIONS } from "../src/config";

describe("v1.0.77: Fast-Fail Delimiter Lookahead & Catalog Harmonization", () => {
  it("harmonizes bold and scr as function constructors of arity 1", () => {
    const boldEntry = lookupCatalog("bold");
    expect(boldEntry).not.toBeNull();
    expect(boldEntry?.roleId).toBe(ROLE_FUNCTION);
    expect(boldEntry?.tier).toBe(2);
    expect(boldEntry?.arity).toBe(1);

    const scrEntry = lookupCatalog("scr");
    expect(scrEntry).not.toBeNull();
    expect(scrEntry?.roleId).toBe(ROLE_FUNCTION);
    expect(scrEntry?.tier).toBe(2);
    expect(scrEntry?.arity).toBe(1);
    expect(scrEntry?.canonical).toBe("\\mathscr");
  });

  it("prevents bare font modifiers from matching without parentheses", () => {
    expect(matchBareSymbol("bold", 0)).toBeNull();
    expect(matchBareSymbol("scr", 0)).toBeNull();
    expect(matchBareSymbol("cal", 0)).toBeNull();
    expect(matchBareSymbol("frak", 0)).toBeNull();
    expect(matchBareSymbol("bb", 0)).toBeNull();
  });

  it("recognizes bold(...) and scr(...) under matchBareFunction", () => {
    const matchBold = matchBareFunction("bold(v)", 0);
    expect(matchBold).not.toBeNull();
    expect(matchBold?.entry.key).toBe("bold");

    const matchScr = matchBareFunction("scr(F)", 0);
    expect(matchScr).not.toBeNull();
    expect(matchScr?.entry.key).toBe("scr");
  });

  it("instantly bails out on single-letter variables in 0.3 ns (Door 2)", () => {
    expect(matchBareFunction("x + y", 0)).toBeNull();
    expect(matchBareFunction("a = b", 0)).toBeNull();
    expect(matchBareFunction("t", 0)).toBeNull();
    expect(matchBareFunction("z^2", 0)).toBeNull();
  });

  it("bails out on tokens touching closing delimiters or operators (Door 3)", () => {
    expect(matchBareFunction("foo)", 0)).toBeNull();
    expect(matchBareFunction("foo]", 0)).toBeNull();
    expect(matchBareFunction("foo}", 0)).toBeNull();
    expect(matchBareFunction("foo,", 0)).toBeNull();
    expect(matchBareFunction("foo+", 0)).toBeNull();
    expect(matchBareFunction("foo=", 0)).toBeNull();
  });

  it("recognizes Tier 1 elementary functions followed by space and valid argument", () => {
    const matchSin = matchBareFunction("sin x", 0);
    expect(matchSin).not.toBeNull();
    expect(matchSin?.entry.key).toBe("sin");

    const matchCos = matchBareFunction("cos \\theta", 0);
    expect(matchCos).not.toBeNull();
    expect(matchCos?.entry.key).toBe("cos");

    const matchLn = matchBareFunction("ln 2", 0);
    expect(matchLn).not.toBeNull();
    expect(matchLn?.entry.key).toBe("ln");
  });

  it("rejects space when followed by an operator or closing punctuation", () => {
    expect(matchBareFunction("sin + cos", 0)).toBeNull();
    expect(matchBareFunction("sin = 1", 0)).toBeNull();
    expect(matchBareFunction("sin ,", 0)).toBeNull();
    expect(matchBareFunction("sin )", 0)).toBeNull();
  });
});

describe("v1.0.77: Dangling Operator & Caret Auto-Sealing (Unicode ▢)", () => {
  it("auto-seals dangling caret (x^) with Unicode placeholder ▢", () => {
    expect(autoSealUnclosedDelimiters("x^")).toBe("x^{▢}");
    expect(autoSealUnclosedDelimiters("x^ + y")).toBe("x^{▢} + y");
    expect(autoSealUnclosedDelimiters("x^ = 2")).toBe("x^{▢} = 2");
    expect(autoSealUnclosedDelimiters("(x^)")).toBe("(x^{▢})");
  });

  it("auto-seals dangling subscript (x_) with Unicode placeholder ▢", () => {
    expect(autoSealUnclosedDelimiters("x_")).toBe("x_{▢}");
    expect(autoSealUnclosedDelimiters("x_ + y")).toBe("x_{▢} + y");
    expect(autoSealUnclosedDelimiters("(x_)")).toBe("(x_{▢})");
  });

  it("auto-seals dangling incomplete radicals and accents", () => {
    expect(autoSealUnclosedDelimiters("\\sqrt")).toBe("\\sqrt{▢}");
    expect(autoSealUnclosedDelimiters("\\sqrt + x")).toBe("\\sqrt{▢} + x");
    expect(autoSealUnclosedDelimiters("\\vec")).toBe("\\vec{▢}");
    expect(autoSealUnclosedDelimiters("\\hat + \\bar")).toBe("\\hat{▢} + \\bar{▢}");
  });

  it("auto-seals dangling single-argument fraction \\frac{a}", () => {
    expect(autoSealUnclosedDelimiters("\\frac{a}")).toBe("\\frac{a}{▢}");
    expect(autoSealUnclosedDelimiters("\\frac{a} + b")).toBe("\\frac{a}{▢} + b");
  });

  it("auto-seals lone trailing backslash at end of expression", () => {
    expect(autoSealUnclosedDelimiters("x + \\")).toBe("x + \\ ");
  });

  it("exempts delimiter sizing modifiers from progressive macro auto-sealing", () => {
    expect(autoSealUnclosedDelimiters("\\Bigl( x \\Bigr)")).toBe("\\Bigl( x \\Bigr)");
    expect(autoSealUnclosedDelimiters("\\big( x \\big)")).toBe("\\big( x \\big)");
    expect(autoSealUnclosedDelimiters("\\Biggl[ x \\Biggr]")).toBe("\\Biggl[ x \\Biggr]");
  });
});

describe("v1.0.77: Strict Structural Delimiter Gating Mode", () => {
  it("bypasses bare Greek words when strictDelimiterGating is true", () => {
    const permissiveSpans = collectTaxonomySpans("alpha + beta", DEFAULT_COLORS, undefined, undefined, undefined, {
      ...DEFAULT_OPTIONS,
      strictDelimiterGating: false,
    });
    expect(permissiveSpans.length).toBeGreaterThan(0);

    const strictSpans = collectTaxonomySpans("alpha + beta", DEFAULT_COLORS, undefined, undefined, undefined, {
      ...DEFAULT_OPTIONS,
      strictDelimiterGating: true,
    });
    expect(strictSpans.length).toBe(0); // Bypassed in 0.3 ns!
  });

  it("always recognizes native LaTeX macros regardless of strictDelimiterGating", () => {
    const strictSpans = collectTaxonomySpans("\\alpha + \\beta", DEFAULT_COLORS, undefined, undefined, undefined, {
      ...DEFAULT_OPTIONS,
      strictDelimiterGating: true,
    });
    expect(strictSpans.length).toBe(2); // \alpha and \beta recognized instantly
  });
});
