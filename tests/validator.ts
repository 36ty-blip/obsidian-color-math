import katex from "katex";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { CHTML } from "mathjax-full/js/output/chtml.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { scanMarkdown } from "../src/parsers/markdown_scanner";

// Initialize headless MathJax instance with full TeX packages
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({
  packages: AllPackages,
  inlineMath: [["$", "$"]],
  displayMath: [["$$", "$$"]],
});
const chtml = new CHTML({ fontURL: "dummy" });
const mathDocument = mathjax.document("", { InputJax: tex, OutputJax: chtml });

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
    katex.renderToString(body, { throwOnError: true });
    return { valid: true, engine: "katex" };
  } catch (err: any) {
    return { valid: false, error: err?.message || String(err), engine: "katex" };
  }
}

export function validateLatexWithMathJax(latex: string): ValidationResult {
  const body = cleanLatex(latex);

  try {
    const node = mathDocument.convert(body, { display: true });
    const serialized = adaptor.outerHTML(node);

    // Look for error marks created by MathJax
    if (serialized.includes("data-mjx-error") || serialized.includes("merror") || serialized.includes("mjx-merror")) {
      const match = serialized.match(/data-mjx-error="([^"]+)"/) || serialized.match(/title="([^"]+)"/);
      const errorMsg = match ? match[1] : "MathJax syntax error in formula";
      return { valid: false, error: errorMsg, engine: "mathjax" };
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
  engine: "both" | "katex" | "mathjax" = "both"
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

