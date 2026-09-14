import { describe, it, expect } from "vitest";
import { convertText, uncolorText, scanMarkdown } from "../src/index";

describe("Markdown Scanner & Fast-Path Features", () => {
  it("converts standard inline math", () => {
    const input = "Here is $a=b$ in text.";
    const res = convertText(input);
    expect(res).toContain("\\textcolor{white}{=}");
    expect(res).toBe("Here is $a\\textcolor{white}{=}b$ in text.");
  });

  it("respects Obsidian and Pandoc whitespace flanking rules", () => {
    // 1. Leading space after opening $ is NOT math
    const leading = "Not math: $ a=b$ here.";
    expect(convertText(leading)).toBe(leading);

    // 2. Trailing space before closing $ is NOT math
    const trailing = "Not math: $a=b $ here.";
    expect(convertText(trailing)).toBe(trailing);

    // 3. Both spaces
    const both = "Not math: $ a=b $ here.";
    expect(convertText(both)).toBe(both);

    // 4. Newline across inline $ is NOT math
    const newline = "Not math: $a=b\n$ here.";
    expect(convertText(newline)).toBe(newline);

    // 5. Escaped dollar is NOT math
    const escaped = "Costs \\$a=b\\$ here.";
    expect(convertText(escaped)).toBe(escaped);
  });

  it("protects currency ranges and amounts", () => {
    const currency1 = "Cost is $20 and profit is $30.";
    expect(convertText(currency1)).toBe(currency1);

    const currency2 = "Spent $100 on groceries.";
    expect(convertText(currency2)).toBe(currency2);

    const currency3 = "Expected $100 to $200 per item.";
    expect(convertText(currency3)).toBe(currency3);

    const mixed = "Spent $50, but equation is $E=mc^2$.";
    const resMixed = convertText(mixed);
    expect(resMixed).toContain("Spent $50");
    expect(resMixed).toContain("\\textcolor");
  });

  it("protects inline code and code blocks", () => {
    const inlineCode = "Use `$a=b$` in terminal and $c=d$ in math.";
    const res = convertText(inlineCode);
    expect(res).toContain("`$a=b$`");
    expect(res).toContain("\\textcolor");

    const fenced = "```python\nx = '$a=b$'\n```\n$$x=y$$";
    const resFenced = convertText(fenced);
    expect(resFenced).toContain("x = '$a=b$'");
    expect(resFenced).toContain("\\textcolor");
  });

  it("fast-path bypasses non-math text", () => {
    const plain = "This is a document without any math markers whatsoever.";
    expect(convertText(plain)).toBe(plain);

    const scan = scanMarkdown(plain);
    expect(scan.mathBlocks.length).toBe(0);
    expect(scan.mathInlines.length).toBe(0);
    expect(scan.protected.length).toBe(0);
  });

  it("handles empty and degenerate inputs safely", () => {
    expect(convertText("")).toBe("");
    expect(convertText("   \r\n\t  ")).toBe("   \r\n\t  ");
    expect(convertText("$")).toBe("$");
    expect(convertText("$$")).toBe("$$");
    expect(convertText("$$$")).toBe("$$$");
    expect(convertText("$$$$")).toBe("$$$$");
    expect(convertText("$ $")).toBe("$ $");
    expect(convertText("$   $")).toBe("$   $");
    expect(convertText("$$ $$")).toBe("$$ $$");
    expect(convertText("$$   $$")).toBe("$$   $$");
    expect(convertText("Hello $ world")).toBe("Hello $ world");
    expect(convertText("Hello $$ world")).toBe("Hello $$ world");
  });

  it("processes a realistic kitchen sink combined document with idempotency and lossless undo", () => {
    const combinedDoc = [
      "# Advanced Mathematics & Notes\r\n",
      "\r\n",
      "> [!theorem] Hamiltonian Formulation\r\n",
      "> In quantum mechanics, the Hamiltonian is given by:\r\n",
      "> $H = \\frac{p^{2}}{2m} + V(x)$\r\n",
      "> and the eigenvalue equation satisfies $H|\\psi\\rangle = E|\\psi\\rangle$.\r\n",
      ">\r\n",
      "> We budgeted \\$50 for the experiment, but spent $20 and $30 on materials.\r\n",
      "> Expected cost was $100 to $200 per sensor.\r\n",
      "> Notice that $ invalid leading$ and $invalid trailing $ are not math.\r\n",
      "> Nor is multiline dollar:\r\n",
      "> $a = b\r\n",
      "> $\r\n",
      "> Code elements must remain completely untouched:\r\n",
      "> `$protected_inline = True$` and ``$double_backtick_protected$``.\r\n",
      ">\r\n",
      "> ```python\r\n",
      "> # Code block with math syntax inside\r\n",
      "> def simulate():\r\n",
      ">     cost = '$50'\r\n",
      ">     equation = '$$E = mc^2$$'\r\n",
      ">     return f'{cost}: {equation}'\r\n",
      "> ```\r\n",
      "\r\n",
      "## Section with Display Math\r\n",
      "\r\n",
      "$$\r\n",
      "\\int_{0}^{\\infty} e^{-x^{2}} dx = \\frac{\\sqrt{\\pi}}{2}\r\n",
      "$$\r\n",
      "\r\n",
      "Punctuation wrapped math: ($x=1$), [$y=2$], and {$z=3$}.\r\n",
      "\r\n",
      "~~~latex\r\n",
      "\\begin{equation}\r\n",
      "\\text{Verbatim tilde protected: } \\int x dx\r\n",
      "\\end{equation}\r\n",
      "~~~\r\n",
      "\r\n",
      "Multilingual & emoji support:\r\n",
      "🚀 Quantum computing: $f(x) = x^{2}$ 🎉\r\n",
      "日本語テキスト: $y = 2x$ の計算。\r\n",
      "Über Schrödinger: $E = mc^{2}$.\r\n",
      "\r\n",
      "Final paragraph with no math whatsoever.\r\n",
    ].join("");

    const converted = convertText(combinedDoc);

    // 1. Math was colored
    expect(converted).toContain("\\textcolor");
    expect(converted).toContain("\\textcolor{white}{=}");

    // 2. Protected areas preserved byte-for-byte
    expect(converted).toContain("\\$50 for the experiment");
    expect(converted).toContain("$20 and $30");
    expect(converted).toContain("$100 to $200");
    expect(converted).toContain("$ invalid leading$");
    expect(converted).toContain("$invalid trailing $");
    expect(converted).toContain("`$protected_inline = True$`");
    expect(converted).toContain("``$double_backtick_protected$``");
    expect(converted).toContain("cost = '$50'");
    expect(converted).toContain("equation = '$$E = mc^2$$'");
    expect(converted).toContain("\\text{Verbatim tilde protected: } \\int x dx");

    // 3. CRLF preservation
    expect(converted.includes("\r\n")).toBe(true);
    expect((converted.match(/\r\n/g) || []).length).toBe((combinedDoc.match(/\r\n/g) || []).length);
    expect(converted.replace(/\r\n/g, "").includes("\n")).toBe(false);

    // 4. Unicode & Emoji preservation
    expect(converted).toContain("🚀");
    expect(converted).toContain("🎉");
    expect(converted).toContain("日本語テキスト");
    expect(converted).toContain("Über");

    // 5. Idempotency
    const secondPass = convertText(converted);
    expect(secondPass).toBe(converted);

    // 6. Lossless Undo
    const uncolored = uncolorText(converted);
    expect(uncolored).toBe(combinedDoc);
  });
});
