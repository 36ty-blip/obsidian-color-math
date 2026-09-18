import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { DEFAULT_COLORS } from "../src/config";

describe("Configuration & Fault Tolerance Tests", () => {
  it("ships a valid and complete default.config.json template", () => {
    const defaultConfigPath = path.resolve(__dirname, "../default.config.json");
    expect(fs.existsSync(defaultConfigPath)).toBe(true);

    const raw = fs.readFileSync(defaultConfigPath, "utf-8");
    const parsed = JSON.parse(raw);

    // Verify root sections
    expect(parsed._comment).toBeDefined();
    expect(parsed.palette).toBeDefined();
    expect(parsed.liveRendering).toBe(true);

    // Verify all colors exist
    for (const key of Object.keys(DEFAULT_COLORS)) {
      expect(parsed.palette[key]).toBe(DEFAULT_COLORS[key as keyof typeof DEFAULT_COLORS]);
    }

    // Verify unicode defaults
    expect(parsed.convertDefiniteIntegrals).toBe(false);
    expect(parsed.convertBoundedOperators).toBe(false);
    expect(parsed.greekStyle).toBe("plane1");
    expect(parsed.convertProseToUnicode).toBe(false);
    expect(parsed.convertProseToLatex).toBe(false);
  });

  it("safely merges partial user configuration over factory defaults", () => {
    const defaultConfig = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../default.config.json"), "utf-8")
    );

    const partialUserData = {
      palette: {
        main: "#ff00ff",
      },
      greekStyle: "standard",
    };

    const merged = {
      ...defaultConfig,
      ...partialUserData,
      palette: {
        ...defaultConfig.palette,
        ...partialUserData.palette,
      },
    };

    // User customized values applied
    expect(merged.palette.main).toBe("#ff00ff");
    expect(merged.greekStyle).toBe("standard");

    // All omitted keys safely retain default values
    expect(merged.palette.orange).toBe(defaultConfig.palette.orange);
    expect(merged.liveRendering).toBe(true);
    expect(merged.convertProseToUnicode).toBe(false);
    expect(merged.convertProseToLatex).toBe(false);
  });
});
