import obsidianmd from "eslint-plugin-obsidianmd";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // Keep Obsidian-specific rules enabled (memory management, manifest, API safety)
      "obsidianmd/ui/sentence-case": "off",
      "obsidianmd/settings-tab/prefer-setting-definitions": "warn", // Handled in settings redesign
      
      // Allow pragmatic TypeScript types where Obsidian's internal DOM/CM6 lacks public typings
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-deprecated": "warn",
    },
  },
];
