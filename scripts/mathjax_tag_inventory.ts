// scripts/mathjax_tag_inventory.ts
//! Empirical MathJax CHTML Tag Inventory & Frequency Distribution Engine.
//! Audits real-world LaTeX expressions across the 10,511-document corpus,
//! extracting every <mjx-...> tag and computing empirical frequency rankings.

import fs from "fs";
import path from "path";
import os from "os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { scanMarkdown } from "../src/parsers/markdown_scanner";
import { TAG_NAMES } from "../src/parsers/catalog";

const baseRequire = createRequire(path.resolve(__dirname, "../package.json"));

// Set of 36 known tags from catalog.ts + standard leaf tags
const KNOWN_CATALOG_TAGS = new Set<string>([
  ...TAG_NAMES.filter((t) => t !== "none"),
  "mjx-container",
  "mjx-math",
  "mjx-mi",
  "mjx-mn",
  "mjx-mo",
  "mjx-mtext",
  "mjx-c",
  "mjx-tstrut",
  "mjx-nstrut",
  "mjx-dstrut",
  "mjx-itable",
  "mjx-dline",
  "mjx-msqrt",
  "mjx-mroot",
  "mjx-msubsup",
  "mjx-subsup",
  "mjx-mstyle",
  "mjx-merror",
  "mjx-menclose",
  "mjx-mpadded",
  "mjx-mphantom",
]);

interface TagStats {
  totalFormulas: number;
  totalTags: number;
  frequency: Record<string, number>;
}

function initMathJax() {
  const mj = baseRequire("@mathjax/src/cjs/mathjax.js");
  const { TeX } = baseRequire("@mathjax/src/cjs/input/tex.js");
  const { CHTML } = baseRequire("@mathjax/src/cjs/output/chtml.js");
  const { liteAdaptor } = baseRequire("@mathjax/src/cjs/adaptors/liteAdaptor.js");
  const { RegisterHTMLHandler } = baseRequire("@mathjax/src/cjs/handlers/html.js");

  baseRequire("@mathjax/src/cjs/input/tex/ams/AmsConfiguration.js");
  baseRequire("@mathjax/src/cjs/input/tex/color/ColorConfiguration.js");
  baseRequire("@mathjax/src/cjs/input/tex/braket/BraketConfiguration.js");
  baseRequire("@mathjax/src/cjs/input/tex/physics/PhysicsConfiguration.js");
  baseRequire("@mathjax/src/cjs/input/tex/mathtools/MathtoolsConfiguration.js");
  baseRequire("@mathjax/src/cjs/input/tex/newcommand/NewcommandConfiguration.js");
  baseRequire("@mathjax/src/cjs/input/tex/cases/CasesConfiguration.js");
  baseRequire("@mathjax/src/cjs/input/tex/unicode/UnicodeConfiguration.js");

  const mathjax = mj.mathjax;
  mathjax.asyncLoad = (name: string) => import(pathToFileURL(baseRequire.resolve(name)).href);

  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);

  const tex = new TeX({
    packages: ["base", "ams", "color", "braket", "physics", "mathtools", "newcommand", "cases", "unicode"],
    inlineMath: [["$", "$"]],
    displayMath: [["$$", "$$"]],
  });
  const chtml = new CHTML({});
  const htmlDoc = mathjax.document("", { InputJax: tex, OutputJax: chtml });

  return { htmlDoc, adaptor };
}

function getAllMdFiles(dir: string): string[] {
  let results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(getAllMdFiles(full));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(full);
      }
    }
  } catch {}
  return results;
}

if (!isMainThread) {
  // WORKER THREAD
  const { files } = workerData as { files: string[] };
  const { htmlDoc, adaptor } = initMathJax();

  const freq: Record<string, number> = {};
  let formulasCount = 0;
  let tagsCount = 0;

  // Universal Tag Regex: captures EVERY opening tag between < and >, regardless of namespace
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9:-]*)[\s>/]/gi;

  for (const file of files) {
    let content = "";
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }

    let scan;
    try {
      scan = scanMarkdown(content);
    } catch {
      continue;
    }

    const blocks = [...scan.mathBlocks, ...scan.mathInlines];
    for (const b of blocks) {
      const raw = content.slice(b.contentStart, b.contentEnd).trim();
      if (!raw) continue;

      try {
        const mathItem = htmlDoc.convert(raw, { display: b.display });
        const html = adaptor.outerHTML(mathItem);
        formulasCount++;

        let match: RegExpExecArray | null;
        tagRegex.lastIndex = 0;
        while ((match = tagRegex.exec(html)) !== null) {
          const rawTag = match[1];
          // Exclude DOCTYPE or XML declarations
          if (rawTag.startsWith("!") || rawTag.startsWith("?")) continue;
          const tag = rawTag.toLowerCase();
          freq[tag] = (freq[tag] || 0) + 1;
          tagsCount++;
        }
      } catch {
        // Skip uncompilable syntax typos
      }
    }
  }

  parentPort?.postMessage({
    totalFormulas: formulasCount,
    totalTags: tagsCount,
    frequency: freq,
  } as TagStats);
} else {
  // MAIN THREAD
  async function run() {
    const isSample = process.argv.includes("--sample");
    const threadArg = process.argv.find((a) => a.startsWith("--threads="))?.split("=")[1];

    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log("       Universal HTML/XML Tag Inventory & Frequency Auditor (All <???>)  ");
    console.log("══════════════════════════════════════════════════════════════════════════\n");

    const corpusRoot = path.resolve(process.cwd(), "tests/corpus");
    if (!fs.existsSync(corpusRoot)) {
      console.error(`Corpus directory not found at: ${corpusRoot}`);
      process.exit(1);
    }

    console.log(`Corpus Directory: ${corpusRoot}`);
    console.log(`Mode:             ${isSample ? "Sample Run (Fast Preview ~2,000 equations)" : "Full Corpus Census (10,511 files)"}`);

    let mdFiles = getAllMdFiles(corpusRoot);
    console.log(`Discovered:       ${mdFiles.length.toLocaleString()} total markdown files`);

    if (isSample) {
      // Pick 60 diverse files across folders
      mdFiles = mdFiles.filter((_, idx) => idx % Math.max(1, Math.floor(mdFiles.length / 60)) === 0).slice(0, 60);
      console.log(`Sample Subset:    ${mdFiles.length} files selected across corpus`);
    }

    const totalCpus = os.cpus().length;
    const numThreads = threadArg ? parseInt(threadArg, 10) : (isSample ? 2 : Math.max(1, Math.floor(totalCpus / 2)));
    console.log(`Workers:          ${numThreads} threads allocated\n`);

    const startTime = Date.now();

    // Chunk files among workers
    const chunks: string[][] = Array.from({ length: numThreads }, () => []);
    mdFiles.forEach((file, idx) => {
      chunks[idx % numThreads].push(file);
    });

    const results = await Promise.all(
      chunks.map((fileChunk) => {
        return new Promise<TagStats>((resolve, reject) => {
          if (fileChunk.length === 0) {
            return resolve({ totalFormulas: 0, totalTags: 0, frequency: {} });
          }
          const worker = new Worker(__filename, {
            workerData: { files: fileChunk },
            execArgv: ["--require", "tsx/cjs"],
          });
          worker.on("message", resolve);
          worker.on("error", reject);
          worker.on("exit", (code) => {
            if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
          });
        });
      })
    );

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);

    // Aggregate statistics
    let totalFormulas = 0;
    let totalTags = 0;
    const aggregatedFreq: Record<string, number> = {};

    for (const res of results) {
      totalFormulas += res.totalFormulas;
      totalTags += res.totalTags;
      for (const [tag, count] of Object.entries(res.frequency)) {
        aggregatedFreq[tag] = (aggregatedFreq[tag] || 0) + count;
      }
    }

    const sorted = Object.entries(aggregatedFreq).sort((a, b) => b[1] - a[1]);

    console.log("\n══════════════════════════════════════════════════════════════════════════");
    console.log(` AUDIT SUMMARY: Completed in ${elapsedSec}s`);
    console.log(` Total Formulas Typeset: ${totalFormulas.toLocaleString()}`);
    console.log(` Total MathJax Tags Generated: ${totalTags.toLocaleString()}`);
    console.log(` Unique Tag Types Discovered: ${sorted.length}`);
    console.log("══════════════════════════════════════════════════════════════════════════\n");

    let cumulativeCount = 0;
    const tableData = sorted.map(([tag, count], idx) => {
      cumulativeCount += count;
      const sharePct = ((count / totalTags) * 100).toFixed(2);
      const cumPct = ((cumulativeCount / totalTags) * 100).toFixed(2);
      const isKnown = KNOWN_CATALOG_TAGS.has(tag);
      return {
        Rank: idx + 1,
        "Tag Name": tag,
        Count: count.toLocaleString(),
        "Share %": `${sharePct}%`,
        "Cumulative %": `${cumPct}%`,
        Status: isKnown ? "✓ In Catalog" : "⚠ NEW DISCOVERY",
      };
    });

    console.table(tableData);
  }

  run().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
