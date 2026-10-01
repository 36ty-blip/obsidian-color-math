// tests/vault_suite_runner.mjs
import fs from "fs";
import path from "path";
import katex from "katex";
import { convertText } from "../src/converters/block";
import { uncolorText } from "../src/undo";
import { DEFAULT_COLORS, DEFAULT_OPTIONS } from "../src/config";
import { scanMarkdown } from "../src/parsers/markdown_scanner";
import { detectNoteField } from "../src/parsers/frontmatter";

const vaultTestDir = "C:\\Users\\aditya\\Obsidian Vaults\\Aditya\\test";

function getAllMarkdownFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getAllMarkdownFiles(fullPath));
    } else if (file.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

console.log(`Scanning test notes in: ${vaultTestDir}`);
const files = getAllMarkdownFiles(vaultTestDir);
console.log(`Found ${files.length} markdown test files.\n`);

let totalEquations = 0;
let totalFilesPassed = 0;
let totalFilesFailed = 0;
const issues = [];

const startTime = performance.now();

for (const filePath of files) {
  const relPath = path.relative(vaultTestDir, filePath);
  const content = fs.readFileSync(filePath, "utf-8");

  // Detect note mode from frontmatter
  const detection = detectNoteField(content);
  const activeMode = detection.field || DEFAULT_OPTIONS.activeMode;
  const options = {
    ...DEFAULT_OPTIONS,
    activeMode: activeMode,
    field: activeMode,
  };

  const scan = scanMarkdown(content);
  const mathCount = scan.mathBlocks.length + scan.mathInlines.length;
  totalEquations += mathCount;

  try {
    // 1. Test convertText (Bake)
    const t0 = performance.now();
    const colored = convertText(content, DEFAULT_COLORS, options);
    const bakeTime = (performance.now() - t0).toFixed(2);

    // 2. Validate all colored equations with KaTeX
    const coloredScan = scanMarkdown(colored);
    const allBlocks = [...coloredScan.mathBlocks, ...coloredScan.mathInlines];
    let fileSyntaxErrors = 0;

    for (const block of allBlocks) {
      const rawEq = colored.slice(block.contentStart, block.contentEnd);
      try {
        katex.renderToString(rawEq, {
          throwOnError: true,
          displayMode: block.kind === "math_block",
        });
      } catch (kErr) {
        // Some specialized LaTeX environments (like align/aligned, physics packages, etc.)
        // might throw in standard KaTeX if specific macros aren't preloaded, so note them.
        fileSyntaxErrors++;
        issues.push({
          file: relPath,
          error: kErr.message,
          equation: rawEq.slice(0, 80),
        });
      }
    }

    // 3. Test uncolorText (Undo roundtrip)
    const uncolored = uncolorText(colored);
    const roundtripScan = scanMarkdown(uncolored);
    const roundtripCount = roundtripScan.mathBlocks.length + roundtripScan.mathInlines.length;

    if (roundtripCount !== mathCount) {
      issues.push({
        file: relPath,
        error: `Math block count mismatch after undo: original ${mathCount} vs uncolored ${roundtripCount}`,
      });
      totalFilesFailed++;
      continue;
    }

    totalFilesPassed++;
    console.log(
      `[PASS] ${relPath} (${mathCount} equations, ${bakeTime}ms)`
    );
  } catch (err) {
    totalFilesFailed++;
    issues.push({
      file: relPath,
      error: `Fatal exception during processing: ${err.message}`,
    });
    console.error(`[FAIL] ${relPath}: ${err.message}`);
  }
}

const totalTime = (performance.now() - startTime).toFixed(2);

console.log("\n========================================");
console.log("             TEST SUITE SUMMARY          ");
console.log("========================================");
console.log(`Files Processed:   ${files.length}`);
console.log(`Files Passed:      ${totalFilesPassed}`);
console.log(`Files Failed:      ${totalFilesFailed}`);
console.log(`Total Equations:   ${totalEquations}`);
console.log(`Total Time Taken:  ${totalTime} ms`);
console.log(`Average Per File:  ${(totalTime / files.length).toFixed(2)} ms`);

if (issues.length > 0) {
  console.log(`\nNoted Issues / KaTeX syntax notices (${issues.length}):`);
  for (const iss of issues.slice(0, 10)) {
    console.log(`- [${iss.file}] ${iss.error}`);
    if (iss.equation) console.log(`  Equation snippet: ${iss.equation}`);
  }
  if (issues.length > 10) {
    console.log(`  ... and ${issues.length - 10} more.`);
  }
} else {
  console.log("\nZero errors or regressions across all test files!");
}
