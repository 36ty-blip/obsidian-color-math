// src/editor/mathjax_interceptor.ts

import { loadMathJax } from "obsidian";
import { ColorPalette, ColorMathOptions } from "../config";
import { colorLatexBody } from "../converters/generic";

export class MathJaxInterceptor {
  private unpatchFns: (() => void)[] = [];
  private getPalette: () => ColorPalette;
  private getOptions: () => ColorMathOptions;
  private isEnabled: () => boolean;

  constructor(
    getPalette: () => ColorPalette,
    getOptions: () => ColorMathOptions,
    isEnabled: () => boolean = () => true
  ) {
    this.getPalette = getPalette;
    this.getOptions = getOptions;
    this.isEnabled = isEnabled;
  }

  async install(): Promise<void> {
    try {
      await loadMathJax();
    } catch (e) {
      console.error("Color Math: Failed to load MathJax", e);
    }

    const mathJax = (window as any)?.MathJax;
    if (!mathJax) {
      console.warn("Color Math: window.MathJax is not defined yet.");
      return;
    }

    const self = this;

    const transform = (latex: string): string => {
      if (!self.isEnabled()) return latex;
      try {
        return colorLatexBody(latex, self.getPalette(), self.getOptions());
      } catch (err) {
        console.error("Color Math transformation error:", err);
        return latex;
      }
    };

    // 1. Hook tex2chtml
    if (typeof mathJax.tex2chtml === "function") {
      const orig = mathJax.tex2chtml;
      mathJax.tex2chtml = function (latex: string, options?: any) {
        return orig.call(this, transform(latex), options);
      };
      this.unpatchFns.push(() => {
        mathJax.tex2chtml = orig;
      });
    }

    // 2. Hook tex2chtmlPromise
    if (typeof mathJax.tex2chtmlPromise === "function") {
      const orig = mathJax.tex2chtmlPromise;
      mathJax.tex2chtmlPromise = function (latex: string, options?: any) {
        return orig.call(this, transform(latex), options);
      };
      this.unpatchFns.push(() => {
        mathJax.tex2chtmlPromise = orig;
      });
    }

    // 3. Hook tex2svg
    if (typeof mathJax.tex2svg === "function") {
      const orig = mathJax.tex2svg;
      mathJax.tex2svg = function (latex: string, options?: any) {
        return orig.call(this, transform(latex), options);
      };
      this.unpatchFns.push(() => {
        mathJax.tex2svg = orig;
      });
    }

    // 4. Hook tex2svgPromise
    if (typeof mathJax.tex2svgPromise === "function") {
      const orig = mathJax.tex2svgPromise;
      mathJax.tex2svgPromise = function (latex: string, options?: any) {
        return orig.call(this, transform(latex), options);
      };
      this.unpatchFns.push(() => {
        mathJax.tex2svgPromise = orig;
      });
    }
  }

  uninstall(): void {
    for (const unpatch of this.unpatchFns) {
      try {
        unpatch();
      } catch (e) {
        // ignore
      }
    }
    this.unpatchFns = [];
  }
}
