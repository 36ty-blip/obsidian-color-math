// tests/catalog.test.ts
import { describe, it, expect } from "vitest";
import {
  lookupCatalog,
  matchMacro,
  matchBareFunction,
  matchBareSymbol,
  DOMAIN_ALL,
  DOMAIN_CORE,
  DOMAIN_LINEAR_ALGEBRA,
  DOMAIN_QUANTUM,
} from "../src/parsers/catalog";

describe("Minimal Perfect Hash (MPHF) Catalog Engine", () => {
  it("resolves standard LaTeX macros with O(1) direct lookup", () => {
    const sin = lookupCatalog("\\sin");
    expect(sin).not.toBeNull();
    expect(sin?.role).toBe("function");

    const alpha = lookupCatalog("\\alpha");
    expect(alpha).not.toBeNull();
    expect(alpha?.role).toBe("parameter");

    const pi = lookupCatalog("\\pi");
    expect(pi).not.toBeNull();
    expect(pi?.role).toBe("constant");

    const bra = lookupCatalog("\\bra");
    expect(bra).not.toBeNull();
    expect(bra?.domains! & DOMAIN_QUANTUM).toBeTruthy();
  });

  it("returns null for unknown macros", () => {
    expect(lookupCatalog("\\notARealMacro123")).toBeNull();
    expect(lookupCatalog("foobarRandomKey")).toBeNull();
    expect(lookupCatalog("")).toBeNull();
  });

  it("filters by domain mask correctly", () => {
    // \bra belongs to DOMAIN_QUANTUM
    expect(lookupCatalog("\\bra", DOMAIN_QUANTUM)).not.toBeNull();
    expect(lookupCatalog("\\bra", DOMAIN_LINEAR_ALGEBRA)).toBeNull();

    // \sin belongs to DOMAIN_CORE
    expect(lookupCatalog("\\sin", DOMAIN_CORE)).not.toBeNull();
  });

  describe("Unicode & Plane 1 character mapping", () => {
    it("maps standard BMP unicode and Plane 1 italic glyphs for Greek letters", () => {
      const alpha = lookupCatalog("\\alpha");
      expect(alpha).not.toBeNull();
      expect(alpha?.unicode).toBe("α");
      expect(alpha?.plane1).toBe("𝛼");

      const beta = lookupCatalog("\\beta");
      expect(beta?.unicode).toBe("β");
      expect(beta?.plane1).toBe("𝛽");

      const gamma = lookupCatalog("\\Gamma");
      expect(gamma?.unicode).toBe("Γ");
      expect(gamma?.plane1).toBe("𝛤");
    });

    it("maps Unicode characters for operators and relations", () => {
      const leq = lookupCatalog("\\leq");
      expect(leq?.unicode).toBe("≤");

      const sum = lookupCatalog("\\sum");
      expect(sum?.unicode).toBe("∑");

      const intOp = lookupCatalog("\\int");
      expect(intOp?.unicode).toBe("∫");

      const coloneqq = lookupCatalog("\\coloneqq");
      expect(coloneqq?.unicode).toBe("≔");
    });
  });

  describe("Canonical Aliases", () => {
    it("resolves canonical targets for standard LaTeX aliases", () => {
      const le = lookupCatalog("\\le");
      expect(le?.canonical).toBe("\\leq");
      expect(le?.unicode).toBe("≤");

      const ge = lookupCatalog("\\ge");
      expect(ge?.canonical).toBe("\\geq");
      expect(ge?.unicode).toBe("≥");

      const ne = lookupCatalog("\\ne");
      expect(ne?.canonical).toBe("\\neq");

      const to = lookupCatalog("\\to");
      expect(to?.canonical).toBe("\\rightarrow");

      const gets = lookupCatalog("\\gets");
      expect(gets?.canonical).toBe("\\leftarrow");

      const iff = lookupCatalog("\\iff");
      expect(iff?.canonical).toBe("\\Longleftrightarrow");

      const implies = lookupCatalog("\\implies");
      expect(implies?.canonical).toBe("\\Longrightarrow");
    });
  });

  describe("Package Origin Tags", () => {
    it("identifies package origin for diverse LaTeX packages", () => {
      expect(lookupCatalog("\\sin")?.package).toBe("core");
      expect(lookupCatalog("\\alpha")?.package).toBe("core");
      expect(lookupCatalog("\\dd")?.package).toBe("physics");
      expect(lookupCatalog("\\bra")?.package).toBe("physics");
      expect(lookupCatalog("\\rank")?.package).toBe("amsmath");
      expect(lookupCatalog("\\coloneqq")?.package).toBe("mathtools");
      expect(lookupCatalog("\\meter")?.package).toBe("siunitx");
      expect(lookupCatalog("\\Set")?.package).toBe("braket");
      expect(lookupCatalog("\\diff")?.package).toBe("diffcoeff");
      expect(lookupCatalog("\\cancel")?.package).toBe("cancel");
      expect(lookupCatalog("\\ce")?.package).toBe("mhchem");
    });
  });

  describe("Bidirectional O(1) Reverse Lookup", () => {
    it("resolves Unicode characters directly to their canonical LaTeX representation", () => {
      // Greek BMP lookup
      const alphaUni = lookupCatalog("α");
      expect(alphaUni).not.toBeNull();
      expect(alphaUni?.canonical).toBe("\\alpha");
      expect(alphaUni?.role).toBe("parameter");

      // Greek Plane 1 math italic lookup
      const alphaPlane1 = lookupCatalog("𝛼");
      expect(alphaPlane1).not.toBeNull();
      expect(alphaPlane1?.canonical).toBe("\\alpha");
      expect(alphaPlane1?.role).toBe("parameter");

      // Operator reverse lookup
      const sumUni = lookupCatalog("∑");
      expect(sumUni).not.toBeNull();
      expect(sumUni?.canonical).toBe("\\sum");
      expect(sumUni?.role).toBe("operator");

      const intUni = lookupCatalog("∫");
      expect(intUni).not.toBeNull();
      expect(intUni?.canonical).toBe("\\int");
      expect(intUni?.role).toBe("operator");

      // Relation reverse lookup
      const leqUni = lookupCatalog("≤");
      expect(leqUni).not.toBeNull();
      expect(leqUni?.canonical).toBe("\\leq");
      expect(leqUni?.role).toBe("relation");
    });
  });

  describe("matchBareFunction (Two-Tier Syntax)", () => {
    it("recognizes Tier 1 functions with parentheses: sin(x), cos(theta)", () => {
      const match1 = matchBareFunction("sin(x)", 0);
      expect(match1).not.toBeNull();
      expect(match1?.entry.key).toBe("sin");
      expect(match1?.length).toBe(3);

      const match2 = matchBareFunction("cos (\\theta)", 0);
      expect(match2).not.toBeNull();
      expect(match2?.entry.key).toBe("cos");
      expect(match2?.length).toBe(3);
    });

    it("recognizes Tier 1 functions followed by space and argument: sin x, cos \\theta, ln 2", () => {
      const match1 = matchBareFunction("sin x", 0);
      expect(match1).not.toBeNull();
      expect(match1?.entry.key).toBe("sin");

      const match2 = matchBareFunction("cos \\theta", 0);
      expect(match2).not.toBeNull();
      expect(match2?.entry.key).toBe("cos");

      const match3 = matchBareFunction("ln 2", 0);
      expect(match3).not.toBeNull();
      expect(match3?.entry.key).toBe("ln");
    });

    it("recognizes Tier 1 functions with superscript powers: sin^2(x), cos^{2} x", () => {
      const match1 = matchBareFunction("sin^2(x)", 0);
      expect(match1).not.toBeNull();
      expect(match1?.entry.key).toBe("sin");

      const match2 = matchBareFunction("cos^{2} x", 0);
      expect(match2).not.toBeNull();
      expect(match2?.entry.key).toBe("cos");
    });

    it("recognizes Tier 2 functions when followed by parentheses: rank(A), relu(z), span(V)", () => {
      const match1 = matchBareFunction("rank(A)", 0);
      expect(match1).not.toBeNull();
      expect(match1?.entry.key).toBe("rank");

      const match2 = matchBareFunction("relu(z)", 0);
      expect(match2).not.toBeNull();
      expect(match2?.entry.key).toBe("relu");

      const match3 = matchBareFunction("span(V)", 0);
      expect(match3).not.toBeNull();
      expect(match3?.entry.key).toBe("span");
    });

    it("does NOT recognize Tier 2 functions without parentheses: rank A, span V (safety rule)", () => {
      expect(matchBareFunction("rank A", 0)).toBeNull();
      expect(matchBareFunction("span V", 0)).toBeNull();
      expect(matchBareFunction("relu z", 0)).toBeNull();
    });

    it("does not match standalone variable products like x * y", () => {
      expect(matchBareFunction("x y", 0)).toBeNull();
      expect(matchBareFunction("a(b)", 0)).toBeNull();
    });
  });

  describe("matchMacro longest-prefix matching", () => {
    it("matches macros accurately starting with backslash", () => {
      const match1 = matchMacro("\\alpha + \\beta", 0);
      expect(match1).not.toBeNull();
      expect(match1?.entry.key).toBe("\\alpha");
      expect(match1?.length).toBe(6);

      const match2 = matchMacro("\\alpha + \\beta", 9);
      expect(match2).not.toBeNull();
      expect(match2?.entry.key).toBe("\\beta");
      expect(match2?.length).toBe(5);
    });
  });

  describe("matchBareSymbol & Typst-style bare constants", () => {
    it("matches bare lowercase Greek letters (alpha, beta, pi, theta)", () => {
      const alpha = matchBareSymbol("alpha + beta", 0);
      expect(alpha).not.toBeNull();
      expect(alpha?.entry.key).toBe("alpha");
      expect(alpha?.entry.canonical).toBe("\\alpha");
      expect(alpha?.entry.role).toBe("parameter");
      expect(alpha?.length).toBe(5);

      const beta = matchBareSymbol("alpha + beta", 8);
      expect(beta).not.toBeNull();
      expect(beta?.entry.key).toBe("beta");
      expect(beta?.entry.canonical).toBe("\\beta");
      expect(beta?.length).toBe(4);

      const pi = matchBareSymbol("2 pi r", 2);
      expect(pi).not.toBeNull();
      expect(pi?.entry.key).toBe("pi");
      expect(pi?.entry.canonical).toBe("\\pi");
      expect(pi?.entry.role).toBe("constant");
    });

    it("matches bare uppercase Greek letters (Gamma, Delta, Omega)", () => {
      const delta = matchBareSymbol("Delta x", 0);
      expect(delta).not.toBeNull();
      expect(delta?.entry.key).toBe("Delta");
      expect(delta?.entry.canonical).toBe("\\Delta");

      const omega = matchBareSymbol("Omega", 0);
      expect(omega).not.toBeNull();
      expect(omega?.entry.key).toBe("Omega");
      expect(omega?.entry.canonical).toBe("\\Omega");
    });

    it("matches bare constants and operators (oo -> infty, hbar, nabla, partial)", () => {
      const oo = matchBareSymbol("oo", 0);
      expect(oo).not.toBeNull();
      expect(oo?.entry.key).toBe("oo");
      expect(oo?.entry.canonical).toBe("\\infty");
      expect(oo?.entry.unicode).toBe("∞");

      const hbar = matchBareSymbol("hbar omega", 0);
      expect(hbar).not.toBeNull();
      expect(hbar?.entry.key).toBe("hbar");
      expect(hbar?.entry.canonical).toBe("\\hbar");

      const nabla = matchBareSymbol("nabla f", 0);
      expect(nabla).not.toBeNull();
      expect(nabla?.entry.key).toBe("nabla");
      expect(nabla?.entry.canonical).toBe("\\nabla");

      const partial = matchBareSymbol("partial u", 0);
      expect(partial).not.toBeNull();
      expect(partial?.entry.key).toBe("partial");
      expect(partial?.entry.canonical).toBe("\\partial");
    });

    it("does not match non-catalog words", () => {
      expect(matchBareSymbol("variableName", 0)).toBeNull();
      expect(matchBareSymbol("foobar", 0)).toBeNull();
    });
  });

  it("benchmarks 50,000 lookups", () => {
    const start = performance.now();
    for (let i = 0; i < 12500; i++) {
      lookupCatalog("\\sin");
      lookupCatalog("\\alpha");
      lookupCatalog("rank");
      lookupCatalog("α");
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(150);
  });
});
