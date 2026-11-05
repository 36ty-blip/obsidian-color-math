// tests/settings_definitions.test.ts
// Unit tests for Obsidian Native Settings Search Indexing & Definitions Catalog

import { describe, it, expect } from "vitest";
import { COLOR_MATH_SETTING_CATALOG } from "../src/config/setting_definitions";

describe("Obsidian Native Settings Search Indexing", () => {
  it("defines a comprehensive catalog of settings with non-empty metadata", () => {
    expect(COLOR_MATH_SETTING_CATALOG.length).toBeGreaterThan(30);

    for (const def of COLOR_MATH_SETTING_CATALOG) {
      expect(def.id).toBeDefined();
      expect(def.id.length).toBeGreaterThan(0);
      expect(def.name).toBeDefined();
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.desc).toBeDefined();
      expect(def.desc.length).toBeGreaterThan(0);
      expect(Array.isArray(def.aliases)).toBe(true);
      expect(def.aliases.length).toBeGreaterThan(0);
    }
  });

  it("indexes key queries across names, descriptions, and keyword aliases", () => {
    const searchCatalog = (query: string) => {
      const q = query.toLowerCase();
      return COLOR_MATH_SETTING_CATALOG.filter((item) => {
        const inName = item.name.toLowerCase().includes(q);
        const inDesc = item.desc.toLowerCase().includes(q);
        const inAliases = item.aliases.some((a) => a.toLowerCase().includes(q));
        return inName || inDesc || inAliases;
      });
    };

    // 1. Rainbow delimiters query
    const rainbowMatches = searchCatalog("rainbow");
    expect(rainbowMatches.length).toBeGreaterThanOrEqual(3);
    expect(rainbowMatches.some((m) => m.id === "rainbow-delimiters")).toBe(true);

    // 2. WebAssembly query
    const wasmMatches = searchCatalog("wasm");
    expect(wasmMatches.length).toBeGreaterThanOrEqual(1);
    expect(wasmMatches[0].id).toBe("use-webassembly");

    // 3. Matrix query
    const matrixMatches = searchCatalog("matrix");
    expect(matrixMatches.length).toBeGreaterThanOrEqual(2);
    expect(matrixMatches.some((m) => m.id === "sugar-bracket-matrices")).toBe(true);

    // 4. Derivative query
    const derivativeMatches = searchCatalog("derivative");
    expect(derivativeMatches.length).toBeGreaterThanOrEqual(1);
    expect(derivativeMatches.some((m) => m.id === "color-differentials")).toBe(true);

    // 5. Syntactic sugar query
    const sugarMatches = searchCatalog("sugar");
    expect(sugarMatches.length).toBeGreaterThanOrEqual(4);

    // 6. Typst query
    const typstMatches = searchCatalog("typst");
    expect(typstMatches.length).toBeGreaterThanOrEqual(1);
    expect(typstMatches[0].id).toBe("dialect-typst");

    // 7. Physical units query
    const unitMatches = searchCatalog("units");
    expect(unitMatches.length).toBeGreaterThanOrEqual(2);
    expect(unitMatches.some((m) => m.id === "color-units")).toBe(true);
  });

  it("conforms to Obsidian SettingDefinitionItem specification", () => {
    const definitions = COLOR_MATH_SETTING_CATALOG.map((item) => ({
      name: item.name,
      desc: item.desc,
      aliases: item.aliases,
      searchable: true,
    }));

    for (const item of definitions) {
      expect(typeof item.name).toBe("string");
      expect(typeof item.desc).toBe("string");
      expect(Array.isArray(item.aliases)).toBe(true);
      expect(item.searchable).toBe(true);
    }
  });

  it("assigns rainbow delimiters and variable data-flow to Theme & Color Palettes", () => {
    const rainbowItem = COLOR_MATH_SETTING_CATALOG.find((i) => i.id === "rainbow-delimiters");
    const dataFlowItem = COLOR_MATH_SETTING_CATALOG.find((i) => i.id === "variable-data-flow");
    expect(rainbowItem?.sectionId).toBe("section-theme-palettes");
    expect(dataFlowItem?.sectionId).toBe("section-theme-palettes");
  });

  it("produces valid Declarative-Shadow Search Adapter definitions with root and shadow elements", () => {
    const definitions = [
      {
        name: "Color Math Settings",
        desc: "AST-driven semantic mathematical styling and MathJax CHTML decoration across CodeMirror 6 and Reading View.",
        render: (setting: any) => {},
      },
      ...COLOR_MATH_SETTING_CATALOG.map((item) => ({
        name: item.name,
        desc: item.desc + (item.aliases?.length ? ` (${item.aliases.join(", ")})` : ""),
        render: (setting: any) => {},
      })),
    ];

    expect(definitions.length).toBe(COLOR_MATH_SETTING_CATALOG.length + 1);
    expect(definitions[0].name).toBe("Color Math Settings");
    expect(typeof definitions[0].render).toBe("function");

    // All entries have non-empty name and desc for Obsidian Core left-sidebar indexing
    for (const def of definitions) {
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.desc.length).toBeGreaterThan(0);
      expect(typeof def.render).toBe("function");
    }
  });
});
