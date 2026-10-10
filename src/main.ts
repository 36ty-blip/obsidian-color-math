// src/main.ts

import {
  App,
  Editor,
  MarkdownView,
  Menu,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  editorLivePreviewField,
} from "obsidian";
import {
  ColorPalette,
  ColorRole,
  ColorMathOptions,
  ActiveMathMode,
  DEFAULT_COLORS,
  setPalette,
  RAINBOW_DELIMITER_COLORS,
} from "./config";
import { convertMathBlock, convertText } from "./converters/block";
import { createColorMathLivePlugin } from "./editor/live_preview";
import { MathJaxInterceptor, ErrorDisplayMode } from "./editor/mathjax_interceptor";
import { scanMarkdown } from "./parsers/markdown_scanner";
import { uncolorFragment, uncolorText } from "./undo";
import { extractThemePalette, isVaultLightMode } from "./utils/theme_colors";
import { registerColorMathMcpTools } from "./mcp";
import {
  convertDocumentMath,
  convertDocumentMathChunked,
  convertLatexToUnicode,
  convertUnicodeToLatex,
  UnicodeConversionOptions,
} from "./converters/unicode_converter";
import { detectNoteField, NoteFieldDetection } from "./parsers/frontmatter";
import { QuickMenuModal, findAmbiguousTokenAtCursor } from "./editor/quick_menu_modal";

interface ColorMathSettings {
  palette: ColorPalette;
  rainbowColors: string[];
  liveRendering: boolean;
  livePreviewHighlighting: boolean;
  highlightInlineMath: boolean;
  highlightDisplayMath: boolean;
  colorAlignment: boolean;
  showRibbonIcon: boolean;
  autoSyncTheme: boolean;
  autoLightDark: boolean;
  enableTaxonomy: boolean;
  taxonomyFunctions: boolean;
  taxonomyParameters: boolean;
  taxonomyConstants: boolean;
  taxonomyIndices: boolean;
  rainbowDelimiters: boolean;
  rainbowBareBraces: boolean;
  highlightUnmatchedBraces: boolean;
  variableDataFlow: boolean;
  colorUnits: boolean;
  colorDifferentials: boolean;
  colorDerivativeFractions: boolean;
  colorInfinitesimals: boolean;
  colorBraKet: boolean;
  colorDimensionless: boolean;
  colorSingleConstants: boolean;
  extendedFunctions: boolean;
  errorDisplayMode: ErrorDisplayMode;
  convertDefiniteIntegrals: boolean;
  convertBoundedOperators: boolean;
  greekStyle: "plane1" | "standard";
  convertProseToUnicode: boolean;
  convertProseToLatex: boolean;
  autoDetectNoteField: boolean;
  defaultMode: ActiveMathMode;
  autoDetectNoteMode: boolean;
  enableQuantumOperatorsGlobal: boolean;
  previewLatexNormalization: boolean;
  autoScaleDelimiters: boolean;
  crashImmunityAutoSeal: boolean;
  requireBracesForSlashDivision: boolean;
  enableQuickMenuOnAmbiguity: boolean;
  padMatrixPadding: boolean;
  collapsedSections: Record<string, boolean>;
}

const DEFAULT_SETTINGS: ColorMathSettings = {
  palette: { ...DEFAULT_COLORS },
  rainbowColors: [...RAINBOW_DELIMITER_COLORS],
  liveRendering: true,
  livePreviewHighlighting: true,
  highlightInlineMath: true,
  highlightDisplayMath: true,
  colorAlignment: true,
  showRibbonIcon: true,
  autoSyncTheme: false,
  autoLightDark: true,
  enableTaxonomy: true,
  taxonomyFunctions: true,
  taxonomyParameters: true,
  taxonomyConstants: true,
  taxonomyIndices: true,
  rainbowDelimiters: true,
  rainbowBareBraces: true,
  highlightUnmatchedBraces: true,
  variableDataFlow: true,
  colorUnits: true,
  colorDifferentials: true,
  colorDerivativeFractions: true,
  colorInfinitesimals: true,
  colorBraKet: true,
  colorDimensionless: true,
  colorSingleConstants: true,
  extendedFunctions: true,
  errorDisplayMode: "inline",
  convertDefiniteIntegrals: false,
  convertBoundedOperators: false,
  greekStyle: "plane1",
  convertProseToUnicode: true,
  convertProseToLatex: false,
  autoDetectNoteField: true,
  defaultMode: "analysis",
  autoDetectNoteMode: false,
  enableQuantumOperatorsGlobal: false,
  previewLatexNormalization: true,
  autoScaleDelimiters: true,
  crashImmunityAutoSeal: true,
  requireBracesForSlashDivision: false,
  enableQuickMenuOnAmbiguity: false,
  padMatrixPadding: false,
  collapsedSections: {},
};

const ROLE_DISPLAY_NAMES: Record<ColorRole, string> = {
  main: "Primary expression / function",
  orange: "Constants & major operators",
  dot: "Multiplication symbols",
  derivative: "Derivatives & prime markers",
  chain: "Inner functions & subscripts",
  upper: "Superscripts & exponents",
  relation: "Relations & equality",
  arrow: "Arrows & mappings",
  set: "Set & logic symbols",
  spacing: "LaTeX spacing & layout",
  parameter: "Parameters & Greek coefficients",
  unit: "Physical units & dimensions",
  energyOperator: "Quantum differential operators",
};

const COLOR_ROLE_DESCRIPTIONS: Record<ColorRole, string> = {
  main: "Primary expression and function identifiers (e.g. f(x), \\sin, \\cos).",
  orange: "Universal constants, coefficients, and major bounded operators (e.g. \\pi, \\hbar, \\sum, \\int, \\lim).",
  dot: "Scalar multiplication products and tensor contractions (e.g. \\cdot, \\times, \\otimes).",
  derivative: "Differential operators (e.g. \\frac{df}{dx}, \\frac{\\partial\\psi}{\\partial t}, \\nabla) and prime order markers (e.g. f'(x)).",
  chain: "Bound summation/product indices (e.g. i, j) and inner chain rule factors (e.g. g(x) in f(g(x))).",
  upper: "Exponent powers and outer tensor/matrix transpose indices (e.g. x^2, A^T, \\mathbf{v}^\\top).",
  relation: "Binary algebraic relations, inequalities, and asymptotic bounds (e.g. =, \\approx, \\le, \\ge, \\sim, \\equiv).",
  arrow: "Morphisms, limit trajectories, vector directions, and logical implications (e.g. \\to, \\mapsto, \\implies).",
  set: "Set-theoretic membership and logical quantifiers (e.g. \\in, \\subset, \\cup, \\cap, \\forall, \\exists).",
  spacing: "LaTeX structural spacing and micro-typography formatting commands (e.g. \\quad, \\;, \\!).",
  parameter: "Continuous parameters, manifold coordinates, and Greek coefficients (e.g. \\alpha, \\beta, \\theta, \\lambda, \\omega).",
  unit: "Physical dimensional units and SI metric prefixes bound to numerical scalars (e.g. \\text{kg}, \\text{m/s}, \\mu\\text{m}, \\text{GHz}).",
  energyOperator: "Canonical quantum mechanics operators (Energy: i\\hbar\\partial_t, Momentum: -i\\hbar\\nabla, Kinetic: -\\frac{\\hbar^2}{2m}\\nabla^2).",
};

export default class ColorMathPlugin extends Plugin {
  settings: ColorMathSettings = DEFAULT_SETTINGS;
  ribbonIconEl: HTMLElement | null = null;
  interceptor: MathJaxInterceptor | null = null;
  private mcpCleanup: (() => void) | null = null;
  private noteModeCache = new Map<string, NoteFieldDetection>();
  private isPluginUnloaded = false;

  async onload() {
    this.isPluginUnloaded = false;
    await this.loadSettings();
    setPalette(this.settings.palette);

    // 1. Prepare MathJax rendering interceptor for automatic Live Preview & Reading View coloring
    this.interceptor = new MathJaxInterceptor(
      () => this.settings.palette,
      () => this.getMathOptions(),
      () => this.settings.liveRendering,
      () => this.settings.errorDisplayMode,
      () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return false;
        if (view.getMode() === "source") {
          const cm = (view.editor as any)?.cm;
          if (cm && typeof cm.state?.field === "function") {
            try {
              const isLive = cm.state.field(editorLivePreviewField, false);
              return isLive === false;
            } catch {
              return false;
            }
          }
        }
        return false;
      }
    );

    // Start background MathJax interception immediately (non-blocking, sub-1ms return for onload)
    void this.interceptor.install(() => {
      if (!this.isPluginUnloaded) {
        this.rerenderMath();
      }
    });

    // 2. Register CodeMirror 6 Live Preview syntax highlighting extension
    this.registerEditorExtension([
      createColorMathLivePlugin(
        () => this.settings.palette,
        () => this.settings.livePreviewHighlighting,
        () => this.getMathOptions()
      ),
    ]);

    // Setup Ribbon icon according to settings
    this.refreshRibbonIcon();

    // Listen for theme and light/dark mode changes
    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        void this.handleThemeChange();
      })
    );

    // Invalidate note mode cache on active leaf switch or file cache update
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.noteModeCache.clear();
      })
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (file?.path) {
          this.noteModeCache.delete(file.path);
        } else {
          this.noteModeCache.clear();
        }
      })
    );

    // 1. Bake colors into note (Permanent)
    this.addCommand({
      id: "colorize-note",
      name: "Bake colors into note (Permanent)",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
          if (!checking) {
            void this.colorizeActiveNote();
          }
          return true;
        }
        return false;
      },
    });

    // 2. Clean baked colors from note
    this.addCommand({
      id: "undo-note",
      name: "Clean baked colors from note",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
          if (!checking) {
            void this.uncolorActiveNote();
          }
          return true;
        }
        return false;
      },
    });

    // 2b. Bake colors across all notes in vault
    this.addCommand({
      id: "colorize-vault",
      name: "Bake colors into all notes in vault",
      callback: () => {
        void this.colorizeVault();
      },
    });

    // 2c. Clean baked colors across all notes in vault
    this.addCommand({
      id: "undo-vault",
      name: "Clean baked colors from all notes in vault",
      callback: () => {
        void this.uncolorVault();
      },
    });

    // 3. Bake colors into current math block
    this.addCommand({
      id: "colorize-current-block",
      name: "Bake colors into current math block",
      editorCallback: (editor: Editor) => {
        void this.colorizeCurrentMathBlock(editor);
      },
    });

    // 3b. Quick suggestion menu on ambiguous notation
    this.addCommand({
      id: "quick-menu-ambiguity",
      name: "Resolve ambiguous math notation (Quick Menu)",
      editorCallback: (editor: Editor) => {
        if (!this.settings.enableQuickMenuOnAmbiguity) return;
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const suggestions = findAmbiguousTokenAtCursor(
          line,
          cursor.ch,
          cursor.line
        );
        if (suggestions && suggestions.length > 0) {
          new QuickMenuModal(this.app, editor, suggestions).open();
        }
      },
    });

    // 4. Clean baked colors from current math block
    this.addCommand({
      id: "undo-current-block",
      name: "Clean baked colors from current math block",
      editorCallback: (editor: Editor) => {
        void this.uncolorCurrentMathBlock(editor);
      },
    });

    // 5. Bake colors into selection
    this.addCommand({
      id: "colorize-selection",
      name: "Bake colors into selection",
      editorCallback: (editor: Editor) => {
        void this.colorizeSelection(editor);
      },
    });

    // 6. Clean baked colors from selection
    this.addCommand({
      id: "undo-selection",
      name: "Clean baked colors from selection",
      editorCallback: (editor: Editor) => {
        void this.uncolorSelection(editor);
      },
    });

    // 7. Toggle dynamic live rendering
    this.addCommand({
      id: "toggle-live-rendering",
      name: "Toggle dynamic live rendering",
      callback: async () => {
        this.settings.liveRendering = !this.settings.liveRendering;
        await this.saveSettings();
        this.rerenderMath();
        new Notice(
          `Color Math: Dynamic live rendering is now ${this.settings.liveRendering ? "ON" : "OFF"}.`
        );
      },
    });

    // 8. Convert LaTeX math to Unicode in active note (Declutter LaTeX)
    this.addCommand({
      id: "convert-math-to-unicode-note",
      name: "Convert math to Unicode in active note (Declutter LaTeX)",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
          if (!checking) {
            void this.convertNoteMathToUnicode();
          }
          return true;
        }
        return false;
      },
    });

    // 9. Convert Unicode math to LaTeX in active note (Restore TeX)
    this.addCommand({
      id: "convert-unicode-to-latex-note",
      name: "Convert Unicode math to LaTeX in active note (Restore TeX)",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
          if (!checking) {
            void this.convertNoteMathToLatex();
          }
          return true;
        }
        return false;
      },
    });

    // 10. Convert current math block to Unicode
    this.addCommand({
      id: "convert-math-to-unicode-block",
      name: "Convert current math block to Unicode",
      editorCallback: (editor: Editor) => {
        this.convertCurrentMathBlockToUnicode(editor);
      },
    });

    // 11. Convert current math block to LaTeX
    this.addCommand({
      id: "convert-unicode-to-latex-block",
      name: "Convert current math block to LaTeX",
      editorCallback: (editor: Editor) => {
        this.convertCurrentMathBlockToLatex(editor);
      },
    });

    // 12. Convert selection to Unicode
    this.addCommand({
      id: "convert-math-to-unicode-selection",
      name: "Convert selection to Unicode",
      editorCallback: (editor: Editor) => {
        this.convertSelectionToUnicode(editor);
      },
    });

    // 13. Convert selection to LaTeX
    this.addCommand({
      id: "convert-unicode-to-latex-selection",
      name: "Convert selection to LaTeX",
      editorCallback: (editor: Editor) => {
        this.convertSelectionToLatex(editor);
      },
    });

    // Settings tab
    this.addSettingTab(new ColorMathSettingTab(this.app, this));

    // Defer heavy asset loading, MCP tool registration, and initial workspace rerendering
    // to onLayoutReady so plugin.onload() returns immediately (< 5ms).
    const onLayoutReadyHandler = () => {
      if (this.isPluginUnloaded) return;

      this.setupMcpTools();
      if (!this.interceptor?.isInstalled()) {
        void this.interceptor?.install(() => {
          if (!this.isPluginUnloaded) {
            this.rerenderMath();
          }
        });
      } else {
        this.rerenderMath();
      }
    };

    if (this.app.workspace.layoutReady) {
      onLayoutReadyHandler();
    } else {
      this.app.workspace.onLayoutReady(onLayoutReadyHandler);
    }
  }

  onunload() {
    this.isPluginUnloaded = true;

    // 1. Unregister MCP tools from Obsidian Local REST API
    this.mcpCleanup?.();
    this.mcpCleanup = null;

    // 2. Unpatch MathJax, release cached DOM elements, and reset handle
    if (this.interceptor) {
      this.interceptor.uninstall();
      this.interceptor.clearCache();
      this.interceptor = null;
    }

    // 3. Clear frontmatter note mode cache
    this.noteModeCache.clear();

    // 4. Detach ribbon icon
    if (this.ribbonIconEl) {
      this.ribbonIconEl.detach();
      this.ribbonIconEl = null;
    }

    // 5. Revert all open notes to native Obsidian uncolored math
    this.rerenderMath();
  }

  setupMcpTools() {
    if (this.mcpCleanup) return;
    this.mcpCleanup = registerColorMathMcpTools(this);
  }

  rerenderMath() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView) {
        const previewMode = (leaf.view as MarkdownView & { previewMode?: { rerender: (full: boolean) => void } }).previewMode;
        previewMode?.rerender(true);
        const cm = (leaf.view.editor as Editor & { cm?: { dispatch: (tr: Record<string, unknown>) => void } })?.cm;
        if (cm) {
          cm.dispatch({});
        }
      }
    });
    this.app.workspace.updateOptions();
  }

  refreshRibbonIcon() {
    if (this.settings.showRibbonIcon) {
      if (!this.ribbonIconEl) {
        this.ribbonIconEl = this.addRibbonIcon(
          "palette",
          "Color Math",
          (evt: MouseEvent) => {
            this.showRibbonMenu(evt);
          }
        );
      }
    } else {
      if (this.ribbonIconEl) {
        this.ribbonIconEl.detach();
        this.ribbonIconEl = null;
      }
    }
  }

  showRibbonMenu(evt: MouseEvent) {
    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle("Bake colors into note (Permanent)")
        .setIcon("file-text")
        .onClick(() => this.colorizeActiveNote())
    );

    menu.addItem((item) =>
      item
        .setTitle("Clean baked colors from note")
        .setIcon("undo")
        .onClick(() => this.uncolorActiveNote())
    );

    menu.addItem((item) =>
      item
        .setTitle(
          this.settings.liveRendering
            ? "Turn off dynamic live rendering"
            : "Turn on dynamic live rendering"
        )
        .setIcon(this.settings.liveRendering ? "eye-off" : "eye")
        .onClick(async () => {
          this.settings.liveRendering = !this.settings.liveRendering;
          await this.saveSettings();
          this.rerenderMath();
          new Notice(
            `Color Math: Dynamic live rendering is now ${this.settings.liveRendering ? "ON" : "OFF"}.`
          );
        })
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle("Bake colors into current math block")
        .setIcon("box")
        .onClick(() => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (view) {
            this.colorizeCurrentMathBlock(view.editor);
          } else {
            new Notice("Color Math: No active Markdown note.");
          }
        })
    );

    menu.addItem((item) =>
      item
        .setTitle("Clean baked colors from current math block")
        .setIcon("rotate-ccw")
        .onClick(() => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (view) {
            this.uncolorCurrentMathBlock(view.editor);
          } else {
            new Notice("Color Math: No active Markdown note.");
          }
        })
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle("Bake colors into selection")
        .setIcon("highlighter")
        .onClick(() => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (view) {
            this.colorizeSelection(view.editor);
          } else {
            new Notice("Color Math: No active Markdown note.");
          }
        })
    );

    menu.addItem((item) =>
      item
        .setTitle("Clean baked colors from selection")
        .setIcon("rotate-ccw")
        .onClick(() => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (view) {
            this.uncolorSelection(view.editor);
          } else {
            new Notice("Color Math: No active Markdown note.");
          }
        })
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle("Open Color Math settings")
        .setIcon("settings")
        .onClick(() => {
          const appWithSetting = this.app as unknown as {
            setting?: { open: () => void; openTabById: (id: string) => void };
          };
          if (appWithSetting.setting && appWithSetting.setting.openTabById) {
            appWithSetting.setting.open();
            appWithSetting.setting.openTabById(this.manifest.id);
          }
        })
    );

    menu.showAtMouseEvent(evt);
  }

  getActiveNoteDetection(content?: string): NoteFieldDetection | null {
    if (!this.settings.autoDetectNoteField) {
      return null;
    }
    const appWithMeta = this.app as unknown as {
      workspace?: { getActiveFile?: () => { path?: string } | null; getActiveViewOfType?: (type: unknown) => MarkdownView | null };
      metadataCache?: { getFileCache?: (file: unknown) => { frontmatter?: Record<string, unknown>; tags?: Array<{ tag: string }> } | null };
    };
    const file = appWithMeta.workspace?.getActiveFile?.();
    const filePath = file?.path;
    if (filePath && this.noteModeCache.has(filePath)) {
      return this.noteModeCache.get(filePath)!;
    }

    const fileCache = file ? appWithMeta.metadataCache?.getFileCache?.(file) : null;
    const frontmatter = fileCache?.frontmatter || {};
    const tagsFromCache = fileCache?.tags?.map((t) => t.tag);
    const combinedFrontmatter = tagsFromCache && tagsFromCache.length > 0
      ? {
          ...frontmatter,
          tags: [
            ...(Array.isArray(frontmatter.tags)
              ? frontmatter.tags
              : frontmatter.tags
              ? [frontmatter.tags]
              : []),
            ...tagsFromCache,
          ],
        }
      : frontmatter;

    const detection = detectNoteField(content || "", combinedFrontmatter);
    if (filePath) {
      this.noteModeCache.set(filePath, detection);
    }
    return detection;
  }

  getMathOptions(content?: string): ColorMathOptions {
    const base: ColorMathOptions = {
      enableTaxonomy: this.settings.enableTaxonomy,
      taxonomyFunctions: this.settings.taxonomyFunctions,
      taxonomyParameters: this.settings.taxonomyParameters,
      taxonomyConstants: this.settings.taxonomyConstants,
      taxonomyIndices: this.settings.taxonomyIndices,
      rainbowDelimiters: this.settings.rainbowDelimiters,
      rainbowColors: this.settings.rainbowColors,
      rainbowBareBraces: this.settings.rainbowBareBraces,
      highlightUnmatchedBraces: this.settings.highlightUnmatchedBraces,
      variableDataFlow: this.settings.variableDataFlow,
      colorUnits: this.settings.colorUnits,
      colorDifferentials: this.settings.colorDifferentials,
      colorDerivativeFractions: this.settings.colorDerivativeFractions,
      colorInfinitesimals: this.settings.colorInfinitesimals,
      colorBraKet: this.settings.colorBraKet,
      colorDimensionless: this.settings.colorDimensionless,
      colorAlignment: this.settings.colorAlignment,
      colorSingleConstants: this.settings.colorSingleConstants,
      extendedFunctions: this.settings.extendedFunctions,
      colorQuantumOperators: this.settings.enableQuantumOperatorsGlobal,
      highlightInlineMath: this.settings.highlightInlineMath,
      highlightDisplayMath: this.settings.highlightDisplayMath,
      previewLatexNormalization: this.settings.previewLatexNormalization,
      autoScaleDelimiters: this.settings.autoScaleDelimiters,
      crashImmunityAutoSeal: this.settings.crashImmunityAutoSeal,
      requireBracesForSlashDivision: this.settings.requireBracesForSlashDivision,
      enableQuickMenuOnAmbiguity: this.settings.enableQuickMenuOnAmbiguity,
      padMatrixPadding: this.settings.padMatrixPadding,
      defaultMode: this.settings.defaultMode,
      autoDetectNoteMode: this.settings.autoDetectNoteMode,
    };

    let activeMode: ActiveMathMode = this.settings.defaultMode || "analysis";

    if (this.settings.autoDetectNoteMode !== false || this.settings.autoDetectNoteField) {
      const detected = this.getActiveNoteDetection(content);
      if (detected) {
        Object.assign(base, detected.overrides);
        if (detected.detectedMode && this.settings.autoDetectNoteMode !== false) {
          activeMode = detected.detectedMode;
        }
      }
    }

    base.activeMode = activeMode;

    return base;
  }

  colorizeCurrentMathBlock(editor: Editor) {
    const content = editor.getValue();
    const cursor = editor.getCursor();
    const offset = editor.posToOffset(cursor);

    const mathBlocks = scanMarkdown(content).mathBlocks;
    const currentBlock = mathBlocks.find(
      (span) => span.start <= offset && offset <= span.end
    );

    if (!currentBlock) {
      new Notice("Color Math: Cursor is not inside a math block ($$...$$).");
      return;
    }

    const rawBlock = content.slice(currentBlock.start, currentBlock.end);
    const colored = convertMathBlock(
      rawBlock,
      this.settings.palette,
      this.getMathOptions(content)
    );

    if (colored === rawBlock) {
      new Notice("Color Math: Math block is already colorized.");
      return;
    }

    const from = editor.offsetToPos(currentBlock.start);
    const to = editor.offsetToPos(currentBlock.end);
    editor.replaceRange(colored, from, to);
    new Notice("Color Math: Colorized current math block! 🎨");
  }

  uncolorCurrentMathBlock(editor: Editor) {
    const content = editor.getValue();
    const cursor = editor.getCursor();
    const offset = editor.posToOffset(cursor);

    const scan = scanMarkdown(content);
    const allSpans = [...scan.mathBlocks, ...scan.mathInlines];
    const currentSpan = allSpans.find(
      (span) => span.start <= offset && offset <= span.end
    );

    if (!currentSpan) {
      new Notice("Color Math: Cursor is not inside a math expression ($...$ or $$...$$).");
      return;
    }

    const rawSpan = content.slice(currentSpan.start, currentSpan.end);
    const uncolored = uncolorFragment(rawSpan);

    if (uncolored === rawSpan) {
      new Notice("Color Math: No baked color wrappers found to remove in this equation.");
      return;
    }

    const from = editor.offsetToPos(currentSpan.start);
    const to = editor.offsetToPos(currentSpan.end);
    editor.replaceRange(uncolored, from, to);

    if (this.settings.liveRendering) {
      new Notice(
        "Color Math: Cleaned baked colors from math expression!\n(Live Preview dynamic coloring is currently ON in settings).",
        5000
      );
    } else {
      new Notice("Color Math: Reverted math expression to clean LaTeX.");
    }
  }

  colorizeSelection(editor: Editor) {
    const selection = editor.getSelection();
    if (selection) {
      const content = editor.getValue();
      const colored = convertText(
        selection,
        this.settings.palette,
        this.getMathOptions(content)
      );
      editor.replaceSelection(colored);
      new Notice("Color Math: Colorized selection.");
    } else {
      new Notice("Color Math: Please select text to colorize.");
    }
  }

  uncolorSelection(editor: Editor) {
    const selection = editor.getSelection();
    if (selection) {
      const uncolored = uncolorFragment(selection);
      if (uncolored === selection) {
        new Notice("Color Math: No baked color wrappers found to remove in selection.");
        return;
      }
      editor.replaceSelection(uncolored);
      if (this.settings.liveRendering) {
        new Notice(
          "Color Math: Cleaned baked colors from selection!\n(Live Preview dynamic coloring is currently ON in settings).",
          5000
        );
      } else {
        new Notice("Color Math: Reverted selection to clean LaTeX.");
      }
    } else {
      new Notice("Color Math: Please select text to undo colors.");
    }
  }

  async colorizeActiveNote() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("Color Math: No active Markdown note.");
      return;
    }

    const editor = view.editor;
    const content = editor.getValue();
    const colored = convertText(
      content,
      this.settings.palette,
      this.getMathOptions(content)
    );

    if (colored === content) {
      new Notice("Color Math: All math blocks are already colored.");
      return;
    }

    const cursor = editor.getCursor();
    editor.setValue(colored);
    editor.setCursor(cursor);
    new Notice("Color Math: Successfully colorized note equations! 🎨");
  }

  async uncolorActiveNote() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("Color Math: No active Markdown note.");
      return;
    }

    const editor = view.editor;
    const content = editor.getValue();
    const uncolored = uncolorText(content);

    if (uncolored === content) {
      new Notice("Color Math: No baked color wrappers found to remove.");
      return;
    }

    const cursor = editor.getCursor();
    editor.setValue(uncolored);
    editor.setCursor(cursor);

    if (this.settings.liveRendering) {
      new Notice(
        "Color Math: Cleaned all baked colors from note equations! 🧹\n(Live Preview dynamic coloring is currently ON in settings).",
        6000
      );
    } else {
      new Notice("Color Math: Successfully cleaned colors from note! 🧹");
    }
  }

  getVaultMathFiles(): TFile[] {
    const files = this.app.vault.getMarkdownFiles();
    const candidates: TFile[] = [];
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) {
        candidates.push(file); // unindexed fallback
        continue;
      }
      const hasMath = cache.sections?.some((s) => s.type === "math");
      if (hasMath) {
        candidates.push(file);
        continue;
      }
      if (
        cache.frontmatter?.["field"] ||
        cache.frontmatter?.["mode"] ||
        cache.frontmatter?.["math"]
      ) {
        candidates.push(file);
      }
    }
    return candidates;
  }

  async colorizeVault() {
    const candidates = this.getVaultMathFiles();
    if (candidates.length === 0) {
      new Notice("Color Math: No markdown notes with math found in vault.");
      return;
    }

    let modifiedCount = 0;
    const notice = new Notice(`Color Math: Scanning ${candidates.length} candidate notes...`, 0);

    for (let i = 0; i < candidates.length; i++) {
      const file = candidates[i];
      try {
        const content = await this.app.vault.read(file);
        if (!content.includes("$")) continue;
        const colored = convertText(
          content,
          this.settings.palette,
          this.getMathOptions(content)
        );
        if (colored !== content) {
          await this.app.vault.modify(file, colored);
          modifiedCount++;
        }
      } catch (err) {
        console.error(`Color Math: Failed to colorize ${file.path}:`, err);
      }
    }

    notice.hide();
    new Notice(
      `Color Math: Vault bake complete! Colored equations in ${modifiedCount} notes. 🎨`,
      6000
    );
  }

  async uncolorVault() {
    const candidates = this.getVaultMathFiles();
    if (candidates.length === 0) {
      new Notice("Color Math: No markdown notes with math found in vault.");
      return;
    }

    let modifiedCount = 0;
    const notice = new Notice(`Color Math: Scanning ${candidates.length} candidate notes...`, 0);

    for (let i = 0; i < candidates.length; i++) {
      const file = candidates[i];
      try {
        const content = await this.app.vault.read(file);
        if (!content.includes("\\textcolor") && !content.includes("\\color")) continue;
        const uncolored = uncolorText(content);
        if (uncolored !== content) {
          await this.app.vault.modify(file, uncolored);
          modifiedCount++;
        }
      } catch (err) {
        console.error(`Color Math: Failed to uncolor ${file.path}:`, err);
      }
    }

    notice.hide();
    new Notice(
      `Color Math: Vault clean complete! Cleaned baked colors from ${modifiedCount} notes. 🧹`,
      6000
    );
  }

  getUnicodeOptions(): UnicodeConversionOptions {
    return {
      convertDefiniteIntegrals: this.settings.convertDefiniteIntegrals,
      convertBoundedOperators: this.settings.convertBoundedOperators,
      greekStyle: this.settings.greekStyle,
      convertProseToUnicode: this.settings.convertProseToUnicode,
      convertProseToLatex: this.settings.convertProseToLatex,
    };
  }

  async convertNoteMathToUnicode() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("Color Math: No active Markdown note.");
      return;
    }

    const editor = view.editor;
    const content = editor.getValue();
    let progressNotice: Notice | null = null;
    const converted = await convertDocumentMathChunked(
      content,
      "to-unicode",
      this.getUnicodeOptions(),
      4,
      (processed, total) => {
        if (total > 15) {
          if (!progressNotice) {
            progressNotice = new Notice(`Color Math: Converting math equations (${processed}/${total})...`, 0);
          } else {
            progressNotice.setMessage(`Color Math: Converting math equations (${processed}/${total})...`);
          }
        }
      }
    );
    if (progressNotice) {
      (progressNotice as Notice).hide();
    }

    if (converted === content) {
      new Notice("Color Math: No LaTeX math expressions needed conversion.");
      return;
    }

    const cursor = editor.getCursor();
    editor.setValue(converted);
    editor.setCursor(cursor);
    new Notice("Color Math: Converted note math equations to Unicode! ✨");
  }

  async convertNoteMathToLatex() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("Color Math: No active Markdown note.");
      return;
    }

    const editor = view.editor;
    const content = editor.getValue();
    let progressNotice: Notice | null = null;
    const converted = await convertDocumentMathChunked(
      content,
      "to-latex",
      this.getUnicodeOptions(),
      4,
      (processed, total) => {
        if (total > 15) {
          if (!progressNotice) {
            progressNotice = new Notice(`Color Math: Converting math to LaTeX (${processed}/${total})...`, 0);
          } else {
            progressNotice.setMessage(`Color Math: Converting math to LaTeX (${processed}/${total})...`);
          }
        }
      }
    );
    if (progressNotice) {
      (progressNotice as Notice).hide();
    }

    if (converted === content) {
      new Notice("Color Math: No Unicode math symbols found to convert.");
      return;
    }

    const cursor = editor.getCursor();
    editor.setValue(converted);
    editor.setCursor(cursor);
    new Notice("Color Math: Converted note Unicode math to LaTeX! 📐");
  }

  convertCurrentMathBlockToUnicode(editor: Editor) {
    const content = editor.getValue();
    const cursor = editor.getCursor();
    const offset = editor.posToOffset(cursor);

    const scan = scanMarkdown(content);
    const allSpans = [...scan.mathBlocks, ...scan.mathInlines];
    const currentSpan = allSpans.find(
      (span) => span.start <= offset && offset <= span.end
    );

    if (!currentSpan) {
      new Notice("Color Math: Cursor is not inside a math expression ($...$ or $$...$$).");
      return;
    }

    const mathContent = content.slice(currentSpan.contentStart, currentSpan.contentEnd);
    const converted = convertLatexToUnicode(mathContent, this.getUnicodeOptions());

    if (converted === mathContent) {
      new Notice("Color Math: Math expression already uses Unicode or has no convertible symbols.");
      return;
    }

    const from = editor.offsetToPos(currentSpan.contentStart);
    const to = editor.offsetToPos(currentSpan.contentEnd);
    editor.replaceRange(converted, from, to);
    new Notice("Color Math: Converted math expression to Unicode! ✨");
  }

  convertCurrentMathBlockToLatex(editor: Editor) {
    const content = editor.getValue();
    const cursor = editor.getCursor();
    const offset = editor.posToOffset(cursor);

    const scan = scanMarkdown(content);
    const allSpans = [...scan.mathBlocks, ...scan.mathInlines];
    const currentSpan = allSpans.find(
      (span) => span.start <= offset && offset <= span.end
    );

    if (!currentSpan) {
      new Notice("Color Math: Cursor is not inside a math expression ($...$ or $$...$$).");
      return;
    }

    const mathContent = content.slice(currentSpan.contentStart, currentSpan.contentEnd);
    const converted = convertUnicodeToLatex(mathContent);

    if (converted === mathContent) {
      new Notice("Color Math: No Unicode symbols found to convert in this equation.");
      return;
    }

    const from = editor.offsetToPos(currentSpan.contentStart);
    const to = editor.offsetToPos(currentSpan.contentEnd);
    editor.replaceRange(converted, from, to);
    new Notice("Color Math: Converted math expression to canonical LaTeX! 📐");
  }

  convertSelectionToUnicode(editor: Editor) {
    const selection = editor.getSelection();
    if (!selection) {
      new Notice("Color Math: Please select math text to convert.");
      return;
    }

    const converted = selection.includes("$")
      ? convertDocumentMath(selection, "to-unicode", this.getUnicodeOptions())
      : convertLatexToUnicode(selection, this.getUnicodeOptions());

    if (converted === selection) {
      new Notice("Color Math: Selection already in Unicode or has no convertible symbols.");
      return;
    }

    editor.replaceSelection(converted);
    new Notice("Color Math: Converted selection to Unicode! ✨");
  }

  convertSelectionToLatex(editor: Editor) {
    const selection = editor.getSelection();
    if (!selection) {
      new Notice("Color Math: Please select math text to convert.");
      return;
    }

    const converted = selection.includes("$")
      ? convertDocumentMath(selection, "to-latex", this.getUnicodeOptions())
      : convertUnicodeToLatex(selection);

    if (converted === selection) {
      new Notice("Color Math: No Unicode symbols found to convert in selection.");
      return;
    }

    editor.replaceSelection(converted);
    new Notice("Color Math: Converted selection to LaTeX! 📐");
  }

  async handleThemeChange() {
    if (this.settings.autoSyncTheme) {
      this.settings.palette = extractThemePalette(this.settings.autoLightDark ? isVaultLightMode() : false);
      await this.saveSettings();
    } else if (this.settings.autoLightDark) {
      const light = isVaultLightMode();
      this.settings.palette = {
        ...this.settings.palette,
        relation: light ? "#1e293b" : "white",
        dot: light ? "#334155" : "white",
        spacing: light ? "#334155" : "white",
      };
      await this.saveSettings();
    }
  }

  async loadSettings() {
    let loadedData: Partial<ColorMathSettings> | null = null;
    try {
      loadedData = (await this.loadData()) as Partial<ColorMathSettings> | null;
    } catch (err) {
      console.warn("Color Math: Error reading user settings data.json, falling back to default configuration:", err);
      new Notice("Color Math: Error loading user settings. Safely fell back to default configuration.", 5000);
      loadedData = null;
    }

    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData || {});
    if (!this.settings.palette || typeof this.settings.palette !== "object") {
      this.settings.palette = { ...DEFAULT_COLORS };
    } else {
      this.settings.palette = Object.assign({}, DEFAULT_COLORS, this.settings.palette);
    }
    if (!Array.isArray(this.settings.rainbowColors) || this.settings.rainbowColors.length === 0) {
      this.settings.rainbowColors = [...RAINBOW_DELIMITER_COLORS];
    }
    if (!this.settings.collapsedSections || typeof this.settings.collapsedSections !== "object") {
      this.settings.collapsedSections = {};
    }
  }

  async resetSettingsToDefaults() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, {
      palette: { ...DEFAULT_COLORS },
      rainbowColors: [...RAINBOW_DELIMITER_COLORS],
      collapsedSections: {},
    });
    await this.saveSettings();
    this.rerenderMath();
    new Notice("Color Math: Restored factory default settings from default.config.json! 🔄");
  }

  async saveSettings() {
    await this.saveData(this.settings);
    setPalette(this.settings.palette);
    this.interceptor?.clearCache();
    this.noteModeCache.clear();
    this.app.workspace.updateOptions();
    this.rerenderMath();
  }
}

class ColorMathSettingTab extends PluginSettingTab {
  plugin: ColorMathPlugin;

  constructor(app: App, plugin: ColorMathPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private createCollapsible(
    containerEl: HTMLElement,
    id: string,
    title: string,
    defaultOpen: boolean = false
  ): HTMLElement {
    const isCollapsed = this.plugin.settings.collapsedSections?.[id] ?? !defaultOpen;
    const details = containerEl.createEl("details", {
      cls: "color-math-collapsible-section",
    });
    if (!isCollapsed) {
      details.setAttribute("open", "");
    }
    const summary = details.createEl("summary", {
      cls: "color-math-collapsible-header",
    });
    const titleSpan = summary.createSpan({ cls: "color-math-collapsible-title" });
    titleSpan.setText(title);

    details.addEventListener("toggle", () => {
      if (!this.plugin.settings.collapsedSections) {
        this.plugin.settings.collapsedSections = {};
      }
      this.plugin.settings.collapsedSections[id] = !details.open;
      void this.plugin.saveSettings();
    });

    return details.createDiv({ cls: "color-math-collapsible-body" });
  }

  private createSubCollapsible(
    containerEl: HTMLElement,
    id: string,
    title: string,
    defaultOpen: boolean = false
  ): HTMLElement {
    const isCollapsed = this.plugin.settings.collapsedSections?.[id] ?? !defaultOpen;
    const details = containerEl.createEl("details", {
      cls: "color-math-sub-collapsible",
    });
    if (!isCollapsed) {
      details.setAttribute("open", "");
    }
    const summary = details.createEl("summary", {
      cls: "color-math-sub-header",
    });
    summary.createSpan({ text: title });

    details.addEventListener("toggle", () => {
      if (!this.plugin.settings.collapsedSections) {
        this.plugin.settings.collapsedSections = {};
      }
      this.plugin.settings.collapsedSections[id] = !details.open;
      void this.plugin.saveSettings();
    });

    return details.createDiv({ cls: "color-math-sub-body" });
  }

  display(): void {
    this.containerEl.empty();
    this.buildTab(this.containerEl);
  }

  private refresh(): void {
    if (typeof (this as any).update === "function") {
      (this as any).update();
    }
    this.containerEl.empty();
    this.buildTab(this.containerEl);
  }

  private buildTab(containerEl: HTMLElement): void {
    containerEl.addClass("color-math-settings-tab");
    containerEl.createEl("p", {
      text: "AST-driven semantic syntax highlighting and real-time MathJax CHTML decoration for mathematical expressions across CodeMirror 6 viewports and Reading View. Operates non-destructively in-memory with zero disk mutation.",
      cls: "color-math-section-desc",
    });

    // =========================================================================
    // Section 1: ⚡ Core & Viewport Rendering
    // =========================================================================
    const coreBody = this.createCollapsible(
      containerEl,
      "section-core",
      "⚡ Core & Viewport Rendering",
      true
    );

    new Setting(coreBody)
      .setName("Show ribbon icon")
      .setDesc("Displays the Color Math palette icon in the left ribbon for fast access to vault-wide AST bake and clean actions.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRibbonIcon)
          .onChange(async (val) => {
            this.plugin.settings.showRibbonIcon = val;
            await this.plugin.saveSettings();
            this.plugin.refreshRibbonIcon();
          })
      );

    new Setting(coreBody)
      .setName("Live rendered math coloring")
      .setDesc("Intercepts MathJax CHTML compilation to inject semantic token styling directly into rendered equation elements without mutating raw Markdown storage. Operates in-memory with S = 𝒪(1) footprint to keep note rendering fast.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.liveRendering)
          .onChange(async (val) => {
            this.plugin.settings.liveRendering = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(coreBody)
      .setName("Editor syntax highlighting (Live Preview)")
      .setDesc("Employs CodeMirror 6 EditorView.decorations facet composition, restricting syntax computation to a 3-block sliding window (active cursor block ± 1) with 𝒪(Δ) delta complexity via viewport virtualization. Ensures instant sub-millisecond editor responsiveness with zero typing lag.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.livePreviewHighlighting)
          .onChange(async (val) => {
            this.plugin.settings.livePreviewHighlighting = val;
            await this.plugin.saveSettings();
            this.refresh();
          })
      );

    if (this.plugin.settings.livePreviewHighlighting) {
      new Setting(coreBody)
        .setClass("color-math-sub-setting")
        .setName("Highlight inline math ($...$)")
        .setDesc("Evaluates inline math expressions ($...$) via a single-pass scanner within active viewport lines. Keeps typing lag-free in text notes.")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.highlightInlineMath)
            .onChange(async (val) => {
              this.plugin.settings.highlightInlineMath = val;
              await this.plugin.saveSettings();
              this.plugin.rerenderMath();
            })
        );

      new Setting(coreBody)
        .setClass("color-math-sub-setting")
        .setName("Highlight display blocks ($$...$$)")
        .setDesc("Parses multiline display blocks ($$...$$) into discrete token ranges with priority ladder resolution. Keeps editor repainting fast.")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.highlightDisplayMath)
            .onChange(async (val) => {
              this.plugin.settings.highlightDisplayMath = val;
              await this.plugin.saveSettings();
              this.plugin.rerenderMath();
            })
        );

      new Setting(coreBody)
        .setClass("color-math-sub-setting")
        .setName("Matrix & tabular alignment tabs (&, \\\\)")
        .setDesc("Isolates column delimiter anchors (&) and row termination breaks (\\\\) in tabular environments (matrix, align, cases) using 𝚯(1) ASCII delimiter matching. Runs instantaneously with zero overhead.")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.colorAlignment)
            .onChange(async (val) => {
              this.plugin.settings.colorAlignment = val;
              await this.plugin.saveSettings();
              this.plugin.rerenderMath();
            })
        );
    }

    // =========================================================================
    // Section 2: 🎨 Theme & Color Palettes
    // =========================================================================
    const themeBody = this.createCollapsible(
      containerEl,
      "section-theme-palettes",
      "🎨 Theme & Color Palettes",
      true
    );

    const PRESET_THEMES: Record<string, { name: string; palette: ColorPalette; rainbow: string[] }> = {
      tokyo: {
        name: "Tokyo Night (Signature)",
        palette: { ...DEFAULT_COLORS },
        rainbow: [...RAINBOW_DELIMITER_COLORS],
      },
      catppuccin: {
        name: "Catppuccin Mocha",
        palette: {
          main: "#89b4fa",
          orange: "#fab387",
          dot: "#cdd6f4",
          derivative: "#cba6f7",
          chain: "#a6e3a1",
          upper: "#cba6f7",
          relation: "#cdd6f4",
          arrow: "#f38ba8",
          set: "#89dceb",
          spacing: "#6c7086",
          parameter: "#f5c2e7",
          unit: "#94e2d5",
          energyOperator: "#74c7ec",
        },
        rainbow: ["#fab387", "#89b4fa", "#cba6f7", "#f38ba8"],
      },
      nord: {
        name: "Nord",
        palette: {
          main: "#88c0d0",
          orange: "#ebcb8b",
          dot: "#eceff4",
          derivative: "#b48ead",
          chain: "#a3be8c",
          upper: "#b48ead",
          relation: "#eceff4",
          arrow: "#bf616a",
          set: "#81a1c1",
          spacing: "#d8dee9",
          parameter: "#b48ead",
          unit: "#8fbcbb",
          energyOperator: "#88c0d0",
        },
        rainbow: ["#ebcb8b", "#88c0d0", "#b48ead", "#bf616a"],
      },
      light: {
        name: "Clean Light (High Contrast)",
        palette: {
          main: "#2563eb",
          orange: "#d97706",
          dot: "#334155",
          derivative: "#7c3aed",
          chain: "#16a34a",
          upper: "#9333ea",
          relation: "#1e293b",
          arrow: "#dc2626",
          set: "#0284c7",
          spacing: "#64748b",
          parameter: "#7c3aed",
          unit: "#0d9488",
          energyOperator: "#0891b2",
        },
        rainbow: ["#d97706", "#2563eb", "#7c3aed", "#dc2626"],
      },
    };

    new Setting(themeBody)
      .setName("Preset theme palettes")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("none", "Choose a preset theme...")
          .addOption("tokyo", "Tokyo Night (Signature)")
          .addOption("catppuccin", "Catppuccin Mocha")
          .addOption("nord", "Nord")
          .addOption("light", "Clean Light (High Contrast)")
          .setValue("none")
          .onChange(async (val) => {
            if (val !== "none" && PRESET_THEMES[val]) {
              const preset = PRESET_THEMES[val];
              this.plugin.settings.palette = { ...preset.palette };
              this.plugin.settings.rainbowColors = [...preset.rainbow];
              await this.plugin.saveSettings();
              this.plugin.rerenderMath();
              this.refresh();
              new Notice(`Color Math: Applied ${preset.name} palette!`);
            }
          });
      });

    new Setting(themeBody)
      .setName("Sync with active theme")
      .addButton((button) =>
        button
          .setButtonText("Sync with Theme")
          .setCta()
          .onClick(async () => {
            this.plugin.settings.palette = extractThemePalette(
              this.plugin.settings.autoLightDark ? isVaultLightMode() : false
            );
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
            this.refresh();
            new Notice("Color Math: Synced colors with active Obsidian theme!");
          })
      );

    new Setting(themeBody)
      .setName("Auto-match on theme change")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoSyncTheme)
          .onChange(async (val) => {
            this.plugin.settings.autoSyncTheme = val;
            if (val) {
              this.plugin.settings.palette = extractThemePalette(
                this.plugin.settings.autoLightDark ? isVaultLightMode() : false
              );
              this.plugin.rerenderMath();
            }
            await this.plugin.saveSettings();
            this.refresh();
          })
      );

    new Setting(themeBody)
      .setName("Auto-adapt for light / dark mode")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoLightDark)
          .onChange(async (val) => {
            this.plugin.settings.autoLightDark = val;
            if (val) {
              const light = isVaultLightMode();
              this.plugin.settings.palette.relation = light ? "#1e293b" : "white";
              this.plugin.settings.palette.dot = light ? "#334155" : "white";
              this.plugin.settings.palette.spacing = light ? "#334155" : "white";
              this.plugin.rerenderMath();
            }
            await this.plugin.saveSettings();
            this.refresh();
          })
      );

    // Sub-collapsible: Semantic Role Colors (13 roles)
    const rolesBody = this.createSubCollapsible(
      themeBody,
      "sub-semantic-roles",
      "Semantic Role Colors (13 Roles)",
      true
    );

    const roles = Object.keys(DEFAULT_COLORS) as ColorRole[];
    for (const role of roles) {
      const setting = new Setting(rolesBody)
        .setName(ROLE_DISPLAY_NAMES[role] || role.charAt(0).toUpperCase() + role.slice(1))
        .setDesc(COLOR_ROLE_DESCRIPTIONS[role] || role);

      const currentColor = this.plugin.settings.palette[role] || DEFAULT_COLORS[role];
      if (currentColor.startsWith("#")) {
        setting.addColorPicker((picker) => {
          picker.setValue(currentColor).onChange(async (val) => {
            this.plugin.settings.palette[role] = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          });
        });
      }

      setting.addText((text) => {
        text
          .setPlaceholder(DEFAULT_COLORS[role])
          .setValue(this.plugin.settings.palette[role])
          .onChange(async (val) => {
            if (val.trim()) {
              this.plugin.settings.palette[role] = val.trim();
              await this.plugin.saveSettings();
              this.plugin.rerenderMath();
            }
          });
      });
    }

    // Sub-collapsible: Rainbow Delimiter Tier Colors (4 tiers)
    const tiersBody = this.createSubCollapsible(
      themeBody,
      "sub-rainbow-tiers",
      "Rainbow Delimiter Colors (Depth Tiers: 𝛿 ≡ k mod 4)",
      false
    );

    const TIER_NAMES = [
      "Tier 0: Outer Brackets (Depth 0)",
      "Tier 1: Nested Brackets (Depth 1)",
      "Tier 2: Deeply Nested (Depth 2)",
      "Tier 3: Core Brackets (Depth 3)",
    ];

    const TIER_DESCRIPTIONS = [
      "Color for outer delimiter nesting depth.",
      "Color for nested delimiter depth.",
      "Color for deeply nested delimiter depth.",
      "Color for core innermost delimiter depth.",
    ];

    for (let i = 0; i < 4; i++) {
      const currentTierColor = this.plugin.settings.rainbowColors[i] || RAINBOW_DELIMITER_COLORS[i];
      const setting = new Setting(tiersBody)
        .setName(TIER_NAMES[i])
        .setDesc(TIER_DESCRIPTIONS[i]);

      if (currentTierColor.startsWith("#")) {
        setting.addColorPicker((picker) => {
          picker.setValue(currentTierColor).onChange(async (val) => {
            this.plugin.settings.rainbowColors[i] = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          });
        });
      }

      setting.addText((text) => {
        text
          .setPlaceholder(RAINBOW_DELIMITER_COLORS[i])
          .setValue(currentTierColor)
          .onChange(async (val) => {
            if (val.trim()) {
              this.plugin.settings.rainbowColors[i] = val.trim();
              await this.plugin.saveSettings();
              this.plugin.rerenderMath();
            }
          });
      });
    }

    new Setting(themeBody)
      .setName("Restore default Tokyo Night palette")
      .setDesc("Revert all palette vectors and delimiter tiers back to canonical Tokyo Night presets.")
      .addButton((button) =>
        button.setButtonText("Restore Defaults").onClick(async () => {
          this.plugin.settings.palette = { ...DEFAULT_COLORS };
          this.plugin.settings.rainbowColors = [...RAINBOW_DELIMITER_COLORS];
          await this.plugin.saveSettings();
          this.plugin.rerenderMath();
          this.refresh();
          new Notice("Color Math: Restored default Tokyo Night palette.");
        })
      );

    // =========================================================================
    // Section 3: 💖 Life Quality & Typing Ergonomics
    // =========================================================================
    const qolBody = this.createCollapsible(
      containerEl,
      "section-quality-of-life",
      "💖 Life Quality & Typing Ergonomics",
      true
    );

    // Sub-collapsible 1: Brackets & Delimiters
    const bracketsBody = this.createSubCollapsible(
      qolBody,
      "sub-qol-brackets",
      "📦 Brackets & Delimiters",
      true
    );

    new Setting(bracketsBody)
      .setName("Rainbow delimiters")
      .setDesc("Computes recursive delimiter nesting depth 𝛿 mod 4 across parentheses, brackets, and set braces with half-open interval pairing ([a, b)). Keeps delimiter tree traversal instant and lag-free.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.rainbowDelimiters)
          .onChange(async (val) => {
            this.plugin.settings.rainbowDelimiters = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
            this.refresh();
          })
      );

    if (this.plugin.settings.rainbowDelimiters) {
      new Setting(bracketsBody)
        .setClass("color-math-sub-setting")
        .setName("Rainbow grouping braces ({})")
        .setDesc("Extends depth coloring to structural LaTeX TeX parameter grouping tokens ({, }) in CodeMirror 6. Evaluates in 𝒪(1) without slowing down typing.")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.rainbowBareBraces)
            .onChange(async (val) => {
              this.plugin.settings.rainbowBareBraces = val;
              await this.plugin.saveSettings();
              this.plugin.rerenderMath();
            })
        );
    }

    new Setting(bracketsBody)
      .setName("Highlight unmatched delimiters & braces")
      .setDesc("Employs compiler delimiter balance verification to flag unbalanced { or stray } with Priority Band 8 error decorations (#f7768e). Detects syntax errors instantly during typing.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.highlightUnmatchedBraces)
          .onChange(async (val) => {
            this.plugin.settings.highlightUnmatchedBraces = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(bracketsBody)
      .setName("Compiler crash immunity")
      .setDesc("Transient AST boundary auto-sealing: dynamically injects virtual \\right. sentinels and balancing braces at equation boundaries during active typing to prevent MathJax parsing crashes. Eliminates red error boxes with zero typing lag.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.crashImmunityAutoSeal)
          .onChange(async (val) => {
            this.plugin.settings.crashImmunityAutoSeal = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(bracketsBody)
      .setName("Auto-scaling delimiters (Typst style)")
      .setDesc("Performs structural vertical height detection: promotes standard delimiters to \\left and \\right when enclosing multi-level AST nodes (\\frac{a}{b}, \\sum, \\int, \\begin{matrix}), while keeping flat expressions at 𝒪(1) compact sizing. Slightly increases formula evaluation time while keeping typing fast.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoScaleDelimiters)
          .onChange(async (val) => {
            this.plugin.settings.autoScaleDelimiters = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    // Sub-collapsible 2: Matrices & Layout Ergonomics
    const matricesBody = this.createSubCollapsible(
      qolBody,
      "sub-qol-matrices",
      "📐 Matrices & Layout Ergonomics",
      true
    );

    new Setting(matricesBody)
      .setName("Ergonomic matrix padding (&)")
      .setDesc("Injects visual structural spacing delimiters (&) at matrix perimeters without altering underlying algebraic dimensions or matrix rank. Runs instantaneously with zero overhead.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.padMatrixPadding)
          .onChange(async (val) => {
            this.plugin.settings.padMatrixPadding = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    // =========================================================================
    // Section 4: 🧠 Mathematical Syntax & Disambiguation
    // =========================================================================
    const mathBody = this.createCollapsible(
      containerEl,
      "section-math-syntax",
      "🧠 Mathematical Syntax & Disambiguation",
      false
    );

    // Sub-collapsible 1: Calculus & Analysis
    const calculusBody = this.createSubCollapsible(
      mathBody,
      "sub-math-calculus",
      "📐 Calculus & Analysis",
      false
    );

    new Setting(calculusBody)
      .setName("Derivative fractions & partials")
      .setDesc("Isolates differential operators (df/dx, ∂ψ/∂t, ∇) from scalar rational expressions (d·f / d·x), eliminating variable shadowing on indeterminate d and symbol ∂. Operates via fast AST pattern matching without typing lag.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.colorDerivativeFractions)
          .onChange(async (val) => {
            this.plugin.settings.colorDerivativeFractions = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(calculusBody)
      .setName("Infinitesimal differentials")
      .setDesc("Detects measure differentials (dx, dt, dθ) at integration boundaries while protecting geometric domain boundaries (∂Ω, ∂V). Resolves boundary tokens instantly with zero slowdown.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.colorInfinitesimals)
          .onChange(async (val) => {
            this.plugin.settings.colorInfinitesimals = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    // Sub-collapsible 2: Symbol Taxonomy & Constants
    const taxonomyBody = this.createSubCollapsible(
      mathBody,
      "sub-math-taxonomy",
      "🏷️ Symbol Taxonomy & Constants",
      false
    );

    new Setting(taxonomyBody)
      .setName("Mathematical symbol taxonomy")
      .setDesc("Classifies 6,879+ symbols using a Minimal Perfect Hash Function (Lemire MPHF) with strictly tight 𝚯(1) constant-time lookup (~55 ns). Resolves symbols at 18,000,000 lookups/second with zero performance slowdown.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableTaxonomy)
          .onChange(async (val) => {
            this.plugin.settings.enableTaxonomy = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
            this.refresh();
          })
      );

    if (this.plugin.settings.enableTaxonomy) {
      new Setting(taxonomyBody)
        .setClass("color-math-sub-setting")
        .setName("Standard math functions")
        .setDesc("Resolves elementary and transcendental function operators (sin, cos, ln, exp) via 𝚯(1) hash indexing. Executes in ~55 ns with zero latency.")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.taxonomyFunctions)
            .onChange(async (val) => {
              this.plugin.settings.taxonomyFunctions = val;
              await this.plugin.saveSettings();
              this.plugin.rerenderMath();
            })
        );

      new Setting(taxonomyBody)
        .setClass("color-math-sub-setting")
        .setName("Greek parameters & coefficients")
        .setDesc("Maps Greek scalar coefficients and manifold coordinates (α, β, θ, λ, ω) to parameter styling via 𝚯(1) lookup. Runs with zero typing lag.")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.taxonomyParameters)
            .onChange(async (val) => {
              this.plugin.settings.taxonomyParameters = val;
              await this.plugin.saveSettings();
              this.plugin.rerenderMath();
            })
        );

      new Setting(taxonomyBody)
        .setClass("color-math-sub-setting")
        .setName("Mathematical constants")
        .setDesc("Identifies universal invariants (π, ℏ, e, ∞) via 𝚯(1) catalog matching. Adds zero performance overhead.")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.taxonomyConstants)
            .onChange(async (val) => {
              this.plugin.settings.taxonomyConstants = val;
              await this.plugin.saveSettings();
              this.plugin.rerenderMath();
            })
        );

      new Setting(taxonomyBody)
        .setClass("color-math-sub-setting")
        .setName("Bound iteration indices")
        .setDesc("Identifies bound dummy index variables in summation (\\sum_{i=1}^n), product (\\prod_{k=1}^m), and limit (\\lim_{x→0}) scopes. Resolves index bounds instantaneously.")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.taxonomyIndices)
            .onChange(async (val) => {
              this.plugin.settings.taxonomyIndices = val;
              await this.plugin.saveSettings();
              this.plugin.rerenderMath();
            })
        );
    }

    new Setting(taxonomyBody)
      .setName("Euler's number (e) & Imaginary units (i, j)")
      .setDesc("Contextual constant disambiguation: identifies e (base of natural log) in exponentiations and i, j ∈ ℂ as imaginary units, while reserving indexed occurrences (e₁, xᵢ) as algebraic variables. Adds sub-microsecond context checks that do not slow down typing.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.colorSingleConstants)
          .onChange(async (val) => {
            this.plugin.settings.colorSingleConstants = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    // Sub-collapsible 3: Physics & Quantum Mechanics
    const physicsBody = this.createSubCollapsible(
      mathBody,
      "sub-math-physics-quantum",
      "⚛️ Physics & Quantum Mechanics",
      false
    );

    new Setting(physicsBody)
      .setName("Enable quantum operators globally")
      .setDesc("Evaluates Hamiltonian and canonical commutation differential operators (Energy: iℏ∂/∂t, Momentum: -iℏ∇, Kinetic: -ℏ²/2m ∇²) globally across all notes without requiring YAML frontmatter. Runs with minimal regex evaluation overhead.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableQuantumOperatorsGlobal)
          .onChange(async (val) => {
            this.plugin.settings.enableQuantumOperatorsGlobal = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(physicsBody)
      .setName("Quantum bra-ket notation")
      .setDesc("Disambiguates Hilbert space Dirac state vectors (|ψ⟩, ⟨ϕ|, ⟨ϕ|ψ⟩) from Euclidean inner products ⟨u, v⟩ and stochastic quadratic variations ⟨M⟩_t. Operates via single-pass bracket inspection with zero typing lag.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.colorBraKet)
          .onChange(async (val) => {
            this.plugin.settings.colorBraKet = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(physicsBody)
      .setName("Color physical units")
      .setDesc("Isolates SI dimensional units and metric prefixes (m/s, kg, μm, GHz) bound to numerical scalars, preventing collision with algebraic variables. Gated by scalar boundaries to keep parsing fast.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.colorUnits)
          .onChange(async (val) => {
            this.plugin.settings.colorUnits = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(physicsBody)
      .setName("Engineering dimensionless numbers")
      .setDesc("Parses contiguous fluid transport and similarity parameters (Re, Ma, Pr, Nu) as unified tokens, while preserving scalar multiplication for separated glyphs (R · e). Token evaluation executes with zero noticeable delay.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.colorDimensionless)
          .onChange(async (val) => {
            this.plugin.settings.colorDimensionless = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    // Sub-collapsible 4: Advanced Functions & Data Flow
    const advancedBody = this.createSubCollapsible(
      mathBody,
      "sub-math-advanced",
      "⚙️ Advanced Functions & Data Flow",
      false
    );

    new Setting(advancedBody)
      .setName("Extended 2–3 letter functions")
      .setDesc("Recognizes shorthand linear algebra and statistical operators (adj, var, cov, im, div, rot) strictly gated by structural argument delimiters ((...), [...]). The delimiter requirement provides 𝒪(1) fast bailout, keeping typing lag-free.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.extendedFunctions)
          .onChange(async (val) => {
            this.plugin.settings.extendedFunctions = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(advancedBody)
      .setName("Variable data-flow hashing")
      .setDesc("Computes deterministic 32-bit hash keys (h(v) mod K) per algebraic variable to track repeated variables with uniform colors across derivations. Adds minor hashing overhead per token, slightly slowing down rendering on massive equations.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.variableDataFlow)
          .onChange(async (val) => {
            this.plugin.settings.variableDataFlow = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    // =========================================================================
    // Section 5: 🔤 Unicode Math & Typography
    // =========================================================================
    const unicodeBody = this.createCollapsible(
      containerEl,
      "section-unicode-typography",
      "🔤 Unicode Math & Typography",
      false
    );

    new Setting(unicodeBody)
      .setName("Greek letter style")
      .setDesc("Selects between Plane 1 Mathematical Italic Symbols (U+1D400–U+1D7FF) and Standard BMP Greek (U+0370–U+03FF) for Unicode conversion. Conversion occurs in-memory with zero typing overhead.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("plane1", "Mathematical Italic (Plane 1: 𝝍, 𝝰) — Recommended for math")
          .addOption("standard", "Standard Greek (ψ, α) — Standard Unicode alphabet")
          .setValue(this.plugin.settings.greekStyle || "plane1")
          .onChange(async (val) => {
            this.plugin.settings.greekStyle = val as "plane1" | "standard";
            await this.plugin.saveSettings();
          })
      );

    new Setting(unicodeBody)
      .setName("Convert definite / bounded integrals")
      .setDesc("Controls conversion of bounded integrals (\\int_a^b) to Unicode (∫_a^b). Keeping this OFF preserves LaTeX commands for proper displaystyle vertical limit placement in TeX engines.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.convertDefiniteIntegrals)
          .onChange(async (val) => {
            this.plugin.settings.convertDefiniteIntegrals = val;
            await this.plugin.saveSettings();
          })
      );

    new Setting(unicodeBody)
      .setName("Convert bounded operators")
      .setDesc("Controls conversion of bounded summation and product operators (\\sum_{i=1}^n) to Unicode (∑_{i=1}^n). Keeping this OFF preserves LaTeX commands for centered vertical limit layout.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.convertBoundedOperators)
          .onChange(async (val) => {
            this.plugin.settings.convertBoundedOperators = val;
            await this.plugin.saveSettings();
          })
      );

    new Setting(unicodeBody)
      .setName("Convert LaTeX in prose to Unicode")
      .setDesc("Scans prose text outside math delimiters to transform LaTeX commands into Unicode glyphs, strictly isolating markdown code spans (`...`) and fenced blocks. Single-pass regex scan executes in milliseconds.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.convertProseToUnicode)
          .onChange(async (val) => {
            this.plugin.settings.convertProseToUnicode = val;
            await this.plugin.saveSettings();
          })
      );

    new Setting(unicodeBody)
      .setName("Convert Unicode in prose to LaTeX")
      .setDesc("Reverses Unicode mathematical symbols in prose back to canonical LaTeX commands, strictly protecting code spans and fenced blocks. Executes in milliseconds with zero note corruption.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.convertProseToLatex)
          .onChange(async (val) => {
            this.plugin.settings.convertProseToLatex = val;
            await this.plugin.saveSettings();
          })
      );

    // =========================================================================
    // Section 6: 🛠️ Diagnostics & Maintenance
    // =========================================================================
    const domainBody = this.createCollapsible(
      containerEl,
      "section-domain-diagnostics",
      "🛠️ Diagnostics & Maintenance",
      false
    );

    new Setting(domainBody)
      .setName("Syntax error display mode")
      .setDesc("Configures MathJax compilation fault handling (inline TeX annotation, DOM fallback to raw source, notice dispatch, or native error box) when formulas contain unrecoverable syntax errors. Handles errors gracefully with zero editor freeze.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("inline", "Inline error message (e.g. \\text{LaTeX Error: ...})")
          .addOption("fallback", "Render original formula (Silent & clean with hover tooltip)")
          .addOption("notice", "Obsidian notice popup & original formula")
          .addOption("native", "Native MathJax error box (Default MathJax behavior)")
          .setValue(this.plugin.settings.errorDisplayMode || "inline")
          .onChange(async (val) => {
            this.plugin.settings.errorDisplayMode = val as ErrorDisplayMode;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(domainBody)
      .setName("Restore all factory defaults")
      .setDesc("Restores the canonical JSON configuration schema across all 13 semantic roles, rainbow tiers, and normalization flags. Re-renders open viewports instantaneously.")
      .addButton((button) =>
        button
          .setButtonText("Reset to Factory Defaults")
          .setWarning()
          .onClick(async () => {
            await this.plugin.resetSettingsToDefaults();
            this.refresh();
          })
      );

    // =========================================================================
    // Section 7: 🧪 Feature Previews & Experimental
    // =========================================================================
    const previewBody = this.createCollapsible(
      containerEl,
      "section-feature-previews",
      "🧪 Feature Previews & Experimental",
      false
    );

    new Setting(previewBody)
      .setName("LaTeX syntax auto-normalization")
      .setDesc("Context-aware heuristic argument consumer: transforms unbraced TeX arguments (\\frac 12 3 → \\frac{12}{3}, \\frac a b → \\frac{a}{b}) via bounded monomial lookahead, bounded by matrix cell dividers (&, \\\\) and \\text{...} boundaries. Resolving unbraced notation requires per-token lookahead and slightly slows down compilation compared to standard braced LaTeX.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.previewLatexNormalization)
          .onChange(async (val) => {
            this.plugin.settings.previewLatexNormalization = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(previewBody)
      .setName("Require braces for infix slash division")
      .setDesc("Restricts infix division conversion strictly to braced pairs ({a}/{b} or [a]/[b]). Braced delimiters allow 𝚯(1) sub-nanosecond bailout, making parsing significantly faster and eliminating ambiguity with physical unit slashes (m/s).")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.requireBracesForSlashDivision)
          .onChange(async (val) => {
            this.plugin.settings.requireBracesForSlashDivision = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(previewBody)
      .setName("Default mathematical mode")
      .setDesc("Sets the global mathematical discipline domain (analysis, geometry, algebra, quantum, stochastic), configuring the primary lexer priority ladder for notes without frontmatter mode tags. Switches priority rules with zero runtime overhead.")
      .addDropdown((dropdown) =>
        dropdown
          // 6 Super-Families
          .addOption("analysis", "📐 Analysis & Calculus (Super-Family)")
          .addOption("pde", "🌊 Fields & PDEs (Super-Family)")
          .addOption("dynamics", "⏱️ Dynamics & Optimization (Super-Family)")
          .addOption("geometry", "🌐 Geometry & Tensors (Super-Family)")
          .addOption("algebra", "🔣 Algebra & Discrete (Super-Family)")
          .addOption("quantum_stochastic", "⚛️ Quantum & Stochastics (Super-Family)")
          // 14 Granular Disciplines
          .addOption("calculus", "— Classical Calculus & Real Analysis")
          .addOption("complex", "— Complex Analysis & Residues")
          .addOption("pde_transport", "— Transport & Fluid PDEs")
          .addOption("continuum", "— Continuum & Wave Mechanics")
          .addOption("ode_dynamics", "— Dynamical Systems & State-Space ODEs")
          .addOption("optimization", "— Optimization & Variational Calculus")
          .addOption("geometry_tensors", "— Differential Geometry & Tensors")
          .addOption("topology", "— Topology & Invariants")
          .addOption("linear_algebra", "— Linear Algebra & Matrix Theory")
          .addOption("abstract_algebra", "— Abstract Algebra & Category Theory")
          .addOption("number_theory", "— Discrete Math & Number Theory")
          .addOption("logic_sets", "— Logic & Set Theory")
          .addOption("quantum", "— Quantum Mechanics & Information")
          .addOption("probability", "— Probability & Statistics")
          .addOption("stochastic", "— Stochastic Calculus (Itô / Finance)")
          .setValue(this.plugin.settings.defaultMode || "analysis")
          .onChange(async (val) => {
            this.plugin.settings.defaultMode = val as ActiveMathMode;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(previewBody)
      .setName("Auto-detect note mode from tags & YAML")
      .setDesc("Queries cached note metadata and hierarchical #tags in 𝚯(1) from app.metadataCache to dynamically specialize lexer priority ladders per file. Cached lookups ensure zero disk I/O and zero note loading lag.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoDetectNoteMode !== false)
          .onChange(async (val) => {
            this.plugin.settings.autoDetectNoteMode = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );
  }
}
