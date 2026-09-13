import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MathJaxInterceptor } from "../src/editor/mathjax_interceptor";
import { DEFAULT_COLORS } from "../src/config";

vi.mock("obsidian", () => {
  return {
    loadMathJax: vi.fn().mockResolvedValue(undefined),
    Notice: vi.fn(),
  };
});

class MockElement {
  public tagName: string;
  public textContent: string = "";
  public attributes: Record<string, string> = {};
  public children: MockElement[] = [];

  constructor(tagName: string = "mjx-container") {
    this.tagName = tagName;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  querySelector(selector: string): MockElement | null {
    if (selector.includes("merror") && this.attributes["data-mjx-error"]) {
      return this;
    }
    for (const child of this.children) {
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
}

describe("MathJaxInterceptor Headless Unit Tests", () => {
  let mockMathJax: {
    tex2chtml: (latex: string, options?: unknown) => unknown;
    tex2chtmlPromise: (latex: string, options?: unknown) => Promise<unknown>;
    tex2svg: (latex: string, options?: unknown) => unknown;
    tex2svgPromise: (latex: string, options?: unknown) => Promise<unknown>;
  };
  let capturedTexCalls: string[] = [];

  beforeEach(() => {
    capturedTexCalls = [];
    mockMathJax = {
      tex2chtml: (latex: string) => {
        capturedTexCalls.push(latex);
        const el = new MockElement("mjx-container");
        if (latex.includes("\\brokenSyntax")) {
          el.setAttribute("data-mjx-error", "Undefined control sequence");
        }
        return el;
      },
      tex2chtmlPromise: async (latex: string) => {
        capturedTexCalls.push(latex);
        const el = new MockElement("mjx-container");
        if (latex.includes("\\brokenSyntax")) {
          el.setAttribute("data-mjx-error", "Undefined control sequence");
        }
        return el;
      },
      tex2svg: (latex: string) => {
        capturedTexCalls.push(latex);
        return new MockElement("svg");
      },
      tex2svgPromise: async (latex: string) => {
        capturedTexCalls.push(latex);
        return new MockElement("svg");
      },
    };

    (globalThis as any).window = {
      MathJax: mockMathJax,
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  it("installs and intercepts tex2chtml with transformed colored LaTeX", async () => {
    const interceptor = new MathJaxInterceptor(
      () => DEFAULT_COLORS,
      () => ({ enableTaxonomy: true }),
      () => true,
      () => "fallback"
    );

    const originalFn = mockMathJax.tex2chtml;
    await interceptor.install();

    expect((window as any).MathJax.tex2chtml).not.toBe(originalFn);

    // Call intercepted tex2chtml
    const result = (window as any).MathJax.tex2chtml("f(x) = y") as MockElement;

    expect(result).toBeDefined();
    expect(capturedTexCalls).toHaveLength(1);
    expect(capturedTexCalls[0]).toContain("\\textcolor");

    // Uninstall restores original function
    interceptor.uninstall();
    expect((window as any).MathJax.tex2chtml).toBe(originalFn);
  });

  it("passes through uncolored LaTeX when disabled", async () => {
    const interceptor = new MathJaxInterceptor(
      () => DEFAULT_COLORS,
      () => ({ enableTaxonomy: true }),
      () => false, // disabled
      () => "fallback"
    );

    await interceptor.install();

    (window as any).MathJax.tex2chtml("f(x) = y");

    expect(capturedTexCalls).toHaveLength(1);
    expect(capturedTexCalls[0]).toBe("f(x) = y");

    interceptor.uninstall();
  });

  it("falls back to original LaTeX when syntax error is produced in fallback mode", async () => {
    const interceptor = new MathJaxInterceptor(
      () => DEFAULT_COLORS,
      () => ({ enableTaxonomy: true }),
      () => true,
      () => "fallback"
    );

    await interceptor.install();

    // Passing input with \brokenSyntax will trigger error branch in handleResult
    const res = (window as any).MathJax.tex2chtml("\\brokenSyntax") as MockElement;

    expect(res.getAttribute("title")).toContain("Color Math: Rendered uncolored formula");

    interceptor.uninstall();
  });

  it("formats inline error message when in inline error mode", async () => {
    const interceptor = new MathJaxInterceptor(
      () => DEFAULT_COLORS,
      () => ({ enableTaxonomy: true }),
      () => true,
      () => "inline"
    );

    await interceptor.install();

    const res = (window as any).MathJax.tex2chtml("\\brokenSyntax") as MockElement;

    expect(res.getAttribute("title")).toContain("Color Math Error:");

    interceptor.uninstall();
  });

  it("intercepts async tex2chtmlPromise identically", async () => {
    const interceptor = new MathJaxInterceptor(
      () => DEFAULT_COLORS,
      () => ({ enableTaxonomy: true }),
      () => true,
      () => "fallback"
    );

    await interceptor.install();

    const result = await (window as any).MathJax.tex2chtmlPromise("f(x) = y");
    expect(result).toBeDefined();
    expect(capturedTexCalls[0]).toContain("\\textcolor");

    interceptor.uninstall();
  });
});
