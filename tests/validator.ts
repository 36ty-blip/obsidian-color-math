import katex from "katex";

export function validateLatexWithKaTeX(latex: string): { valid: boolean; error?: string } {
  let body = latex.trim();
  body = body.replace(/^#+\s*/, "");
  if (body.startsWith("$$") && body.endsWith("$$")) {
    body = body.slice(2, -2).trim();
  } else if (body.startsWith("$") && body.endsWith("$")) {
    body = body.slice(1, -1).trim();
  }

  try {
    katex.renderToString(body, { throwOnError: true });
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err?.message || String(err) };
  }
}
