import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_PALETTE, DEFAULT_OPTIONS } from "../src/config";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { CHTML } from "mathjax-full/js/output/chtml.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { autoSealNextLevel } from "./test_scratch";

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

const inputMatrix = "\\begin{pmatrix} \\left( \\textcolor{#bb9af7}{a} & \\textcolor{#2ac3de}{b} \\right) \\end{pmatrix}";
console.log("Input: ", inputMatrix);
const sealed = autoSealNextLevel(inputMatrix);
console.log("Sealed:", sealed);
const colored = colorLatexBody(sealed, DEFAULT_PALETTE, { ...DEFAULT_OPTIONS, useCST: true });
console.log("Colored:\n", colored);
console.log("MathJax:", checkMJ(colored));
