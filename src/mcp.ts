// src/mcp.ts

import { App, PluginManifest, TFile } from "obsidian";
import { z } from "zod";
import type ColorMathPlugin from "./main";
import { convertText } from "./converters/block";
import { uncolorText } from "./undo";

export const LOCAL_REST_API_PLUGIN_ID = "obsidian-local-rest-api";

export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface LocalRestApiPublicApi {
  readonly apiVersion: number;
  addMcpTool(
    name: string,
    description: string,
    schema: Record<string, z.ZodType>,
    callback: (args: Record<string, unknown>) => Promise<unknown>,
    annotations?: McpToolAnnotations
  ): void;
  unregister(): void;
}

interface LocalRestApiHostPlugin {
  getPublicApi(manifest: PluginManifest): LocalRestApiPublicApi;
}

interface AppWithPluginRegistry {
  plugins?: { plugins?: Record<string, unknown> };
}

/**
 * Resolves the host plugin's extension API, or `undefined` when Obsidian Local REST
 * API is not installed, disabled, or not yet loaded.
 */
export function getLocalRestApi(
  app: App,
  manifest: PluginManifest,
  requiredVersion = 2
): LocalRestApiPublicApi | undefined {
  const plugin = (app as unknown as AppWithPluginRegistry).plugins?.plugins?.[
    LOCAL_REST_API_PLUGIN_ID
  ] as LocalRestApiHostPlugin | undefined;

  if (!plugin || typeof plugin.getPublicApi !== "function") {
    return undefined;
  }

  try {
    const api = plugin.getPublicApi(manifest);
    if (!api || typeof api.addMcpTool !== "function") {
      return undefined;
    }
    const version = api.apiVersion ?? 1;
    if (version < requiredVersion) {
      console.warn(
        `Color Math: Obsidian Local REST API version ${version} found, but version ${requiredVersion}+ is required for MCP extensions.`
      );
      return undefined;
    }
    return api;
  } catch (err) {
    console.warn("Color Math: Failed to initialize Local REST API extension handle:", err);
    return undefined;
  }
}

/**
 * Registers Color Math tools into Obsidian Local REST API's running MCP server.
 * Returns a teardown function to call on plugin unload, or null if API is unavailable.
 */
export function registerColorMathMcpTools(plugin: ColorMathPlugin): (() => void) | null {
  const api = getLocalRestApi(plugin.app, plugin.manifest, 2);
  if (!api) {
    return null;
  }

  try {
    // 1. Tool: color_math_convert_text
    api.addMcpTool(
      "color_math_convert_text",
      "Converts LaTeX math expressions ($...$ and $$...$$) within the provided text, applying semantic color formatting according to Obsidian Color Math rules and active palette.",
      {
        text: z.string().describe("Markdown or LaTeX text containing math expressions to colorize"),
      },
      async (args: Record<string, unknown>) => {
        const text = String(args.text ?? "");
        const palette = plugin.settings.palette;
        const options = plugin.getMathOptions();
        const converted = convertText(text, palette, options);
        return {
          originalLength: text.length,
          convertedLength: converted.length,
          changed: converted !== text,
          result: converted,
        };
      },
      {
        title: "Colorize Math Expressions in Text",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      }
    );

    // 2. Tool: color_math_uncolor_text
    api.addMcpTool(
      "color_math_uncolor_text",
      "Strips baked color formatting (\\color{...}, \\textcolor{...}, etc.) from LaTeX math expressions within the provided text, restoring clean standard LaTeX.",
      {
        text: z.string().describe("Markdown or LaTeX text containing baked math color formatting to clean"),
      },
      async (args: Record<string, unknown>) => {
        const text = String(args.text ?? "");
        const cleaned = uncolorText(text);
        return {
          originalLength: text.length,
          cleanedLength: cleaned.length,
          changed: cleaned !== text,
          result: cleaned,
        };
      },
      {
        title: "Clean Baked Colors from Text",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      }
    );

    // 3. Tool: color_math_colorize_note
    api.addMcpTool(
      "color_math_colorize_note",
      "Applies semantic math coloring (or cleans baked colors) in a specific Obsidian markdown note file in the vault.",
      {
        path: z.string().describe("Vault-relative path to the markdown note (e.g. 'folder/note.md')"),
        undo: z
          .boolean()
          .optional()
          .describe("If true, removes baked colors instead of adding them (default: false)"),
      },
      async (args: Record<string, unknown>) => {
        const path = String(args.path ?? "").trim();
        const undo = Boolean(args.undo ?? false);

        const file = plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
          throw new Error(`File not found or not a markdown note at path: "${path}"`);
        }

        const originalContent = await plugin.app.vault.read(file);
        const newContent = undo
          ? uncolorText(originalContent)
          : convertText(originalContent, plugin.settings.palette, plugin.getMathOptions());

        const changed = newContent !== originalContent;
        if (changed) {
          await plugin.app.vault.modify(file, newContent);
        }

        return {
          path: file.path,
          action: undo ? "clean" : "colorize",
          changed,
          message: changed
            ? `Successfully ${undo ? "cleaned colors from" : "colorized math in"} ${file.path}`
            : `No changes needed; ${file.path} was already ${undo ? "clean" : "colorized"}.`,
        };
      },
      {
        title: "Colorize or Clean Math in Vault Note",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      }
    );

    // 4. Tool: color_math_get_settings
    api.addMcpTool(
      "color_math_get_settings",
      "Retrieves the active Obsidian Color Math settings, configuration toggles, and current hex color palette.",
      {},
      async () => {
        return {
          palette: plugin.settings.palette,
          options: plugin.getMathOptions(),
          liveRendering: plugin.settings.liveRendering,
          livePreviewHighlighting: plugin.settings.livePreviewHighlighting,
        };
      },
      {
        title: "Get Color Math Settings",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      }
    );

    return () => {
      try {
        api.unregister();
      } catch (e) {
        console.warn("Color Math: Error unregistering MCP tools:", e);
      }
    };
  } catch (err) {
    console.error("Color Math: Failed to register MCP tools with Local REST API:", err);
    return null;
  }
}
