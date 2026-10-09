// tests/find_healed.ts
// Multi-threaded finder (6 threads / 50% CPU) to locate equations
// where original failed in KaTeX but healed equation succeeded!

import fs from "fs";
import path from "path";
import os from "os";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import katex from "katex";
import { scanMarkdown } from "../src/parsers/markdown_scanner";
import { convertText } from "../src/converters/block";
import { DEFAULT_OPTIONS, ColorMathOptions } from "../src/config";
import { detectNoteField } from "../src/parsers/frontmatter";

interface HealedSample {
  file: string;
  origEq: string;
  colEq: string;
  origErr: string;
}

if (!isMainThread) {
  const { files, corpusRoot } = workerData as { files: string[]; corpusRoot: string };
  const healedList: HealedSample[] = [];
  let healedCount = 0;

  for (const filePath of files) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    if (!content.includes("$")) continue;

    let scan;
    try {
      scan = scanMarkdown(content);
    } catch {
      continue;
    }

    const originalBlocks = [...scan.mathBlocks, ...scan.mathInlines];
    if (originalBlocks.length === 0) continue;

    const detection = detectNoteField(content);
    const activeMode = detection.field || DEFAULT_OPTIONS.activeMode;
    const options: ColorMathOptions = {
      ...DEFAULT_OPTIONS,
      activeMode,
    };

    let colored = "";
    try {
      colored = convertText(content, options);
    } catch {
      continue;
    }

    const coloredScan = scanMarkdown(colored);
    const coloredBlocks = [...coloredScan.mathBlocks, ...coloredScan.mathInlines];

    const len = Math.min(originalBlocks.length, coloredBlocks.length);
    for (let i = 0; i < len; i++) {
      const oBlock = originalBlocks[i];
      const cBlock = coloredBlocks[i];
      const origEq = content.slice(oBlock.contentStart, oBlock.contentEnd);
      const colEq = colored.slice(cBlock.contentStart, cBlock.contentEnd);

      let origFails = false;
      let origErr = "";
      try {
        katex.renderToString(origEq, {
          throwOnError: true,
          displayMode: oBlock.kind === "math_block",
        });
      } catch (e: any) {
        origFails = true;
        origErr = e.message;
      }

      if (origFails) {
        let colWorks = false;
        try {
          katex.renderToString(colEq, {
            throwOnError: true,
            displayMode: cBlock.kind === "math_block",
          });
          colWorks = true;
        } catch {}

        if (colWorks) {
          healedCount++;
          healedList.push({
            file: path.relative(corpusRoot, filePath),
            origEq: origEq.trim(),
            colEq: colEq.trim(),
            origErr: origErr,
          });
        }
      }
    }
  }

  parentPort?.postMessage({ healedCount, healedList });
} else {
  async function run() {
    const corpusRoot = path.resolve(process.cwd(), "tests/corpus");
    const numThreads = 6; // strictly 6 threads = 50% CPU allocation

    console.log(`Starting multi-core healed equations finder on 6 threads...`);

    function getAllMdFiles(dir: string): string[] {
      let results: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(getAllMdFiles(full));
        } else if (entry.name.endsWith(".md")) {
          results.push(full);
        }
      }
      return results;
    }

    const allFiles = getAllMdFiles(corpusRoot);
    console.log(`Found ${allFiles.length} files. Distributing across ${numThreads} worker threads...`);

    const chunks: string[][] = Array.from({ length: numThreads }, () => []);
    allFiles.forEach((file, index) => {
      chunks[index % numThreads].push(file);
    });

    let totalHealed = 0;
    const allSamples: HealedSample[] = [];

    const startTime = Date.now();
    const workerPromises = chunks.map((chunkFiles) => {
      return new Promise<void>((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: { files: chunkFiles, corpusRoot },
        });

        worker.on("message", (msg: { healedCount: number; healedList: HealedSample[] }) => {
          totalHealed += msg.healedCount;
          allSamples.push(...msg.healedList);
        });

        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
          else resolve();
        });
      });
    });

    await Promise.all(workerPromises);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\nScan finished in ${duration}s.`);
    console.log(`Total equations healed (Failed originally -> Succeeded with Color Math): ${totalHealed}\n`);

    const reportPath = path.resolve(process.cwd(), "reports/healed_equations.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({ totalHealed, durationSec: duration, samples: allSamples }, null, 2));

    console.log(`Wrote full list of healed equations to: ${reportPath}`);
  }

  run().catch(console.error);
}
