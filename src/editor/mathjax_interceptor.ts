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

interface DomErrorCandidate {
  getAttribute?: (name: string) => string | null;
  title?: string;
  textContent?: string | null;
}

interface DomQueryableCandidate {
  getAttribute?: (name: string) => string | null;
  querySelector?: (selectors: string) => DomErrorCandidate | null;
  find?: (selector: string) => DomErrorCandidate | null;
}

export type ErrorDisplayMode = "inline" | "fallback" | "notice" | "native";

export class MathJaxInterceptor {
  private unpatchFns: (() => void)[] = [];
  private getPalette: () => ColorPalette;
  private getOptions: () => ColorMathOptions;
  private isEnabled: () => boolean;
  private getErrorMode: () => ErrorDisplayMode;
  private lastNoticeTime: number = 0;

  constructor(
    getPalette: () => ColorPalette,
    getOptions: () => ColorMathOptions,
    isEnabled: () => boolean = () => true,
    getErrorMode: () => ErrorDisplayMode = () => "inline"
  ) {
    this.getPalette = getPalette;
    this.getOptions = getOptions;
    this.isEnabled = isEnabled;
    this.getErrorMode = getErrorMode;
  }

  private notifyUserError(errorMsg: string): void {
    const now = Date.now();
    if (now - this.lastNoticeTime > 4000) {
      this.lastNoticeTime = now;
      new Notice(`Color Math: LaTeX syntax issue — ${errorMsg}`, 5000);
    }
  }

  private installed: boolean = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount: number = 0;

  isInstalled(): boolean {
    return this.installed;
  }

  async install(onSuccess?: () => void): Promise<boolean> {
    if (this.installed) {
      return true;
    }

    try {
      await loadMathJax();
    } catch (e) {
      console.error("Color Math: Failed to load MathJax", e);
    }

    const mathJax = (window as Window & { MathJax?: MathJaxObject })?.MathJax;
    if (!mathJax || typeof mathJax.tex2chtml !== "function") {
      this.scheduleRetry(onSuccess);
      return false;
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

    // 1. Hook tex2chtml
    if (typeof mathJax.tex2chtml === "function") {
      const orig = mathJax.tex2chtml;
      mathJax.tex2chtml = (latex: string, options?: unknown) => {
        if (!this.isEnabled()) return orig.call(mathJax, latex, options);
        try {
          const transformed = transform(latex);
          const res = orig.call(mathJax, transformed, options);
          return this.handleResult(res, orig, mathJax, latex, transformed, options);
        } catch (err) {
          console.warn("Color Math: Exception during tex2chtml, falling back to original LaTeX:", err);
          return orig.call(mathJax, latex, options);
        }
      };
      this.unpatchFns.push(() => {
        mathJax.tex2chtml = orig;
      });
    }

    // 2. Hook tex2chtmlPromise
    if (typeof mathJax.tex2chtmlPromise === "function") {
      const orig = mathJax.tex2chtmlPromise;
      mathJax.tex2chtmlPromise = async (latex: string, options?: unknown) => {
        if (!this.isEnabled()) return orig.call(mathJax, latex, options);
        try {
          const transformed = transform(latex);
          return await this.handleAsyncResult(
            orig.call(mathJax, transformed, options),
            orig,
            mathJax,
            latex,
            transformed,
            options
          );
        } catch (err) {
          console.warn("Color Math: Exception during tex2chtmlPromise, falling back to original LaTeX:", err);
          return await orig.call(mathJax, latex, options);
        }
      };
      this.unpatchFns.push(() => {
        mathJax.tex2chtmlPromise = orig;
      });
    }

    // 3. Hook tex2svg
    if (typeof mathJax.tex2svg === "function") {
      const orig = mathJax.tex2svg;
      mathJax.tex2svg = (latex: string, options?: unknown) => {
        if (!this.isEnabled()) return orig.call(mathJax, latex, options);
        try {
          const transformed = transform(latex);
          const res = orig.call(mathJax, transformed, options);
          return this.handleResult(res, orig, mathJax, latex, transformed, options);
        } catch (err) {
          console.warn("Color Math: Exception during tex2svg, falling back to original LaTeX:", err);
          return orig.call(mathJax, latex, options);
        }
      };
      this.unpatchFns.push(() => {
        mathJax.tex2svg = orig;
      });
    }

    // 4. Hook tex2svgPromise
    if (typeof mathJax.tex2svgPromise === "function") {
      const orig = mathJax.tex2svgPromise;
      mathJax.tex2svgPromise = async (latex: string, options?: unknown) => {
        if (!this.isEnabled()) return orig.call(mathJax, latex, options);
        try {
          const transformed = transform(latex);
          return await this.handleAsyncResult(
            orig.call(mathJax, transformed, options),
            orig,
            mathJax,
            latex,
            transformed,
            options
          );
        } catch (err) {
          console.warn("Color Math: Exception during tex2svgPromise, falling back to original LaTeX:", err);
          return await orig.call(mathJax, latex, options);
        }
      };
      this.unpatchFns.push(() => {
        mathJax.tex2svgPromise = orig;
      });
    }

    this.installed = true;
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryCount = 0;
    onSuccess?.();
    return true;
  }

  private scheduleRetry(onSuccess?: () => void): void {
    if (this.installed || this.retryCount >= 10) return;
    const delays = [100, 250, 500, 1000, 2000, 3000, 4000];
    const delay = delays[Math.min(this.retryCount, delays.length - 1)];
    this.retryCount++;
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
    }
    this.retryTimer = window.setTimeout(() => {
      void this.install(onSuccess);
    }, delay);
  }

  private formatSafeErrorLatex(msg: string): string {
    const escaped = msg
      .replace(/\\/g, "/")
      .replace(/[{}^_%$&#~]/g, " ");
    return `\\textcolor{#f7768e}{\\text{[Color Math: ${escaped}]}}`;
  }

  private getMathJaxError(el: unknown): string | null {
    if (!el || typeof el !== "object") return null;
    const dom = el as DomQueryableCandidate;
    if (typeof dom.getAttribute === "function") {
      const errAttr = dom.getAttribute("data-mjx-error");
      if (errAttr) return errAttr;
    }

    let errNode: DomErrorCandidate | null = null;
    if (typeof dom.querySelector === "function") {
      errNode = dom.querySelector(".merror, [data-mjx-error], mjx-merror");
    } else if (typeof dom.find === "function") {
      errNode = dom.find(".merror, [data-mjx-error], mjx-merror");
    }

    if (errNode) {
      const attrError =
        typeof errNode.getAttribute === "function"
          ? errNode.getAttribute("data-mjx-error")
          : null;
      const attrTitle =
        typeof errNode.getAttribute === "function"
          ? errNode.getAttribute("title")
          : errNode.title;
      const textContent = errNode.textContent?.trim();
      return attrError || attrTitle || textContent || "LaTeX syntax error";
    }
    return null;
  }

  private handleResult<T extends HTMLElement | SVGElement>(
    result: T,
    origFn: (latex: string, options?: unknown) => T,
    context: unknown,
    originalLatex: string,
    transformedLatex: string,
    options?: unknown
  ): T {
    const errorMsg = this.getMathJaxError(result);
    if (errorMsg) {
      console.warn("Color Math: MathJax rendered error for colored LaTeX:", {
        error: errorMsg,
        original: originalLatex,
        transformed: transformedLatex,
      });

      const mode = this.getErrorMode();
      if (mode === "native") {
        return result;
      }

      if (mode === "notice") {
        this.notifyUserError(errorMsg);
      }

      if (mode === "inline") {
        try {
          const inlineErrorLatex = this.formatSafeErrorLatex(errorMsg);
          const inlineEl = origFn.call(context, inlineErrorLatex, options);
          if (inlineEl && typeof (inlineEl as Element).setAttribute === "function") {
            (inlineEl as Element).setAttribute(
              "title",
              `Color Math Error: ${errorMsg}\nOriginal: ${originalLatex}\nTransformed: ${transformedLatex}`
            );
          }
          return inlineEl;
        } catch {
          // fallback
        }
      }

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
  }

  private async handleAsyncResult<T extends HTMLElement | SVGElement>(
    resultPromise: Promise<T>,
    origFn: (latex: string, options?: unknown) => Promise<T>,
    context: unknown,
    originalLatex: string,
    transformedLatex: string,
    options?: unknown
  ): Promise<T> {
    const result = await resultPromise;
    const errorMsg = this.getMathJaxError(result);
    if (errorMsg) {
      console.warn("Color Math: MathJax rendered error for colored LaTeX (async):", {
        error: errorMsg,
        original: originalLatex,
        transformed: transformedLatex,
      });

      const mode = this.getErrorMode();
      if (mode === "native") {
        return result;
      }

      if (mode === "notice") {
        this.notifyUserError(errorMsg);
      }

      if (mode === "inline") {
        try {
          const inlineErrorLatex = this.formatSafeErrorLatex(errorMsg);
          const inlineEl = await origFn.call(context, inlineErrorLatex, options);
          if (inlineEl && typeof (inlineEl as Element).setAttribute === "function") {
            (inlineEl as Element).setAttribute(
              "title",
              `Color Math Error: ${errorMsg}\nOriginal: ${originalLatex}\nTransformed: ${transformedLatex}`
            );
          }
          return inlineEl;
        } catch {
          // fallback
        }
      }

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
  }

  uninstall(): void {
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    for (const unpatch of this.unpatchFns) {
      try {
        unpatch();
      } catch {
        // ignore
      }
    }
    this.unpatchFns = [];
    this.installed = false;
  }
}
