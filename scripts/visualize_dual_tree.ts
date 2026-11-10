// scripts/visualize_dual_tree.ts
//! Mermaid Dual-Tree Alignment Visualizer.
//! Compiles a LaTeX mathematical expression into both its Markdown Concrete Syntax Tree (CST)
//! and its Rendered MathJax CHTML DOM, maps source-to-DOM provenance, and prints an interactive
//! two-column Mermaid alignment graph highlighting any crossing or misaligned edges.

import { MathCSTParser } from "../src/parsers/cst/parser";
import { CSTNode } from "../src/parsers/cst/types";
import { getHeadlessMathJax, compileAndStampRealMathJax } from "../tests/mathjax_node_adapter";
import { getMathJaxElementRange } from "../src/editor/weakmap_index";
import { FakeElement } from "../tests/tri_engine_harness";
import * as fs from "node:fs";
import * as path from "node:path";

export interface FlatCSTItem {
  id: string;
  kind: string;
  start: number;
  end: number;
  text: string;
  desc: string;
  node: CSTNode;
}

export interface FlatDOMItem {
  id: string;
  tag: string;
  text: string;
  range: { start: number; end: number } | null;
  method: "M2" | "M1" | "NONE";
  element: FakeElement;
}

export interface AlignmentEdge {
  domId: string;
  cstId: string;
  domText: string;
  cstText: string;
  start: number;
  end: number;
  isCrossing: boolean;
  label?: string;
}

/**
 * Recursively flattens CST into inspectable nodes with byte offsets.
 */
export function flattenCST(nodes: CSTNode[], rawSource: string): FlatCSTItem[] {
  const items: FlatCSTItem[] = [];
  let counter = 0;

  function visit(node: CSTNode, context = "") {
    if (!node) return;
    const id = `CST_${counter++}`;
    const slice = rawSource.slice(node.start, node.end);
    let desc = context ? `${node.kind} (${context})` : node.kind;

    if (node.kind === "fraction") {
      desc = `frac: ${node.command || "\\frac"}`;
      items.push({ id, kind: node.kind, start: node.start, end: node.end, text: slice, desc, node });
      if (node.numerator) {
        for (const ch of node.numerator) visit(ch, "num");
      }
      if (node.denominator) {
        for (const ch of node.denominator) visit(ch, "den");
      }
      return;
    }

    if (node.kind === "group") {
      desc = `group: ${node.openText || ""}...${node.closeText || ""}`;
      items.push({ id, kind: node.kind, start: node.start, end: node.end, text: slice, desc, node });
      if (node.children) {
        for (const ch of node.children) visit(ch, "group-child");
      }
      return;
    }

    if (node.kind === "script") {
      desc = `script: ${node.scriptType}`;
      items.push({ id, kind: node.kind, start: node.start, end: node.end, text: slice, desc, node });
      if (node.base) visit(node.base, "base");
      if (node.arg) {
        for (const ch of node.arg) visit(ch, node.scriptType);
      }
      return;
    }

    items.push({ id, kind: node.kind, start: node.start, end: node.end, text: slice, desc, node });
  }

  for (const n of nodes) {
    visit(n);
  }
  return items;
}

/**
 * Traverses rendered fake DOM tree and collects stamped elements and terminal leaves.
 */
export function flattenDOM(root: FakeElement): FlatDOMItem[] {
  const items: FlatDOMItem[] = [];
  let counter = 0;

  function visit(el: FakeElement) {
    if (!el || el.tagName === "TEXT") return;

    // Determine stamped range: Method 2 (WeakMap) -> Method 1 (Class)
    const m2 = getMathJaxElementRange(el as unknown as Element);
    let range: { start: number; end: number } | null = null;
    let method: "M2" | "M1" | "NONE" = "NONE";

    if (m2 && m2.start >= 0 && m2.end >= m2.start) {
      range = { start: m2.start, end: m2.end };
      method = "M2";
    } else {
      const cls = el.className || "";
      const match = cls.match(/\bcm-src-(\d+)-(\d+)\b/);
      if (match) {
        range = { start: parseInt(match[1], 10), end: parseInt(match[2], 10) };
        method = "M1";
      }
    }

    const tag = el.tagName.toLowerCase();
    const isLeaf = ["mjx-mi", "mjx-mn", "mjx-mo", "mjx-mtext", "mjx-c"].includes(tag);
    const isSpecialContainer = ["mjx-mfrac", "mjx-mtable", "mjx-mtr", "mjx-mtd"].includes(tag);

    // Only register leaves and structural containers of interest
    if (isLeaf || isSpecialContainer || range !== null) {
      const text = el.textContent.trim() || `<${tag}>`;
      items.push({
        id: `DOM_${counter++}`,
        tag,
        text,
        range,
        method,
        element: el,
      });
    }

    if (el.children) {
      for (const ch of el.children) {
        visit(ch);
      }
    }
  }

  visit(root);
  return items;
}

/**
 * Escapes characters for Mermaid node labels.
 */
function sanitizeMermaidText(str: string): string {
  return str
    .replace(/\\/g, "#92;")
    .replace(/"/g, "#quot;")
    .replace(/\[/g, "#91;")
    .replace(/\]/g, "#93;")
    .replace(/\{/g, "#123;")
    .replace(/\}/g, "#125;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Generates full Mermaid Diagram string connecting CST nodes to DOM elements.
 */
export async function generateDualTreeMermaid(rawSource: string): Promise<{
  mermaid: string;
  cstCount: number;
  domCount: number;
  edgeCount: number;
  crossingCount: number;
}> {
  // 1. Pure CST Parse
  const cstNodes = new MathCSTParser(rawSource).parse();
  const flatCST = flattenCST(cstNodes, rawSource);

  // 2. Real MathJax Compile & Stamp
  const root = await compileAndStampRealMathJax(rawSource);
  const flatDOM = flattenDOM(root);

  // 3. Provenance Edge Binding & Inversion Detection
  const edges: AlignmentEdge[] = [];
  let lastCstStart = -1;
  let crossingCount = 0;

  for (const dom of flatDOM) {
    if (!dom.range) continue;

    // Find best CST node matching range
    const exact = flatCST.find((c) => c.start === dom.range!.start && c.end === dom.range!.end);
    const covering = exact || flatCST.find((c) => c.start <= dom.range!.start && c.end >= dom.range!.end);

    if (covering) {
      const isLeaf = ["mjx-mi", "mjx-mn", "mjx-mo", "mjx-mtext", "mjx-c"].includes(dom.tag);
      const isVerticalStackChild = dom.element.closest("mjx-munderover, mjx-msubsup, mjx-under, mjx-over, mjx-sub, mjx-sup") !== null;
      
      // Monotonicity assertion applies to terminal leaf sequences in reading order
      const isCrossing = isLeaf && !isVerticalStackChild && dom.range.start < lastCstStart;
      if (isCrossing) {
        crossingCount++;
      }
      if (isLeaf && !isVerticalStackChild) {
        lastCstStart = Math.max(lastCstStart, dom.range.start);
      }

      edges.push({
        domId: dom.id,
        cstId: covering.id,
        domText: dom.text,
        cstText: covering.text,
        start: dom.range.start,
        end: dom.range.end,
        isCrossing,
        label: isCrossing ? `MISALIGNED [${dom.range.start}, ${dom.range.end}]` : `[${dom.range.start}, ${dom.range.end}]`,
      });
    }
  }

  // 4. Construct Mermaid Source
  const lines: string[] = [];
  lines.push("graph LR");
  lines.push("  %% Markdown CST Subgraph");
  lines.push("  subgraph CST [\"Markdown Raw CST (Source)\"]");
  lines.push("    direction TB");
  for (const c of flatCST) {
    const label = `${sanitizeMermaidText(c.text)} [${c.start}, ${c.end}] (${sanitizeMermaidText(c.desc)})`;
    lines.push(`    ${c.id}["${label}"]`);
  }
  lines.push("  end");
  lines.push("");

  lines.push("  %% Rendered MathJax CHTML DOM Subgraph");
  lines.push("  subgraph DOM [\"Rendered CHTML DOM (Target)\"]");
  lines.push("    direction TB");
  for (const d of flatDOM) {
    const rangeStr = d.range ? ` [${d.range.start}, ${d.range.end}]` : " [unstamped]";
    const label = `&lt;${d.tag}&gt; ${sanitizeMermaidText(d.text)}${rangeStr}`;
    lines.push(`    ${d.id}["${label}"]`);
  }
  lines.push("  end");
  lines.push("");

  lines.push("  %% Directed Provenance Alignment Edges");
  edges.forEach((e, idx) => {
    if (e.isCrossing) {
      lines.push(`    ${e.domId} -.->|"${e.label}"| ${e.cstId}`);
      lines.push(`    linkStyle ${idx} stroke:#f7768e,stroke-width:3px;`);
    } else {
      lines.push(`    ${e.domId} -->|"${e.label}"| ${e.cstId}`);
    }
  });

  lines.push("");
  lines.push("  %% Styling Classes");
  lines.push("  classDef cstBox fill:#1e2030,stroke:#82aaff,stroke-width:2px,color:#c8d3f5;");
  lines.push("  classDef domBox fill:#1b2b34,stroke:#c3e88d,stroke-width:2px,color:#c8d3f5;");
  lines.push(`  class ${flatCST.map((c) => c.id).join(",")} cstBox;`);
  lines.push(`  class ${flatDOM.map((d) => d.id).join(",")} domBox;`);

  return {
    mermaid: lines.join("\n"),
    cstCount: flatCST.length,
    domCount: flatDOM.length,
    edgeCount: edges.length,
    crossingCount,
  };
}

// CLI Execution Handler
if (require.main === module || process.argv[1]?.endsWith("visualize_dual_tree.ts")) {
  (async () => {
    const args = process.argv.slice(2);
    let equation = "f(x)={a_0}/{2} + \\sum_{n=1}^{oo} a_n{cos({n pi x}/{l})}+b_n{sin({n pi x}/{l})}";
    let savePath: string | null = null;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--file" || args[i] === "-o") {
        savePath = args[++i];
      } else if (!args[i].startsWith("-")) {
        equation = args[i];
      }
    }

    console.log(`\nAnalyzing Equation:\n  ${equation}\n`);
    const result = await generateDualTreeMermaid(equation);

    console.log(`=== Alignment Telemetry ===`);
    console.log(`  CST Nodes    : ${result.cstCount}`);
    console.log(`  DOM Elements : ${result.domCount}`);
    console.log(`  Mapped Edges : ${result.edgeCount}`);
    console.log(`  Crossings    : ${result.crossingCount} ${result.crossingCount === 0 ? "✓ (Strict Monotonic)" : "⚠ (Misalignment Detected!)"}\n`);

    if (savePath) {
      fs.writeFileSync(savePath, result.mermaid, "utf-8");
      console.log(`Saved Mermaid diagram to: ${savePath}`);
    } else {
      console.log("```mermaid");
      console.log(result.mermaid);
      console.log("```\n");
    }
  })().catch((err) => {
    console.error("Visualizer Error:", err);
    process.exit(1);
  });
}
