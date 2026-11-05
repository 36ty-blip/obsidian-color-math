import { describe, it, expect } from "vitest";
import { DEFAULT_OPTIONS } from "../src/config";
import * as fs from "fs";
import * as path from "path";

describe("Roadmap 1.23 Settings Reorganization & UI Hygiene", () => {
  it("includes floating tooltip opacity and opaque background options in DEFAULT_OPTIONS", () => {
    expect(DEFAULT_OPTIONS.inlineMathFloatingTooltip).toBe(true);
    expect(DEFAULT_OPTIONS.inlineMathFloatingTooltipOpacity).toBe(100);
    expect(DEFAULT_OPTIONS.inlineMathFloatingTooltipOpaque).toBe(false);
  });

  it("verifies main.ts has search aliases attached to settings", () => {
    const mainPath = path.resolve(__dirname, "../src/main.ts");
    const content = fs.readFileSync(mainPath, "utf8");

    // Check addSearchAliases helper method
    expect(content).toContain("private addSearchAliases(setting: Setting, aliases: string[]): Setting");
    expect(content).toContain("setupSearchAutoUnfolding");
    expect(content).toContain('details.setAttribute("data-section-id", id)');

    // Check that aliases exist across sections
    expect(content).toContain('["tooltip", "floating", "preview", "hover", "inline", "cursor", "popup"]');
    expect(content).toContain('["opacity", "transparency", "alpha", "slider", "fade"]');
    expect(content).toContain('["opaque", "solid", "backdrop", "blur", "background"]');
    expect(content).toContain('["rainbow", "delimiter", "bracket", "parenthesis", "nesting", "depth", "color"]');
    expect(content).toContain('["hash", "dataflow", "variable", "tracking", "murmur", "continuity", "color"]');
  });

  it("verifies dedicated Experimental section is established", () => {
    const mainPath = path.resolve(__dirname, "../src/main.ts");
    const content = fs.readFileSync(mainPath, "utf8");

    expect(content).toContain("section-feature-preview-experimental");
    expect(content).toContain("🧪 Feature Preview & Experimental");
    expect(content).toContain("Strict structural delimiter gating");
    expect(content).toContain("Require backslash for Greek letters");
  });

  it("verifies redundant symbol taxonomy master toggle is pruned", () => {
    const mainPath = path.resolve(__dirname, "../src/main.ts");
    const content = fs.readFileSync(mainPath, "utf8");

    // "Mathematical symbol taxonomy" should no longer be a setting in the settings tab
    expect(content).not.toContain('.setName("Mathematical symbol taxonomy")');
    // But the granular settings remain
    expect(content).toContain('.setName("Standard math functions")');
    expect(content).toContain('.setName("Greek parameters & coefficients")');
    expect(content).toContain('.setName("Mathematical constants")');
    expect(content).toContain('.setName("Bound iteration indices")');
    expect(content).toContain('.setName("Euler\'s number (e) & Imaginary units (i, j)")');
  });

  it("verifies styles.css contains search alias and opaque tooltip definitions", () => {
    const cssPath = path.resolve(__dirname, "../styles.css");
    const css = fs.readFileSync(cssPath, "utf8");

    expect(css).toContain(".color-math-search-alias");
    expect(css).toContain("display: none !important;");
    expect(css).toContain(".color-math-tooltip-opaque");
  });
});
