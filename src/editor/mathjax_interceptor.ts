// src/editor/mathjax_interceptor.ts

import { loadMathJax, Notice } from "obsidian";
import { ColorPalette, ColorMathOptions } from "../config";
import { colorLatexBody } from "../converters/generic";

interface MathJaxObject {
  tex2chtml?: (latex: string, options?: unknown) => HTMLElement;
  tex2chtmlPromise?: (latex: string, options?: unknown) => Promise<HTMLElement>;
  tex2svg?: (latex: string, options?: unknown) => SVGElement;
  tex2svgPromise?: (latex: string, options?: unknown) => Promise<SVGElement>;
}

export class MathJaxInterceptor {
  private unpatchFns: (() => void)[] = [];
  private getPalette: () => ColorPalette;
  private getOptions: () => ColorMathOptions;
  private isEnabled: () => boolean;
  private lastNoticeTime: number = 0;

  constructor(
    getPalette: () => ColorPalette,
    getOptions: () => ColorMathOptions,
    isEnabled: () => boolean = () => true
  ) {
    this.getPalette = getPalette;
    this.getOptions = getOptions;
    this.isEnabled = isEnabled;
  }

  private notifyUserError(errorMsg: string): void {
    const now = Date.now();
    if (now - this.lastNoticeTime > 4000) {
      this.lastNoticeTime = now;
      new Notice(`Color Math: LaTeX syntax issue — ${errorMsg}`, 5000);
    }
  }

  async install(): Promise<void> {
    try {
      await loadMathJax();
    } catch (e) {
      console.error("Color Math: Failed to load MathJax", e);
    }

    const mathJax = (window as Window & { MathJax?: MathJaxObject })?.MathJax;
    if (!mathJax) {
      console.warn("Color Math: window.MathJax is not defined yet.");
      return;
    }

    const transform = (latex: string): string => {
      if (!this.isEnabled()) return latex;
      try {
        return colorLatexBody(latex, this.getPalette(), this.getOptions());
      } catch (err) {
        console.error("Color Math transformation error:", err);
        return latex;
      }
    };

    const self = this;

    const getMathJaxError = (el: unknown): string | null => {
      if (!el || typeof el !== "object") return null;
      const dom = el as Element;
      if (typeof dom.getAttribute === "function") {
        const errAttr = dom.getAttribute("data-mjx-error");
        if (errAttr) return errAttr;
      }
      if (typeof dom.querySelector === "function") {
        const errNode = dom.querySelector(".merror, [data-mjx-error], mjx-merror");
        if (errNode) {
          return (
            errNode.getAttribute("data-mjx-error") ||
            errNode.getAttribute("title") ||
            errNode.textContent?.trim() ||
            "LaTeX syntax error"
          );
        }
      }
      return null;
    };

    const handleResult = <T extends HTMLElement | SVGElement>(
      result: T,
      origFn: (latex: string, options?: unknown) => T,
      context: unknown,
      originalLatex: string,
      transformedLatex: string,
      options?: unknown
    ): T => {
      const errorMsg = getMathJaxError(result);
      if (errorMsg) {
        console.warn("Color Math: MathJax rendered error for colored LaTeX:", {
          error: errorMsg,
          original: originalLatex,
          transformed: transformedLatex,
        });
        self.notifyUserError(errorMsg);

        // Fallback to rendering the original clean LaTeX
        try {
          const fallback = origFn.call(context, originalLatex, options);
          if (fallback && typeof (fallback as Element).setAttribute === "function") {
            (fallback as Element).setAttribute(
              "title",
              `Color Math: Rendered uncolored formula because colored syntax had error: ${errorMsg}`
            );
          }
          return fallback;
        } catch {
          return result;
        }
      }
      return result;
    };

    const handleAsyncResult = async <T extends HTMLElement | SVGElement>(
      resultPromise: Promise<T>,
      origFn: (latex: string, options?: unknown) => Promise<T>,
      context: unknown,
      originalLatex: string,
      transformedLatex: string,
      options?: unknown
    ): Promise<T> => {
      const result = await resultPromise;
      const errorMsg = getMathJaxError(result);
      if (errorMsg) {
        console.warn("Color Math: MathJax rendered error for colored LaTeX (async):", {
          error: errorMsg,
          original: originalLatex,
          transformed: transformedLatex,
        });
        self.notifyUserError(errorMsg);

        try {
          const fallback = await origFn.call(context, originalLatex, options);
          if (fallback && typeof (fallback as Element).setAttribute === "function") {
            (fallback as Element).setAttribute(
              "title",
              `Color Math: Rendered uncolored formula because colored syntax had error: ${errorMsg}`
            );
          }
          return fallback;
        } catch {
          return result;
        }
      }
      return result;
    };

    // 1. Hook tex2chtml
    if (typeof mathJax.tex2chtml === "function") {
      const orig = mathJax.tex2chtml;
      mathJax.tex2chtml = function (this: unknown, latex: string, options?: unknown) {
        if (!self.isEnabled()) return orig.call(this, latex, options);
        try {
          const transformed = transform(latex);
          const res = orig.call(this, transformed, options);
          return handleResult(res, orig, this, latex, transformed, options);
        } catch (err) {
          console.warn("Color Math: Exception during tex2chtml, falling back to original LaTeX:", err);
          return orig.call(this, latex, options);
        }
      };
      this.unpatchFns.push(() => {
        mathJax.tex2chtml = orig;
      });
    }

    // 2. Hook tex2chtmlPromise
    if (typeof mathJax.tex2chtmlPromise === "function") {
      const orig = mathJax.tex2chtmlPromise;
      mathJax.tex2chtmlPromise = async function (this: unknown, latex: string, options?: unknown) {
        if (!self.isEnabled()) return orig.call(this, latex, options);
        try {
          const transformed = transform(latex);
          return await handleAsyncResult(
            orig.call(this, transformed, options),
            orig,
            this,
            latex,
            transformed,
            options
          );
        } catch (err) {
          console.warn("Color Math: Exception during tex2chtmlPromise, falling back to original LaTeX:", err);
          return await orig.call(this, latex, options);
        }
      };
      this.unpatchFns.push(() => {
        mathJax.tex2chtmlPromise = orig;
      });
    }

    // 3. Hook tex2svg
    if (typeof mathJax.tex2svg === "function") {
      const orig = mathJax.tex2svg;
      mathJax.tex2svg = function (this: unknown, latex: string, options?: unknown) {
        if (!self.isEnabled()) return orig.call(this, latex, options);
        try {
          const transformed = transform(latex);
          const res = orig.call(this, transformed, options);
          return handleResult(res, orig, this, latex, transformed, options);
        } catch (err) {
          console.warn("Color Math: Exception during tex2svg, falling back to original LaTeX:", err);
          return orig.call(this, latex, options);
        }
      };
      this.unpatchFns.push(() => {
        mathJax.tex2svg = orig;
      });
    }

    // 4. Hook tex2svgPromise
    if (typeof mathJax.tex2svgPromise === "function") {
      const orig = mathJax.tex2svgPromise;
      mathJax.tex2svgPromise = async function (this: unknown, latex: string, options?: unknown) {
        if (!self.isEnabled()) return orig.call(this, latex, options);
        try {
          const transformed = transform(latex);
          return await handleAsyncResult(
            orig.call(this, transformed, options),
            orig,
            this,
            latex,
            transformed,
            options
          );
        } catch (err) {
          console.warn("Color Math: Exception during tex2svgPromise, falling back to original LaTeX:", err);
          return await orig.call(this, latex, options);
        }
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
      } catch {
        // ignore
      }
    }
    this.unpatchFns = [];
  }
}
