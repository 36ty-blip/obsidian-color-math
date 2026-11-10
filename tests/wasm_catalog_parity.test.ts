// tests/wasm_catalog_parity.test.ts
// Bijective Parity Test Suite: Pure TypeScript Lemire MPHF vs. WebAssembly Island 1 Engine
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  lookupCatalog,
  CATALOG_TABLE,
  DOMAIN_ALL,
  DIALECT_ALL,
  DOMAIN_QUANTUM,
  DOMAIN_LINEAR_ALGEBRA,
  DIALECT_LATEX,
  DIALECT_TYPST,
} from "../src/parsers/catalog";
import {
  isWasmCatalogReady,
  initWasmCatalog,
  lookupWasmCatalogSlot,
  lookupWasmCatalogPacked,
  disableWasmCatalog,
} from "../src/parsers/wasm_catalog";

describe("Island 1: Lemire MPHF Catalog Parity & Bijective Verification", () => {
  it("verifies pure TypeScript baseline matches 100% across all 9,342 catalog entries", () => {
    let matched = 0;
    for (let i = 0; i < CATALOG_TABLE.length; i++) {
      const entry = CATALOG_TABLE[i];
      if (!entry) continue;
      const result = lookupCatalog(entry.key, DOMAIN_ALL, DIALECT_ALL);
      expect(result).not.toBeNull();
      expect(result?.key).toBe(entry.key);
      matched++;
    }
    expect(matched).toBe(9342);
  });

  it("verifies pure TypeScript rejection for unknown symbols", () => {
    expect(lookupCatalog("\\notARealCommand_xyz123")).toBeNull();
    expect(lookupCatalog("randomNonExistentSymbol")).toBeNull();
    expect(lookupCatalog("")).toBeNull();
  });

  it("verifies pure TypeScript domain and dialect bitmask filtering", () => {
    const bra = lookupCatalog("\\bra", DOMAIN_QUANTUM, DIALECT_ALL);
    expect(bra).not.toBeNull();

    const braWrongDomain = lookupCatalog("\\bra", DOMAIN_LINEAR_ALGEBRA, DIALECT_ALL);
    expect(braWrongDomain).toBeNull();
  });

  describe("WebAssembly Island 1 Engine Bijective Parity", () => {
    beforeAll(async () => {
      const candidatePaths = [
        path.resolve(__dirname, "../wasm/target/wasm32-unknown-unknown/release/color_math_wasm.wasm"),
        path.resolve(__dirname, "../wasm/wasm_pkg/color_math_wasm_bg.wasm"),
      ];
      const wasmPath = candidatePaths.find((p) => fs.existsSync(p));
      if (wasmPath) {
        const wasmBytes = fs.readFileSync(wasmPath);
        await initWasmCatalog(wasmBytes);
      }
    });

    afterAll(() => {
      disableWasmCatalog();
    });

    it("initializes WASM Island 1 module successfully", () => {
      expect(isWasmCatalogReady()).toBe(true);
    });

    it("achieves 100.00% bijective parity with pure TypeScript across all 9,342 catalog entries", () => {
      if (!isWasmCatalogReady()) {
        console.warn("WASM binary not found; skipping WASM parity check");
        return;
      }

      let exactMatches = 0;
      for (let i = 0; i < CATALOG_TABLE.length; i++) {
        const entry = CATALOG_TABLE[i];
        if (!entry) continue;

        const tsResult = lookupCatalog(entry.key, DOMAIN_ALL, DIALECT_ALL);
        const wasmSlot = lookupWasmCatalogSlot(entry.key, DOMAIN_ALL, DIALECT_ALL);

        expect(wasmSlot).toBeGreaterThanOrEqual(0);
        expect(wasmSlot).toBeLessThan(CATALOG_TABLE.length);

        const wasmEntry = CATALOG_TABLE[wasmSlot];
        expect(wasmEntry.key).toBe(entry.key);
        expect(wasmEntry.role).toBe(tsResult?.role);
        expect(wasmEntry.priority).toBe(tsResult?.priority);
        exactMatches++;
      }
      expect(exactMatches).toBe(9342);
    });

    it("verifies WASM rejection for unknown symbols mirrors pure TypeScript", () => {
      if (!isWasmCatalogReady()) return;

      expect(lookupWasmCatalogSlot("\\notARealCommand_xyz123")).toBe(-1);
      expect(lookupWasmCatalogSlot("randomNonExistentSymbol")).toBe(-1);
      expect(lookupWasmCatalogSlot("")).toBe(-1);
    });

    it("verifies WASM domain and dialect bitmask filtering mirrors pure TypeScript", () => {
      if (!isWasmCatalogReady()) return;

      const braSlot = lookupWasmCatalogSlot("\\bra", DOMAIN_QUANTUM, DIALECT_ALL);
      expect(braSlot).toBeGreaterThanOrEqual(0);
      expect(CATALOG_TABLE[braSlot].key).toBe("\\bra");

      const braWrongDomain = lookupWasmCatalogSlot("\\bra", DOMAIN_LINEAR_ALGEBRA, DIALECT_ALL);
      expect(braWrongDomain).toBe(-1);
    });

    it("verifies packed 32-bit WASM metadata decoding", () => {
      if (!isWasmCatalogReady()) return;

      const packed = lookupWasmCatalogPacked("\\sin", DOMAIN_ALL, DIALECT_ALL);
      expect(packed).not.toBe(0xFFFFFFFF);

      const role = packed & 0xF;
      const priority = (packed >> 4) & 0x7F;
      const slot = (packed >> 20) & 0xFFF;

      expect(CATALOG_TABLE[slot].key).toBe("\\sin");
      expect(role).toBe(0); // ROLE_FUNCTION
      expect(priority).toBe(22);
    });
  });
});
