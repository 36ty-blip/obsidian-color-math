// src/editor/mathjax_interceptor.ts

import { loadMathJax, Notice } from "obsidian";
import { ColorPalette, ColorMathOptions, getLiveCssPalette } from "../config";
import { colorLatexBody } from "../converters/generic";
import { stampMathJaxDOM } from "./dom_stamper";
import { RenderCacheData, hydrateElementFromHtml } from "../cache/render_cache";

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

export function computeMathHash(latex: string, contextKey: string = ""): string {
  let h = 0x811c9dc5 >>> 0;
  const str = latex + "\0" + contextKey;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function isQueryableElement(val: unknown): val is Element {
  if (!val || typeof val !== "object") return false;
  return "querySelectorAll" in val && typeof val.querySelectorAll === "function";
}

export class MathJaxInterceptor {
  private unpatchFns: (() => void)[] = [];
  private getPalette: () => ColorPalette;
  private getOptions: () => ColorMathOptions;
  private isEnabled: () => boolean;
  private getErrorMode: () => ErrorDisplayMode;
  private isSourceMode?: () => boolean;
  private lastNoticeTime: number = 0;
  private renderCache = new Map<string, HTMLElement | SVGElement>();
  private maxCacheEntries: number = 500;
  private persistentCache: RenderCacheData | null = null;
  private onCacheDirty?: () => void;
  private pluginVersion: string = "";

  setPluginVersion(version: string): void {
    this.pluginVersion = version;
  }

  clearCache(): void {
    this.renderCache.clear();
    if (this.persistentCache && this.persistentCache.renders) {
      this.persistentCache.renders = {};
      if (this.onCacheDirty) {
        this.onCacheDirty();
      }
    }
  }

  setPersistentCache(cache: RenderCacheData | null, onDirty?: () => void): void {
    this.persistentCache = cache;
    this.onCacheDirty = onDirty;
  }

  getPersistentCache(): RenderCacheData | null {
    return this.persistentCache;
  }

  private getContextKey(): string {
    const p = this.getPalette();
    const o = this.getOptions();
    const rainbow = (o.rainbowColors || []).join(",");
    // Encode roles that are explicitly configured as "none" to preserve clean AST suppression.
    // Hex colors themselves are not in the key because CSS variables decouple color updates.
    const noneRoles = Object.entries(p)
      .filter(([_, val]) => val === "none")
      .map(([k]) => k)
      .sort()
      .join(",");
    const vPrefix = this.pluginVersion ? `v:${this.pluginVersion}` : "";
    return [
      vPrefix,
      noneRoles,
      rainbow,
      o.activeMode || "",
      o.enableTaxonomy ? "t1" : "t0",
      o.colorUnits ? "u1" : "u0",
      o.rainbowDelimiters ? "r1" : "r0",
      o.variableDataFlow ? "v1" : "v0",
      o.colorDifferentials ? "d1" : "d0",
      o.colorBraKet ? "b1" : "b0",
    ].filter(Boolean).join("|");
  }

  private isChtmlStylesheetReady(): boolean {
    if (typeof document === "undefined" || !document.head || typeof document.head.querySelector !== "function") return true;
    const style = document.head.querySelector("style#MJX-CHTML-styles");
    return style !== null && (style.textContent?.length ?? 0) > 50;
  }

  private getCachedElement<T extends HTMLElement | SVGElement>(hash: string, latex?: string): T | null {
    const cached = this.renderCache.get(hash);
    if (cached) {
      // Read Gate: detect and evict toxic cached errors
      if (this.getMathJaxError(cached)) {
        this.renderCache.delete(hash);
        if (this.persistentCache?.renders?.[hash]) {
          delete this.persistentCache.renders[hash];
          if (this.onCacheDirty) this.onCacheDirty();
        }
      } else {
        if ("cloneNode" in cached && typeof cached.cloneNode === "function") {
          return cached.cloneNode(true) as T;
        }
        return cached as T;
      }
    }

    // Secondary check: Persistent Zero-MathJax Render Cache
    // Guard: Only hydrate from disk cache if MathJax's CHTML stylesheet exists in <head>.
    // If <head> has no MathJax stylesheet (e.g. cold boot or after reload), bypass persistent cache
    // so MathJax natively compiles at least once, populating <head> with glyph metrics!
    if (this.persistentCache && this.persistentCache.renders && this.persistentCache.renders[hash]) {
      if (!this.isChtmlStylesheetReady()) {
        return null;
      }
      const record = this.persistentCache.renders[hash];
      record.ts = Date.now();
      const hydrated = hydrateElementFromHtml<T>(record.html);
      if (hydrated) {
        // Read Gate: auto-purge toxic cached error markup from disk
        const err = this.getMathJaxError(hydrated);
        if (err) {
          delete this.persistentCache.renders[hash];
          this.renderCache.delete(hash);
          if (this.onCacheDirty) this.onCacheDirty();
          return null;
        }

        if (latex && this.getOptions().targetedMathNavigation !== false && isQueryableElement(hydrated)) {
          stampMathJaxDOM(hydrated, latex);
        }
        // Seed into in-memory cache for O(1) repeat hits without re-serializing
        this.cacheElement(hash, hydrated, record.display, false);
        return hydrated;
      }
    }

    return null;
  }

  private cacheElement<T extends HTMLElement | SVGElement>(
    hash: string,
    el: T,
    isDisplay: boolean = false,
    persist: boolean = true
  ): void {
    if (!el) return;
    // Write Gate: Strictly NEVER cache MathJax error elements
    if (this.getMathJaxError(el)) {
      this.renderCache.delete(hash);
      if (this.persistentCache?.renders?.[hash]) {
        delete this.persistentCache.renders[hash];
        if (this.onCacheDirty) this.onCacheDirty();
      }
      return;
    }

    if ("setAttribute" in el && typeof el.setAttribute === "function") {
      el.setAttribute("data-math-hash", hash);
    }
    if (this.renderCache.size >= this.maxCacheEntries) {
      const firstKey = this.renderCache.keys().next().value;
      if (firstKey) this.renderCache.delete(firstKey);
    }
    if ("cloneNode" in el && typeof el.cloneNode === "function") {
      this.renderCache.set(hash, el.cloneNode(true) as HTMLElement | SVGElement);
    } else {
      this.renderCache.set(hash, el);
    }

    // Persist serialized markup for instant Zero-MathJax startup on subsequent sessions
    if (persist && this.persistentCache && this.persistentCache.renders && "outerHTML" in el && typeof (el as any).outerHTML === "string") {
      this.persistentCache.renders[hash] = {
        html: (el as any).outerHTML,
        display: isDisplay,
        ts: Date.now(),
      };
      if (this.onCacheDirty) {
        this.onCacheDirty();
      }
    }
  }

  constructor(
    getPalette: () => ColorPalette,
    getOptions: () => ColorMathOptions,
    isEnabled: () => boolean = () => true,
    getErrorMode: () => ErrorDisplayMode = () => "inline",
    isSourceMode?: () => boolean
  ) {
    this.getPalette = getPalette;
    this.getOptions = getOptions;
    this.isEnabled = isEnabled;
    this.getErrorMode = getErrorMode;
    this.isSourceMode = isSourceMode;
  }

  private notifyUserError(errorMsg: string): void {
    const now = Date.now();
    if (now - this.lastNoticeTime > 4000) {
      this.lastNoticeTime = now;
      new Notice(`Color Math: LaTeX syntax issue — ${errorMsg}`, 5000);
    }
  }

  private installed: boolean = false;
  private retryTimer: number | ReturnType<typeof setTimeout> | null = null;
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

    const mathJax = (window as Window & { MathJax?: MathJaxObject & { config?: { tex?: { linebreaks?: { inline?: boolean; display?: boolean } } } } })?.MathJax;
    if (!mathJax || typeof mathJax.tex2chtml !== "function") {
      this.scheduleRetry(onSuccess);
      return false;
    }

    if (mathJax.config?.tex && this.getOptions().mathJaxLineBreaking !== false) {
      mathJax.config.tex.linebreaks = mathJax.config.tex.linebreaks || {};
      mathJax.config.tex.linebreaks.display = true;
    }

    const transform = (latex: string): string => {
      if (!this.isEnabled()) return latex;
      if (this.isSourceMode && this.isSourceMode()) return latex;
      try {
        const opts = this.getOptions();
        const effectiveOpts = {
          ...opts,
          useCST: opts.useCST !== false,
        };
        const livePalette = getLiveCssPalette(this.getPalette());
        return colorLatexBody(latex, livePalette, effectiveOpts);
      } catch (err) {
        console.error("Color Math transformation error:", err);
        return latex;
      }
    };

    // 1. Hook tex2chtml
    if (typeof mathJax.tex2chtml === "function") {
      const orig = mathJax.tex2chtml;
      const wrappedTex2chtml = (latex: string, options?: unknown) => {
        if (!this.isEnabled()) return orig.call(mathJax, latex, options);
        const isDisplay = Boolean((options as { display?: boolean } | undefined)?.display);
        const isEphemeral = Boolean((options as { ephemeral?: boolean } | undefined)?.ephemeral);
        const hash = computeMathHash(latex, this.getContextKey() + (isDisplay ? "|D" : "|I"));
        const cached = this.getCachedElement<HTMLElement>(hash, latex);
        if (cached) return cached;
        try {
          const transformed = transform(latex);
          const res = orig.call(mathJax, transformed, options);
          const finalResult = this.handleResult(res, orig, mathJax, latex, transformed, options);
          if (isQueryableElement(finalResult)) {
            if (typeof finalResult.setAttribute === "function") {
              finalResult.setAttribute("data-math-latex", latex);
            }
            if (this.getOptions().targetedMathNavigation !== false) {
              stampMathJaxDOM(finalResult, latex);
            }
          }
          if (this.getMathJaxError(finalResult)) {
            this.renderCache.delete(hash);
            if (this.persistentCache?.renders?.[hash]) {
              delete this.persistentCache.renders[hash];
              if (this.onCacheDirty) this.onCacheDirty();
            }
          } else {
            this.cacheElement(hash, finalResult, isDisplay, !isEphemeral);
          }
          return finalResult;
        } catch (err) {
          console.warn("Color Math: Exception during tex2chtml, falling back to original LaTeX:", err);
          return orig.call(mathJax, latex, options);
        }
      };
      (wrappedTex2chtml as unknown as { __colorMathActive?: () => boolean }).__colorMathActive = () =>
        this.isEnabled() && !(this.isSourceMode && this.isSourceMode());
      mathJax.tex2chtml = wrappedTex2chtml;
      this.unpatchFns.push(() => {
        mathJax.tex2chtml = orig;
      });
    }

    // 2. Hook tex2chtmlPromise
    if (typeof mathJax.tex2chtmlPromise === "function") {
      const orig = mathJax.tex2chtmlPromise;
      mathJax.tex2chtmlPromise = async (latex: string, options?: unknown) => {
        if (!this.isEnabled()) return orig.call(mathJax, latex, options);
        const isDisplay = Boolean((options as { display?: boolean } | undefined)?.display);
        const isEphemeral = Boolean((options as { ephemeral?: boolean } | undefined)?.ephemeral);
        const hash = computeMathHash(latex, this.getContextKey() + (isDisplay ? "|D" : "|I"));
        const cached = this.getCachedElement<HTMLElement>(hash, latex);
        if (cached) return cached;
        try {
          const transformed = transform(latex);
          const finalResult = await this.handleAsyncResult(
            orig.call(mathJax, transformed, options),
            orig,
            mathJax,
            latex,
            transformed,
            options
          );
          if (isQueryableElement(finalResult)) {
            if (typeof finalResult.setAttribute === "function") {
              finalResult.setAttribute("data-math-latex", latex);
            }
            if (this.getOptions().targetedMathNavigation !== false) {
              stampMathJaxDOM(finalResult, latex);
            }
          }
          if (this.getMathJaxError(finalResult)) {
            this.renderCache.delete(hash);
            if (this.persistentCache?.renders?.[hash]) {
              delete this.persistentCache.renders[hash];
              if (this.onCacheDirty) this.onCacheDirty();
            }
          } else {
            this.cacheElement(hash, finalResult, isDisplay, !isEphemeral);
          }
          return finalResult;
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
        const hash = computeMathHash(latex, this.getContextKey());
        const cached = this.getCachedElement<SVGElement>(hash, latex);
        if (cached) return cached;
        try {
          const transformed = transform(latex);
          const res = orig.call(mathJax, transformed, options);
          const finalResult = this.handleResult(res, orig, mathJax, latex, transformed, options);
          if (this.getOptions().targetedMathNavigation !== false && isQueryableElement(finalResult)) {
            stampMathJaxDOM(finalResult, latex);
          }
          if (this.getMathJaxError(finalResult)) {
            this.renderCache.delete(hash);
            if (this.persistentCache?.renders?.[hash]) {
              delete this.persistentCache.renders[hash];
              if (this.onCacheDirty) this.onCacheDirty();
            }
          } else {
            this.cacheElement(hash, finalResult, false);
          }
          return finalResult;
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
        const hash = computeMathHash(latex, this.getContextKey());
        const cached = this.getCachedElement<SVGElement>(hash, latex);
        if (cached) return cached;
        try {
          const transformed = transform(latex);
          const finalResult = await this.handleAsyncResult(
            orig.call(mathJax, transformed, options),
            orig,
            mathJax,
            latex,
            transformed,
            options
          );
          if (this.getOptions().targetedMathNavigation !== false && isQueryableElement(finalResult)) {
            stampMathJaxDOM(finalResult, latex);
          }
          if (this.getMathJaxError(finalResult)) {
            this.renderCache.delete(hash);
            if (this.persistentCache?.renders?.[hash]) {
              delete this.persistentCache.renders[hash];
              if (this.onCacheDirty) this.onCacheDirty();
            }
          } else {
            this.cacheElement(hash, finalResult, false);
          }
          return finalResult;
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
      const titleAttr = dom.getAttribute("title");
      if (titleAttr && titleAttr.includes("Color Math Error:")) return titleAttr;
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

    if ("textContent" in (el as any) && typeof (el as any).textContent === "string") {
      const txt = (el as any).textContent as string;
      if (txt.includes("[Color Math:")) return txt;
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
    this.clearCache();
  }
}
