// tests/bootloader_deferral.test.ts
// Unit tests for Sub-50ms Asynchronous Bootloader & Idle Task Deferral Architecture (Roadmap 1.18)

import { describe, it, expect, beforeEach } from "vitest";
import {
  lookupCatalog,
  lookupMacroSignature,
  hydrateCatalog,
  isCatalogReady,
  resetCatalogHydrationForTesting,
  DOOR1_CORE_CATALOG,
  ROLE_FUNCTION,
  ROLE_STRUCTURAL,
  ROLE_DELIMITER,
  ROLE_PARAMETER,
  ROLE_CONSTANT,
} from "../src/parsers/catalog";

describe("Sub-50ms Bootloader & Idle Task Deferral (Roadmap 1.18)", () => {
  beforeEach(() => {
    resetCatalogHydrationForTesting();
  });

  it("maintains unhydrated state prior to idle task trigger", () => {
    expect(isCatalogReady()).toBe(false);
  });

  it("resolves foundational math tokens via Door 1 fast-path while unhydrated", () => {
    expect(isCatalogReady()).toBe(false);

    // Common functions
    const sinEntry = lookupCatalog("\\sin");
    expect(sinEntry).not.toBeNull();
    expect(sinEntry?.roleId).toBe(ROLE_FUNCTION);
    expect(sinEntry?.expectedText).toBe("sin");

    const cosEntry = lookupCatalog("\\cos");
    expect(cosEntry).not.toBeNull();
    expect(cosEntry?.expectedText).toBe("cos");

    // Layout constructors
    const fracEntry = lookupCatalog("\\frac");
    expect(fracEntry).not.toBeNull();
    expect(fracEntry?.roleId).toBe(ROLE_STRUCTURAL);
    expect(fracEntry?.arity).toBe(2);

    const sqrtEntry = lookupCatalog("\\sqrt");
    expect(sqrtEntry).not.toBeNull();
    expect(sqrtEntry?.roleId).toBe(ROLE_DELIMITER);
    expect(sqrtEntry?.arity).toBe(1);
    expect(sqrtEntry?.hasOptionalBracket).toBe(true);

    // Greek letters & constants
    const alphaEntry = lookupCatalog("\\alpha");
    expect(alphaEntry).not.toBeNull();
    expect(alphaEntry?.roleId).toBe(ROLE_PARAMETER);

    const piEntry = lookupCatalog("\\pi");
    expect(piEntry).not.toBeNull();
    expect(piEntry?.roleId).toBe(ROLE_CONSTANT);

    // Bare functions and shorthand symbols
    const bareSin = lookupCatalog("sin");
    expect(bareSin).not.toBeNull();
    expect(bareSin?.tier).toBe(1);

    const ooEntry = lookupCatalog("oo");
    expect(ooEntry).not.toBeNull();
    expect(ooEntry?.roleId).toBe(ROLE_CONSTANT);
  });

  it("preserves fallback MPHF resolution for rare tokens when unhydrated", () => {
    expect(isCatalogReady()).toBe(false);

    // Token outside DOOR1_CORE_CATALOG falls through to Lemire MPHF table seamlessly
    const ointEntry = lookupCatalog("\\oint");
    expect(ointEntry).not.toBeNull();

    const coprodEntry = lookupCatalog("\\coprod");
    expect(coprodEntry).not.toBeNull();
  });

  it("provides progressive macro signature lookup during live typing before hydration", () => {
    expect(isCatalogReady()).toBe(false);

    const fracSig = lookupMacroSignature("\\frac");
    expect(fracSig).not.toBeNull();
    expect(fracSig?.mandatoryArgs).toBe(2);
    expect(fracSig?.hasOptionalBracket).toBe(false);

    const sqrtSig = lookupMacroSignature("\\sqrt");
    expect(sqrtSig).not.toBeNull();
    expect(sqrtSig?.mandatoryArgs).toBe(1);
    expect(sqrtSig?.hasOptionalBracket).toBe(true);
  });

  it("transitions cleanly through hydrateCatalog() lifecycle", () => {
    expect(isCatalogReady()).toBe(false);

    hydrateCatalog();
    expect(isCatalogReady()).toBe(true);

    // Idempotent re-hydration
    hydrateCatalog();
    expect(isCatalogReady()).toBe(true);

    // Lookups remain 100% accurate after hydration
    const sinEntry = lookupCatalog("\\sin");
    expect(sinEntry).not.toBeNull();
    expect(sinEntry?.roleId).toBe(ROLE_FUNCTION);

    const fracEntry = lookupCatalog("\\frac");
    expect(fracEntry).not.toBeNull();
    expect(fracEntry?.roleId).toBe(ROLE_STRUCTURAL);
  });

  it("guarantees sub-microsecond Door 1 throughput within 144Hz frame budget", () => {
    expect(isCatalogReady()).toBe(false);

    const tokens = ["\\sin", "\\cos", "\\frac", "\\sqrt", "\\alpha", "\\pi", "sin", "oo"];
    let nullCount = 0;
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      const token = tokens[i % tokens.length];
      const entry = lookupCatalog(token);
      if (!entry) nullCount++;
    }
    const elapsedMs = performance.now() - start;

    expect(nullCount).toBe(0);
    // 10,000 lookups must execute within the 6.94ms 144Hz frame budget (typical: < 0.5ms)
    expect(elapsedMs).toBeLessThan(6.94);
  });
});
