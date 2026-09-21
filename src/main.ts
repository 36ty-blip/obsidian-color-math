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
  type SettingDefinitionItem,
} from "obsidian";
import {
  ColorPalette,
  ColorRole,
  ColorMathOptions,
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
  enableQuantumOperatorsGlobal: boolean;
  previewLatexNormalization: boolean;
  collapsedSections: Record<string, boolean>;
}

const DEFAULT_SETTINGS: ColorMathSettings = {
  palette: { ...DEFAULT_COLORS },
  rainbowColors: [...RAINBOW_DELIMITER_COLORS],
  liveRendering: true,
  livePreviewHighlighting: false,
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
  convertProseToUnicode: false,
  convertProseToLatex: false,
  autoDetectNoteField: true,
  enableQuantumOperatorsGlobal: false,
  previewLatexNormalization: true,
  collapsedSections: {},
};

const COLOR_ROLE_DESCRIPTIONS: Record<ColorRole, string> = {
  main: "Primary expression / function color",
  orange: "Constants, coefficients, and major operators",
  dot: "Multiplication dots and symbols",
  derivative: "Outer derivatives and prime markers",
  chain: "Chain rule factors and subscripts",
  upper: "Superscripts and matrix outer wrappers",
  relation: "Relations, equalities, and tensors",
  arrow: "Arrows and mappings",
  set: "Set theory symbols",
  spacing: "LaTeX spacing commands",
  parameter: "Parameters, angles, and Greek coefficients",
  unit: "Physical units and metric prefixes (e.g. μm, m/s, nm)",
  energyOperator: "Quantum operators (Energy: iℏ∂/∂t, Momentum: -iℏ∇, Kinetic: -ℏ²/2m ∇²)",
};

export default class ColorMathPlugin extends Plugin {
  settings: ColorMathSettings = DEFAULT_SETTINGS;
  ribbonIconEl: HTMLElement | null = null;
  interceptor: MathJaxInterceptor | null = null;
  private mcpCleanup: (() => void) | null = null;

  async onload() {
    await this.loadSettings();
    setPalette(this.settings.palette);

    // 1. Install MathJax rendering interceptor for automatic Live Preview & Reading View coloring
    this.interceptor = new MathJaxInterceptor(
      () => this.settings.palette,
      () => this.getMathOptions(),
      () => this.settings.liveRendering,
      () => this.settings.errorDisplayMode
    );
    await this.interceptor.install(() => this.rerenderMath());

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

    // 3. Bake colors into current math block
    this.addCommand({
      id: "colorize-current-block",
      name: "Bake colors into current math block",
      editorCallback: (editor: Editor) => {
        void this.colorizeCurrentMathBlock(editor);
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

    // Register MCP tools with Obsidian Local REST API if installed
    this.setupMcpTools();
    this.app.workspace.onLayoutReady(() => {
      if (!this.mcpCleanup) {
        this.setupMcpTools();
      }
      if (!this.interceptor?.isInstalled()) {
        void this.interceptor?.install(() => this.rerenderMath());
      } else {
        this.rerenderMath();
      }
    });

    // Initial workspace math rerender
    this.rerenderMath();
  }

  onunload() {
    this.mcpCleanup?.();
    this.mcpCleanup = null;
    this.interceptor?.uninstall();
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
      workspace?: { getActiveFile?: () => unknown; getActiveViewOfType?: (type: unknown) => MarkdownView | null };
      metadataCache?: { getFileCache?: (file: unknown) => { frontmatter?: Record<string, unknown> } | null };
    };
    const file = appWithMeta.workspace?.getActiveFile?.();
    const cache = file ? appWithMeta.metadataCache?.getFileCache?.(file)?.frontmatter : undefined;

    let text = content;
    if (!text && !cache) {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view) {
        text = view.editor.getValue();
      }
    }
    return detectNoteField(text || "", cache);
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
    };

    if (this.settings.autoDetectNoteField) {
      const detected = this.getActiveNoteDetection(content);
      if (detected) {
        Object.assign(base, detected.overrides);
      }
    }

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
    this.app.workspace.updateOptions();
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

  private buildTab(containerEl: HTMLElement): void {
    containerEl.createEl("p", {
      text: "Automatically apply semantic colors to LaTeX and MathJax equations in markdown notes.",
      cls: "color-math-section-desc",
    });

    // =========================================================================
    // Section 1: ⚡ Core & Live Rendering
    // =========================================================================
    const coreBody = this.createCollapsible(
      containerEl,
      "section-core",
      "⚡ Core & Live Rendering",
      true
    );

    new Setting(coreBody)
      .setName("Show ribbon icon")
      .setDesc("Display the Color Math palette icon in the left ribbon for quick bake/clean actions.")
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
      .setDesc("Automatically colorize rendered MathJax equations in Reading View and Live Preview without modifying your raw Markdown notes.")
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
      .setDesc("Live syntax highlighting inside the CodeMirror editor as you type.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.livePreviewHighlighting)
          .onChange(async (val) => {
            this.plugin.settings.livePreviewHighlighting = val;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.livePreviewHighlighting) {
      new Setting(coreBody)
        .setClass("color-math-sub-setting")
        .setName("Highlight inline math ($...$)")
        .setDesc("Apply real-time syntax coloring to inline math expressions inside the editor.")
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
        .setDesc("Apply real-time syntax coloring to multiline display math blocks inside the editor.")
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
        .setDesc("Highlight column separator tabs (&) and row breaks (\\\\) inside tabular environments.")
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

    new Setting(themeBody)
      .setName("Sync with active theme")
      .setDesc("Extract and apply matching colors from your currently active Obsidian theme.")
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
            this.display();
            new Notice("Color Math: Synced colors with active Obsidian theme!");
          })
      );

    new Setting(themeBody)
      .setName("Auto-match on theme change")
      .setDesc("Automatically re-sync palette whenever you switch themes in Obsidian.")
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
            this.display();
          })
      );

    new Setting(themeBody)
      .setName("Auto-adapt for light / dark mode")
      .setDesc("Adjust operator contrast (e.g. '=' and '\\cdot') so math never washes out on light backgrounds.")
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
            this.display();
          })
      );

    new Setting(themeBody)
      .setName("Restore default Tokyo Night palette")
      .setDesc("Revert all colors back to our signature Tokyo Night palette.")
      .addButton((button) =>
        button.setButtonText("Restore Defaults").onClick(async () => {
          this.plugin.settings.palette = { ...DEFAULT_COLORS };
          this.plugin.settings.rainbowColors = [...RAINBOW_DELIMITER_COLORS];
          await this.plugin.saveSettings();
          this.plugin.rerenderMath();
          this.display();
          new Notice("Color Math: Restored default Tokyo Night palette.");
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
        .setName(role.charAt(0).toUpperCase() + role.slice(1))
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
      "Rainbow Delimiter Colors (Depth Tiers)",
      false
    );

    const TIER_NAMES = [
      "Tier 0: Outer Brackets (Depth 0)",
      "Tier 1: Nested Brackets (Depth 1)",
      "Tier 2: Deeply Nested (Depth 2)",
      "Tier 3: Core Brackets (Depth 3)",
    ];

    for (let i = 0; i < 4; i++) {
      const currentTierColor = this.plugin.settings.rainbowColors[i] || RAINBOW_DELIMITER_COLORS[i];
      const setting = new Setting(tiersBody)
        .setName(TIER_NAMES[i])
        .setDesc(`Color for delimiter nesting depth ${i}.`);

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

    // =========================================================================
    // Section 3: 🧠 Mathematical Syntax & Disambiguation
    // =========================================================================
    const mathBody = this.createCollapsible(
      containerEl,
      "section-math-syntax",
      "🧠 Mathematical Syntax & Disambiguation",
      false
    );

    // Group A: Calculus & Differentials
    new Setting(mathBody).setName("Calculus & Differentials").setHeading();

    new Setting(mathBody)
      .setName("Derivative fractions & partials")
      .setDesc("Color derivative fractions (df/dx, ∂ψ/∂t, ∇) with the derivative role to protect 'd' from being mistaken for a variable.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.colorDerivativeFractions)
          .onChange(async (val) => {
            this.plugin.settings.colorDerivativeFractions = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(mathBody)
      .setName("Infinitesimal differentials")
      .setDesc("Highlight trailing differentials (dx, dt, dθ) at the end of integrals and expressions.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.colorInfinitesimals)
          .onChange(async (val) => {
            this.plugin.settings.colorInfinitesimals = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(mathBody)
      .setName("Enable quantum operators globally")
      .setDesc("Always highlight quantum differential operators (Energy: iℏ∂/∂t, Momentum: -iℏ∇, Kinetic: -ℏ²/2m ∇²) across all notes without requiring YAML frontmatter.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableQuantumOperatorsGlobal)
          .onChange(async (val) => {
            this.plugin.settings.enableQuantumOperatorsGlobal = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    // Group B: Delimiters & Brackets
    new Setting(mathBody).setName("Delimiters & Brackets").setHeading();

    new Setting(mathBody)
      .setName("Rainbow delimiters")
      .setDesc("Color nested parentheses, brackets, and braces recursively by depth to prevent delimiter blindness.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.rainbowDelimiters)
          .onChange(async (val) => {
            this.plugin.settings.rainbowDelimiters = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
            this.display();
          })
      );

    if (this.plugin.settings.rainbowDelimiters) {
      new Setting(mathBody)
        .setClass("color-math-sub-setting")
        .setName("Rainbow grouping braces ({})")
        .setDesc("Include LaTeX grouping braces { and } in rainbow depth coloring in Live Preview.")
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

    new Setting(mathBody)
      .setName("Highlight unmatched delimiters & braces")
      .setDesc("Highlight unclosed { or stray } with a high-visibility warning in Live Preview to catch MathJax syntax errors while typing.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.highlightUnmatchedBraces)
          .onChange(async (val) => {
            this.plugin.settings.highlightUnmatchedBraces = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(mathBody)
      .setName("Quantum bra-ket notation")
      .setDesc("Highlight Dirac bra-ket state vectors (|ψ⟩, ⟨ϕ|, ⟨ϕ|ψ⟩) with clean delimiter styling.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.colorBraKet)
          .onChange(async (val) => {
            this.plugin.settings.colorBraKet = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    // Group C: Symbol Taxonomy & Constants
    new Setting(mathBody).setName("Symbol Taxonomy & Constants").setHeading();

    new Setting(mathBody)
      .setName("Mathematical symbol taxonomy")
      .setDesc("Semantically categorize and color constants, standard functions, parameters, and bound indices.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableTaxonomy)
          .onChange(async (val) => {
            this.plugin.settings.enableTaxonomy = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
            this.display();
          })
      );

    if (this.plugin.settings.enableTaxonomy) {
      new Setting(mathBody)
        .setClass("color-math-sub-setting")
        .setName("Standard math functions")
        .setDesc("Color sin, cos, ln, exp, and operator functions with the main role.")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.taxonomyFunctions)
            .onChange(async (val) => {
              this.plugin.settings.taxonomyFunctions = val;
              await this.plugin.saveSettings();
              this.plugin.rerenderMath();
            })
        );

      new Setting(mathBody)
        .setClass("color-math-sub-setting")
        .setName("Greek parameters & coefficients")
        .setDesc("Color Greek angles and coefficients (α, β, θ, λ, ω) with the parameter role.")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.taxonomyParameters)
            .onChange(async (val) => {
              this.plugin.settings.taxonomyParameters = val;
              await this.plugin.saveSettings();
              this.plugin.rerenderMath();
            })
        );

      new Setting(mathBody)
        .setClass("color-math-sub-setting")
        .setName("Mathematical constants")
        .setDesc("Color mathematical constants (π, ℏ, ∞) with the orange role.")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.taxonomyConstants)
            .onChange(async (val) => {
              this.plugin.settings.taxonomyConstants = val;
              await this.plugin.saveSettings();
              this.plugin.rerenderMath();
            })
        );

      new Setting(mathBody)
        .setClass("color-math-sub-setting")
        .setName("Bound iteration indices")
        .setDesc("Color summation/limit index variables (e.g. index i in \\sum_{i=1}^n or x in \\lim_{x\\to 0}) with the chain role.")
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

    new Setting(mathBody)
      .setName("Euler's number (e) & Imaginary units (i, j)")
      .setDesc("Intelligently recognize Euler's constant (e^x, e^{iπ}) and imaginary numbers (i, j), while leaving indexed variables (e_1, x_i) distinct.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.colorSingleConstants)
          .onChange(async (val) => {
            this.plugin.settings.colorSingleConstants = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    // Group D: Physics, Engineering & Variables
    new Setting(mathBody).setName("Physics, Engineering & Variables").setHeading();

    new Setting(mathBody)
      .setName("Color physical units")
      .setDesc("Distinguish physical units and metric prefixes (e.g. μm, m/s, kg) from algebraic variables. Turn off to keep units in natural text color.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.colorUnits)
          .onChange(async (val) => {
            this.plugin.settings.colorUnits = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(mathBody)
      .setName("Engineering dimensionless numbers")
      .setDesc("Recognize contiguous dimensionless numbers (Re, Ma, Pr, Nu) as unified coefficients. Separate letters like 'R e' remain separate variables.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.colorDimensionless)
          .onChange(async (val) => {
            this.plugin.settings.colorDimensionless = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(mathBody)
      .setName("Extended 2–3 letter functions")
      .setDesc("Recognize shorthand 2–3 letter math functions (adj, var, cov, im, sp, div, rot, sh, ch) before parentheses.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.extendedFunctions)
          .onChange(async (val) => {
            this.plugin.settings.extendedFunctions = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(mathBody)
      .setName("Variable data-flow hashing")
      .setDesc("Deterministically assign a unique color to each variable in an expression to visually trace its flow.")
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
    // Section 4: 🔤 Unicode Math & Typography
    // =========================================================================
    const unicodeBody = this.createCollapsible(
      containerEl,
      "section-unicode-typography",
      "🔤 Unicode Math & Typography",
      false
    );

    new Setting(unicodeBody)
      .setName("Greek letter style")
      .setDesc("Choose between Mathematical Italic (Plane 1, e.g. 𝝍, 𝝰) and Standard Greek (e.g. ψ, α) when converting to Unicode.")
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
      .setDesc("Convert bounded integrals (e.g. \\int_a^b) to Unicode (∫_a^b). When OFF (recommended), bounded integrals remain LaTeX commands to preserve vertical limit placement in TeX engines.")
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
      .setDesc("Convert bounded summation/product operators (e.g. \\sum_{i=1}^n) to Unicode (∑_{i=1}^n). When OFF (recommended), preserves LaTeX commands for proper displaystyle limits.")
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
      .setDesc("Convert LaTeX math commands like \\psi to 𝜓 in regular text outside math blocks and lines (default: OFF to protect prose). Code blocks and inline code are strictly protected.")
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
      .setDesc("Convert Unicode symbols like 𝝍 back to \\psi in regular text outside math blocks (default: OFF). When OFF, Unicode symbols in your notes prose are preserved.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.convertProseToLatex)
          .onChange(async (val) => {
            this.plugin.settings.convertProseToLatex = val;
            await this.plugin.saveSettings();
          })
      );

    // =========================================================================
    // Section 5: 🛠️ Domain Presets & Diagnostics
    // =========================================================================
    const domainBody = this.createCollapsible(
      containerEl,
      "section-domain-diagnostics",
      "🛠️ Domain Presets & Diagnostics",
      false
    );

    new Setting(domainBody)
      .setName("Auto-detect note domain from YAML properties & tags")
      .setDesc("Automatically activate Quantum mode when a note defines quantum properties (keys: field, subject, topic, discipline, category, or color-math.field) or tags (#quantum, #physics, #qm, #quantum-mechanics).")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoDetectNoteField)
          .onChange(async (val) => {
            this.plugin.settings.autoDetectNoteField = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(domainBody)
      .setName("Syntax error display mode")
      .setDesc("Choose how to display errors when an equation has broken syntax.")
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
      .setDesc("Reset all plugin settings, Unicode conversion rules, and palette back to default.config.json.")
      .addButton((button) =>
        button
          .setButtonText("Reset to Factory Defaults")
          .setWarning()
          .onClick(async () => {
            await this.plugin.resetSettingsToDefaults();
            this.display();
          })
      );

    // =========================================================================
    // Section 6: 🧪 Feature Previews
    // =========================================================================
    const previewBody = this.createCollapsible(
      containerEl,
      "section-feature-previews",
      "🧪 Feature Previews",
      false
    );

    new Setting(previewBody)
      .setName("LaTeX syntax auto-normalization")
      .setDesc("Pre-process and normalize unbraced macro arguments (e.g. \\frac a b → \\frac{a}{b}, \\frac \\vec F b → \\frac{\\vec F}{b}, x^2 → x^{2}) before coloring to prevent LaTeX syntax errors from casual or unbraced notation.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.previewLatexNormalization)
          .onChange(async (val) => {
            this.plugin.settings.previewLatexNormalization = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );
  }
}
