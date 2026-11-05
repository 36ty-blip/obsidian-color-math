import katex from "katex";
import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { AbstractOutputJax } from "@mathjax/src/js/core/OutputJax.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/js/input/tex/color/ColorConfiguration.js";
import "@mathjax/src/js/input/tex/braket/BraketConfiguration.js";
import "@mathjax/src/js/input/tex/physics/PhysicsConfiguration.js";
import "@mathjax/src/js/input/tex/mathtools/MathtoolsConfiguration.js";
import "@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js";
import "@mathjax/src/js/input/tex/cases/CasesConfiguration.js";
import "@mathjax/src/js/input/tex/centernot/CenternotConfiguration.js";
import "@mathjax/src/js/input/tex/empheq/EmpheqConfiguration.js";
import "@mathjax/src/js/input/tex/extpfeil/ExtpfeilConfiguration.js";
import "@mathjax/src/js/input/tex/unicode/UnicodeConfiguration.js";
import "@mathjax/src/js/input/tex/units/UnitsConfiguration.js";
import "@mathjax/src/js/input/tex/upgreek/UpgreekConfiguration.js";
import "@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js";
import "@mathjax/src/js/input/tex/cancel/CancelConfiguration.js";
import "@mathjax/src/js/input/tex/verb/VerbConfiguration.js";
import { scanMarkdown } from "../src/parsers/markdown_scanner";

// Headless MathJax 4 OutputJax specifically designed for AST syntax validation
class SyntaxValidationOutput extends AbstractOutputJax {
  typeset(math: any) {
    return math.root;
  }
  escaped(math: any) {
    return math.math;
  }
}

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({
  packages: [
    "base",
    "ams",
    "color",
    "braket",
    "physics",
    "mathtools",
    "newcommand",
    "cases",
    "centernot",
    "empheq",
    "extpfeil",
    "unicode",
    "units",
    "upgreek",
    "boldsymbol",
    "cancel",
    "verb",
  ],
  inlineMath: [["$", "$"]],
  displayMath: [["$$", "$$"]],
});
const syntaxOutput = new SyntaxValidationOutput();
const mathDocument = mathjax.document("", { InputJax: tex, OutputJax: syntaxOutput });

function extractMathJaxError(node: any): string | null {
  if (!node) return null;
  if (node.kind === "merror") {
    return node.attributes?.get("data-mjx-error") || node.attributes?.get("title") || "MathJax syntax error in formula";
  }
  for (const child of node.childNodes || []) {
    const err = extractMathJaxError(child);
    if (err) return err;
  }
  return null;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  engine: "katex" | "mathjax";
}

export interface DualValidationResult {
  valid: boolean;
  katex: ValidationResult;
  mathjax: ValidationResult;
  error?: string;
}

function cleanLatex(latex: string): string {
  let body = latex.trim();
  body = body.replace(/^#+\s*/, "");
  if (body.startsWith("$$") && body.endsWith("$$")) {
    body = body.slice(2, -2).trim();
  } else if (body.startsWith("$") && body.endsWith("$")) {
    body = body.slice(1, -1).trim();
  }
  return body;
}

export function validateLatexWithKaTeX(latex: string): ValidationResult {
  const body = cleanLatex(latex);

  try {
    katex.renderToString(body, {
      throwOnError: true,
      strict: false,
    });
    return { valid: true, engine: "katex" };
  } catch (err: any) {
    return { valid: false, error: err?.message || String(err), engine: "katex" };
  }
}

export function validateLatexWithMathJax(latex: string): ValidationResult {
  const body = cleanLatex(latex);

  try {
    const node = mathDocument.convert(body, { display: true });
    const errorMsg = extractMathJaxError(node);
    if (errorMsg || (tex as any).parseOptions?.error) {
      return { valid: false, error: errorMsg || "MathJax syntax error in formula", engine: "mathjax" };
    }

    return { valid: true, engine: "mathjax" };
  } catch (err: any) {
    return { valid: false, error: err?.message || String(err), engine: "mathjax" };
  }
}

export function validateLatexDual(latex: string): DualValidationResult {
  const katexRes = validateLatexWithKaTeX(latex);
  const mathjaxRes = validateLatexWithMathJax(latex);

  const valid = katexRes.valid && mathjaxRes.valid;
  const errors: string[] = [];
  if (!katexRes.valid) errors.push(`[KaTeX] ${katexRes.error}`);
  if (!mathjaxRes.valid) errors.push(`[MathJax] ${mathjaxRes.error}`);

  return {
    valid,
    katex: katexRes,
    mathjax: mathjaxRes,
    error: errors.length > 0 ? errors.join(" | ") : undefined,
  };
}

export function validateMarkdownMath(
  markdown: string,
  engine: "both" | "katex" | "mathjax" = "mathjax"
): { valid: boolean; failures: { block: string; error: string }[] } {
  const { mathBlocks } = scanMarkdown(markdown);
  const failures: { block: string; error: string }[] = [];

  for (const block of mathBlocks) {
    const raw = markdown.slice(block.start, block.end);
    if (engine === "both") {
      const res = validateLatexDual(raw);
      if (!res.valid) {
        failures.push({ block: raw, error: res.error || "Unknown validation error" });
      }
    } else if (engine === "katex") {
      const res = validateLatexWithKaTeX(raw);
      if (!res.valid) {
        failures.push({ block: raw, error: res.error || "KaTeX error" });
      }
    } else {
      const res = validateLatexWithMathJax(raw);
      if (!res.valid) {
        failures.push({ block: raw, error: res.error || "MathJax error" });
      }
    }
  }

  return { valid: failures.length === 0, failures };
}

