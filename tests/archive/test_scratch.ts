import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_PALETTE, DEFAULT_OPTIONS } from "../src/config";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { CHTML } from "mathjax-full/js/output/chtml.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const tex = new TeX({ packages: AllPackages });
const chtml = new CHTML({ fontURL: "dummy" });
const htmlDoc = mathjax.document("", { InputJax: tex, OutputJax: chtml });

function checkMJ(latex: string) {
  try {
    const node = htmlDoc.convert(latex, { display: true });
    const rendered = adaptor.outerHTML(node);
    const match = rendered.match(/title="([^"]+)"/) || rendered.match(/data-mjx-error="([^"]+)"/);
    if (match) return `FAIL (${match[1]})`;
    if (rendered.includes("merror")) return "FAIL (merror)";
    return "PASS";
  } catch (e: any) {
    return `FAIL (${e.message})`;
  }
}

const allCases = [
  {
    name: "Case 1: Discrete colors on left/right",
    input: "\\textcolor{#e0af68}{\\left(} \\textcolor{#bb9af7}{a} + \\textcolor{#2ac3de}{b} \\textcolor{#e0af68}{\\right)}",
  },
  {
    name: "Case 2: Crossing matrix column &",
    input: "\\begin{pmatrix} \\left( \\textcolor{#bb9af7}{a} & \\textcolor{#2ac3de}{b} \\right) \\end{pmatrix}",
  },
  {
    name: "Case 2b: Left OUTSIDE matrix (must NOT split)",
    input: "\\left( \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix} \\right)",
  },
  {
    name: "Case 3: Crossing fraction braces",
    input: "\\frac{ \\left( \\textcolor{#bb9af7}{a} }{ \\textcolor{#2ac3de}{b} \\right) }",
  },
  {
    name: "Case 4: Mid-typing unclosed nested left",
    input: "\\left( \\textcolor{#2ac3de}{1} + \\left( \\frac{\\cfrac{\\textcolor{#bb9af7}{a}}{\\textcolor{#2ac3de}{b}}\\textcolor{#bb9af7}{a}}{\\textcolor{#2ac3de}{b}}",
  },
  {
    name: "Case 5: Canonical set-builder with \\middle|",
    input: "\\left\\{ \\textcolor{#bb9af7}{x} \\ \\middle| \\ \\frac{\\textcolor{#2ac3de}{1}}{\\textcolor{#bb9af7}{x}} \\textcolor{#f7768e}{>} \\textcolor{#2ac3de}{0} \\right\\}",
  },
];

console.log("=== COMPREHENSIVE END-TO-END HEALER & COLOR VERIFICATION ===");
let allPassed = true;
for (const c of allCases) {
  console.log(`\n--- ${c.name} ---`);
  console.log("Raw Input:  ", c.input);
  const colored = colorLatexBody(c.input, DEFAULT_PALETTE, { ...DEFAULT_OPTIONS, useCST: true });
  console.log("Color Math: ", colored);
  const status = checkMJ(colored);
  console.log("MathJax:    ", status);
  if (status !== "PASS") allPassed = false;
}

console.log("\n==========================================");
console.log(`ALL HEALER TESTS PASSED: ${allPassed ? "YES (100% SUCCESS)" : "NO"}`);
console.log("==========================================");
