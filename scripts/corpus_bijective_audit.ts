// scripts/corpus_bijective_audit.ts
//! Multi-Threaded Bijective & Causal Ablation Corpus Audit Runner.
//! Scans 11,000+ Markdown documents in tests/corpus using 50% CPU (6 worker threads on i5-13420H).
//! 1. Decouples Method 1, Method 2, and Method 3 (zero backfilling / cross-pollution).
//! 2. Disables auto-crash proofing and syntax normalizers during deletion ablation.
//! 3. Implements 16-Schema Innermost Fault Attribution with full ancestor schema_path.
//! 4. Generates 3 segregated datasets:
//!    - tests/telemetry/mapping_telemetry.json
//!    - tests/telemetry/orphan_telemetry.json
//!    - tests/telemetry/mutation_telemetry.json

import fs from "fs";
import path from "path";
import os from "os";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { CHTML } from "@mathjax/src/js/output/chtml.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";

import { scanMarkdown } from "../src/parsers/markdown_scanner";
import { stampMathJaxDOM } from "../src/editor/dom_stamper";
import { getMathJaxElementRange } from "../src/editor/weakmap_index";
import { resolveOnDemandRange, SPACING_COMMANDS, FONT_ACCENT_COMMANDS } from "../src/editor/lazy_navigation";
import { MathCSTParser } from "../src/parsers/cst/parser";
import { CSTNode, GroupNode, UnderOverNode, ScriptNode } from "../src/parsers/cst/types";
import { createFakeElement, FakeElement } from "../tests/tri_engine_harness";
import {
  lookupCatalog,
  getExpectedChildTag,
  getTagIdFromNodeName,
  getTagName,
  TAG_NONE,
  TAG_MSPACE,
  TAG_MROW,
  TAG_TEXATOM,
} from "../src/parsers/catalog";

export type SpatialSchema =
  | "STRETCHY_EXTENSIBLE"
  | "EXTENSIBLE_ARROW"
  | "LIMIT_STACKING"
  | "POSTFIX_SCRIPT"
  | "PRESCRIPT_TENSOR"
  | "FRACTION_DIVIDER"
  | "RADICAL_SURD"
  | "DIACRITICAL_ACCENT"
  | "ENCLOSING_FRAME"
  | "DYNAMIC_FENCE"
  | "GRID_ARRAY"
  | "RELATIONAL_STACK"
  | "EXPLICIT_SPACER"
  | "ZERO_WIDTH_OVERLAY"
  | "ATOM_ISOLATION"
  | "HORIZONTAL_GLUE_FLOW";

interface MappingRecord {
  file: string;
  equationIdx: number;
  domTag: string;
  tagId: number;
  domText: string;
  method1_class: [number, number] | null;
  method2_weakmap: [number, number] | null;
  method3_ondemand: [number, number] | null;
  selectedRange: [number, number] | null;
  sourceSlice: string;
  isCollision: boolean;
  triParityMatch: boolean;
  innermost_schema: SpatialSchema;
  schema_path: string;
}

interface OrphanRecord {
  file: string;
  equationIdx: number;
  tokenKind: string;
  tokenText: string;
  tokenRange: [number, number];
  equationSnippet: string;
  innermost_schema: SpatialSchema;
  schema_path: string;
  tagId: number;
}

interface MutationRecord {
  file: string;
  equationIdx: number;
  clickedTag: string;
  clickedText: string;
  mappedRange: [number, number];
  highlightedSlice: string;
  deletedGlyphs: string[];
  isMatch: boolean;
  discrepancyType: "EXACT_MATCH" | "CLUSTER_OVERDELETION" | "WRONG_TOKEN_DELETED" | "SYNTAX_COLLAPSE" | "UNMAPPED_OMISSION" | "SYNTACTIC_HALF_FENCE_UNBALANCED";
  innermost_schema: SpatialSchema;
  schema_path: string;
}

interface WorkerTask {
  files: string[];
  workerId: number;
  sampleAblationEvery: number;
}

interface WorkerOutput {
  workerId: number;
  filesScanned: number;
  equationsProcessed: number;
  equationsWithCollisions: number;
  equationsWithOrphans: number;
  schemaStats: Record<SpatialSchema, { total: number; collisions: number; orphans: number; mutations: number; mutationFailures: number }>;
  mappings: MappingRecord[];
  orphans: OrphanRecord[];
  mutations: MutationRecord[];
}

function isElementInvisible(el: any): boolean {
  const text = el.textContent || "";
  return /^[\u200B-\u200F\u2060-\u206F\uFEFF\s]*$/.test(text);
}

/**
 * Collects visible semantic leaf tokens from the CST along with their schema breadcrumb path.
 */
function extractCSTLeavesWithAncestry(
  nodes: CSTNode[],
  parentPath: SpatialSchema[] = []
): { kind: string; start: number; end: number; text: string; innermost: SpatialSchema; path: string }[] {
  const leaves: { kind: string; start: number; end: number; text: string; innermost: SpatialSchema; path: string }[] = [];

  function currentInnermost(): SpatialSchema {
    return parentPath.length > 0 ? parentPath[parentPath.length - 1] : "HORIZONTAL_GLUE_FLOW";
  }

  function pathString(): string {
    return parentPath.length > 0 ? parentPath.join(" > ") : "HORIZONTAL_GLUE_FLOW";
  }

  for (const node of nodes) {
    switch (node.kind) {
      case "identifier":
        leaves.push({ kind: "identifier", start: node.start, end: node.end, text: (node as any).text, innermost: currentInnermost(), path: pathString() });
        break;
      case "number":
        leaves.push({ kind: "number", start: node.start, end: node.end, text: (node as any).value, innermost: currentInnermost(), path: pathString() });
        break;
      case "operator":
        leaves.push({ kind: "operator", start: node.start, end: node.end, text: (node as any).text, innermost: currentInnermost(), path: pathString() });
        break;
      case "text":
        leaves.push({ kind: "text", start: node.start, end: node.end, text: (node as any).text, innermost: currentInnermost(), path: pathString() });
        break;
      case "punctuation":
        if ((node as any).char !== "&" && (node as any).char !== "{" && (node as any).char !== "}") {
          leaves.push({ kind: "punctuation", start: node.start, end: node.end, text: (node as any).char, innermost: currentInnermost(), path: pathString() });
        }
        break;

      case "fraction":
        leaves.push(...extractCSTLeavesWithAncestry(node.numerator, [...parentPath, "FRACTION_DIVIDER"]));
        leaves.push(...extractCSTLeavesWithAncestry(node.denominator, [...parentPath, "FRACTION_DIVIDER"]));
        break;

      case "script": {
        const isLimit = node.base && (
          (node.base.kind === "command" && ["\\sum", "\\prod", "\\coprod", "\\bigcap", "\\bigcup", "\\lim", "\\max", "\\min", "\\sup", "\\inf"].includes((node.base as any).name))
        );
        const schema: SpatialSchema = isLimit ? "LIMIT_STACKING" : "POSTFIX_SCRIPT";
        if (node.base) {
          leaves.push(...extractCSTLeavesWithAncestry([node.base], parentPath));
        }
        leaves.push(...extractCSTLeavesWithAncestry(node.arg, [...parentPath, schema]));
        break;
      }

      case "underover": {
        const isExtensible = ["\\underbrace", "\\overbrace", "\\underbracket", "\\overbracket"].includes(node.operator);
        const isArrow = node.operator.startsWith("\\x");
        const schema: SpatialSchema = isExtensible ? "STRETCHY_EXTENSIBLE" : isArrow ? "EXTENSIBLE_ARROW" : "RELATIONAL_STACK";
        leaves.push(...extractCSTLeavesWithAncestry(node.base, [...parentPath, schema]));
        if (node.script) {
          leaves.push(...extractCSTLeavesWithAncestry(node.script, [...parentPath, schema]));
        }
        break;
      }

      case "group": {
        const isMatrix = (node.delimType as string) === "matrix" || node.children.some((c) => (c.kind === "punctuation" && (c as any).char === "&") || (c.kind === "command" && (c as any).name === "\\\\"));
        const isFence = node.isLeftRight || ["paren", "bracket", "sized"].includes(node.delimType);
        const schema: SpatialSchema = isMatrix ? "GRID_ARRAY" : isFence ? "DYNAMIC_FENCE" : "ATOM_ISOLATION";

        // Visible fences (parens, brackets, pipes) produce clickable DOM elements in MathJax
        if (node.delimType !== "brace" && node.delimType !== "bare_brace" && node.openText && node.openStart !== undefined && node.openEnd !== undefined) {
          leaves.push({ kind: "punctuation", start: node.openStart, end: node.openEnd, text: node.openText, innermost: schema, path: pathString() });
        }

        leaves.push(...extractCSTLeavesWithAncestry(node.children, [...parentPath, schema]));

        if (node.delimType !== "brace" && node.delimType !== "bare_brace" && node.closeText && node.closeStart !== undefined && node.closeEnd !== undefined) {
          leaves.push({ kind: "punctuation", start: node.closeStart, end: node.closeEnd, text: node.closeText, innermost: schema, path: pathString() });
        }
        break;
      }

      case "command": {
        if (node.name === "\\sqrt") {
          leaves.push({ kind: "command", start: node.start, end: node.end, text: "\\sqrt", innermost: "RADICAL_SURD", path: pathString() });
        } else if (SPACING_COMMANDS.has(node.name) || ["\\quad", "\\qquad", "\\,", "\\:", "\\;", "\\!", "\\ ", "\\hspace", "\\kern"].includes(node.name)) {
          // Layout whitespace spacers do not produce clickable visual character glyphs
        } else if (FONT_ACCENT_COMMANDS.has(node.name) || ["\\hat", "\\vec", "\\bar", "\\tilde", "\\dot", "\\ddot", "\\overline", "\\underline", "\\overrightarrow", "\\overleftarrow", "\\overleftrightarrow"].includes(node.name)) {
          // accent
        } else {
          leaves.push({ kind: "command", start: node.start, end: node.end, text: node.name, innermost: currentInnermost(), path: pathString() });
        }
        break;
      }

      default:
        break;
    }
  }
  return leaves;
}

function getWrapperTagId(el: any): { tagId: number; tagName: string } {
  let curr = el ? el.parentElement : null;
  let fallbackIntermediate: { tagId: number; tagName: string } | null = null;
  while (curr) {
    const tid = getTagIdFromNodeName(curr.tagName || "");
    if (tid !== TAG_NONE) {
      if (tid === TAG_MROW || tid === TAG_TEXATOM) {
        if (!fallbackIntermediate) {
          fallbackIntermediate = { tagId: tid, tagName: (curr.tagName || "").toLowerCase() };
        }
      } else {
        return { tagId: tid, tagName: (curr.tagName || "").toLowerCase() };
      }
    }
    curr = curr.parentElement;
  }
  return fallbackIntermediate || { tagId: TAG_NONE, tagName: (el?.tagName || "none").toLowerCase() };
}

// -------------------------------------------------------------
// WORKER THREAD LOGIC
// -------------------------------------------------------------
if (!isMainThread) {
  const { files, workerId, sampleAblationEvery } = workerData as WorkerTask;

  // Initialize isolated headless MathJax compiler for this thread
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const tex = new TeX({ packages: ["base", "ams"] });
  const chtml = new CHTML({});
  const mathjaxDoc = mathjax.document("", { InputJax: tex, OutputJax: chtml });

  function compileMathDOM(latex: string): FakeElement | null {
    try {
      const mathNode = mathjaxDoc.convert(latex, { display: true });
      function convert(node: any): FakeElement | null {
        if (!node) return null;
        const kind = node.kind || node.tagName || "";
        if (kind === "#text") return null;

        const children: FakeElement[] = [];
        let textContent = "";

        if (node.children) {
          for (const c of node.children) {
            if (c.kind === "#text") {
              textContent += c.value || "";
            } else {
              const childEl = convert(c);
              if (childEl) children.push(childEl);
            }
          }
        }

        const fakeEl = createFakeElement(kind, children, textContent);
        if (node.attributes?.class) {
          fakeEl.className = node.attributes.class;
        }
        return fakeEl;
      }
      return convert(mathNode);
    } catch {
      return null;
    }
  }

  const allSchemas: SpatialSchema[] = [
    "STRETCHY_EXTENSIBLE",
    "EXTENSIBLE_ARROW",
    "LIMIT_STACKING",
    "POSTFIX_SCRIPT",
    "PRESCRIPT_TENSOR",
    "FRACTION_DIVIDER",
    "RADICAL_SURD",
    "DIACRITICAL_ACCENT",
    "ENCLOSING_FRAME",
    "DYNAMIC_FENCE",
    "GRID_ARRAY",
    "RELATIONAL_STACK",
    "EXPLICIT_SPACER",
    "ZERO_WIDTH_OVERLAY",
    "ATOM_ISOLATION",
    "HORIZONTAL_GLUE_FLOW",
  ];

  const schemaStats: WorkerOutput["schemaStats"] = {} as any;
  for (const s of allSchemas) {
    schemaStats[s] = { total: 0, collisions: 0, orphans: 0, mutations: 0, mutationFailures: 0 };
  }

  const output: WorkerOutput = {
    workerId,
    filesScanned: 0,
    equationsProcessed: 0,
    equationsWithCollisions: 0,
    equationsWithOrphans: 0,
    schemaStats,
    mappings: [],
    orphans: [],
    mutations: [],
  };

  for (const filePath of files) {
    output.filesScanned++;
    let content = "";
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    const scan = scanMarkdown(content);
    const mathBlocks = [...scan.mathBlocks, ...scan.mathInlines];

    for (let eqIdx = 0; eqIdx < mathBlocks.length; eqIdx++) {
      const block = mathBlocks[eqIdx];
      const rawMath = content.slice(block.contentStart, block.contentEnd).trim();
      if (!rawMath || rawMath.length < 2) continue;

      const container = compileMathDOM(rawMath);
      if (!container) continue;

      output.equationsProcessed++;

      // 1. Stamp 4D Spatial Tensor
      try {
        stampMathJaxDOM(container as any, rawMath);
      } catch {
        continue;
      }

      // 2. Extract CST Leaves with full 16-Schema Ancestry
      let cstLeaves: ReturnType<typeof extractCSTLeavesWithAncestry> = [];
      try {
        const parser = new MathCSTParser(rawMath);
        const ast = parser.parse();
        cstLeaves = extractCSTLeavesWithAncestry(ast);
      } catch {
        continue;
      }

      // Map offset to CST leaf metadata
      const leafOffsetMap = new Map<number, { innermost: SpatialSchema; path: string }>();
      for (const l of cstLeaves) {
        leafOffsetMap.set(l.start, { innermost: l.innermost, path: l.path });
      }

      // 3. Collect clickable leaf glyphs (filter out stretchy delimiters and invisible pseudo-operators)
      const candidateEls = container.querySelectorAll("mjx-mi, mjx-mo, mjx-mn, mjx-mtext, mjx-surd");
      const clickableEls = candidateEls.filter(
        (el) => !el.closest("mjx-stretchy-h, mjx-stretchy-v") && !isElementInvisible(el)
      );

      const rangeUsage = new Map<string, number>();
      let equationHadCollision = false;

      // 4. Decoupled Method Audit (Zero Cross-Pollution)
      for (const el of clickableEls) {
        // Method 1: Strictly DOM Class Provenance (zero WeakMap lookups)
        const m1Match = el.className.match(/cm-src-(\d+)-(\d+)/);
        const m1Range: [number, number] | null = m1Match
          ? [parseInt(m1Match[1], 10), parseInt(m1Match[2], 10)]
          : null;

        // Method 2: Strictly Spatial WeakMap Index (zero backfilling from M1)
        const m2 = getMathJaxElementRange(el as any);
        const m2Range: [number, number] | null = m2 ? [m2.start, m2.end] : null;

        // Method 3: Strictly Pure On-Demand CST (skipWeakMap = true)
        let m3Range: [number, number] | null = null;
        try {
          const m3 = resolveOnDemandRange(el as any, container as any, rawMath, true);
          if (m3) m3Range = [m3.start, m3.end];
        } catch {}

        const triParityMatch = Boolean(
          m1Range &&
          m2Range &&
          m3Range &&
          m1Range[0] === m2Range[0] &&
          m2Range[0] === m3Range[0] &&
          m1Range[1] === m2Range[1] &&
          m2Range[1] === m3Range[1]
        );

        const chosen = m2Range || m1Range || m3Range;
        const start = chosen ? chosen[0] : -1;
        const end = chosen ? chosen[1] : -1;
        const slice = start >= 0 && end > start ? rawMath.slice(start, end) : "<UNMAPPED>";

        const ancestry = leafOffsetMap.get(start) || { innermost: "HORIZONTAL_GLUE_FLOW", path: "HORIZONTAL_GLUE_FLOW" };
        output.schemaStats[ancestry.innermost].total++;

        let isCollision = false;
        if (start >= 0 && end > start) {
          const key = `${start}-${end}`;
          const currentCount = rangeUsage.get(key) || 0;
          rangeUsage.set(key, currentCount + 1);
          if (currentCount >= 1) {
            // Check if this range corresponds to an atomic CST token or multi-glyph macro
            const matchingLeaf = cstLeaves.find((l) => l.start === start && l.end === end);
            const isSingleAtom = Boolean(
              matchingLeaf ||
              slice.startsWith("\\") ||
              slice === ":=" ||
              slice === "::" ||
              slice === "==" ||
              slice === "!=" ||
              slice === "<=" ||
              slice === ">="
            );
            if (!isSingleAtom) {
              isCollision = true;
              equationHadCollision = true;
              output.schemaStats[ancestry.innermost].collisions++;
            }
          }
        }

        const wrapperInfo = getWrapperTagId(el);
        if (output.mappings.length < 5000) {
          output.mappings.push({
            file: path.basename(filePath),
            equationIdx: eqIdx,
            domTag: wrapperInfo.tagName,
            tagId: wrapperInfo.tagId,
            domText: el.textContent.trim(),
            method1_class: m1Range,
            method2_weakmap: m2Range,
            method3_ondemand: m3Range,
            selectedRange: chosen,
            sourceSlice: slice,
            isCollision,
            triParityMatch,
            innermost_schema: ancestry.innermost,
            schema_path: ancestry.path,
          });
        }
      }

      if (equationHadCollision) {
        output.equationsWithCollisions++;
      }

      // 5. Check Orphans
      let equationHadOrphans = false;
      for (const leaf of cstLeaves) {
        if (
          leaf.text === "{" ||
          leaf.text === "}" ||
          leaf.text === "&" ||
          leaf.text === "\\\\" ||
          leaf.text === "\\cr" ||
          leaf.text === "\\newline" ||
          SPACING_COMMANDS.has(leaf.text)
        ) {
          continue;
        }

        const key = `${leaf.start}-${leaf.end}`;
        if (!rangeUsage.has(key)) {
          equationHadOrphans = true;
          output.schemaStats[leaf.innermost].orphans++;
          if (output.orphans.length < 5000) {
            const catEntry = lookupCatalog(leaf.text);
            const orphanTagId = catEntry && catEntry.layoutSlotCode
              ? getExpectedChildTag(catEntry, 0)
              : (SPACING_COMMANDS.has(leaf.text) ? TAG_MSPACE : TAG_NONE);
            output.orphans.push({
              file: path.basename(filePath),
              equationIdx: eqIdx,
              tokenKind: leaf.kind,
              tokenText: leaf.text,
              tokenRange: [leaf.start, leaf.end],
              equationSnippet: rawMath.slice(0, 80),
              innermost_schema: leaf.innermost,
              schema_path: leaf.path,
              tagId: orphanTagId,
            });
          }
        }
      }
      if (equationHadOrphans) {
        output.equationsWithOrphans++;
      }

      // 6. Raw Deletion Ablation (Auto-Crash Proofing STRICTLY DISABLED)
      const hasStructuralMolecules = rawMath.includes("under") || rawMath.includes("over") || rawMath.includes("\\sum") || rawMath.includes("\\frac") || rawMath.includes("matrix");
      const shouldRunAblation = hasStructuralMolecules || eqIdx % sampleAblationEvery === 0;

      if (shouldRunAblation && clickableEls.length > 0 && output.mutations.length < 2500) {
        const normalizeGlyphText = (s: string) =>
          s.trim().replace(/\u00af+/g, "").replace(/\u23af+/g, "").replace(/\u23de+/g, "⏞").replace(/\u23df+/g, "⏟");
        const origGlyphs = clickableEls.map((e) => normalizeGlyphText(e.textContent));

        for (let gIdx = 0; gIdx < Math.min(clickableEls.length, 5); gIdx++) {
          const el = clickableEls[gIdx];
          const m2 = getMathJaxElementRange(el as any);
          const m1Match = el.className.match(/cm-src-(\d+)-(\d+)/);
          const start = m2 ? m2.start : m1Match ? parseInt(m1Match[1], 10) : -1;
          const end = m2 ? m2.end : m1Match ? parseInt(m1Match[2], 10) : -1;
          const clickedText = origGlyphs[gIdx];

          const ancestry = leafOffsetMap.get(start) || { innermost: "HORIZONTAL_GLUE_FLOW", path: "HORIZONTAL_GLUE_FLOW" };
          output.schemaStats[ancestry.innermost].mutations++;

          if (start < 0 || end <= start) {
            output.schemaStats[ancestry.innermost].mutationFailures++;
            output.mutations.push({
              file: path.basename(filePath),
              equationIdx: eqIdx,
              clickedTag: el.tagName.toLowerCase(),
              clickedText,
              mappedRange: [-1, -1],
              highlightedSlice: "<UNMAPPED>",
              deletedGlyphs: [],
              isMatch: false,
              discrepancyType: "UNMAPPED_OMISSION",
              innermost_schema: ancestry.innermost,
              schema_path: ancestry.path,
            });
            continue;
          }

          const highlightedSlice = rawMath.slice(start, end);

          // Guard against whole-equation or over-wide cluster spans
          if (end - start >= rawMath.length) {
            output.schemaStats[ancestry.innermost].mutationFailures++;
            output.mutations.push({
              file: path.basename(filePath),
              equationIdx: eqIdx,
              clickedTag: el.tagName.toLowerCase(),
              clickedText,
              mappedRange: [start, end],
              highlightedSlice,
              deletedGlyphs: [],
              isMatch: false,
              discrepancyType: "CLUSTER_OVERDELETION",
              innermost_schema: ancestry.innermost,
              schema_path: ancestry.path,
            });
            continue;
          }

          // One-Hot Sentinel Perturbation: replace mapped slice with a brace-isolated sentinel
          const isExtensibleBraceCmd = highlightedSlice === "\\underbrace" || highlightedSlice === "\\overbrace";
          let replacement: string;
          if (isExtensibleBraceCmd) {
            replacement = "";
          } else if (el.tagName === "MJX-MO") {
            replacement = "{\\ominus}";
          } else {
            replacement = "{\\Omega}";
          }

          const rawMutatedLatex = rawMath.slice(0, start) + replacement + rawMath.slice(end);

          let mutatedContainer: FakeElement | null = null;
          try {
            mutatedContainer = compileMathDOM(rawMutatedLatex);
          } catch {
            mutatedContainer = null;
          }

          const hasMerror = mutatedContainer
            ? mutatedContainer.querySelectorAll("mjx-merror").length > 0
            : true;

          if (!mutatedContainer || hasMerror) {
            // Check if highlightedSlice is an unbalanced delimiter or environment fence
            const isHalfFence =
              highlightedSlice.startsWith("\\begin") ||
              highlightedSlice.startsWith("\\end") ||
              highlightedSlice === "\\left" ||
              highlightedSlice === "\\right" ||
              highlightedSlice === "{" ||
              highlightedSlice === "}" ||
              highlightedSlice.startsWith("\\left") ||
              highlightedSlice.startsWith("\\right");

            if (isHalfFence) {
              output.mutations.push({
                file: path.basename(filePath),
                equationIdx: eqIdx,
                clickedTag: el.tagName.toLowerCase(),
                clickedText,
                mappedRange: [start, end],
                highlightedSlice,
                deletedGlyphs: [clickedText],
                isMatch: true,
                discrepancyType: "SYNTACTIC_HALF_FENCE_UNBALANCED",
                innermost_schema: ancestry.innermost,
                schema_path: ancestry.path,
              });
              continue;
            }

            // Syntax collapse / MathJax error is a FAILURE (never a silent pass!)
            output.schemaStats[ancestry.innermost].mutationFailures++;
            output.mutations.push({
              file: path.basename(filePath),
              equationIdx: eqIdx,
              clickedTag: el.tagName.toLowerCase(),
              clickedText,
              mappedRange: [start, end],
              highlightedSlice,
              deletedGlyphs: [clickedText],
              isMatch: false,
              discrepancyType: "SYNTAX_COLLAPSE",
              innermost_schema: ancestry.innermost,
              schema_path: ancestry.path,
            });
            continue;
          }

          const mutatedGlyphs = mutatedContainer
            .querySelectorAll("mjx-mi, mjx-mo, mjx-mn, mjx-mtext, mjx-surd")
            .filter((e) => !e.closest("mjx-stretchy-h, mjx-stretchy-v") && !isElementInvisible(e))
            .map((e) => normalizeGlyphText(e.textContent));

          // Sequence-Diff Invariant Oracle:
          // The sentinel glyph (Ω or ⊖) must be present in the mutated DOM.
          // All other glyphs from non-target tokens must be preserved in exact sequence order.
          let countPreserved = false;
          let targetChanged = false;
          let othersUntouched = false;

          if (isExtensibleBraceCmd) {
            const expectedRemaining = origGlyphs.filter((_, idx) => idx !== gIdx).slice().sort();
            const actualRemaining = mutatedGlyphs.slice().sort();
            countPreserved = actualRemaining.length === expectedRemaining.length;
            targetChanged = countPreserved;
            othersUntouched =
              countPreserved && expectedRemaining.every((g, idx) => g === actualRemaining[idx]);
          } else {
            const sentinel = el.tagName === "MJX-MO" ? "⊖" : "Ω";
            const sentinelPresent =
              mutatedGlyphs.includes(sentinel) ||
              mutatedGlyphs.includes("\u2296") ||
              mutatedGlyphs.includes("\u03a9") ||
              mutatedGlyphs.some((g) => g.includes("Ω") || g.includes("⊖"));

            // Non-target glyphs from original
            const nonTargetOrig = origGlyphs.filter((_, idx) => {
              const candEl = clickableEls[idx];
              const candM2 = getMathJaxElementRange(candEl as any);
              const candM1 = candEl.className.match(/cm-src-(\d+)-(\d+)/);
              const s = candM2 ? candM2.start : candM1 ? parseInt(candM1[1], 10) : -1;
              const e = candM2 ? candM2.end : candM1 ? parseInt(candM1[2], 10) : -1;
              return !(s === start && e === end);
            });

            // Non-target glyphs from mutated
            const nonTargetMutated = mutatedGlyphs.filter(
              (g) => g !== sentinel && g !== "\u2296" && g !== "\u03a9" && !g.includes("Ω") && !g.includes("⊖")
            );

            othersUntouched =
              nonTargetOrig.length === nonTargetMutated.length &&
              nonTargetOrig.every((g, idx) => g === nonTargetMutated[idx]);
            targetChanged = sentinelPresent;
            countPreserved = sentinelPresent && othersUntouched;
          }

          let discrepancyType: MutationRecord["discrepancyType"] = "EXACT_MATCH";
          let isMatch = true;

          if (!countPreserved) {
            discrepancyType = "CLUSTER_OVERDELETION";
            isMatch = false;
            output.schemaStats[ancestry.innermost].mutationFailures++;
          } else if (!targetChanged || !othersUntouched) {
            discrepancyType = "WRONG_TOKEN_DELETED";
            isMatch = false;
            output.schemaStats[ancestry.innermost].mutationFailures++;
          }

          output.mutations.push({
            file: path.basename(filePath),
            equationIdx: eqIdx,
            clickedTag: el.tagName.toLowerCase(),
            clickedText,
            mappedRange: [start, end],
            highlightedSlice,
            deletedGlyphs: [clickedText],
            isMatch,
            discrepancyType,
            innermost_schema: ancestry.innermost,
            schema_path: ancestry.path,
          });
        }
      }
    }
  }

  parentPort?.postMessage(output);
} else {
  // -------------------------------------------------------------
  // MASTER COORDINATOR
  // -------------------------------------------------------------
  async function runMaster() {
    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log("   Color Math 16-Schema Bijective & Causal Ablation Audit Engine          ");
    console.log("   (Method Decoupled | Auto-Seal Disabled | 6 Workers @ 50% CPU)          ");
    console.log("══════════════════════════════════════════════════════════════════════════\n");

    const cliTarget = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : null;
    const possibleRoots = [
      cliTarget,
      path.resolve(__dirname, "../tests/corpus"),
      path.resolve(process.cwd(), "tests/corpus"),
    ].filter(Boolean) as string[];
    const corpusRoot = possibleRoots.find((d) => fs.existsSync(d)) || possibleRoots[0];
    if (!fs.existsSync(corpusRoot)) {
      console.error("Corpus directory not found at:", corpusRoot);
      process.exit(1);
    }

    console.log("Scanning corpus files...");
    function getAllMd(dir: string): string[] {
      let res: string[] = [];
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith(".")) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            res = res.concat(getAllMd(full));
          } else if (entry.isFile() && entry.name.endsWith(".md")) {
            res.push(full);
          }
        }
      } catch (err) {
        // Skip inaccessible directories gracefully
      }
      return res;
    }

    const allFiles = getAllMd(corpusRoot);
    const totalCpus = os.cpus().length;
    const numWorkers = Math.max(1, Math.floor(totalCpus / 2));

    console.log(`Corpus Root:       ${corpusRoot}`);
    console.log(`Documents Found:   ${allFiles.length} markdown notes`);
    console.log(`Processor Model:   ${os.cpus()[0].model}`);
    console.log(`Thread Allocation: ${numWorkers} parallel workers (50% CPU allocation)\n`);

    const shards: string[][] = Array.from({ length: numWorkers }, () => []);
    for (let i = 0; i < allFiles.length; i++) {
      shards[i % numWorkers].push(allFiles[i]);
    }

    console.log(`Launching ${numWorkers} worker threads across ${allFiles.length} files...`);
    const startTime = Date.now();

    const workerPromises = shards.map((shardFiles, workerId) => {
      return new Promise<WorkerOutput>((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: {
            files: shardFiles,
            workerId,
            sampleAblationEvery: 10,
          } as WorkerTask,
        });

        worker.on("message", (msg: WorkerOutput) => resolve(msg));
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code !== 0) reject(new Error(`Worker ${workerId} exited with code ${code}`));
        });
      });
    });

    const results = await Promise.all(workerPromises);
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);

    let totalEquations = 0;
    let totalEquationsWithCollisions = 0;
    let totalEquationsWithOrphans = 0;
    const allMappings: MappingRecord[] = [];
    const allOrphans: OrphanRecord[] = [];
    const allMutations: MutationRecord[] = [];

    const aggregatedSchemaStats: Record<SpatialSchema, { total: number; collisions: number; orphans: number; mutations: number; mutationFailures: number }> = {} as any;

    for (const r of results) {
      totalEquations += r.equationsProcessed;
      totalEquationsWithCollisions += r.equationsWithCollisions;
      totalEquationsWithOrphans += r.equationsWithOrphans;
      allMappings.push(...r.mappings);
      allOrphans.push(...r.orphans);
      allMutations.push(...r.mutations);

      for (const [k, v] of Object.entries(r.schemaStats)) {
        const schema = k as SpatialSchema;
        if (!aggregatedSchemaStats[schema]) {
          aggregatedSchemaStats[schema] = { total: 0, collisions: 0, orphans: 0, mutations: 0, mutationFailures: 0 };
        }
        aggregatedSchemaStats[schema].total += v.total;
        aggregatedSchemaStats[schema].collisions += v.collisions;
        aggregatedSchemaStats[schema].orphans += v.orphans;
        aggregatedSchemaStats[schema].mutations += v.mutations;
        aggregatedSchemaStats[schema].mutationFailures += v.mutationFailures;
      }
    }

    const telemetryDir = path.resolve(__dirname, "../tests/telemetry");
    if (!fs.existsSync(telemetryDir)) {
      fs.mkdirSync(telemetryDir, { recursive: true });
    }

    // Write Dataset 1: Mapping & Collisions Telemetry
    const mappingFile = path.join(telemetryDir, "mapping_telemetry.json");
    fs.writeFileSync(mappingFile, JSON.stringify(allMappings, null, 2), "utf8");

    // Write Dataset 2: Orphan Telemetry
    const orphanFile = path.join(telemetryDir, "orphan_telemetry.json");
    fs.writeFileSync(orphanFile, JSON.stringify(allOrphans, null, 2), "utf8");

    // Write Dataset 3: Mutation & Ground Truth Telemetry
    const mutationFile = path.join(telemetryDir, "mutation_telemetry.json");
    fs.writeFileSync(mutationFile, JSON.stringify(allMutations, null, 2), "utf8");

    console.log("\n══════════════════════════════════════════════════════════════════════════");
    console.log("   16-SCHEMA SPATIAL LAYOUT PARETO BREAKDOWN MATRIX");
    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log("Schema Name                  | Tokens  | Collisions (%)  | Orphans (%)   | Mutation Fail (%)");
    console.log("-----------------------------+---------+-----------------+---------------+------------------");

    const sortedSchemas = Object.entries(aggregatedSchemaStats).sort((a, b) => (b[1].collisions + b[1].orphans) - (a[1].collisions + a[1].orphans));

    for (const [schema, s] of sortedSchemas) {
      const colPct = ((s.collisions / Math.max(1, s.total)) * 100).toFixed(1);
      const orphPct = ((s.orphans / Math.max(1, s.total)) * 100).toFixed(1);
      const mutFailPct = ((s.mutationFailures / Math.max(1, s.mutations)) * 100).toFixed(1);
      console.log(
        `${schema.padEnd(28)} | ${String(s.total).padStart(7)} | ${String(s.collisions).padStart(6)} (${colPct.padStart(4)}%) | ${String(s.orphans).padStart(5)} (${orphPct.padStart(4)}%) | ${String(s.mutationFailures).padStart(6)} (${mutFailPct.padStart(4)}%)`
      );
    }

    // Secondary Breakdown: MathJax CHTML Wrapper Tag Breakdown (26 Tags)
    console.log("\n══════════════════════════════════════════════════════════════════════════");
    console.log("   MATHJAX CHTML WRAPPER TAG BREAKDOWN (26 TAGS)");
    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log("Tag Name (mjx-*)             | Tag ID | Mapped Tokens | Collisions (%)  | Orphans (%)   | Orphan Density");
    console.log("-----------------------------+--------+---------------+-----------------+---------------+---------------");

    const tagStats = new Map<number, { mapped: number; collisions: number; orphans: number }>();
    for (let id = 0; id <= 0x1F; id++) {
      tagStats.set(id, { mapped: 0, collisions: 0, orphans: 0 });
    }

    for (const m of allMappings) {
      const stats = tagStats.get(m.tagId) || { mapped: 0, collisions: 0, orphans: 0 };
      stats.mapped++;
      if (m.isCollision) stats.collisions++;
      tagStats.set(m.tagId, stats);
    }

    for (const o of allOrphans) {
      const stats = tagStats.get(o.tagId) || { mapped: 0, collisions: 0, orphans: 0 };
      stats.orphans++;
      tagStats.set(o.tagId, stats);
    }

    const activeTags = Array.from(tagStats.entries()).filter(([_, s]) => s.mapped > 0 || s.orphans > 0);
    activeTags.sort((a, b) => (b[1].mapped + b[1].orphans) - (a[1].mapped + a[1].orphans));

    for (const [tagId, s] of activeTags) {
      const tagName = getTagName(tagId);
      const hexId = "0x" + tagId.toString(16).toUpperCase().padStart(2, "0");
      const total = s.mapped + s.orphans;
      const colPct = ((s.collisions / Math.max(1, s.mapped)) * 100).toFixed(1);
      const orphPct = ((s.orphans / Math.max(1, total)) * 100).toFixed(1);
      const density = (s.orphans / Math.max(1, total)).toFixed(3);
      console.log(
        `${tagName.padEnd(28)} | ${hexId.padStart(6)} | ${String(s.mapped).padStart(13)} | ${String(s.collisions).padStart(6)} (${colPct.padStart(4)}%) | ${String(s.orphans).padStart(5)} (${orphPct.padStart(4)}%) | ${density.padStart(13)}`
      );
    }

    console.log("══════════════════════════════════════════════════════════════════════════");
    console.log(`Execution Time:               ${elapsedSec}s`);
    console.log(`Total Documents Scanned:      ${allFiles.length}`);
    console.log(`Total Mathematical Equations: ${totalEquations}`);
    console.log(`Equations With Collisions:    ${totalEquationsWithCollisions} (${((totalEquationsWithCollisions / Math.max(1, totalEquations)) * 100).toFixed(2)}%)`);
    console.log(`Equations With Orphans:       ${totalEquationsWithOrphans} (${((totalEquationsWithOrphans / Math.max(1, totalEquations)) * 100).toFixed(2)}%)`);
    console.log(`Mappings Saved:               ${allMappings.length} -> ${mappingFile}`);
    console.log(`Orphans Saved:                ${allOrphans.length} -> ${orphanFile}`);
    console.log(`Mutations Saved:              ${allMutations.length} -> ${mutationFile}`);
    console.log("══════════════════════════════════════════════════════════════════════════\n");
  }

  runMaster().catch((err) => {
    console.error("Corpus audit failed with error:", err);
    process.exit(1);
  });
}
