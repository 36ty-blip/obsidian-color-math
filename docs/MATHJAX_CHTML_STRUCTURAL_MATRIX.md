# MathJax CHTML Structural Taxonomy & 3D Baseline Structure Model (BST)

This technical reference formalizes the 3-dimensional spatial coordinate system for mapping between LaTeX Concrete Syntax Trees (CST) and MathJax 3/4 CommonHTML (CHTML) DOM trees, eliminating 1D array index collapse.

---

## 1. Academic Foundation: The Baseline Structure Tree (BST)

In mathematical document analysis and formula recognition, planar math typography cannot be represented by a flat 1D sequence or a simple 2D bounding grid. The standard foundational representation in computer science is the **Baseline Structure Tree (BST)**, pioneered by **Richard Zanibbi, Dorothea Blostein, and James R. Cordy** (2002, *Baseline Structure Analysis of Handwritten Mathematics Notation*).

### The 3 Dimensions of Mathematical Typography

A mathematical expression lives in a **3D Coordinate Space $(Z, Y, X)$**:

$$\text{Token Coordinate} = (Z, Y, X) \in \mathbb{N}_0 \times \mathcal{R} \times \mathbb{N}_0$$

1. **$Z \in \mathbb{N}_0$ (Structural Depth / Tree Scope)**:
   - Identifies the hierarchical nesting level of the expression.
   - $Z = 0$: The dominant root baseline.
   - $Z = 1$: Inside a bracket group `\left( ... \right)`, inside a fraction slot, or inside a radical.
   - $Z = 2$: A nested script inside a fraction inside a bracket: $\left( \frac{x_i^2}{y} \right)$.
   - **Isolation Invariant**: Tokens belonging to different $Z$-scopes can never shift or displace each other.

2. **$Y \in \mathcal{R}$ (Vertical Elevation / Spatial Region Role)**:
   - Captures the vertical tier relative to the active baseline:
     - $Y = +1$ (`Above` / `Super` / `Numerator` / `Accent`): e.g. $x^{\mathbf{2}}$, $\sum^{\mathbf{n}}$, $\frac{\mathbf{a}}{b}$, $\vec{\mathbf{v}}$.
     - $Y = 0$ (`Baseline` / `Dominant Line`): e.g. $\mathbf{x}$, $\mathbf{+}$, $\mathbf{\sum}$.
     - $Y = -1$ (`Below` / `Sub` / `Denominator` / `Underbrace`): e.g. $x_{\mathbf{i}}$, $\sum_{\mathbf{i=0}}$, $\frac{a}{\mathbf{b}}$, $\underbrace{a+b}_{\mathbf{\text{label}}}$.
     - For matrices: $Y = \text{Row Index } r \in \{0, 1, \dots, R-1\}$.

3. **$X \in \mathbb{N}_0$ (Local Horizontal Sequence)**:
   - The token index strictly local to the given $(Z, Y)$ baseline (e.g. within $a + b + c$, $a$ is $X=0$, $+$ is $X=1$, $b$ is $X=2$, etc.).

---

## 2. Canonical MathJax CHTML Wrapper Matrix

MathJax CHTML transforms W3C MathML nodes (`MmlNode`) into specific HTML custom elements (`<mjx-*>`). Below is the canonical taxonomy derived from `mathjax/MathJax-src/ts/output/chtml/Wrappers/`.

### 2.1 The Script & Limit Matrix ($Y \in \{-1, 0, +1\}$)

| MathJax CHTML Wrapper | Generated HTML Tag | Child 0 ($Y = 0$, Base) | Child 1 ($Y = -1$, Sub/Under) | Child 2 ($Y = +1$, Super/Over) |
| :--- | :--- | :--- | :--- | :--- |
| **`msub`** | `<mjx-msub>` | Base element | `<mjx-script>` (Subscript) | — |
| **`msup`** | `<mjx-msup>` | Base element | — | `<mjx-script>` (Superscript) |
| **`msubsup`** | `<mjx-msubsup>` | Base element | `<mjx-script>` (Subscript) | `<mjx-script>` (Superscript) |
| **`munder`** | `<mjx-munder>` | Base / `<mjx-row>` | `<mjx-under>` (Limit / Underbrace) | — |
| **`mover`** | `<mjx-mover>` | Base / `<mjx-row>` | — | `<mjx-over>` (Limit / Overbrace / Accent) |
| **`munderover`** | `<mjx-munderover>` | Base (`<mjx-mo>`) | `<mjx-under>` (Lower Limit) | `<mjx-over>` (Upper Limit) |

### 2.2 The Division & Radical Matrix

| MathJax CHTML Wrapper | Generated HTML Tag | Child Components | Notes |
| :--- | :--- | :--- | :--- |
| **`mfrac`** | `<mjx-mfrac>` $\to$ `<mjx-frac>` | `<mjx-num>` ($Y=+1$), `<mjx-dline>` (bar), `<mjx-den>` ($Y=-1$) | Standard division |
| **`mfrac[atop]`** | `<mjx-mfrac class="mjx-atop">` | `<mjx-num>` ($Y=+1$), `<mjx-den>` ($Y=-1$) | Binomial coefficients $\binom{n}{k}$, no fraction line |
| **`msqrt`** | `<mjx-sqrt>` | `<mjx-surd>` (radical glyph), `<mjx-box>` (radicand body) | Square roots |
| **`mroot`** | `<mjx-mroot>` | `<mjx-surd>`, `<mjx-box>` (radicand), `<mjx-root>` ($Y=+1$, index $n$) | Indexed radicals $\sqrt[n]{x}$ |

### 2.3 The Scope & Enclosure Matrix ($Z$-Depth Isolation)

| MathJax CHTML Wrapper | Generated HTML Tag | Child Components | Notes |
| :--- | :--- | :--- | :--- |
| **`mrow`** | `<mjx-mrow>` / `<mjx-TeXAtom>` | Open delimiter (`<mjx-mo>`), inner children, close delimiter (`<mjx-mo>`) | Parentheses, brackets, braces `(x+y)` |
| **`mtable`** | `<mjx-mtable>` $\to$ `<mjx-table>` | `<mjx-mtr>` (Rows) $\to$ `<mjx-mtd>` (Cells) | Matrices, aligned equations |
| **`mtext`** | `<mjx-mtext>` | Text characters | $\text{...}$, preserves spaces |

---

## 3. Structural Reversals: Why 1D Flat Arrays Bleed Across Dimensions

### The `\underbrace` Inversion
In raw LaTeX, decorators are prefix operators:
$$\texttt{\textbackslash underbrace} \{ a + b + c \}$$
- **LaTeX Sequence**: `\underbrace` (pos 0) $\to$ `$a$` (pos 1) $\to$ `$+$` (pos 2) $\to$ `$b$` (pos 3) $\to$ `$+$` (pos 4) $\to$ `$c$` (pos 5).
- **MathJax CHTML Layout**: `<mjx-munder>` renders the base expression `$a+b+c$` **first** in the DOM, then attaches `<mjx-under>` (the horizontal curly brace glyph) **second** (at the bottom).
- **The 1D Flat Collapse Bug**:
  If indexed as a flat 1D array:
  - DOM 0 ($a$) is assigned LaTeX 0 (`\underbrace`).
  - DOM 1 ($+$) is assigned LaTeX 1 ($a$).
  - DOM 5 (the brace glyph) is assigned LaTeX 5 ($c$).
  - **Result**: Every token in $a+b+c$ is shifted 1 position right, and hovering over the brace highlights $c$.
- **The 3D Coordinate Solution**:
  - `\underbrace` belongs to $Y = -1$ (Under).
  - $a, +, b, +, c$ belong to $Y = 0$ (Base).
  - Slot $Y = 0$ resolves strictly against $a, +, b, +, c$.
  - Slot $Y = -1$ resolves strictly against `\underbrace`.

### The Stacked Limit Inversion (`\sum`, `\prod`)
- In display math, `\sum_{i=0}^n` uses `<mjx-munderover>`.
- Child 0 = Base operator $\sum$ ($Y = 0$).
- Child 1 = Lower limit `<mjx-under>` ($Y = -1$).
- Child 2 = Upper limit `<mjx-over>` ($Y = +1$).
- Whether the author writes `\sum_{i=0}^n` or `\sum^n_{i=0}`, the 3D resolver dispatches `<mjx-under>` to subscript and `<mjx-over>` to superscript, completely isolating the limits from colliding with the base $\sum$.
