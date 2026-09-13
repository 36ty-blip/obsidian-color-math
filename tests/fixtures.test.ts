import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { convertText, uncolorText } from "../src/index";
import { validateMarkdownMath } from "./validator";

describe("Markdown Fixture Regression Tests", () => {
  const originalDir = path.resolve(__dirname, "original");
  const expectedDir = path.resolve(__dirname, "expected");

  const files = fs
    .readdirSync(originalDir)
    .filter((file) => file.endsWith(".md"))
    .sort();

  it("found fixture files", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toEqual(
      fs.readdirSync(expectedDir).filter((file) => file.endsWith(".md")).sort()
    );
  });

  for (const filename of files) {
    describe(`Fixture: ${filename}`, () => {
      const originalPath = path.join(originalDir, filename);
      const expectedPath = path.join(expectedDir, filename);

      const source = fs.readFileSync(originalPath, "utf8");
      const expected = fs.readFileSync(expectedPath, "utf8");
      const actual = convertText(source);

      it("converts exactly to expected output", () => {
        expect(actual).toBe(expected);
      });

      it("undoes back to original source exactly", () => {
        expect(uncolorText(actual)).toBe(source);
      });

      it("is idempotent (convert(convert(source)) === convert(source))", () => {
        expect(convertText(actual)).toBe(actual);
      });

      it("validates all converted equations against both KaTeX and MathJax engines", () => {
        const validation = validateMarkdownMath(actual, "both");
        if (!validation.valid) {
          console.error(`Validation failures in ${filename}:`, validation.failures);
        }
        expect(
          validation.valid,
          `Dual-engine validation failed for ${filename}: ${JSON.stringify(validation.failures)}`
        ).toBe(true);
      });
    });
  }
});
