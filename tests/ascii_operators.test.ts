// tests/ascii_operators.test.ts
import { describe, it, expect } from "vitest";
import {
  normalizeAsciiOperators,
  normalizeMathSyntax,
  maskComments,
} from "../src/utils/latex_helpers";
import { colorLatexBody } from "../src/converters/generic";
import { DEFAULT_COLORS } from "../src/config";

describe("Phase 8: Pure ASCII Operator Ligatures (Max Speed Syntactic Sugar)", () => {
  describe("Individual Operator Normalization", () => {
    it("normalizes >= to \\ge with spacing", () => {
      expect(normalizeAsciiOperators("a >= b")).toBe("a \\ge b");
      expect(normalizeAsciiOperators("a>=b")).toBe("a\\ge b");
      expect(normalizeAsciiOperators("x >= 0")).toBe("x \\ge 0");
    });

    it("normalizes <= to \\le with spacing", () => {
      expect(normalizeAsciiOperators("a <= b")).toBe("a \\le b");
      expect(normalizeAsciiOperators("a<=b")).toBe("a\\le b");
      expect(normalizeAsciiOperators("x <= 100")).toBe("x \\le 100");
    });

    it("normalizes != to \\neq with spacing", () => {
      expect(normalizeAsciiOperators("a != b")).toBe("a \\neq b");
      expect(normalizeAsciiOperators("x != 0")).toBe("x \\neq 0");
    });

    it("normalizes := to \\coloneqq with spacing", () => {
      expect(normalizeAsciiOperators("f(x) := x^2")).toBe("f(x) \\coloneqq x^2");
      expect(normalizeAsciiOperators("A:=B")).toBe("A\\coloneqq B");
    });

    it("normalizes +- and -+ to \\pm and \\mp", () => {
      expect(normalizeAsciiOperators("x +- y")).toBe("x \\pm y");
      expect(normalizeAsciiOperators("x -+ y")).toBe("x \\mp y");
      expect(normalizeAsciiOperators("\\mu +- \\sigma")).toBe("\\mu \\pm \\sigma");
    });

    it("normalizes ~= to \\approx", () => {
      expect(normalizeAsciiOperators("pi ~= 3.14159")).toBe("pi \\approx 3.14159");
    });

    it("normalizes << and >> to \\ll and \\gg", () => {
      expect(normalizeAsciiOperators("x << y")).toBe("x \\ll y");
      expect(normalizeAsciiOperators("x >> y")).toBe("x \\gg y");
    });

    it("normalizes arrow and mapping ligatures", () => {
      // 1 dash/equal -> short arrows
      expect(normalizeAsciiOperators("x -> y")).toBe("x \\to y");
      expect(normalizeAsciiOperators("x => y")).toBe("x \\implies y");
      expect(normalizeAsciiOperators("x <=> y")).toBe("x \\iff y");
      expect(normalizeAsciiOperators("x <-> y")).toBe("x \\leftrightarrow y");
      expect(normalizeAsciiOperators("x <- y")).toBe("x \\leftarrow y");
      expect(normalizeAsciiOperators("x |-> y")).toBe("x \\mapsto y");

      // 2 dashes/equals -> standard long arrows
      expect(normalizeAsciiOperators("x ==> y")).toBe("x \\Longrightarrow y");
      expect(normalizeAsciiOperators("x --> y")).toBe("x \\longrightarrow y");
      expect(normalizeAsciiOperators("x <-- y")).toBe("x \\longleftarrow y");
      expect(normalizeAsciiOperators("x <== y")).toBe("x \\Longleftarrow y");
      expect(normalizeAsciiOperators("x <==> y")).toBe("x \\Longleftrightarrow y");
      expect(normalizeAsciiOperators("x <--> y")).toBe("x \\longleftrightarrow y");

      // >= 3 dashes/equals -> extensible stretchy arrows
      expect(normalizeAsciiOperators("x ===> y")).toBe("x \\xRightarrow{\\hspace{1.05em}} y");
      expect(normalizeAsciiOperators("x ====> y")).toBe("x \\xRightarrow{\\hspace{1.40em}} y");
      expect(normalizeAsciiOperators("x ---> y")).toBe("x \\xrightarrow{\\hspace{1.05em}} y");
      expect(normalizeAsciiOperators("x ----> y")).toBe("x \\xrightarrow{\\hspace{1.40em}} y");
      expect(normalizeAsciiOperators("x <--- y")).toBe("x \\xleftarrow{\\hspace{1.05em}} y");
      expect(normalizeAsciiOperators("x <=== y")).toBe("x \\xLeftarrow{\\hspace{1.05em}} y");
      expect(normalizeAsciiOperators("x <---> y")).toBe("x \\xleftrightarrow{\\hspace{1.05em}} y");
      expect(normalizeAsciiOperators("x <----> y")).toBe("x \\xleftrightarrow{\\hspace{1.40em}} y");
      expect(normalizeAsciiOperators("x <===> y")).toBe("x \\xLeftrightarrow{\\hspace{1.05em}} y");
    });
  });

  describe("LaTeX Immunity & Context Protection", () => {
    it("strictly preserves existing canonical LaTeX commands", () => {
      expect(normalizeAsciiOperators("a \\ge b")).toBe("a \\ge b");
      expect(normalizeAsciiOperators("a \\le b")).toBe("a \\le b");
      expect(normalizeAsciiOperators("a \\neq b")).toBe("a \\neq b");
      expect(normalizeAsciiOperators("a \\coloneqq b")).toBe("a \\coloneqq b");
      expect(normalizeAsciiOperators("a \\to b")).toBe("a \\to b");
    });

    it("preserves operators inside \\text{...}", () => {
      expect(normalizeAsciiOperators('\\text{if x >= 0 then y != 0}')).toBe(
        '\\text{if x >= 0 then y != 0}'
      );
    });

    it("preserves operators in comments", () => {
      expect(normalizeAsciiOperators("x = 1 % note: a >= b\ny = 2")).toBe(
        "x = 1 % note: a >= b\ny = 2"
      );
    });

    it("preserves standalone >, <, =, and + operators", () => {
      expect(normalizeAsciiOperators("x > y")).toBe("x > y");
      expect(normalizeAsciiOperators("x < y")).toBe("x < y");
      expect(normalizeAsciiOperators("x = y")).toBe("x = y");
      expect(normalizeAsciiOperators("x + y - z")).toBe("x + y - z");
    });
  });

  describe("Master Normalizer Pipeline & Settings Gating", () => {
    it("runs within normalizeMathSyntax by default", () => {
      const output = normalizeMathSyntax("a >= b");
      expect(output).toContain("\\ge");
    });

    it("respects sugarAsciiOperators: false toggle", () => {
      const output = normalizeMathSyntax("a >= b", {
        sugarAsciiOperators: false,
      });
      expect(output).toBe("a >= b");
    });

    it("respects speedSyntacticSugar: false master toggle", () => {
      const output = normalizeMathSyntax("a >= b", {
        speedSyntacticSugar: false,
      });
      expect(output).toBe("a >= b");
    });

    it("normalizes operators while preserving uncolored contrast for relations", () => {
      const colored = colorLatexBody("a >= b", DEFAULT_COLORS);
      expect(colored).toContain("\\ge");
      expect(colored).not.toContain("\\textcolor{white}");
    });

    it("Option A: stretches 3+ dashes into extensible stretchy arrows", () => {
      // 11 dashes: <----------->
      expect(normalizeAsciiOperators("<----------->")).toContain("\\xleftrightarrow{\\hspace{3.85em}}");
      // 10 dashes: ---------->
      expect(normalizeAsciiOperators("---------->")).toContain("\\xrightarrow{\\hspace{3.50em}}");
      // 11 equals: <===========>
      expect(normalizeAsciiOperators("<===========>")).toContain("\\xLeftrightarrow{\\hspace{3.85em}}");
      // 10 equals: ==========>
      expect(normalizeAsciiOperators("==========>")).toContain("\\xRightarrow{\\hspace{3.50em}}");
    });

    it("never wastes energy scanning inside comments (% ...)", () => {
      const input = "x = 1 % let dx be small and lambda = 500 nm with sin(theta)\ny = 2";
      const colored = colorLatexBody(input, DEFAULT_COLORS, {
        enableTaxonomy: true,
        colorDifferentials: true,
        colorUnits: true,
        variableDataFlow: true,
      });
      // The comment text must be completely uncolored (no \textcolor inside the comment)
      const commentIndex = colored.indexOf("%");
      const commentLineEnd = colored.indexOf("\n", commentIndex);
      const commentPart = colored.slice(commentIndex, commentLineEnd);
      expect(commentPart).not.toContain("\\textcolor");
      expect(commentPart).toBe("% let dx be small and lambda = 500 nm with sin(theta)");
    });

    describe("SIMD-accelerated maskComments", () => {
      it("preserves exact length and offsets while blanking comment bodies", () => {
        const input = "x + y % comment here\nz = 1";
        const masked = maskComments(input);
        expect(masked.length).toBe(input.length);
        expect(masked).toBe("x + y %             \nz = 1");
      });

      it("handles CRLF line endings without disturbing carriage return", () => {
        const input = "a = 5 % comment\r\nb = 10";
        const masked = maskComments(input);
        expect(masked.length).toBe(input.length);
        expect(masked).toBe("a = 5 %        \r\nb = 10");
      });

      it("handles comments ending at end of file without newline", () => {
        const input = "x = y % end of file comment";
        const masked = maskComments(input);
        expect(masked.length).toBe(input.length);
        expect(masked).toBe("x = y %                    ");
      });

      it("respects escaped \\% symbols", () => {
        const input = "100\\% apple % comment\nnext";
        const masked = maskComments(input);
        expect(masked.length).toBe(input.length);
        expect(masked).toBe("100\\% apple %        \nnext");
      });

      it("handles multiple comments on different lines", () => {
        const input = "% line 1\na = 1 % line 2\n% line 3\nb = 2";
        const masked = maskComments(input);
        expect(masked.length).toBe(input.length);
        expect(masked).toBe("%       \na = 1 %       \n%       \nb = 2");
      });
    });

    describe("Extensible Stretchy Arrow Opaque Macro Immunity", () => {
      it("preserves pure \\hspace dimension argument and does not color e or m inside extensible arrows", () => {
        const input = "\n--------->\n\\xrightarrow{\\quad\\quad} \\\\\n\n";
        const colored = colorLatexBody(input, DEFAULT_COLORS, {
          enableTaxonomy: true,
          variableDataFlow: true,
        });

        // Must retain clean \hspace{3.15em} without coloring 'e' or 'm' as variables
        expect(colored).toContain("\\xrightarrow{\\hspace{3.15em}}");
        expect(colored).not.toContain("textcolor{#9ece6a}{e}");
        expect(colored).not.toContain("textcolor{#bb9af7}{m}");
      });
    });
  });
});
