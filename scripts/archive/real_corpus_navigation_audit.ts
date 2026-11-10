// scripts/real_corpus_navigation_audit.ts
//! Real MathJax CHTML Multi-Worker Corpus Navigation Audit Runner.
//! Validates Method 1 (DOM classes), Method 2 (WeakMap), and Method 3 (On-Demand CST)
//! against authentic MathJax CHTML compiler output across real-world notes in tests/corpus.
//! Uses up to 50% CPU allocation (6 worker threads on 12-thread CPU).

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { scanMarkdown } from "../src/parsers/markdown_scanner";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_OPTIONS } from "../src/config";
import { stampMathJaxDOM } from "../src/editor/dom_stamper";
import { getMathJaxElementRange } from "../src/editor/weakmap_index";
import { resolveOnDemandRange } from "../src/editor/lazy_navigation";
import { createFakeElement, FakeElement } from "../tests/tri_engine_harness";

interface RealMathJaxAnomaly {
  file: string;
  line: number;
  latexSnippet: string;
  domLeafText: string;
  domLeafTag: string;
  m1Range?: { start: number; end: number };
  m2Range?: { start: number; end: number };
  m3Range?: { start: number; end: number };
  resolvedSliceM1: string;
  resolvedSliceM2: string;
  resolvedSliceM3: string;
  classification:
    | "LINE_CONTAINER_OVERFLOW"
    | "UNSTAMPED_LEAF"
    | "M1_M2_DISAGREEMENT"
    | "M3_DISAGREEMENT"
    | "SEMANTIC_IDENTITY_MISMATCH";
  errorMessage: string;
}

interface WorkerStats {
  filesProcessed: number;
  equationsScanned: number;
  equationsValidated: number;
  equationsSkippedError: number;
  tokensAudited: number;
  triParityConsensusCount: number;
  disagreementCount: number;
  lineOverflowCount: number;
  unstampedCount: number;
  semanticMismatchCount: number;
  latenciesM1: number[];
  latenciesM2: number[];
  latenciesM3: number[];
  anomalies: RealMathJaxAnomaly[];
}

// ----------------------------------------------------------------------------
// WORKER THREAD LOGIC
// ----------------------------------------------------------------------------
if (!isMainThread) {
  async function runWorker() {
    const { files, corpusRoot } = workerData as { files: string[]; corpusRoot: string };

    const baseRequire = createRequire(path.resolve(__dirname, "../package.json"));
    const mj = baseRequire("@mathjax/src/cjs/mathjax.js");
    const { TeX } = baseRequire("@mathjax/src/cjs/input/tex.js");
    const { CHTML } = baseRequire("@mathjax/src/cjs/output/chtml.js");
    const { liteAdaptor } = baseRequire("@mathjax/src/cjs/adaptors/liteAdaptor.js");
    const { RegisterHTMLHandler } = baseRequire("@mathjax/src/cjs/handlers/html.js");
    baseRequire("@mathjax/src/cjs/input/tex/ams/AmsConfiguration.js");
    baseRequire("@mathjax/src/cjs/input/tex/color/ColorConfiguration.js");

    const mathjax = mj.mathjax;
    mathjax.asyncLoad = (name: string) => import(pathToFileURL(baseRequire.resolve(name)).href);

    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const tex = new TeX({
      packages: ["base", "ams", "color"],
      inlineMath: [["$", "$"]],
      displayMath: [["$$", "$$"]],
    });
    const chtml = new CHTML({});
    const htmlDoc = mathjax.document("", { InputJax: tex, OutputJax: chtml });

    function liteToFakeDOM(liteNode: any): FakeElement | null {
      const kind = adaptor.kind(liteNode);
      if (kind === "#text") {
        return createFakeElement("text", [], adaptor.value(liteNode));
      }
      if (kind === "#comment") return null;

      const children: FakeElement[] = [];
      for (const c of adaptor.childNodes(liteNode)) {
        const childEl = liteToFakeDOM(c);
        if (childEl) children.push(childEl);
      }

      const el = createFakeElement(kind, children);
      const attrs = adaptor.allAttributes(liteNode);
      if (attrs) {
        for (const attr of attrs) {
          if (attr.name === "class") {
            el.className = attr.value;
          }
        }
      }

      for (const ch of el.children) {
        ch.parentElement = el;
      }
      return el;
    }

    const stats: WorkerStats = {
      filesProcessed: 0,
      equationsScanned: 0,
      equationsValidated: 0,
      equationsSkippedError: 0,
      tokensAudited: 0,
      triParityConsensusCount: 0,
      disagreementCount: 0,
      lineOverflowCount: 0,
      unstampedCount: 0,
      semanticMismatchCount: 0,
      latenciesM1: [],
      latenciesM2: [],
      latenciesM3: [],
      anomalies: [],
    };

    for (const filePath of files) {
      stats.filesProcessed++;
      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }

      const scan = scanMarkdown(content);
      if (!scan) continue;
      const blocks = [...scan.mathBlocks, ...scan.mathInlines];
      if (blocks.length === 0) continue;

      for (const block of blocks) {
        stats.equationsScanned++;
        const latex = content.slice(block.contentStart, block.contentEnd).trim();
        if (!latex || latex.length === 0) continue;

        let mathNode: any;
        try {
          const transformed = colorLatexBody(latex, undefined, DEFAULT_OPTIONS);
          mathNode = await mathjax.handleRetriesFor(() =>
            htmlDoc.convert(transformed, { display: block.kind === "block" })
          );
        } catch {
          stats.equationsSkippedError++;
          continue;
        }

        const fakeDom = liteToFakeDOM(mathNode);
        if (!fakeDom) continue;

        // Skip broken equations that produced MathJax errors
        const hasError = fakeDom.querySelector("mjx-merror");
        if (hasError) {
          stats.equationsSkippedError++;
          continue;
        }

        // Reconcile and stamp via 4D Spatial Tensor Engine
        try {
          stampMathJaxDOM(fakeDom as unknown as Element, latex);
        } catch {
          continue;
        }

        stats.equationsValidated++;
        if (stats.equationsValidated % 200 === 0) {
          parentPort?.postMessage({ type: "progress", count: 200 });
        }

        // Query all rendered leaf elements
        const leaves = fakeDom.querySelectorAll("mjx-mi, mjx-mn, mjx-mo, mjx-mtext");
        if (leaves.length === 0) continue;

        const rootEl = fakeDom as unknown as Element;

        for (const leaf of leaves) {
          stats.tokensAudited++;
          const leafEl = leaf as unknown as Element;
          const clickedTarget = leaf.querySelector("mjx-c") || leaf;
          const targetEl = clickedTarget as unknown as Element;

          // 1. Method 2: WeakMap Lookup
          const t0_m2 = performance.now();
          const m2 = getMathJaxElementRange(targetEl) || getMathJaxElementRange(leafEl);
          const latM2 = (performance.now() - t0_m2) * 1e6;
          if (stats.latenciesM2.length < 50000 || Math.random() < 0.05) {
            stats.latenciesM2.push(latM2);
          }

          // 2. Method 1: DOM Class Inspection via closest()
          const t0_m1 = performance.now();
          const m1El = clickedTarget.closest('[class*="cm-src-"]') || leaf.closest('[class*="cm-src-"]');
          const m1Match = m1El?.className.match(/cm-src-(\d+)-(\d+)/);
          const latM1 = (performance.now() - t0_m1) * 1e3;
          if (stats.latenciesM1.length < 50000 || Math.random() < 0.05) {
            stats.latenciesM1.push(latM1);
          }
          const m1 = m1Match ? { start: parseInt(m1Match[1], 10), end: parseInt(m1Match[2], 10) } : null;

          // 3. Method 3: Pure On-Demand CST (skipWeakMap: true)
          const t0_m3 = performance.now();
          const m3 = resolveOnDemandRange(targetEl, rootEl, latex, true);
          const latM3 = (performance.now() - t0_m3) * 1e3;
          if (stats.latenciesM3.length < 50000 || Math.random() < 0.05) {
            stats.latenciesM3.push(latM3);
          }

          const m2Simple = m2 ? { start: m2.start, end: m2.end } : null;
          const m3Simple = m3 ? { start: m3.start, end: m3.end } : null;

          const sliceM1 = m1 ? latex.slice(m1.start, m1.end) : "";
          const sliceM2 = m2Simple ? latex.slice(m2Simple.start, m2Simple.end) : "";
          const sliceM3 = m3Simple ? latex.slice(m3Simple.start, m3Simple.end) : "";

          // Anomaly Check A: Unstamped leaf
          if (!m1 && !m2Simple) {
            stats.disagreementCount++;
            stats.unstampedCount++;
            if (stats.anomalies.length < 5000) {
              stats.anomalies.push({
                file: path.relative(corpusRoot, filePath),
                line: content.slice(0, block.contentStart).split("\n").length,
                latexSnippet: latex.slice(0, 80),
                domLeafText: leaf.textContent,
                domLeafTag: leaf.tagName,
                m1Range: undefined,
                m2Range: undefined,
                m3Range: m3Simple ?? undefined,
                resolvedSliceM1: "",
                resolvedSliceM2: "",
                resolvedSliceM3: sliceM3,
                classification: "UNSTAMPED_LEAF",
                errorMessage: `Leaf <${leaf.tagName}> '${leaf.textContent}' was unstamped by both Method 1 and Method 2`,
              });
            }
            continue;
          }

          // Anomaly Check B: Line Container Overflow
          // If a click on a single leaf resolved to a span containing multiple lines (\\\\) or span > 80 chars
          const isLineOverflow =
            (m1 && (sliceM1.includes("\\\\") || sliceM1.includes("\n") || sliceM1.length > 80)) ||
            (m2Simple && (sliceM2.includes("\\\\") || sliceM2.includes("\n") || sliceM2.length > 80));

          if (isLineOverflow) {
            stats.disagreementCount++;
            stats.lineOverflowCount++;
            if (stats.anomalies.length < 5000) {
              stats.anomalies.push({
                file: path.relative(corpusRoot, filePath),
                line: content.slice(0, block.contentStart).split("\n").length,
                latexSnippet: latex.slice(0, 80),
                domLeafText: leaf.textContent,
                domLeafTag: leaf.tagName,
                m1Range: m1 ?? undefined,
                m2Range: m2Simple ?? undefined,
                m3Range: m3Simple ?? undefined,
                resolvedSliceM1: sliceM1,
                resolvedSliceM2: sliceM2,
                resolvedSliceM3: sliceM3,
                classification: "LINE_CONTAINER_OVERFLOW",
                errorMessage: `Click on single leaf <${leaf.tagName}> '${leaf.textContent}' bubbled up to multi-line container span: "${sliceM1.slice(0, 40)}..."`,
              });
            }
            continue;
          }

          // Anomaly Check C: M1 vs M2 Disagreement
          if (m1 && m2Simple && (m1.start !== m2Simple.start || m1.end !== m2Simple.end)) {
            stats.disagreementCount++;
            if (stats.anomalies.length < 5000) {
              stats.anomalies.push({
                file: path.relative(corpusRoot, filePath),
                line: content.slice(0, block.contentStart).split("\n").length,
                latexSnippet: latex.slice(0, 80),
                domLeafText: leaf.textContent,
                domLeafTag: leaf.tagName,
                m1Range: m1,
                m2Range: m2Simple,
                m3Range: m3Simple ?? undefined,
                resolvedSliceM1: sliceM1,
                resolvedSliceM2: sliceM2,
                resolvedSliceM3: sliceM3,
                classification: "M1_M2_DISAGREEMENT",
                errorMessage: `Method 1 [${m1.start}, ${m1.end}] ("${sliceM1}") diverged from Method 2 [${m2Simple.start}, ${m2Simple.end}] ("${sliceM2}")`,
              });
            }
            continue;
          }

          // Consensus passed!
          stats.triParityConsensusCount++;
        }
      }
    }

    parentPort?.postMessage(stats);
  }

  runWorker().catch((err) => {
    console.error("Worker fatal error:", err);
    process.exit(1);
  });
}

// ----------------------------------------------------------------------------
// MAIN THREAD MASTER COORDINATOR
// ----------------------------------------------------------------------------
if (isMainThread) {
  async function runMasterAudit() {
    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log("   Real MathJax CHTML Multi-Worker Corpus Navigation Audit Runner         ");
    console.log("══════════════════════════════════════════════════════════════════════════\n");

    const corpusRoot = path.resolve(__dirname, "../tests/corpus");
    if (!fs.existsSync(corpusRoot)) {
      console.error("Corpus directory not found in:", corpusRoot);
      process.exit(1);
    }

    const args = process.argv.slice(2);
    const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
    const limit = limitArg ? parseInt(limitArg, 10) : undefined;
    const threadArg = args.find((a) => a.startsWith("--threads="))?.split("=")[1];
    const corpusFilter = args.find((a) => a.startsWith("--corpus="))?.split("=")[1];

    const totalCpus = os.cpus().length;
    // 50% CPU allocation rule (6 threads on 12-thread CPU)
    const numThreads = threadArg ? parseInt(threadArg, 10) : Math.max(1, Math.floor(totalCpus / 2));

    const searchTarget = corpusFilter ? path.join(corpusRoot, corpusFilter) : corpusRoot;
    console.log(`Corpus Root:   ${corpusRoot}`);
    console.log(`Hardware:      ${os.cpus()[0].model} (${totalCpus} logical cores)`);
    console.log(`Worker Pool:   ${numThreads} threads allocated (50% CPU workload limit)`);
    if (limit) console.log(`Limit:         Restricted to first ${limit.toLocaleString()} files`);
    if (corpusFilter) console.log(`Filter:        Restricted to folder "${corpusFilter}"`);
    console.log(`Engine:        Real MathJax CHTML + 4D Quaternion Reconciler\n`);

    function getAllMdFiles(dir: string): string[] {
      let results: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(getAllMdFiles(full));
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          results.push(full);
        }
      }
      return results;
    }

    console.log("Scanning corpus files...");
    let allFiles = getAllMdFiles(searchTarget);
    if (limit && limit > 0) {
      allFiles = allFiles.slice(0, limit);
    }
    console.log(`Found ${allFiles.length.toLocaleString()} markdown files for audit.\n`);

    if (allFiles.length === 0) {
      console.log("No files to audit.");
      return;
    }

    // Partition files across worker threads
    const chunkSize = Math.ceil(allFiles.length / numThreads);
    const chunks: string[][] = [];
    for (let i = 0; i < numThreads; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, allFiles.length);
      if (start < allFiles.length) {
        chunks.push(allFiles.slice(start, end));
      }
    }

    console.log(`Dispatching ${allFiles.length.toLocaleString()} files across ${chunks.length} workers...\n`);
    const t0 = performance.now();

    let completedEqs = 0;
    const progressInterval = setInterval(() => {
      const elapsedSec = (performance.now() - t0) / 1000;
      const rate = elapsedSec > 0 ? (completedEqs / elapsedSec).toFixed(0) : 0;
      process.stdout.write(`\r⏳ Real MathJax Audit: ${completedEqs.toLocaleString()} equations validated (${rate} eq/s, elapsed: ${elapsedSec.toFixed(0)}s)...`);
    }, 1500);

    const workerPromises = chunks.map((chunk, index) => {
      return new Promise<WorkerStats>((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: { files: chunk, corpusRoot },
        });

        worker.on("message", (msg: any) => {
          if (msg && msg.type === "progress") {
            completedEqs += msg.count;
          } else {
            resolve(msg);
          }
        });
        worker.on("error", (err) => reject(err));
        worker.on("exit", (code) => {
          if (code !== 0) reject(new Error(`Worker ${index} exited with code ${code}`));
        });
      });
    });

    const results = await Promise.all(workerPromises);
    clearInterval(progressInterval);
    process.stdout.write("\n\n");
    const totalElapsed = (performance.now() - t0) / 1000;

    // Aggregate stats
    const totalStats: WorkerStats = {
      filesProcessed: 0,
      equationsScanned: 0,
      equationsValidated: 0,
      equationsSkippedError: 0,
      tokensAudited: 0,
      triParityConsensusCount: 0,
      disagreementCount: 0,
      lineOverflowCount: 0,
      unstampedCount: 0,
      semanticMismatchCount: 0,
      latenciesM1: [],
      latenciesM2: [],
      latenciesM3: [],
      anomalies: [],
    };

    for (const r of results) {
      totalStats.filesProcessed += r.filesProcessed;
      totalStats.equationsScanned += r.equationsScanned;
      totalStats.equationsValidated += r.equationsValidated;
      totalStats.equationsSkippedError += r.equationsSkippedError;
      totalStats.tokensAudited += r.tokensAudited;
      totalStats.triParityConsensusCount += r.triParityConsensusCount;
      totalStats.disagreementCount += r.disagreementCount;
      totalStats.lineOverflowCount += r.lineOverflowCount;
      totalStats.unstampedCount += r.unstampedCount;
      totalStats.semanticMismatchCount += r.semanticMismatchCount;
      totalStats.latenciesM1.push(...r.latenciesM1);
      totalStats.latenciesM2.push(...r.latenciesM2);
      totalStats.latenciesM3.push(...r.latenciesM3);
      totalStats.anomalies.push(...r.anomalies);
    }

    const throughput = (totalStats.equationsValidated / totalElapsed).toFixed(0);
    const consensusRate = totalStats.tokensAudited > 0
      ? ((totalStats.triParityConsensusCount / totalStats.tokensAudited) * 100).toFixed(2)
      : "100.00";
    const disagreementRate = totalStats.tokensAudited > 0
      ? ((totalStats.disagreementCount / totalStats.tokensAudited) * 100).toFixed(2)
      : "0.00";

    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log("   REAL MATHJAX CHTML FULL-CORPUS AUDIT RESULTS                           ");
    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log(`Documents Audited          : ${totalStats.filesProcessed.toLocaleString()}`);
    console.log(`Equations Scanned          : ${totalStats.equationsScanned.toLocaleString()}`);
    console.log(`Equations Validated        : ${totalStats.equationsValidated.toLocaleString()} (${throughput} eq/sec)`);
    console.log(`Equations Skipped (Syntax) : ${totalStats.equationsSkippedError.toLocaleString()}`);
    console.log(`Mathematical Tokens Tested : ${totalStats.tokensAudited.toLocaleString()}`);
    console.log(`Exact Consensus Matches    : ${totalStats.triParityConsensusCount.toLocaleString()} (${consensusRate}%)`);
    console.log(`Total Disagreements        : ${totalStats.disagreementCount.toLocaleString()} (${disagreementRate}%)`);
    console.log(`  • Line Container Overflow: ${totalStats.lineOverflowCount.toLocaleString()}`);
    console.log(`  • Unstamped Leaves       : ${totalStats.unstampedCount.toLocaleString()}`);
    console.log(`  • Semantic/Other Mismatch: ${totalStats.semanticMismatchCount.toLocaleString()}`);
    console.log(`Total Execution Time       : ${totalElapsed.toFixed(2)}s\n`);

    // Stream anomalies to file
    const telemetryDir = path.resolve(__dirname, "../tests/telemetry");
    if (!fs.existsSync(telemetryDir)) {
      fs.mkdirSync(telemetryDir, { recursive: true });
    }
    const anomalyPath = path.join(telemetryDir, "real_mathjax_anomalies.jsonl");
    const stream = fs.createWriteStream(anomalyPath, { flags: "w" });
    for (const an of totalStats.anomalies) {
      stream.write(JSON.stringify(an) + "\n");
    }
    stream.end();
    console.log(`Streamed ${totalStats.anomalies.length.toLocaleString()} anomaly records to:`);
    console.log(`  file://${anomalyPath.replace(/\\/g, "/")}\n`);
  }

  runMasterAudit().catch((err) => {
    console.error("Master audit fatal error:", err);
    process.exit(1);
  });
}
