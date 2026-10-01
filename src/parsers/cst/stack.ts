// src/parsers/cst/stack.ts
//! Pushdown Automaton (PDA) Delimiter Context Stack.
//! Inspired by Sublime Text / Tree-sitter pushdown lexers.

export interface DelimiterFrame {
  opener: string;
  expectedCloser: string;
  depth: number;
  openStart: number;
  allowPipeBreak?: boolean;
}

export class DelimiterStack {
  private frames: DelimiterFrame[] = [];

  public push(frame: DelimiterFrame): void {
    this.frames.push(frame);
  }

  public pop(): DelimiterFrame | undefined {
    return this.frames.pop();
  }

  public top(): DelimiterFrame | undefined {
    return this.frames.length > 0 ? this.frames[this.frames.length - 1] : undefined;
  }

  public size(): number {
    return this.frames.length;
  }

  public isEmpty(): boolean {
    return this.frames.length === 0;
  }

  /**
   * Checks if current character or prefix matches the top expected closer.
   */
  public isTopCloser(text: string, index: number): boolean {
    const top = this.top();
    if (!top) return false;
    return text.startsWith(top.expectedCloser, index);
  }

  /**
   * Checks if a closing delimiter matches any active frame on the stack.
   */
  public hasMatchingOpener(closer: string): boolean {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (this.frames[i].expectedCloser === closer) {
        return true;
      }
    }
    return false;
  }
}
