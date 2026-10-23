# ⚡ Max Speed Syntactic Sugar & Typing Ergonomics Guide

Welcome to **⚡ Max Speed Syntactic Sugar**, an authentic, zero-friction input acceleration layer designed for mathematicians, physicists, engineers, and computer scientists.

Unlike non-standard dialect compilers that lock notes into proprietary formats, **Max Speed Syntactic Sugar** is a strict desugaring engine: it normalizes clean, zero-Shift ASCII keystrokes into canonical, standards-compliant LaTeX in $\mathcal{O}(1)$ nanosecond time without altering existing LaTeX macros.

---

## 🏎️ Executive Summary: Keystroke Reduction Matrix

| Mathematical Construct | Standard LaTeX | ⚡ Max Speed Sugar | Keystrokes Saved |
| :--- | :--- | :--- | :--- |
| **$2 \times 2$ Matrix** | `\begin{matrix} 1 & 2 \\ 3 & 4 \end{matrix}` | `mat[1, 2; 3, 4]` | **66% (16 vs 46)** |
| **Parenthesized Matrix** | `\begin{pmatrix} a & b \\ c & d \end{pmatrix}` | `pmat[a, b; c, d]` | **65% (17 vs 48)** |
| **Bracketed Matrix** | `\begin{bmatrix} 1 & 0 \\ 0 & 1 \end{bmatrix}` | `bmat[1, 0; 0, 1]` | **65% (17 vs 48)** |
| **Root with Index** | `\sqrt[3]{x^2 + 1}` | `sqrt[3][x^2 + 1]` | **Zero Shift switches** |
| **Basic Square Root** | `\sqrt{x + y}` | `sqrt[x + y]` | **Zero Shift switches** |
| **Logical Equivalence** | `\Longleftrightarrow` | `<==>` | **78% (4 vs 18)** |
| **Bidirectional Arrow** | `\longleftrightarrow` | `<--->` | **72% (5 vs 18)** |
| **Right Arrow** | `\longrightarrow` | `--->` | **73% (4 vs 15)** |
| **Implication** | `\Longrightarrow` | `===>` | **73% (4 vs 15)** |
| **Inequality** | `\ge`, `\le`, `\neq` | `>=`, `<=`, `!=` | **Instant muscle memory** |
| **Definition** | `\coloneqq` | `:=` | **80% (2 vs 10)** |
| **Plus-Minus** | `\pm`, `\mp` | `+-`, `-+` | **50% (2 vs 4)** |
| **Midline Ellipsis** | `\cdots` | `...` (between `+`, `-`, `*`) | **57% (3 vs 7)** |
| **Baseline Ellipsis** | `\ldots` | `...` (between `,`, `;`) | **57% (3 vs 7)** |
| **Inline Text** | `\text{for all\ } x > 0` | `"for all " x > 0` | **Shift-free quotes** |

---

## 1. 📐 Shift-Free Breathing-Room Matrices

Matrix typing in vanilla LaTeX is notoriously slow due to repetitive `\begin{...}`, `&`, and `\\`. Max Speed Sugar introduces structural bracket matrices with **interchangeable delimiters**:

### Available Matrix Shorthands
- `mat[...]` $\longrightarrow$ `\begin{matrix} ... \end{matrix}`
- `pmat[...]` $\longrightarrow$ `\begin{pmatrix} ... \end{pmatrix}`
- `bmat[...]` $\longrightarrow$ `\begin{bmatrix} ... \end{bmatrix}`
- `Bmat[...]` $\longrightarrow$ `\begin{Bmatrix} ... \end{Bmatrix}`
- `vmat[...]` $\longrightarrow$ `\begin{vmatrix} ... \end{vmatrix}`
- `Vmat[...]` $\longrightarrow$ `\begin{Vmatrix} ... \end{Vmatrix}`
- `dmat[...]` $\longrightarrow$ `\begin{vmatrix} ... \end{vmatrix}` (Determinants)

### Breathing-Room Rules
1. **Interchangeable Row Delimiters**: Semicolons (`;`), physical newlines (`\n`), and LaTeX terminators (`\\`) all separate rows.
2. **Interchangeable Column Delimiters**: Commas (`,`) and ampersands (`&`) separate columns.
3. **$\mathcal{O}(1)$ Parenthesis & Bracket Depth Shielding**: Commas inside nested expressions like `f(a, b)` or `[x, y]` **never** split matrix columns:
   ```latex
   mat[f(a, b), 2; 3, 4] ⟶ \begin{matrix} f(a, b) & 2 \\ 3 & 4 \end{matrix}
   ```
4. **Tolerance of Trailing Semicolons**: `mat[1, 2; 3, 4;]` cleans up gracefully without generating phantom blank rows.

---

## 2. 🌱 Arity-Gated Chained Roots

Standard LaTeX roots require switching between square brackets for degree and curly braces for radicand (`\sqrt[3]{x}`). Max Speed Sugar streamlines this:

- **Single Radical**: `sqrt[x]` $\longrightarrow$ `\sqrt{x}`
- **Degree Root**: `sqrt[3][x]` $\longrightarrow$ `\sqrt[3]{x}`
- **Complex Radicand**: `sqrt[n][x^2 + y^2]` $\longrightarrow$ `\sqrt[n]{x^2 + y^2}`
- **$\mathcal{O}(1)$ Arity Gating Protection**: Because roots mathematically have $\text{Arity} = 2$ ($[degree]\{radicand\}$), the scanner immediately halts argument consumption after 2 brackets. Any immediately following bracket is preserved as an array/group term without greedy corruption:
  ```latex
  sqrt[3][aj][kd] ⟶ \sqrt[3]{aj}[kd]
  ```
- **Standard LaTeX Invariance**: Canonical LaTeX like `\sqrt[n]{x}` and array index chains like `A[i][j]` are strictly preserved.

---

## 3. 🎯 Maximal Munch Operator Ligatures

Token fragmentation is eliminated via **Maximal Munch Continuous Cluster Scanning**. The lexer consumes the entire contiguous run of operator characters as an atomic cluster before desugaring:

| Cluster | LaTeX Equivalent | Meaning |
| :--- | :--- | :--- |
| `>=` | `\ge` | Greater than or equal |
| `<=` | `\le` | Less than or equal |
| `!=` | `\neq` | Not equal |
| `:=` | `\coloneqq` | Defined as |
| `+-` | `\pm` | Plus-minus |
| `-+` | `\mp` | Minus-plus |
| `~=` | `\approx` | Approximately equal |
| `<<` | `\ll` | Much less than |
| `>>` | `\gg` | Much greater than |
| `|->` | `\mapsto` | Maps to |
| `<==>` | `\Longleftrightarrow` | Long bidirectional implication |
| `<--->` | `\longleftrightarrow` | Long bidirectional arrow |
| `===>` | `\Longrightarrow` | Long forward implication |
| `---->` | `\longrightarrow` | Long forward arrow |
| `<===` | `\Longleftarrow` | Long backward implication |
| `<---` | `\longleftarrow` | Long backward arrow |

### Disambiguation Policy: `<=`, `<==`, and Arrows
- Single equals (`<=`) is **strictly less-than-or-equal** ($\le$).
- Double equals (`<==`, `<===`) is **strictly the left double implication arrow** ($\Longleftarrow$).
- This completely protects mathematical statements like $x \le y$ while providing effortless arrow expansion.

---

## 4. 💬 Inline Quoted Text Strings

Typing `\text{...}` in math mode breaks writing flow. Max Speed Sugar allows standard double quotes:

- `"for all " x > 0` $\longrightarrow$ `\text{for all\ } x > 0`
- Multi-space runs are automatically converted into non-breaking LaTeX spacers (`\ `).
- Escaped quotes (`\"`) and math mode dollar signs (`$`) inside quotes are fully supported.

---

## 5. ⋯ Context-Aware ASCII Ellipses

Typing `...` or longer runs like `.....` automatically desugars depending on adjacent tokens:
- **Operator Context** (adjacent to `+`, `-`, `*`, `/`, `=`, `\times`, `\cdot`):
  $$1 + ... + n \longrightarrow 1 + \cdots + n$$
- **Punctuation & Comma Context** (adjacent to `,`, `;`, or brackets):
  $$x_1, ..., x_n \longrightarrow x_1, \ldots, x_n$$
  $$[a, b, ...] \longrightarrow [a, b, \ldots]$$

---

## 6. 🔬 Real-World Scientific Equations

### Calculus & Differential Equations
```latex
% Input:
"Let " f(x) := sqrt[1 - x^2] " where " -1 <= x <= 1

% Normalized LaTeX:
\text{Let\ } f(x) \coloneqq \sqrt{1 - x^2} \text{ where\ } -1 \le x \le 1
```

### Linear Algebra & Quantum Mechanics
```latex
% Input:
pmat[a, b; c, d] pmat[x; y] = pmat[ax + by; cx + dy]

% Normalized LaTeX:
\begin{pmatrix} a & b \\ c & d \end{pmatrix} \begin{pmatrix} x \\ y \end{pmatrix} = \begin{pmatrix} ax + by \\ cx + dy \end{pmatrix}
```

### Discrete Math & Series
```latex
% Input:
S_n := a_1 + a_2 + ... + a_n = sum_{k=1}^n a_k

% Normalized LaTeX:
S_n \coloneqq a_1 + a_2 + \cdots + a_n = \sum_{k=1}^n a_k
```
