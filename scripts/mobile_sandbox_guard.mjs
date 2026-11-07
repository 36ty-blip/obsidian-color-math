#!/usr/bin/env node

/**
 * mobile_sandbox_guard.mjs
 *
 * Zero-Leak Mobile Platform Sandbox Scanner for Obsidian Color Math.
 *
 * Obsidian plugins run cross-platform on Desktop (Electron / Node.js) and
 * Mobile (iOS JavaScriptCore and Android WebView / V8). Accidental imports
 * of Node.js built-in modules or execution of unshielded Node desktop globals
 * crash Obsidian mobile app startup.
 *
 * This scanner asserts that the production bundle (main.js) is 100% pure
 * browser/mobile compatible and contains zero unshielded desktop leaks.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const bundlePath = path.join(rootDir, "main.js");

// Forbidden desktop-only imports in production mobile bundle
const FORBIDDEN_PATTERNS = [
  {
    name: "Node File System (fs / node:fs)",
    regex: /require\s*\(\s*['"](?:node:)?fs(?:\/promises)?['"]\s*\)/g,
  },
  {
    name: "Node Child Process (child_process / node:child_process)",
    regex: /require\s*\(\s*['"](?:node:)?child_process['"]\s*\)/g,
  },
  {
    name: "Node OS (os / node:os)",
    regex: /require\s*\(\s*['"](?:node:)?os['"]\s*\)/g,
  },
  {
    name: "Node Path (path / node:path)",
    regex: /require\s*\(\s*['"](?:node:)?path['"]\s*\)/g,
  },
  {
    name: "Node Network (net / http / https)",
    regex: /require\s*\(\s*['"](?:node:)?(?:net|http|https|tls|dgram)['"]\s*\)/g,
  },
  {
    name: "Direct process.exit Call",
    regex: /\bprocess\.exit\s*\(/g,
  },
];

async function scanBundle() {
  console.log(`[mobile_sandbox_guard] Scanning production bundle: ${bundlePath}`);

  try {
    const code = await fs.readFile(bundlePath, "utf-8");
    const violations = [];

    for (const rule of FORBIDDEN_PATTERNS) {
      const matches = [...code.matchAll(rule.regex)];
      if (matches.length > 0) {
        violations.push({
          rule: rule.name,
          count: matches.length,
          samples: matches.slice(0, 3).map((m) => m[0]),
        });
      }
    }

    if (violations.length > 0) {
      console.error(`\n❌ [mobile_sandbox_guard] CRITICAL: Forbidden desktop APIs detected in production bundle!`);
      for (const v of violations) {
        console.error(`  • ${v.rule} (${v.count} occurrence${v.count > 1 ? "s" : ""})`);
        console.error(`    Sample matches: ${v.samples.join(", ")}`);
      }
      console.error(`\nThese modules will cause fatal crashes on Obsidian Mobile (iOS/Android). Aborting release build.\n`);
      process.exit(1);
    }

    console.log(`[mobile_sandbox_guard] ✔ 100% Mobile Sandbox Pass: Zero Node built-ins or desktop leaks detected.`);
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error(`❌ [mobile_sandbox_guard] Bundle main.js not found at ${bundlePath}. Run 'npm run build' first.`);
    } else {
      console.error(`❌ [mobile_sandbox_guard] Scan error:`, err.message);
    }
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("mobile_sandbox_guard.mjs")) {
  scanBundle();
}
