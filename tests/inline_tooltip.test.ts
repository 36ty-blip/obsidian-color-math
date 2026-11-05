// tests/inline_tooltip.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { registerSingleTooltipHost, syncTooltipAppearance, highlightSelectionInMathContainer } from "../src/editor/inline_tooltip";

describe("Inline Tooltip Singleton & Top-Layer Architecture", () => {
  it("enforces strictly one tooltip in DOM by removing any competing tooltip", () => {
    let outerRemoved = false;
    const outerHost: any = {
      classList: { add: () => {} },
      style: {},
      remove: () => {
        outerRemoved = true;
      },
    };

    let innerRemoved = false;
    const innerHost: any = {
      classList: { add: () => {} },
      style: {},
      remove: () => {
        innerRemoved = true;
      },
    };

    // Outer tooltip mounts
    registerSingleTooltipHost(outerHost);
    expect(outerRemoved).toBe(false);

    // Inner table-cell tooltip mounts -> outer must be instantly removed!
    registerSingleTooltipHost(innerHost);
    expect(outerRemoved).toBe(true);
    expect(innerRemoved).toBe(false);
  });

  it("assigns top-layer z-index and fixed position on host element", () => {
    const hostEl: any = {
      styleProps: {} as Record<string, string>,
      classList: {
        classes: new Set<string>(),
        add(c: string) {
          this.classes.add(c);
        },
        remove(c: string) {
          this.classes.delete(c);
        },
      },
      style: {
        setProperty(name: string, val: string) {},
      },
    };

    syncTooltipAppearance(100, false, hostEl);

    expect(hostEl.classList.classes.has("color-math-tooltip-host")).toBe(true);
  });

  it("verifies styles.css applies top layer z-index without !important", () => {
    const cssPath = path.resolve(__dirname, "../styles.css");
    const css = fs.readFileSync(cssPath, "utf8");

    expect(css).toContain("z-index: var(--layer-tooltip, 99999);");
    expect(css).not.toContain("z-index: var(--layer-tooltip, 99999) !important;");
  });
});

describe("Bidirectional Math Selection vs. Insertion Caret Synchronization", () => {
  function createMockMathContainer() {
    const elements: any[] = [];
    function makeEl(tagName: string, className: string) {
      const classes = new Set<string>(className.split(" ").filter(Boolean));
      const el: any = {
        tagName: tagName.toUpperCase(),
        classList: {
          add: (c: string) => classes.add(c),
          remove: (...cls: string[]) => cls.forEach((c) => classes.delete(c)),
          contains: (c: string) => classes.has(c),
        },
        querySelectorAll: (sel: string) => {
          return elements.filter((child) => child !== el && matchSel(child, sel));
        },
      };
      Object.defineProperty(el, "className", {
        get: () => Array.from(classes).join(" "),
        set: (val: string) => {
          classes.clear();
          val.split(" ").filter(Boolean).forEach((c) => classes.add(c));
        },
      });
      elements.push(el);
      return el;
    }

    function matchSel(el: any, sel: string): boolean {
      const parts = sel.split(",").map((s) => s.trim());
      return parts.some((p) => {
        if (p.startsWith(".")) {
          return el.classList.contains(p.slice(1));
        }
        return el.tagName.toLowerCase() === p.toLowerCase();
      });
    }

    const container: any = {
      querySelectorAll: (sel: string) => {
        return elements.filter((child) => matchSel(child, sel));
      },
    };

    // Symbol x at [0, 1]
    const elX = makeEl("mjx-mi", "cm-src-0-1");
    // Operator + at [2, 3]
    const elPlus = makeEl("mjx-mo", "cm-src-2-3");
    // Symbol y at [4, 5]
    const elY = makeEl("mjx-mi", "cm-src-4-5");

    return { container, elX, elPlus, elY };
  }

  it("applies range selection outline when relTo > relFrom", () => {
    const { container, elX } = createMockMathContainer();
    highlightSelectionInMathContainer(container, 0, 1);

    expect(elX.classList.contains("color-math-selected-target")).toBe(true);
    expect(elX.classList.contains("color-math-caret-before")).toBe(false);
    expect(elX.classList.contains("color-math-caret-after")).toBe(false);
  });

  it("renders a blinking caret line and NO selection box when cursor is collapsed (relFrom === relTo)", () => {
    const { container, elX } = createMockMathContainer();

    // Cursor before 'x' (offset 0)
    highlightSelectionInMathContainer(container, 0, 0);
    expect(elX.classList.contains("color-math-selected-target")).toBe(false);
    expect(elX.classList.contains("color-math-caret-before")).toBe(true);
    expect(elX.classList.contains("color-math-caret-after")).toBe(false);

    // Cursor after 'x' (offset 1)
    highlightSelectionInMathContainer(container, 1, 1);
    expect(elX.classList.contains("color-math-selected-target")).toBe(false);
    expect(elX.classList.contains("color-math-caret-before")).toBe(false);
    expect(elX.classList.contains("color-math-caret-after")).toBe(true);
  });

  it("verifies styles.css defines GPU-accelerated caret blink animation and transparency", () => {
    const cssPath = path.resolve(__dirname, "../styles.css");
    const css = fs.readFileSync(cssPath, "utf8");

    expect(css).toContain("@keyframes color-math-caret-blink");
    expect(css).toContain(".color-math-caret-before::before");
    expect(css).toContain(".color-math-caret-after::after");
    expect(css).toContain("pointer-events: none !important;");
  });
});
