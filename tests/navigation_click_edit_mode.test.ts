// tests/navigation_click_edit_mode.test.ts
//! Verifies that disabling targeted math navigation ("Targeted rendered-math click navigation"
//! in Life Quality settings) does NOT swallow click events on math blocks in Live Preview,
//! allowing Obsidian to naturally receive the click and unfold the block into edit mode.

import { describe, it, expect, vi } from "vitest";
import { createColorMathLivePlugin } from "../src/editor/live_preview";
import { DEFAULT_OPTIONS, ColorMathOptions } from "../src/config";

describe("Live Preview Math Click & Edit Mode Yielding", () => {
  it("does not preventDefault or stopPropagation on click when targetedMathNavigation is false", () => {
    let currentOptions: ColorMathOptions = {
      ...DEFAULT_OPTIONS,
      targetedMathNavigation: false,
    };

    const listeners: Record<string, Function> = {};
    const mockDom: any = {
      addEventListener: (type: string, fn: Function) => {
        listeners[type] = fn;
      },
      removeEventListener: (type: string) => {
        delete listeners[type];
      },
      querySelectorAll: () => [],
    };

    const mockView: any = {
      dom: mockDom,
      state: {
        doc: {
          lineAt: () => ({ number: 1, from: 0, to: 10 }),
          sliceString: () => "$$ x = 1 $$",
          length: 11,
        },
        selection: {
          main: { from: 0, to: 0, anchor: 0, head: 0 },
        },
      },
      visibleRanges: [{ from: 0, to: 11 }],
      dispatch: vi.fn(),
    };

    const pluginExtension: any = createColorMathLivePlugin(
      () => {},
      () => currentOptions
    );

    // Instantiate plugin with our mockView
    const pluginInstance = pluginExtension.create(mockView);

    const mockMathContainer: any = {
      matches: (sel: string) => sel.includes("mjx-container") || sel.includes(".MathJax"),
      closest: (sel: string) => (sel.includes("mjx-container") || sel.includes(".MathJax") ? mockMathContainer : null),
    };

    const mockTarget: any = {
      closest: (sel: string) => (sel.includes("mjx-container") || sel.includes(".MathJax") ? mockMathContainer : null),
    };

    let prevented = false;
    let stopped = false;
    const clickEvent: any = {
      target: mockTarget,
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => {
        stopped = true;
      },
    };

    // Trigger click handler directly
    listeners["click"](clickEvent);

    // Targeted math navigation is false -> click MUST pass through to Obsidian untouched!
    expect(prevented).toBe(false);
    expect(stopped).toBe(false);

    pluginInstance.destroy();
  });

  it("does not swallow click events when targetedMathNavigation is true but no navigation selection occurred", () => {
    let currentOptions: ColorMathOptions = {
      ...DEFAULT_OPTIONS,
      targetedMathNavigation: true,
    };

    const listeners: Record<string, Function> = {};
    const mockDom: any = {
      addEventListener: (type: string, fn: Function) => {
        listeners[type] = fn;
      },
      removeEventListener: (type: string) => {
        delete listeners[type];
      },
      querySelectorAll: () => [],
    };

    const mockView: any = {
      dom: mockDom,
      state: {
        doc: {
          lineAt: () => ({ number: 1, from: 0, to: 10 }),
          sliceString: () => "$$ y = 2 $$",
          length: 11,
        },
        selection: {
          main: { from: 0, to: 0, anchor: 0, head: 0 },
        },
      },
      visibleRanges: [{ from: 0, to: 11 }],
      dispatch: vi.fn(),
    };

    const pluginExtension: any = createColorMathLivePlugin(
      () => {},
      () => currentOptions
    );

    const pluginInstance = pluginExtension.create(mockView);

    const mockMathContainer: any = {
      matches: (sel: string) => sel.includes("mjx-container") || sel.includes(".MathJax"),
      closest: (sel: string) => (sel.includes("mjx-container") || sel.includes(".MathJax") ? mockMathContainer : null),
    };

    const mockTarget: any = {
      closest: (sel: string) => (sel.includes("mjx-container") || sel.includes(".MathJax") ? mockMathContainer : null),
    };

    let prevented = false;
    let stopped = false;
    const clickEvent: any = {
      target: mockTarget,
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => {
        stopped = true;
      },
    };

    // Click without prior onMouseDown selection
    listeners["click"](clickEvent);

    expect(prevented).toBe(false);
    expect(stopped).toBe(false);

    pluginInstance.destroy();
  });

  it("suppresses click when navigation selection was explicitly dispatched by Color Math", () => {
    let currentOptions: ColorMathOptions = {
      ...DEFAULT_OPTIONS,
      targetedMathNavigation: true,
    };

    const listeners: Record<string, Function> = {};
    const mockDom: any = {
      addEventListener: (type: string, fn: Function) => {
        listeners[type] = fn;
      },
      removeEventListener: (type: string) => {
        delete listeners[type];
      },
      querySelectorAll: () => [],
    };

    const mockView: any = {
      dom: mockDom,
      state: {
        doc: {
          lineAt: () => ({ number: 1, from: 0, to: 10 }),
          sliceString: () => "$$ z = 3 $$",
          length: 11,
        },
        selection: {
          main: { from: 0, to: 0, anchor: 0, head: 0 },
        },
      },
      visibleRanges: [{ from: 0, to: 11 }],
      dispatch: vi.fn(),
      focus: vi.fn(),
    };

    const pluginExtension: any = createColorMathLivePlugin(
      () => {},
      () => currentOptions
    );

    const pluginInstance = pluginExtension.create(mockView);

    // Simulate navigation selection was initiated (as applyNavigationSelection does)
    pluginInstance.suppressNextClick = true;
    pluginInstance.lastNavigationSelection = { anchor: 3, head: 4 };

    let prevented = false;
    let stopped = false;
    const clickEvent: any = {
      target: mockDom,
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => {
        stopped = true;
      },
    };

    listeners["click"](clickEvent);

    // Must be suppressed to protect custom sub-expression selection from Obsidian overwrite
    expect(prevented).toBe(true);
    expect(stopped).toBe(true);
    // Flags must be cleanly reset
    expect(pluginInstance.suppressNextClick).toBe(false);
    expect(pluginInstance.lastNavigationSelection).toBe(null);

    pluginInstance.destroy();
  });
});
