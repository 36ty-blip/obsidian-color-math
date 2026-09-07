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
} from "obsidian";
import { ColorPalette, ColorRole, ColorMathOptions, DEFAULT_COLORS, setPalette } from "./config";
import { convertMathBlock, convertText } from "./converters/block";
import { createColorMathLivePlugin } from "./editor/live_preview";
import { MathJaxInterceptor } from "./editor/mathjax_interceptor";
import { scanMarkdown } from "./parsers/markdown_scanner";
import { uncolorFragment, uncolorText } from "./undo";
import { extractThemePalette, isVaultLightMode } from "./utils/theme_colors";

interface ColorMathSettings {
  palette: ColorPalette;
  liveRendering: boolean;
  livePreviewHighlighting: boolean;
  showRibbonIcon: boolean;
  autoSyncTheme: boolean;
  autoLightDark: boolean;
  enableTaxonomy: boolean;
  rainbowDelimiters: boolean;
  variableDataFlow: boolean;
  colorUnits: boolean;
  colorDifferentials: boolean;
  colorBraKet: boolean;
  colorDimensionless: boolean;
}

const DEFAULT_SETTINGS: ColorMathSettings = {
  palette: { ...DEFAULT_COLORS },
  liveRendering: true,
  livePreviewHighlighting: false,
  showRibbonIcon: true,
  autoSyncTheme: false,
  autoLightDark: true,
  enableTaxonomy: true,
  rainbowDelimiters: true,
  variableDataFlow: false,
  colorUnits: true,
  colorDifferentials: true,
  colorBraKet: true,
  colorDimensionless: true,
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
};

export default class ColorMathPlugin extends Plugin {
  settings: ColorMathSettings = DEFAULT_SETTINGS;
  ribbonIconEl: HTMLElement | null = null;
  interceptor: MathJaxInterceptor | null = null;

  async onload() {
    await this.loadSettings();
    setPalette(this.settings.palette);

    // 1. Install MathJax rendering interceptor for automatic Live Preview & Reading View coloring
    this.interceptor = new MathJaxInterceptor(
      () => this.settings.palette,
      () => this.getMathOptions(),
      () => this.settings.liveRendering
    );
    await this.interceptor.install();

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

    // Settings tab
    this.addSettingTab(new ColorMathSettingTab(this.app, this));

    // Initial workspace math rerender
    this.rerenderMath();
  }

  onunload() {
    this.interceptor?.uninstall();
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

  getMathOptions(): ColorMathOptions {
    return {
      enableTaxonomy: this.settings.enableTaxonomy,
      rainbowDelimiters: this.settings.rainbowDelimiters,
      variableDataFlow: this.settings.variableDataFlow,
      colorUnits: this.settings.colorUnits,
      colorDifferentials: this.settings.colorDifferentials,
      colorBraKet: this.settings.colorBraKet,
      colorDimensionless: this.settings.colorDimensionless,
    };
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
      this.getMathOptions()
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

    const mathBlocks = scanMarkdown(content).mathBlocks;
    const currentBlock = mathBlocks.find(
      (span) => span.start <= offset && offset <= span.end
    );

    if (!currentBlock) {
      new Notice("Color Math: Cursor is not inside a math block ($$...$$).");
      return;
    }

    const rawBlock = content.slice(currentBlock.start, currentBlock.end);
    const uncolored = uncolorFragment(rawBlock);

    if (uncolored === rawBlock) {
      new Notice("Color Math: No color wrappers found to remove in this block.");
      return;
    }

    const from = editor.offsetToPos(currentBlock.start);
    const to = editor.offsetToPos(currentBlock.end);
    editor.replaceRange(uncolored, from, to);
    new Notice("Color Math: Reverted math block to clean LaTeX.");
  }

  colorizeSelection(editor: Editor) {
    const selection = editor.getSelection();
    if (selection) {
      const colored = convertText(
        selection,
        this.settings.palette,
        this.getMathOptions()
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
      editor.replaceSelection(uncolored);
      new Notice("Color Math: Reverted selection to clean LaTeX.");
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
      this.getMathOptions()
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
      new Notice("Color Math: No color wrappers found to remove.");
      return;
    }

    const cursor = editor.getCursor();
    editor.setValue(uncolored);
    editor.setCursor(cursor);
    new Notice("Color Math: Reverted math colors to clean LaTeX.");
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
    const loadedData = (await this.loadData()) as Partial<ColorMathSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData || {});
    if (!this.settings.palette) {
      this.settings.palette = { ...DEFAULT_COLORS };
    } else {
      this.settings.palette = Object.assign({}, DEFAULT_COLORS, this.settings.palette);
    }
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

  display(): void {
    this.containerEl.empty();
    this.buildTab(this.containerEl);
  }

  private buildTab(containerEl: HTMLElement): void {
    containerEl.createEl("p", {
      text: "Automatically apply semantic colors to LaTeX and MathJax equations in markdown notes.",
    });

    new Setting(containerEl)
      .setName("Show ribbon icon")
      .setDesc("Display the Color Math palette icon on the left ribbon bar. Note: you can reorder or move ribbon icons via Settings > Appearance > Ribbon menu.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRibbonIcon)
          .onChange(async (val) => {
            this.plugin.settings.showRibbonIcon = val;
            await this.plugin.saveSettings();
            this.plugin.refreshRibbonIcon();
          })
      );

    new Setting(containerEl)
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

    new Setting(containerEl)
      .setName("Real-time editor syntax highlighting")
      .setDesc("Highlight equations inside the editor in real-time as you type.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.livePreviewHighlighting)
          .onChange(async (val) => {
            this.plugin.settings.livePreviewHighlighting = val;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName("IDE Visual Enhancements").setHeading();

    new Setting(containerEl)
      .setName("Rainbow delimiters")
      .setDesc("Color nested parentheses, brackets, and braces by depth to prevent delimiter blindness.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.rainbowDelimiters)
          .onChange(async (val) => {
            this.plugin.settings.rainbowDelimiters = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(containerEl)
      .setName("Mathematical symbol taxonomy")
      .setDesc("Semantically categorize and color constants, standard functions, parameters, and bound indices.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableTaxonomy)
          .onChange(async (val) => {
            this.plugin.settings.enableTaxonomy = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(containerEl)
      .setName("Variable data-flow hashing")
      .setDesc("Deterministically assign a unique color to each variable in an expression to trace its flow.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.variableDataFlow)
          .onChange(async (val) => {
            this.plugin.settings.variableDataFlow = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(containerEl)
      .setName("Color physical units")
      .setDesc("Distinguish physical units and metric prefixes (e.g. μm, m/s, kg) from algebraic variables and parameters. Turn off to keep units in natural text color.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.colorUnits)
          .onChange(async (val) => {
            this.plugin.settings.colorUnits = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(containerEl)
      .setName("Calculus differentials & derivatives")
      .setDesc("Color differentials (dx, dt, dθ) and derivative fractions (df/dx, ∂/∂t) with the derivative role to prevent misidentifying 'd' as a variable.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.colorDifferentials)
          .onChange(async (val) => {
            this.plugin.settings.colorDifferentials = val;
            await this.plugin.saveSettings();
            this.plugin.rerenderMath();
          })
      );

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl).setName("Theme Integration").setHeading();

    new Setting(containerEl)
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
            this.containerEl.empty();
            this.buildTab(this.containerEl);
            new Notice("Color Math: Synced colors with active Obsidian theme!");
          })
      );

    new Setting(containerEl)
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
            this.containerEl.empty();
            this.buildTab(this.containerEl);
          })
      );

    new Setting(containerEl)
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
            this.containerEl.empty();
            this.buildTab(this.containerEl);
          })
      );

    new Setting(containerEl)
      .setName("Restore default palette")
      .setDesc("Revert all colors back to our signature Tokyo Night palette.")
      .addButton((button) =>
        button.setButtonText("Restore Defaults").onClick(async () => {
          this.plugin.settings.palette = { ...DEFAULT_COLORS };
          await this.plugin.saveSettings();
          this.plugin.rerenderMath();
          this.containerEl.empty();
          this.buildTab(this.containerEl);
          new Notice("Color Math: Restored default Tokyo Night palette.");
        })
      );

    new Setting(containerEl).setName("Color Palette Roles").setHeading();

    const roles = Object.keys(DEFAULT_COLORS) as ColorRole[];

    for (const role of roles) {
      const setting = new Setting(containerEl)
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
  }
}
