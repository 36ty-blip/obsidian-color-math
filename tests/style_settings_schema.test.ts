// tests/style_settings_schema.test.ts
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { DEFAULT_COLORS, ColorRole } from "../src/config";

describe("Style Settings Schema Specification", () => {
  const stylesPath = path.resolve(__dirname, "../styles.css");
  const cssContent = fs.readFileSync(stylesPath, "utf-8");

  it("contains an @settings comment block at the top", () => {
    expect(cssContent).toContain("/* @settings");
    expect(cssContent).toContain("name: Color Math");
    expect(cssContent).toContain("id: color-math");
  });

  it("covers all 16 semantic roles with variable-color controls", () => {
    const roles = Object.keys(DEFAULT_COLORS) as ColorRole[];
    expect(roles.length).toBe(16);

    for (const role of roles) {
      const settingId = `color-math-role-${role}`;
      expect(cssContent).toContain(`id: ${settingId}`);
      expect(cssContent).toContain(`--${settingId}:`);
    }
  });

  it("defines default CSS custom properties under :root", () => {
    expect(cssContent).toContain(":root {");
    expect(cssContent).toContain("--color-math-role-main: #7aa2f7;");
    expect(cssContent).toContain("--color-math-role-orange: #e0af68;");
    expect(cssContent).toContain("--color-math-role-parameter: #ff9e64;");
    expect(cssContent).toContain("--color-math-role-derivative: #bb9af7;");
  });

  it("covers curated palette presets via class-select", () => {
    expect(cssContent).toContain("id: color-math-theme-preset");
    expect(cssContent).toContain("type: class-select");
    expect(cssContent).toContain("color-math-theme-tokyo");
    expect(cssContent).toContain("color-math-theme-catppuccin");
    expect(cssContent).toContain("color-math-theme-nord");
    expect(cssContent).toContain("color-math-theme-light");
    expect(cssContent).toContain("color-math-theme-custom");

    // Asserts preset CSS class rules exist
    expect(cssContent).toContain("body.color-math-theme-catppuccin");
    expect(cssContent).toContain("body.color-math-theme-nord");
    expect(cssContent).toContain("body.color-math-theme-light");
  });

  it("covers all 6 rainbow tiers with variable-color controls and :root definitions", () => {
    for (let i = 1; i <= 6; i++) {
      expect(cssContent).toContain(`id: color-math-rainbow-${i}`);
      expect(cssContent).toContain(`--color-math-rainbow-${i}:`);
    }
  });

  it("covers all 8 variable-flow hash slots with variable-color controls and :root definitions", () => {
    for (let i = 1; i <= 8; i++) {
      expect(cssContent).toContain(`id: color-math-hash-${i}`);
      expect(cssContent).toContain(`--color-math-hash-${i}:`);
    }
  });

  it("covers syntax diagnostics and warning variables", () => {
    expect(cssContent).toContain("id: color-math-unmatched-delim");
    expect(cssContent).toContain("id: color-math-unmatched-bg");
    expect(cssContent).toContain("--color-math-unmatched-delim: #f7768e;");
    expect(cssContent).toContain("--color-math-unmatched-bg: rgba(247, 118, 142, 0.18);");
  });
});
