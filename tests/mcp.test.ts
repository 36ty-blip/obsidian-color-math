// tests/mcp.test.ts

import { describe, it, expect, vi } from "vitest";
import { registerColorMathMcpTools, getLocalRestApi, LOCAL_REST_API_PLUGIN_ID } from "../src/mcp";
import type ColorMathPlugin from "../src/main";
import { DEFAULT_COLORS } from "../src/config";

describe("Color Math MCP Extension Integration", () => {
  it("gracefully returns null if Local REST API plugin is not present", () => {
    const fakePlugin = {
      app: {
        plugins: {
          plugins: {},
        },
      },
      manifest: { id: "obsidian-color-math", name: "Color Math", version: "1.0.7" },
    } as unknown as ColorMathPlugin;

    const cleanup = registerColorMathMcpTools(fakePlugin);
    expect(cleanup).toBeNull();
  });

  it("gracefully returns undefined if host apiVersion is below 2", () => {
    const fakePlugin = {
      app: {
        plugins: {
          plugins: {
            [LOCAL_REST_API_PLUGIN_ID]: {
              getPublicApi: () => ({
                apiVersion: 1,
                addMcpTool: vi.fn(),
              }),
            },
          },
        },
      },
      manifest: { id: "obsidian-color-math", name: "Color Math", version: "1.0.7" },
    } as unknown as ColorMathPlugin;

    const api = getLocalRestApi(fakePlugin.app, fakePlugin.manifest, 2);
    expect(api).toBeUndefined();
  });

  it("successfully registers all 4 MCP tools and unregisters on teardown", async () => {
    const registeredTools = new Map<string, { description: string; schema: any; callback: any; annotations: any }>();
    const unregisterMock = vi.fn();

    const mockApi = {
      apiVersion: 2,
      addMcpTool: vi.fn((name, description, schema, callback, annotations) => {
        registeredTools.set(name, { description, schema, callback, annotations });
      }),
      unregister: unregisterMock,
    };

    const fakePlugin = {
      app: {
        plugins: {
          plugins: {
            [LOCAL_REST_API_PLUGIN_ID]: {
              getPublicApi: () => mockApi,
            },
          },
        },
        vault: {
          getAbstractFileByPath: vi.fn(),
          read: vi.fn(),
          modify: vi.fn(),
        },
      },
      manifest: { id: "obsidian-color-math", name: "Color Math", version: "1.0.7" },
      settings: {
        palette: { ...DEFAULT_COLORS },
        liveRendering: true,
        livePreviewHighlighting: false,
      },
      getMathOptions: () => ({
        enableTaxonomy: true,
        rainbowDelimiters: true,
        variableDataFlow: false,
        colorUnits: true,
        colorDifferentials: true,
        colorBraKet: true,
        colorDimensionless: true,
        extendedFunctions: true,
      }),
    } as unknown as ColorMathPlugin;

    const cleanup = registerColorMathMcpTools(fakePlugin);
    expect(cleanup).not.toBeNull();
    expect(registeredTools.size).toBe(4);
    expect(registeredTools.has("color_math_convert_text")).toBe(true);
    expect(registeredTools.has("color_math_uncolor_text")).toBe(true);
    expect(registeredTools.has("color_math_colorize_note")).toBe(true);
    expect(registeredTools.has("color_math_get_settings")).toBe(true);

    // Test color_math_convert_text callback
    const convertTool = registeredTools.get("color_math_convert_text")!;
    const convertRes = (await convertTool.callback({ text: "Here is math: $$\\frac{df}{dx}$$" })) as any;
    expect(convertRes.changed).toBe(true);
    expect(convertRes.result).toContain("\\textcolor");

    // Test color_math_uncolor_text callback
    const uncolorTool = registeredTools.get("color_math_uncolor_text")!;
    const uncolorRes = (await uncolorTool.callback({ text: convertRes.result })) as any;
    expect(uncolorRes.changed).toBe(true);
    expect(uncolorRes.result).not.toContain("\\textcolor");

    // Test color_math_get_settings callback
    const settingsTool = registeredTools.get("color_math_get_settings")!;
    const settingsRes = (await settingsTool.callback({})) as any;
    expect(settingsRes.palette).toBeDefined();
    expect(settingsRes.options.enableTaxonomy).toBe(true);

    // Test cleanup
    cleanup!();
    expect(unregisterMock).toHaveBeenCalledTimes(1);
  });
});
