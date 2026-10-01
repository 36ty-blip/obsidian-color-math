export class Notice {
  constructor(public message: string, public timeout?: number) {}
}

export async function loadMathJax(): Promise<void> {
  return Promise.resolve();
}

export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class App {}
export class MarkdownView {}
export class Menu {}
export class Editor {}
export class SuggestModal<T> {
  constructor(public app: any) {}
  setPlaceholder(placeholder: string): void {}
  open(): void {}
  close(): void {}
}
export type SettingDefinitionItem = any;
