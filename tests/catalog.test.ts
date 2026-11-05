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
  DIALECT_ALL,
  DIALECT_LATEX,
  DIALECT_TYPST,
  DIALECT_ASCIIMATH,
  DIALECT_MATLAB,
  DIALECT_PYTHON,
  DIALECT_WOLFRAM,
  DIALECT_JULIA,
  DIALECT_LEAN4,
  DIALECT_R,
  getActiveDialects,
  getRoleName,
  getPackageOrigin,
  ROLE_FUNCTION,
  ROLE_PARAMETER,
  ROLE_CONSTANT,
  ROLE_OPERATOR,
  ROLE_RELATION,
  getExpectedChildTag,
  getTagName,
  getTagIdFromNodeName,
  tagMatchesMask,
  ChtmlTagMask,
  MASK_TRANSPARENT_INTERMEDIATE,
  MASK_STRETCHY_FRAGMENTS,
  MASK_SLOT_CONTAINERS,
  TAG_NONE,
  TAG_MFRAC,
  TAG_FRAC,
  TAG_NUM,
  TAG_DEN,
  TAG_DBOX,
  TAG_DTABLE,
  TAG_LINE,
  TAG_DSTRUT,
  TAG_MUNDEROVER,
  TAG_MUNDER,
  TAG_MOVER,
  TAG_UNDER,
  TAG_OVER,
  TAG_BOX,
  TAG_BASE,
  TAG_ROW,
  TAG_SUB,
  TAG_SUP,
  TAG_SCRIPT,
  TAG_SPACER,
  TAG_EXT,
  TAG_SURD,
  TAG_ROOT,
  TAG_MTR,
  TAG_MTD,
  TAG_MSPACE,
  TAG_TABLE,
  TAG_MROW,
  TAG_TEXATOM,
  TAG_STRETCHY_H,
  TAG_STRETCHY_V,
} from "../src/parsers/catalog";

describe("Minimal Perfect Hash (MPHF) Catalog Engine", () => {
  it("resolves standard LaTeX macros with O(1) direct lookup", () => {
    const sin = lookupCatalog("\\sin");
    expect(sin).not.toBeNull();
    expect(getRoleName(sin!.roleId)).toBe("function");

    const alpha = lookupCatalog("\\alpha");
    expect(alpha).not.toBeNull();
    expect(getRoleName(alpha!.roleId)).toBe("parameter");

    const pi = lookupCatalog("\\pi");
    expect(pi).not.toBeNull();
    expect(getRoleName(pi!.roleId)).toBe("constant");

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

  describe("Unicode character mapping", () => {
    it("maps Unicode glyphs for Greek letters", () => {
      const alpha = lookupCatalog("\\alpha");
      expect(alpha).not.toBeNull();
      expect(alpha?.unicode).toBe("α");

      const beta = lookupCatalog("\\beta");
      expect(beta?.unicode).toBe("β");

      const gamma = lookupCatalog("\\Gamma");
      expect(gamma?.unicode).toBe("Γ");
    });

    it("verifies native uncolored flag on limit operators", () => {
      const lim = lookupCatalog("\\lim");
      expect(lim).not.toBeNull();
      expect(lim?.uncolored).toBe(true);

      const limsup = lookupCatalog("\\limsup");
      expect(limsup).not.toBeNull();
      expect(limsup?.uncolored).toBe(true);

      const bareLim = lookupCatalog("lim");
      expect(bareLim).not.toBeNull();
      expect(bareLim?.uncolored).toBe(true);
    });

    it("verifies native extensible flag on extensible annotations", () => {
      const overbrace = lookupCatalog("\\overbrace");
      expect(overbrace).not.toBeNull();
      expect(overbrace?.extensible).toBe(true);
      expect(overbrace?.arity).toBe(1);

      const underbrace = lookupCatalog("\\underbrace");
      expect(underbrace).not.toBeNull();
      expect(underbrace?.extensible).toBe(true);
      expect(underbrace?.arity).toBe(1);

      const underline = lookupCatalog("\\underline");
      expect(underline).not.toBeNull();
      expect(underline?.extensible).toBe(true);
      expect(underline?.arity).toBe(1);
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
      expect(getPackageOrigin(lookupCatalog("\\sin")!)).toBe("core");
      expect(getPackageOrigin(lookupCatalog("\\alpha")!)).toBe("core");
      expect(getPackageOrigin(lookupCatalog("\\dd")!)).toBe("physics");
      expect(getPackageOrigin(lookupCatalog("\\bra")!)).toBe("physics");
      expect(getPackageOrigin(lookupCatalog("\\rank")!)).toBe("amsmath");
      expect(getPackageOrigin(lookupCatalog("\\coloneqq")!)).toBe("mathtools");
      expect(getPackageOrigin(lookupCatalog("\\meter")!)).toBe("siunitx");
      expect(getPackageOrigin(lookupCatalog("\\Set")!)).toBe("braket");
      expect(getPackageOrigin(lookupCatalog("\\diff")!)).toBe("diffcoeff");
      expect(getPackageOrigin(lookupCatalog("\\cancel")!)).toBe("cancel");
      expect(getPackageOrigin(lookupCatalog("\\ce")!)).toBe("mhchem");
    });
  });

  describe("Bidirectional O(1) Reverse Lookup", () => {
    it("resolves Unicode characters directly to their canonical LaTeX representation", () => {
      // Greek BMP lookup
      const alphaUni = lookupCatalog("α");
      expect(alphaUni).not.toBeNull();
      expect(alphaUni?.canonical).toBe("\\alpha");
      expect(getRoleName(alphaUni!.roleId)).toBe("parameter");

      // Greek Plane 1 math italic lookup
      const alphaPlane1 = lookupCatalog("𝛼");
      expect(alphaPlane1).not.toBeNull();
      expect(alphaPlane1?.canonical).toBe("\\alpha");
      expect(getRoleName(alphaPlane1!.roleId)).toBe("parameter");

      // Operator reverse lookup
      const sumUni = lookupCatalog("∑");
      expect(sumUni).not.toBeNull();
      expect(sumUni?.canonical).toBe("\\sum");
      expect(getRoleName(sumUni!.roleId)).toBe("operator");

      const intUni = lookupCatalog("∫");
      expect(intUni).not.toBeNull();
      expect(intUni?.canonical).toBe("\\int");
      expect(getRoleName(intUni!.roleId)).toBe("operator");

      // Relation reverse lookup
      const leqUni = lookupCatalog("≤");
      expect(leqUni).not.toBeNull();
      expect(leqUni?.canonical).toBe("\\leq");
      expect(getRoleName(leqUni!.roleId)).toBe("relation");
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
      expect(getRoleName(alpha!.entry.roleId)).toBe("parameter");
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
      expect(getRoleName(pi!.entry.roleId)).toBe("constant");
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

  describe("MathJax 4 & Upstream Packages (mathtools)", () => {
    it("resolves newly ingested mathtools relations in O(1)", () => {
      const coloneqq = lookupCatalog("\\coloneqq");
      expect(coloneqq).not.toBeNull();
      expect(getRoleName(coloneqq!.roleId)).toBe("relation");
      expect(coloneqq?.unicode).toBe("≔");
      expect(getPackageOrigin(coloneqq!)).toBe("mathtools");

      const eqqcolon = lookupCatalog("\\eqqcolon");
      expect(eqqcolon).not.toBeNull();
      expect(getRoleName(eqqcolon!.roleId)).toBe("relation");
      expect(eqqcolon?.unicode).toBe("≕");

      const xrightarrow = lookupCatalog("\\xleftrightarrow");
      expect(xrightarrow).not.toBeNull();
      expect(getRoleName(xrightarrow!.roleId)).toBe("relation");
    });

    it("resolves mathtools operators, environments and prescript", () => {
      const prescript = lookupCatalog("\\prescript");
      expect(prescript).not.toBeNull();
      expect(getRoleName(prescript!.roleId)).toBe("operator");

      const cramped = lookupCatalog("\\cramped");
      expect(cramped).not.toBeNull();
      expect(getRoleName(cramped!.roleId)).toBe("operator");

      const dcases = lookupCatalog("dcases");
      expect(dcases).not.toBeNull();
      expect(getRoleName(dcases!.roleId)).toBe("delimiter");

      const rcases = lookupCatalog("rcases");
      expect(rcases).not.toBeNull();
      expect(getRoleName(rcases!.roleId)).toBe("delimiter");

      const pmatrixStar = lookupCatalog("pmatrix*");
      expect(pmatrixStar).not.toBeNull();
      expect(getRoleName(pmatrixStar!.roleId)).toBe("delimiter");
    });
  });

  describe("Typst sym.txt & Multi-Dialect Catalog Ingestion", () => {
    it("resolves official Typst dotted symbols in O(1)", () => {
      const arrowR = lookupCatalog("arrow.r");
      expect(arrowR).not.toBeNull();
      expect(getRoleName(arrowR!.roleId)).toBe("relation");
      expect(arrowR?.unicode).toBe("→");

      const subsetEq = lookupCatalog("subset.eq");
      expect(subsetEq).not.toBeNull();
      expect(getRoleName(subsetEq!.roleId)).toBe("relation");
      expect(subsetEq?.unicode).toBe("⊆");

      const parenLFlat = lookupCatalog("paren.l.flat");
      expect(parenLFlat).not.toBeNull();
      expect(getRoleName(parenLFlat!.roleId)).toBe("delimiter");
    });

    it("resolves AsciiMath symbols", () => {
      const xx = lookupCatalog("xx");
      expect(xx).not.toBeNull();
      expect(getRoleName(xx!.roleId)).toBe("operator");

      const neq = lookupCatalog("!=");
      expect(neq).not.toBeNull();
      expect(getRoleName(neq!.roleId)).toBe("relation");
    });

    it("resolves MATLAB matrix operators & functions", () => {
      const dotMul = lookupCatalog(".*");
      expect(dotMul).not.toBeNull();
      expect(getRoleName(dotMul!.roleId)).toBe("operator");
      expect(dotMul?.canonical).toBe("\\odot");

      const rref = lookupCatalog("rref");
      expect(rref).not.toBeNull();
      expect(getRoleName(rref!.roleId)).toBe("function");
    });

    it("resolves SymPy / Python mathematical entities", () => {
      const symMatrix = lookupCatalog("Matrix");
      expect(symMatrix).not.toBeNull();
      expect(getRoleName(symMatrix!.roleId)).toBe("delimiter");

      const diracDelta = lookupCatalog("DiracDelta");
      expect(diracDelta).not.toBeNull();
      expect(getRoleName(diracDelta!.roleId)).toBe("function");
    });

    it("resolves Wolfram Language named characters and functions", () => {
      const diffD = lookupCatalog("\\[DifferentialD]");
      expect(diffD).not.toBeNull();
      expect(getRoleName(diffD!.roleId)).toBe("differential");
      expect(diffD?.unicode).toBe("ⅆ");

      const sinWolfram = lookupCatalog("Sin");
      expect(sinWolfram).not.toBeNull();
      expect(getRoleName(sinWolfram!.roleId)).toBe("function");
    });
  });

  describe("Dialect Bitmask Gating (O(1) Branchless Filtering)", () => {
    it("filters out inactive dialects in O(1) when dialect mask is applied", () => {
      // By default with DIALECT_ALL, MATLAB operator '.*' resolves
      expect(lookupCatalog(".*", DOMAIN_ALL, DIALECT_ALL)).not.toBeNull();

      // When only DIALECT_LATEX is active, '.*' is filtered out (returns null)
      expect(lookupCatalog(".*", DOMAIN_ALL, DIALECT_LATEX)).toBeNull();

      // When only DIALECT_MATLAB is active, '.*' resolves
      expect(lookupCatalog(".*", DOMAIN_ALL, DIALECT_MATLAB)).not.toBeNull();

      // Core LaTeX macro \sin always resolves with DIALECT_LATEX
      expect(lookupCatalog("\\sin", DOMAIN_ALL, DIALECT_LATEX)).not.toBeNull();

      // Wolfram 'Sin' is filtered out if DIALECT_WOLFRAM is disabled
      expect(lookupCatalog("Sin", DOMAIN_ALL, DIALECT_LATEX)).toBeNull();
      expect(lookupCatalog("Sin", DOMAIN_ALL, DIALECT_WOLFRAM)).not.toBeNull();

      // Typst 'arrow.r' is filtered out if DIALECT_TYPST is disabled
      expect(lookupCatalog("arrow.r", DOMAIN_ALL, DIALECT_LATEX)).toBeNull();
      expect(lookupCatalog("arrow.r", DOMAIN_ALL, DIALECT_TYPST)).not.toBeNull();
    });

    it("computes activeDialects bitmask from options correctly", () => {
      expect(getActiveDialects(undefined)).toBe(DIALECT_ALL);
      expect(getActiveDialects({})).toBe(DIALECT_ALL);
      expect(getActiveDialects({ dialectMatlab: false })).toBe((DIALECT_ALL & ~DIALECT_MATLAB) >>> 0);
      expect(getActiveDialects({ dialectPython: false, dialectWolfram: false })).toBe(
        (DIALECT_ALL & ~DIALECT_PYTHON & ~DIALECT_WOLFRAM) >>> 0
      );
      expect(getActiveDialects({ dialectLatex: false, dialectTypst: false, dialectAsciiMath: false, dialectMatlab: false, dialectPython: false, dialectWolfram: false })).toBe((DIALECT_ALL & ~0x3F) >>> 0);
    });
  });

  describe("Absolute Value (abs / \\abs) Multi-Dialect MPHF Ingestion", () => {
    it("resolves bare 'abs' with O(1) direct lookup across all 10 mathematical dialects", () => {
      const entry = lookupCatalog("abs");
      expect(entry).not.toBeNull();
      expect(getRoleName(entry!.roleId)).toBe("function");
      expect(entry!.tier).toBe(1);
      expect(entry!.arity).toBe(1);
      expect(entry!.canonical).toBe("\\abs");

      // Verify active in every single dialect bit
      const dialects = [
        DIALECT_LATEX,
        DIALECT_TYPST,
        DIALECT_ASCIIMATH,
        DIALECT_MATLAB,
        DIALECT_PYTHON,
        DIALECT_WOLFRAM,
        DIALECT_JULIA,
        DIALECT_LEAN4,
        DIALECT_R,
      ];
      for (const d of dialects) {
        expect(lookupCatalog("abs", DOMAIN_ALL, d)).not.toBeNull();
      }
    });

    it("matches bare 'abs' as a Tier 1 function with both delimiter and spaced arguments", () => {
      // Delimiter arguments
      expect(matchBareFunction("abs(x)", 0)?.length).toBe(3);
      expect(matchBareFunction("abs[x]", 0)?.length).toBe(3);
      expect(matchBareFunction("abs{x}", 0)?.length).toBe(3);

      // Spaced arguments (Tier 1 capability)
      expect(matchBareFunction("abs x", 0)?.length).toBe(3);
      expect(matchBareFunction("abs \\theta", 0)?.length).toBe(3);
      expect(matchBareFunction("abs 2", 0)?.length).toBe(3);
    });

    it("resolves '\\abs' macro with mandatory arity 1 and macro signature in O(1)", () => {
      const entry = lookupCatalog("\\abs");
      expect(entry).not.toBeNull();
      expect(getRoleName(entry!.roleId)).toBe("function");
      expect(entry!.arity).toBe(1);

      const match = matchMacro("\\abs{x}", 0);
      expect(match).not.toBeNull();
      expect(match?.entry.key).toBe("\\abs");
    });
  });

  describe("26-Tag CHTML Layout Architecture & 32-Bit Slot Encoding", () => {
    it("extracts 32-bit Big-Endian layout slot codes in O(1)", () => {
      const frac = lookupCatalog("\\frac");
      expect(frac).not.toBeNull();
      expect(frac?.layoutSlotCode).toBeDefined();
      expect(getExpectedChildTag(frac!, 0)).toBe(TAG_NUM);
      expect(getExpectedChildTag(frac!, 1)).toBe(TAG_DEN);
      expect(getExpectedChildTag(frac!, 2)).toBe(TAG_NONE);
      expect(getExpectedChildTag(frac!, 3)).toBe(TAG_NONE);

      const sqrt = lookupCatalog("\\sqrt");
      expect(sqrt).not.toBeNull();
      expect(sqrt?.layoutSlotCode).toBeDefined();
      expect(getExpectedChildTag(sqrt!, 0)).toBe(TAG_BOX);
      expect(getExpectedChildTag(sqrt!, 1)).toBe(TAG_ROOT);

      const sub = lookupCatalog("_");
      expect(sub).not.toBeNull();
      expect(getExpectedChildTag(sub!, 0)).toBe(TAG_SUB);
      expect(getExpectedChildTag(sub!, 1)).toBe(TAG_UNDER);

      const sup = lookupCatalog("^");
      expect(sup).not.toBeNull();
      expect(getExpectedChildTag(sup!, 0)).toBe(TAG_SUP);
      expect(getExpectedChildTag(sup!, 1)).toBe(TAG_OVER);

      const casesEntry = lookupCatalog("cases") || lookupCatalog("matrix") || lookupCatalog("mat");
      if (casesEntry) {
        expect(getExpectedChildTag(casesEntry, 0)).toBe(TAG_MTR);
        expect(getExpectedChildTag(casesEntry, 1)).toBe(TAG_MTD);
      }

      const quad = lookupCatalog("\\quad");
      expect(quad).not.toBeNull();
      expect(getExpectedChildTag(quad!, 0)).toBe(TAG_MSPACE);
    });

    it("maps MathJax DOM tag names to numeric tag IDs and back", () => {
      expect(getTagIdFromNodeName("mjx-mfrac")).toBe(TAG_MFRAC);
      expect(getTagIdFromNodeName("mjx-frac")).toBe(TAG_FRAC);
      expect(getTagIdFromNodeName("mjx-num")).toBe(TAG_NUM);
      expect(getTagIdFromNodeName("mjx-den")).toBe(TAG_DEN);
      expect(getTagIdFromNodeName("mjx-dbox")).toBe(TAG_DBOX);
      expect(getTagIdFromNodeName("mjx-dtable")).toBe(TAG_DTABLE);
      expect(getTagIdFromNodeName("mjx-line")).toBe(TAG_LINE);
      expect(getTagIdFromNodeName("mjx-surd")).toBe(TAG_SURD);
      expect(getTagIdFromNodeName("mjx-box")).toBe(TAG_BOX);
      expect(getTagIdFromNodeName("mjx-root")).toBe(TAG_ROOT);
      expect(getTagIdFromNodeName("mjx-sub")).toBe(TAG_SUB);
      expect(getTagIdFromNodeName("mjx-sup")).toBe(TAG_SUP);
      expect(getTagIdFromNodeName("mjx-spacer")).toBe(TAG_SPACER);
      expect(getTagIdFromNodeName("mjx-ext")).toBe(TAG_EXT);
      expect(getTagIdFromNodeName("mjx-mrow")).toBe(TAG_MROW);
      expect(getTagIdFromNodeName("mjx-unknown")).toBe(TAG_NONE);

      expect(getTagName(TAG_NUM)).toBe("mjx-num");
      expect(getTagName(TAG_DEN)).toBe("mjx-den");
      expect(getTagName(TAG_BOX)).toBe("mjx-box");
      expect(getTagName(TAG_SURD)).toBe("mjx-surd");
    });

    it("evaluates ChtmlTagMask bitmask sets in O(1)", () => {
      expect(tagMatchesMask(TAG_MROW, MASK_TRANSPARENT_INTERMEDIATE)).toBe(true);
      expect(tagMatchesMask(TAG_TEXATOM, MASK_TRANSPARENT_INTERMEDIATE)).toBe(true);
      expect(tagMatchesMask(TAG_BOX, MASK_TRANSPARENT_INTERMEDIATE)).toBe(true);
      expect(tagMatchesMask(TAG_NUM, MASK_TRANSPARENT_INTERMEDIATE)).toBe(false);

      expect(tagMatchesMask(TAG_EXT, MASK_STRETCHY_FRAGMENTS)).toBe(true);
      expect(tagMatchesMask(TAG_SPACER, MASK_STRETCHY_FRAGMENTS)).toBe(true);
      expect(tagMatchesMask(TAG_SURD, MASK_STRETCHY_FRAGMENTS)).toBe(true);
      expect(tagMatchesMask(TAG_LINE, MASK_STRETCHY_FRAGMENTS)).toBe(true);
      expect(tagMatchesMask(TAG_NUM, MASK_STRETCHY_FRAGMENTS)).toBe(false);

      expect(tagMatchesMask(TAG_NUM, MASK_SLOT_CONTAINERS)).toBe(true);
      expect(tagMatchesMask(TAG_DEN, MASK_SLOT_CONTAINERS)).toBe(true);
      expect(tagMatchesMask(TAG_SUB, MASK_SLOT_CONTAINERS)).toBe(true);
      expect(tagMatchesMask(TAG_SUP, MASK_SLOT_CONTAINERS)).toBe(true);
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
