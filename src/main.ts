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
import { ColorPalette, ColorRole, DEFAULT_COLORS, setPalette } from "./config";
import { convertMathBlock, convertText } from "./converters/block";
import { createColorMathLivePlugin } from "./editor/live_preview";
import { scanMarkdown } from "./parsers/markdown_scanner";
import { uncolorFragment, uncolorText } from "./undo";
import { extractThemePalette, isVaultLightMode } from "./utils/theme_colors";

interface ColorMathSettings {
  palette: ColorPalette;
  livePreviewHighlighting: boolean;
  showRibbonIcon: boolean;
  autoSyncTheme: boolean;
  autoLightDark: boolean;
}

const DEFAULT_SETTINGS: ColorMathSettings = {
  palette: { ...DEFAULT_COLORS },
  livePreviewHighlighting: false,
  showRibbonIcon: true,
  autoSyncTheme: false,
  autoLightDark: true,
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
};

export default class ColorMathPlugin extends Plugin {
  settings: ColorMathSettings = DEFAULT_SETTINGS;
  ribbonIconEl: HTMLElement | null = null;

  async onload() {
    await this.loadSettings();
    setPalette(this.settings.palette);

    // Register CodeMirror 6 Live Preview syntax highlighting extension
    this.registerEditorExtension([
      createColorMathLivePlugin(
        () => this.settings.palette,
        () => this.settings.livePreviewHighlighting
      ),
    ]);

    // Setup Ribbon icon according to settings
    this.refreshRibbonIcon();

    // Listen for theme and light/dark mode changes
    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        this.handleThemeChange();
      })
    );

    // 1. Colorize current note
    this.addCommand({
      id: "color-math-colorize-note",
      name: "Colorize current note",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
          if (!checking) {
            this.colorizeActiveNote();
          }
          return true;
        }
        return false;
      },
    });

    // 2. Undo current note
    this.addCommand({
      id: "color-math-undo-note",
      name: "Undo current note",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
          if (!checking) {
            this.uncolorActiveNote();
          }
          return true;
        }
        return false;
      },
    });

    // 3. Colorize current math block
    this.addCommand({
      id: "color-math-colorize-current-block",
      name: "Colorize current math block",
      editorCallback: (editor: Editor) => {
        this.colorizeCurrentMathBlock(editor);
      },
    });

    // 4. Undo current math block
    this.addCommand({
      id: "color-math-undo-current-block",
      name: "Undo current math block",
      editorCallback: (editor: Editor) => {
        this.uncolorCurrentMathBlock(editor);
      },
    });

    // 5. Colorize selection
    this.addCommand({
      id: "color-math-colorize-selection",
      name: "Colorize selection",
      editorCallback: (editor: Editor) => {
        this.colorizeSelection(editor);
      },
    });

    // 6. Undo selection
    this.addCommand({
      id: "color-math-undo-selection",
      name: "Undo selection",
      editorCallback: (editor: Editor) => {
        this.uncolorSelection(editor);
      },
    });

    // Settings tab
    this.addSettingTab(new ColorMathSettingTab(this.app, this));
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
        .setTitle("Colorize current note")
        .setIcon("file-text")
        .onClick(() => this.colorizeActiveNote())
    );

    menu.addItem((item) =>
      item
        .setTitle("Undo current note")
        .setIcon("undo")
        .onClick(() => this.uncolorActiveNote())
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle("Colorize current math block")
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
        .setTitle("Undo current math block")
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
        .setTitle("Colorize selection")
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
        .setTitle("Undo selection")
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
          const setting = (this.app as any).setting;
          if (setting && setting.openTabById) {
            setting.open();
            setting.openTabById(this.manifest.id);
          }
        })
    );

    menu.showAtMouseEvent(evt);
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
    const colored = convertMathBlock(rawBlock, this.settings.palette);

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
      const colored = convertText(selection, this.settings.palette);
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
    const colored = convertText(content, this.settings.palette);

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
    const loadedData = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
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
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Color Math Settings" });
    containerEl.createEl("p", {
      text: "Automatically apply semantic colors to LaTeX and MathJax equations in Obsidian Markdown.",
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

    containerEl.createEl("h3", { text: "Theme Integration" });

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
            this.display();
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
            }
            await this.plugin.saveSettings();
            this.display();
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
            }
            await this.plugin.saveSettings();
            this.display();
          })
      );

    new Setting(containerEl)
      .setName("Restore default palette")
      .setDesc("Revert all colors back to our signature Tokyo Night palette.")
      .addButton((button) =>
        button.setButtonText("Restore Defaults").onClick(async () => {
          this.plugin.settings.palette = { ...DEFAULT_COLORS };
          await this.plugin.saveSettings();
          this.display();
          new Notice("Color Math: Restored default Tokyo Night palette.");
        })
      );

    containerEl.createEl("h3", { text: "Color Palette Roles" });

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
            }
          });
      });
    }
  }
}
