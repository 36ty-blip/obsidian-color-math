// src/editor/reference_modal.ts
// Interactive Modal and Vault Note Export Manager for Color Math Syntax & Operator Reference

import { App, Modal, MarkdownRenderer, Notice, TFile } from "obsidian";
import { SYNTAX_GUIDE_MD, COLOR_MATH_REFERENCE_FILENAME } from "../docs/syntax_guide";

/**
 * Creates or opens the authoritative Color Math reference guide note in the vault root.
 */
export async function exportReferenceNote(app: App): Promise<TFile> {
  const existing = app.vault.getAbstractFileByPath(COLOR_MATH_REFERENCE_FILENAME);
  if (existing instanceof TFile) {
    const leaf = app.workspace.getLeaf(true);
    await leaf.openFile(existing);
    new Notice(`Color Math: '${COLOR_MATH_REFERENCE_FILENAME}' already exists in vault and was opened.`);
    return existing;
  }

  const created = await app.vault.create(COLOR_MATH_REFERENCE_FILENAME, SYNTAX_GUIDE_MD);
  const leaf = app.workspace.getLeaf(true);
  await leaf.openFile(created);
  new Notice(`Color Math: Created and opened '${COLOR_MATH_REFERENCE_FILENAME}' in vault.`);
  return created;
}

/**
 * Interactive Cheatsheet Modal rendering the full mathematical syntax catalog with KaTeX support.
 */
export class ColorMathReferenceModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("color-math-reference-modal-container");
    contentEl.addClass("color-math-reference-modal-content");

    // Sticky Top Toolbar
    const toolbarEl = contentEl.createDiv({ cls: "color-math-reference-toolbar" });

    const titleEl = toolbarEl.createDiv({ cls: "color-math-reference-title" });
    titleEl.createEl("span", {
      text: "📐 Color Math — Syntax & Operator Reference",
      cls: "color-math-reference-heading",
    });

    const actionsEl = toolbarEl.createDiv({ cls: "color-math-reference-actions" });

    const exportBtn = actionsEl.createEl("button", {
      text: "Export Note to Vault",
      cls: "mod-cta color-math-ref-btn",
    });
    exportBtn.addEventListener("click", () => {
      void exportReferenceNote(this.app);
    });

    const copyBtn = actionsEl.createEl("button", {
      text: "Copy Markdown",
      cls: "color-math-ref-btn",
    });
    copyBtn.addEventListener("click", () => {
      void navigator.clipboard.writeText(SYNTAX_GUIDE_MD).then(
        () => {
          new Notice("Color Math: Reference guide markdown copied to clipboard.");
        },
        () => {
          new Notice("Color Math: Unable to copy to clipboard.");
        }
      );
    });

    // Scrollable Markdown Render Container
    const bodyEl = contentEl.createDiv({ cls: "color-math-reference-body markdown-rendered" });

    void MarkdownRenderer.render(
      this.app,
      SYNTAX_GUIDE_MD,
      bodyEl,
      "",
      this
    );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
