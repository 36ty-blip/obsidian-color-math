// src/editor/quick_menu_modal.ts
// Lightweight Obsidian SuggestModal triggered by Alt+Enter on ambiguous mathematical tokens

import { App, Editor, SuggestModal } from "obsidian";

export interface AmbiguitySuggestion {
  label: string;
  replacement: string;
  description: string;
  from?: { line: number; ch: number };
  to?: { line: number; ch: number };
}

export interface AmbiguityRule {
  name: string;
  regex: RegExp;
  suggestions: {
    label: string;
    replacement: string;
    description: string;
  }[];
}

export const AMBIGUOUS_RULES: AmbiguityRule[] = [
  {
    name: "Multiplication / Asterisk",
    regex: /\*+/g,
    suggestions: [
      {
        label: "\\cdot",
        replacement: "\\cdot ",
        description: "Dot multiplication / scalar product ($a \\cdot b$)",
      },
      {
        label: "\\times",
        replacement: "\\times ",
        description: "Cross product / dimensions ($a \\times b$)",
      },
      {
        label: "\\ast",
        replacement: "\\ast ",
        description: "Convolution / asterisk ($f \\ast g$)",
      },
    ],
  },
  {
    name: "Right Arrow / Mapping",
    regex: /->/g,
    suggestions: [
      {
        label: "\\to",
        replacement: "\\to ",
        description: "Limit or mapping ($x \\to 0$)",
      },
      {
        label: "\\longrightarrow",
        replacement: "\\longrightarrow ",
        description: "Long right arrow ($A \\longrightarrow B$)",
      },
      {
        label: "\\rightarrow",
        replacement: "\\rightarrow ",
        description: "Right arrow ($A \\rightarrow B$)",
      },
    ],
  },
  {
    name: "Implication Arrow",
    regex: /=>/g,
    suggestions: [
      {
        label: "\\implies",
        replacement: "\\implies ",
        description: "Logical implication ($P \\implies Q$)",
      },
      {
        label: "\\Longrightarrow",
        replacement: "\\Longrightarrow ",
        description: "Long implication arrow",
      },
    ],
  },
  {
    name: "Equivalence Arrow",
    regex: /<=>|<->/g,
    suggestions: [
      {
        label: "\\iff",
        replacement: "\\iff ",
        description: "If and only if ($P \\iff Q$)",
      },
      {
        label: "\\longleftrightarrow",
        replacement: "\\longleftrightarrow ",
        description: "Long bidirectional arrow",
      },
    ],
  },
  {
    name: "Inequality / Comparison",
    regex: /!=/g,
    suggestions: [
      {
        label: "\\neq",
        replacement: "\\neq ",
        description: "Not equal ($a \\neq b$)",
      },
    ],
  },
  {
    name: "Less Than or Equal",
    regex: /<=/g,
    suggestions: [
      {
        label: "\\le",
        replacement: "\\le ",
        description: "Less than or equal ($a \\le b$)",
      },
      {
        label: "\\leq",
        replacement: "\\leq ",
        description: "Less than or equal (variant)",
      },
    ],
  },
  {
    name: "Greater Than or Equal",
    regex: />=/g,
    suggestions: [
      {
        label: "\\ge",
        replacement: "\\ge ",
        description: "Greater than or equal ($a \\ge b$)",
      },
      {
        label: "\\geq",
        replacement: "\\geq ",
        description: "Greater than or equal (variant)",
      },
    ],
  },
  {
    name: "Plus-Minus",
    regex: /\+-/g,
    suggestions: [
      {
        label: "\\pm",
        replacement: "\\pm ",
        description: "Plus-minus sign ($a \\pm b$)",
      },
    ],
  },
  {
    name: "Minus-Plus",
    regex: /-\+/g,
    suggestions: [
      {
        label: "\\mp",
        replacement: "\\mp ",
        description: "Minus-plus sign ($a \\mp b$)",
      },
    ],
  },
];

/**
 * Searches the line text around the cursor for an ambiguous mathematical symbol.
 */
export function findAmbiguousTokenAtCursor(
  lineText: string,
  cursorCh: number,
  lineNumber: number
): AmbiguitySuggestion[] | null {
  for (const rule of AMBIGUOUS_RULES) {
    const regex = new RegExp(rule.regex.source, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(lineText)) !== null) {
      const matchStart = match.index;
      const matchEnd = match.index + match[0].length;

      // Check if cursor is adjacent to or inside the matched token
      if (cursorCh >= matchStart && cursorCh <= matchEnd) {
        return rule.suggestions.map((s) => ({
          ...s,
          from: { line: lineNumber, ch: matchStart },
          to: { line: lineNumber, ch: matchEnd },
        }));
      }
    }
  }

  return null;
}

export class QuickMenuModal extends SuggestModal<AmbiguitySuggestion> {
  private suggestions: AmbiguitySuggestion[];
  private editor: Editor;

  constructor(app: App, editor: Editor, suggestions: AmbiguitySuggestion[]) {
    super(app);
    this.editor = editor;
    this.suggestions = suggestions;
    this.setPlaceholder("Select mathematical notation replacement...");
  }

  getSuggestions(query: string): AmbiguitySuggestion[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.suggestions;
    return this.suggestions.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }

  renderSuggestion(suggestion: AmbiguitySuggestion, el: HTMLElement): void {
    const container = el.createDiv({ cls: "color-math-suggestion-item" });
    const title = container.createSpan({ cls: "color-math-suggestion-title" });
    title.setText(suggestion.label);
    const desc = container.createSpan({ cls: "color-math-suggestion-desc" });
    desc.setText(` — ${suggestion.description}`);
  }

  onChooseSuggestion(
    suggestion: AmbiguitySuggestion,
    _evt: MouseEvent | KeyboardEvent
  ): void {
    if (suggestion.from && suggestion.to) {
      this.editor.replaceRange(
        suggestion.replacement,
        suggestion.from,
        suggestion.to
      );
    } else {
      this.editor.replaceSelection(suggestion.replacement);
    }
  }
}
