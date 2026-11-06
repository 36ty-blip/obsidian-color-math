// tests/keystroke_prefix_audit.ts
// Character-by-Character Keystroke Prefix Stress Audit Runner
// Tests every intermediate typing state (S[0..1], S[0..2], ..., S[0..N])
// against normalizeMathSyntax -> autoSealUnclosedDelimiters -> colorLatexBody -> KaTeX.
// Kept strictly separate from standard vitest unit tests.

import fs from "fs";
import path from "path";
import os from "os";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { validateLatexWithMathJax } from "./validator";
import { RAW_MATHEMATICAL_CORPUS, buildTypingCorpus, TypingScript } from "./keystroke/typing_corpus";
import { normalizeMathSyntax, autoSealUnclosedDelimiters } from "../src/utils/latex_helpers";
import { colorLatexBody, computeSemanticMathSpans } from "../src/converters/generic";
import { selectColorSpans, flattenColorSpans } from "../src/utils/spans";
import { DEFAULT_COLORS, DEFAULT_OPTIONS, ColorMathOptions } from "../src/config";

export interface MacroAuditEquation {
  name: string;
  category: "radicals" | "fractions_stacking" | "structural_styling" | "extensible_arrows" | "nested_adversarial" | "corpus_base";
  raw: string;
}

// Dedicated multi-stage macro corpus specifically designed to stress-test typing transitions
export const MULTI_STAGE_MACRO_CORPUS: MacroAuditEquation[] = [
  // 1. Radicals
  { name: "Square Root Basic", category: "radicals", raw: "\\sqrt{x}" },
  { name: "Cubic Root with Index", category: "radicals", raw: "\\sqrt[3]{x}" },
  { name: "N-th Root with Expression", category: "radicals", raw: "\\sqrt[n]{x + y}" },
  { name: "Complex Index Root", category: "radicals", raw: "\\sqrt[n+1]{a^2 + b^2}" },

  // 2. 2-Argument Fractions, Binomials & Stacking Macros
  { name: "Standard Fraction", category: "fractions_stacking", raw: "\\frac{a}{b}" },
  { name: "Fraction with Nested Braces", category: "fractions_stacking", raw: "\\frac{\\sin(x)}{x}" },
  { name: "Fraction with Compound Expressions", category: "fractions_stacking", raw: "\\frac{a + b}{c + d}" },
  { name: "Display Fraction", category: "fractions_stacking", raw: "\\dfrac{1}{x + 1}" },
  { name: "Text Fraction", category: "fractions_stacking", raw: "\\tfrac{1}{2} x" },
  { name: "Continued Fraction", category: "fractions_stacking", raw: "\\cfrac{1}{2 + x}" },
  { name: "Standard Binomial", category: "fractions_stacking", raw: "\\binom{n}{k}" },
  { name: "Display Binomial", category: "fractions_stacking", raw: "\\dbinom{n}{k}" },
  { name: "Text Binomial", category: "fractions_stacking", raw: "\\tbinom{n}{k}" },
  { name: "Overset Relation", category: "fractions_stacking", raw: "\\overset{f}{\\longrightarrow}" },
  { name: "Underset Limit", category: "fractions_stacking", raw: "\\underset{x \\to 0}{\\lim}" },
  { name: "Stackrel Definition", category: "fractions_stacking", raw: "\\stackrel{\\text{def}}{=}" },

  // 3. 1-Argument Structural & Styling Macros
  { name: "Math Bold", category: "structural_styling", raw: "\\mathbf{x}" },
  { name: "Math Blackboard Bold", category: "structural_styling", raw: "\\mathbb{R}" },
  { name: "Math Calligraphic", category: "structural_styling", raw: "\\mathcal{H}" },
  { name: "Math Fraktur", category: "structural_styling", raw: "\\mathfrak{g}" },
  { name: "Math Script", category: "structural_styling", raw: "\\mathscr{F}" },
  { name: "Bold Symbol", category: "structural_styling", raw: "\\boldsymbol{\\theta}" },
  { name: "BM Vector", category: "structural_styling", raw: "\\bm{v}" },
  { name: "Operator Name", category: "structural_styling", raw: "\\operatorname{tr}(A)" },
  { name: "Plain Text in Math", category: "structural_styling", raw: "\\text{speed}" },
  { name: "Math Roman", category: "structural_styling", raw: "\\mathrm{d}x" },
  { name: "Overline Conjugate", category: "structural_styling", raw: "\\overline{z}" },
  { name: "Underline Variable", category: "structural_styling", raw: "\\underline{u}" },
  { name: "Overbrace Annotation", category: "structural_styling", raw: "\\overbrace{a + b + c}" },
  { name: "Underbrace Annotation", category: "structural_styling", raw: "\\underbrace{x + y + z}" },
  { name: "Over Right Arrow", category: "structural_styling", raw: "\\overrightarrow{AB}" },
  { name: "Over Left Arrow", category: "structural_styling", raw: "\\overleftarrow{BA}" },
  { name: "Wide Hat", category: "structural_styling", raw: "\\widehat{H}" },
  { name: "Wide Tilde", category: "structural_styling", raw: "\\widetilde{M}" },
  { name: "Boxed Equation", category: "structural_styling", raw: "\\boxed{E = mc^2}" },
  { name: "Cancel Term", category: "structural_styling", raw: "\\cancel{x}" },
  { name: "Backward Cancel", category: "structural_styling", raw: "\\bcancel{y}" },
  { name: "Cross Cancel", category: "structural_styling", raw: "\\xcancel{z}" },
  { name: "Phantom Spacer", category: "structural_styling", raw: "\\phantom{0}" },
  { name: "Modulo Operator", category: "structural_styling", raw: "x \\pmod{p}" },
  { name: "Triple Dot Derivative", category: "structural_styling", raw: "\\dddot{x}" },
  { name: "Quadruple Dot Derivative", category: "structural_styling", raw: "\\ddddot{x}" },

  // 4. Extensible Arrows with Optional [sub] + Mandatory {sup}
  { name: "Extensible Right Arrow Mandatory Only", category: "extensible_arrows", raw: "\\xrightarrow{f}" },
  { name: "Extensible Right Arrow with Sub and Sup", category: "extensible_arrows", raw: "\\xrightarrow[below]{above}" },
  { name: "Extensible Left Arrow", category: "extensible_arrows", raw: "\\xleftarrow[a]{b}" },
  { name: "Extensible Double Arrow", category: "extensible_arrows", raw: "\\xleftrightarrow[sub]{sup}" },
  { name: "Extensible Right Double Arrow", category: "extensible_arrows", raw: "\\xRightarrow[n]{m}" },
  { name: "Extensible Left Double Arrow", category: "extensible_arrows", raw: "\\xLeftarrow[n]{m}" },
  { name: "Extensible Equivalence Arrow", category: "extensible_arrows", raw: "\\xLeftrightarrow[n]{m}" },
  { name: "Extensible Mapsto Arrow", category: "extensible_arrows", raw: "\\xmapsto[below]{above}" },

  // 5. Nested & Complex Adversarial Combinations
  { name: "Fraction of Radicals", category: "nested_adversarial", raw: "\\frac{\\sqrt[3]{x}}{\\mathbf{y}}" },
  { name: "Radical of Fraction", category: "nested_adversarial", raw: "\\sqrt{\\frac{a}{b}}" },
  { name: "Overbrace Fraction", category: "nested_adversarial", raw: "\\overbrace{\\frac{a}{b}}^{\\text{ratio}}" },
  { name: "Nested Display Fraction", category: "nested_adversarial", raw: "\\dfrac{1}{1 + \\dfrac{1}{x}}" },
  { name: "Integral with Rational Integrand", category: "nested_adversarial", raw: "\\int_0^\\infty \\frac{dx}{1 + x^2}" },
  { name: "Complex Script Exponent", category: "nested_adversarial", raw: "x^{2} + y_{k+1}" },
];

export interface KeystrokeFailure {
  equationName: string;
  category: string;
  charIndex: number;
  totalChars: number;
  typedChar: string;
  prefix: string;
  sealed: string;
  colored: string;
  errorMessage: string;
  failureType: "UNCLOSED_MACRO_ARG" | "UNCLOSED_BRACKET" | "DANGLING_OPERATOR" | "INCOMPLETE_COMMAND" | "OTHER_PARSE_ERROR";
  mathjaxStatus: { valid: boolean; error?: string };
  cm6Status: { valid: boolean; error?: string };
}

export interface KeystrokeAuditSummary {
  totalEquations: number;
  totalKeystrokes: number;
  passedKeystrokes: number;
  failedKeystrokes: number;
  passRatePct: string;
  byCategory: Record<string, { total: number; failed: number }>;
  byFailureType: Record<string, number>;
  byEngineBreakdown: {
    mathjaxPassCount: number;
    mathjaxFailCount: number;
    cm6PassCount: number;
    cm6FailCount: number;
    bothPassedCount: number;
  };
  mathjaxErrors: Array<{ equationName: string; prefix: string; sealed: string; error: string }>;
  failures: KeystrokeFailure[];
}

function classifyFailure(prefix: string, sealed: string, err: string): KeystrokeFailure["failureType"] {
  if (err.includes("expected '}'") || err.includes("Missing argument") || err.includes("expected ']'")) {
    if (prefix.includes("[") && !sealed.includes("]")) return "UNCLOSED_BRACKET";
    return "UNCLOSED_MACRO_ARG";
  }
  if (err.includes("Undefined control sequence") && /\\([A-Za-z]+)$/.test(prefix)) {
    return "INCOMPLETE_COMMAND";
  }
  if (err.includes("Expected group after '^'") || err.includes("Expected group after '_'")) {
    return "DANGLING_OPERATOR";
  }
  return "OTHER_PARSE_ERROR";
}

export function runKeystrokePrefixAudit(): KeystrokeAuditSummary {
  // Combine base typing corpus + multi-stage macro corpus
  const allEquations: MacroAuditEquation[] = [
    ...MULTI_STAGE_MACRO_CORPUS,
    ...RAW_MATHEMATICAL_CORPUS.map((item) => ({
      name: item.name,
      category: "corpus_base" as const,
      raw: item.raw,
    })),
  ];

  const options: ColorMathOptions = {
    ...DEFAULT_OPTIONS,
    previewLatexNormalization: true,
    crashImmunityAutoSeal: true,
    speedSyntacticSugar: true,
    useCST: true,
  };

  const failures: KeystrokeFailure[] = [];
  const mathjaxErrors: Array<{ equationName: string; prefix: string; sealed: string; error: string }> = [];
  let totalKeystrokes = 0;
  let passedKeystrokes = 0;

  const byCategory: Record<string, { total: number; failed: number }> = {};
  const byFailureType: Record<string, number> = {
    UNCLOSED_MACRO_ARG: 0,
    UNCLOSED_BRACKET: 0,
    DANGLING_OPERATOR: 0,
    INCOMPLETE_COMMAND: 0,
    OTHER_PARSE_ERROR: 0,
  };

  const byEngineBreakdown = {
    mathjaxPassCount: 0,
    mathjaxFailCount: 0,
    cm6PassCount: 0,
    cm6FailCount: 0,
    bothPassedCount: 0,
  };

  for (const eq of allEquations) {
    if (!byCategory[eq.category]) {
      byCategory[eq.category] = { total: 0, failed: 0 };
    }

    const raw = eq.raw;
    for (let k = 1; k <= raw.length; k++) {
      const prefix = raw.slice(0, k);
      const typedChar = raw[k - 1];

      // Filter: Our role only begins once a command name is finished.
      // If the user is mid-spelling a command name (e.g. \f, \fr, \fra before \frac), skip:
      const cmdMatch = prefix.match(/(\\+)([A-Za-z]*)$/);
      if (cmdMatch && cmdMatch[1].length % 2 === 1 && k < raw.length && /[A-Za-z]/.test(raw[k])) {
        continue;
      }

      totalKeystrokes++;
      byCategory[eq.category].total++;

      // 1. Pipeline: normalizeMathSyntax -> autoSealUnclosedDelimiters -> colorLatexBody
      let sealed = prefix;
      let colored = prefix;

      try {
        const norm = normalizeMathSyntax(prefix, options);
        sealed = autoSealUnclosedDelimiters(norm, true);
        colored = colorLatexBody(sealed, DEFAULT_COLORS, options);
      } catch (pipeErr: any) {
        const fType = "OTHER_PARSE_ERROR";
        byFailureType[fType]++;
        byCategory[eq.category].failed++;
        failures.push({
          equationName: eq.name,
          category: eq.category,
          charIndex: k,
          totalChars: raw.length,
          typedChar,
          prefix,
          sealed,
          colored,
          errorMessage: `Pipeline crashed: ${pipeErr.message}`,
          failureType: fType,
        });
        continue;
      }

      // 2. CodeMirror 6 Live Preview incremental decoration validation
      let cm6Valid = false;
      let cm6Err: string | undefined;

      try {
        const rawSpans = computeSemanticMathSpans(prefix, DEFAULT_COLORS, options);
        const selected = selectColorSpans(prefix, rawSpans);
        const cmSpans = flattenColorSpans(selected);
        const builder = new RangeSetBuilder<Decoration>();
        let lastFrom = -1;
        for (const span of cmSpans) {
          const from = span.start;
          const to = span.end;
          if (from < to && to <= prefix.length) {
            if (from < lastFrom) {
              throw new Error(`Out of order range [${from}, ${to}] after lastFrom ${lastFrom} in prefix "${prefix}"`);
            }
            builder.add(from, to, Decoration.mark({ class: `color-math-role-${span.role || "main"}` }));
            lastFrom = from;
          }
        }
        builder.finish();
        cm6Valid = true;
      } catch (cErr: any) {
        cm6Err = cErr.message;
      }

      // MathJax 4 validation (authoritative for Obsidian users on final colored LaTeX)
      const mjRes = validateLatexWithMathJax(colored);
      const mathjaxValid = mjRes.valid;
      const mathjaxErr = mjRes.error;

      if (mathjaxValid) {
        byEngineBreakdown.mathjaxPassCount++;
      } else {
        byEngineBreakdown.mathjaxFailCount++;
        mathjaxErrors.push({
          equationName: eq.name,
          prefix,
          sealed,
          error: mathjaxErr || "MathJax error",
        });
      }

      if (cm6Valid) byEngineBreakdown.cm6PassCount++;
      else byEngineBreakdown.cm6FailCount++;

      if (mathjaxValid && cm6Valid) byEngineBreakdown.bothPassedCount++;

      // Both MathJax 4 and CodeMirror 6 must validate cleanly
      const overallValid = mathjaxValid && cm6Valid;

      if (overallValid) {
        passedKeystrokes++;
      } else {
        byCategory[eq.category].failed++;
        const effectiveErr = mathjaxErr || cm6Err || "Syntax error";
        const fType = classifyFailure(prefix, sealed, effectiveErr);
        byFailureType[fType]++;
        failures.push({
          equationName: eq.name,
          category: eq.category,
          charIndex: k,
          totalChars: raw.length,
          typedChar,
          prefix,
          sealed,
          colored,
          errorMessage: effectiveErr,
          failureType: fType,
          mathjaxStatus: { valid: mathjaxValid, error: mathjaxErr },
          cm6Status: { valid: cm6Valid, error: cm6Err },
        });
      }
    }
  }

  const passRatePct = ((passedKeystrokes / totalKeystrokes) * 100).toFixed(1) + "%";

  return {
    totalEquations: allEquations.length,
    totalKeystrokes,
    passedKeystrokes,
    failedKeystrokes: failures.length,
    passRatePct,
    byCategory,
    byFailureType,
    byEngineBreakdown,
    mathjaxErrors,
    failures,
  };
}

// CLI Execution
if (require.main === module || !process.env.VITEST) {
  console.log("\n=========================================================================");
  console.log("🔍 CHARACTER-BY-CHARACTER KEYSTROKE PREFIX STRESS AUDIT");
  console.log("=========================================================================\n");

  const start = Date.now();
  const summary = runKeystrokePrefixAudit();
  const elapsed = Date.now() - start;

  console.log(`Equations Audited:  ${summary.totalEquations}`);
  console.log(`Keystrokes Tested:  ${summary.totalKeystrokes} intermediate typing states`);
  console.log(`Passed States:      ${summary.passedKeystrokes}`);
  console.log(`Failed States:      ${summary.failedKeystrokes}`);
  console.log(`Pass Rate:          ${summary.passRatePct}`);
  console.log(`Duration:           ${elapsed} ms\n`);

  console.log("-------------------------------------------------------------------------");
  console.log("ENGINE VALIDATION BREAKDOWN (MathJax 4 vs CodeMirror 6 Live Preview):");
  console.log("-------------------------------------------------------------------------");
  const mjRate = ((summary.byEngineBreakdown.mathjaxPassCount / summary.totalKeystrokes) * 100).toFixed(1);
  const cmRate = ((summary.byEngineBreakdown.cm6PassCount / summary.totalKeystrokes) * 100).toFixed(1);
  console.log(`• MathJax 4 (Obsidian):        ${summary.byEngineBreakdown.mathjaxPassCount} / ${summary.totalKeystrokes} passed (${mjRate}%) | Failed: ${summary.byEngineBreakdown.mathjaxFailCount}`);
  console.log(`• CodeMirror 6 (Live Preview): ${summary.byEngineBreakdown.cm6PassCount} / ${summary.totalKeystrokes} passed (${cmRate}%) | Failed: ${summary.byEngineBreakdown.cm6FailCount}`);
  console.log(`• Both Engines Passed:         ${summary.byEngineBreakdown.bothPassedCount} / ${summary.totalKeystrokes}\n`);

  if (summary.mathjaxErrors.length > 0) {
    console.log("-------------------------------------------------------------------------");
    console.log(`🚨 MATHJAX v4 WARNINGS / ERRORS (${summary.mathjaxErrors.length} instances):`);
    console.log("-------------------------------------------------------------------------");
    const grouped: Record<string, number> = {};
    for (const me of summary.mathjaxErrors) {
      grouped[me.error] = (grouped[me.error] || 0) + 1;
    }
    for (const [err, count] of Object.entries(grouped).sort((a, b) => b[1] - a[1])) {
      console.log(`• ${err}: ${count} occurrences`);
    }
    console.log("\nSample MathJax warnings:");
    for (const me of summary.mathjaxErrors.slice(0, 5)) {
      console.log(`  [${me.equationName}] "${me.prefix}" -> "${me.sealed}": ${me.error}`);
    }
    console.log("");
  }

  console.log("-------------------------------------------------------------------------");
  console.log("BREAKDOWN BY CATEGORY:");
  console.log("-------------------------------------------------------------------------");
  for (const [cat, data] of Object.entries(summary.byCategory)) {
    const rate = (((data.total - data.failed) / data.total) * 100).toFixed(1);
    console.log(`• ${cat.padEnd(22)}: ${String(data.failed).padStart(4)} / ${String(data.total).padStart(4)} failed (${rate}% pass)`);
  }

  console.log("\n-------------------------------------------------------------------------");
  console.log("BREAKDOWN BY FAILURE TYPE:");
  console.log("-------------------------------------------------------------------------");
  for (const [fType, count] of Object.entries(summary.byFailureType)) {
    console.log(`• ${fType.padEnd(25)}: ${count} instances`);
  }

  console.log("\n-------------------------------------------------------------------------");
  console.log("SAMPLE OF DETECTED MID-TYPING BREAKDOWNS:");
  console.log("-------------------------------------------------------------------------");
  const sample = summary.failures.slice(0, 35);
  for (const f of sample) {
    console.log(`[${f.category}] "${f.equationName}" (step ${f.charIndex}/${f.totalChars}, typed '${f.typedChar}'):`);
    console.log(`  Prefix: "${f.prefix}"`);
    console.log(`  Sealed: "${f.sealed}"`);
    console.log(`  Error:  ${f.errorMessage}\n`);
  }

  if (summary.failures.length > 35) {
    console.log(`... and ${summary.failures.length - 35} more failure states.\n`);
  }

  // Export full results to JSON for precise analysis
  const outDir = path.resolve(__dirname, "generated");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outFile = path.join(outDir, "keystroke_audit_results.json");
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`Full JSON report exported to: ${outFile}\n`);
}
