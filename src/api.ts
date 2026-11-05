// src/api.ts
//! Public Developer API for Obsidian Color Math.
//! Enables external companion plugins (LaTeX Suite, Math Booster, Dataview, Excalidraw, QuickAdd)
//! and user scripts to programmatically utilize Color Math's dialect translation, CST parser,
//! math colorization, clean academic export, and macro registry.

import type ColorMathPlugin from "./main";
import { ColorRole, ColorPalette, ColorMathOptions, COLORS } from "./config";
import { normalizeMathSyntax } from "./utils/latex_helpers";
import { colorLatexBody, computeSemanticMathSpans } from "./converters/generic";
import { uncolorFragment } from "./undo";
import { MathCSTParser, CSTNode } from "./parsers/cst/index";
import type { ColorSpan } from "./utils/spans";
import { CUSTOM_MACRO_FUNCTIONS, CUSTOM_BARE_FUNCTIONS } from "./config";

export type MathDialect = "latex" | "typst" | "asciimath";

export interface TranslateOptions {
  from: MathDialect;
  to: MathDialect;
  matrixStyle?: "bmatrix" | "pmatrix" | "matrix" | "vmatrix";
}

export interface CustomMacroDefinition {
  identifier: string; // e.g. "\\ket" or "ket"
  role?: ColorRole;
  category?: string;
  bare?: boolean; // if true, registers bare shorthand without backslash
}

export interface IDisposable {
  dispose(): void;
}

export interface ColorMathPublicAPI {
  readonly version: string;

  /**
   * Translates math notation between dialects (e.g. Typst / AsciiMath -> LaTeX).
   * Forward-compatible design supporting Phase 4 bidirectional LaTeX <-> Typst compilation.
   */
  translate(input: string, options: TranslateOptions): string;

  /**
   * Convenience shortcut converting Typst or AsciiMath shorthand into canonical LaTeX.
   */
  toLatex(typstOrAsciiMath: string, options?: Partial<ColorMathOptions>): string;

  /**
   * Normalizes syntax shorthand (mat[...], {a}/{b}, :=, ->, xx, etc.) into LaTeX.
   */
  normalizeSyntax(mathStr: string, options?: Partial<ColorMathOptions>): string;

  /**
   * Colorizes a LaTeX math string using active or specified palette.
   */
  colorize(latexStr: string, options?: Partial<ColorMathOptions>): string;

  /**
   * Reversibly strips all Color Math styling (\textcolor, \class) into clean standard LaTeX.
   */
  stripColors(coloredLatexStr: string): string;

  /**
   * Parses mathematical expression into Concrete Syntax Tree (CST) nodes.
   */
  parseCST(mathStr: string): CSTNode[];

  /**
   * Extracts semantic tokens and color spans with roles.
   */
  getTokens(mathStr: string, options?: Partial<ColorMathOptions>): ColorSpan[];

  /**
   * Returns current active palette mapping.
   */
  getPalette(): Readonly<ColorPalette>;

  /**
   * Returns active color for a given semantic role.
   */
  getColor(role: ColorRole): string;

  /**
   * Registers a custom domain macro/operator with automatic cleanup on dispose.
   */
  registerCustomMacro(def: CustomMacroDefinition): IDisposable;
}

export class ColorMathAPIImpl implements ColorMathPublicAPI {
  private plugin: ColorMathPlugin;

  constructor(plugin: ColorMathPlugin) {
    this.plugin = plugin;
  }

  get version(): string {
    return this.plugin.manifest.version;
  }

  translate(input: string, options: TranslateOptions): string {
    if (!input) return "";

    if (options.from === "typst" || options.from === "asciimath") {
      if (options.to === "latex") {
        return normalizeMathSyntax(input, this.plugin.getMathOptions());
      }
    }

    if (options.from === "latex") {
      if (options.to === "latex") {
        return normalizeMathSyntax(input, this.plugin.getMathOptions());
      }
      if (options.to === "typst") {
        throw new Error(
          "Bidirectional LaTeX -> Typst AST translation is scheduled for Phase 4 of the Color Math Dialect Roadmap."
        );
      }
    }

    return normalizeMathSyntax(input, this.plugin.getMathOptions());
  }

  toLatex(typstOrAsciiMath: string, options?: Partial<ColorMathOptions>): string {
    if (!typstOrAsciiMath) return "";
    const opts = options ? { ...this.plugin.getMathOptions(), ...options } : this.plugin.getMathOptions();
    return normalizeMathSyntax(typstOrAsciiMath, opts);
  }

  normalizeSyntax(mathStr: string, options?: Partial<ColorMathOptions>): string {
    if (!mathStr) return "";
    const opts = options ? { ...this.plugin.getMathOptions(), ...options } : this.plugin.getMathOptions();
    return normalizeMathSyntax(mathStr, opts);
  }

  colorize(latexStr: string, options?: Partial<ColorMathOptions>): string {
    if (!latexStr) return "";
    const pal = this.plugin.settings?.palette || COLORS;
    const opt = options ? { ...this.plugin.getMathOptions(), ...options } : this.plugin.getMathOptions();
    return colorLatexBody(latexStr, pal, opt);
  }

  stripColors(coloredLatexStr: string): string {
    if (!coloredLatexStr) return "";
    return uncolorFragment(coloredLatexStr);
  }

  parseCST(mathStr: string): CSTNode[] {
    const parser = new MathCSTParser(mathStr);
    return parser.parse();
  }

  getTokens(mathStr: string, options?: Partial<ColorMathOptions>): ColorSpan[] {
    if (!mathStr) return [];
    const pal = this.plugin.settings?.palette || COLORS;
    const opt = options ? { ...this.plugin.getMathOptions(), ...options } : this.plugin.getMathOptions();
    return computeSemanticMathSpans(mathStr, pal, opt);
  }

  getPalette(): Readonly<ColorPalette> {
    const pal = this.plugin.settings?.palette || COLORS;
    return Object.freeze({ ...pal });
  }

  getColor(role: ColorRole): string {
    const pal = this.plugin.settings?.palette || COLORS;
    return pal[role] || COLORS[role] || "none";
  }

  registerCustomMacro(def: CustomMacroDefinition): IDisposable {
    const macroName = def.identifier.startsWith("\\") ? def.identifier : `\\${def.identifier}`;
    const bareName = def.identifier.replace(/^\\/, "").toLowerCase();

    CUSTOM_MACRO_FUNCTIONS.add(macroName);
    if (def.bare !== false) {
      CUSTOM_BARE_FUNCTIONS.add(bareName);
    }

    return {
      dispose: () => {
        CUSTOM_MACRO_FUNCTIONS.delete(macroName);
        CUSTOM_BARE_FUNCTIONS.delete(bareName);
      },
    };
  }
}
