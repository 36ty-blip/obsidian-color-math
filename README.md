# 🎨 Obsidian Color Math

> Semantic color for LaTeX and MathJax equations — making math effortless to read and understand.

Monochrome LaTeX equations are visually dense and mentally exhausting to parse. **Obsidian Color Math** automatically transforms plain mathematical expressions into clear, semantically colored notation in real time, so your brain can distinguish operators, variables, functions, and differentials at a glance.

---

<!-- HERO DEMO: 5-10s GIF or Video showing real-time, lag-free typing in Live Preview -->
<p align="center">
  <img src="https://raw.githubusercontent.com/36ty-blip/obsidian-color-math/main/docs/assets/demo.gif" alt="Obsidian Color Math Live Demo" width="800">
</p>

---

## 🌈 Before & After (Live Rendered Math)

### 1. Calculus & Chain Rule

**Before (Monochrome LaTeX):**
``` latex + typst
{d}/{dx} f'(g(y)) = f'(g(y)) \cdot g'(y)y' " Now double quotes can be used for text. "
% {}/{} can be used for fractions. 
```
$$ \frac{d}{dx} f(g(y)) = f'(g(y)) \cdot g'(y)y' \text{ Now double quotes can be used for text. } $$

**After (Semantic Color Math):**
$$ \textcolor{#bb9af7}{\frac{d}{dx}} \textcolor{#7aa2f7}{f}\textcolor{#e0af68}{(}\textcolor{#bb9af7}{g}\textcolor{#7aa2f7}{(}\textcolor{#e0af68}{y}\textcolor{#7aa2f7}{)}\textcolor{#e0af68}{)} = \textcolor{#7aa2f7}{f'}\textcolor{#e0af68}{(}\textcolor{#bb9af7}{g}\textcolor{#7aa2f7}{(}\textcolor{#e0af68}{y}\textcolor{#7aa2f7}{)}\textcolor{#e0af68}{)} \cdot \textcolor{#7aa2f7}{g'}\textcolor{#e0af68}{(}\textcolor{#e0af68}{y}\textcolor{#e0af68}{)}\textcolor{#e0af68}{y'} $$

### 2. Quantum Mechanics & Bra-Ket

**Before (Monochrome LaTeX):**
$$ i\hbar \frac{\partial}{\partial t} |\psi(t)\rangle = \hat{H} |\psi(t)\rangle $$

**After (Semantic Color Math):**
$$ \textcolor{#e0af68}{i}\textcolor{#e0af68}{\hbar} \textcolor{#bb9af7}{\frac{\partial}{\partial t}} \textcolor{#e0af68}{|}\textcolor{#ff9e64}{\psi}\textcolor{#e0af68}{(}\textcolor{#7dcfff}{t}\textcolor{#e0af68}{)}\textcolor{#e0af68}{\rangle} = \textcolor{#ff9e64}{\hat{\textcolor{#7aa2f7}{H}}} \textcolor{#e0af68}{|}\textcolor{#ff9e64}{\psi}\textcolor{#e0af68}{(}\textcolor{#7dcfff}{t}\textcolor{#e0af68}{)}\textcolor{#e0af68}{\rangle} $$

---

## 🧭 Bidirectional Rendered-Math ⟷ Source Navigation & Double Map Architecture

Click any rendered symbol, fraction, or matrix cell directly inside Obsidian Live Preview, and Color Math instantly teleports the CodeMirror 6 editor cursor to the exact character span in your raw LaTeX source.

<p align="center">
  <img src="docs/assets/spatial_coordinates_4d_diagram.jpg" alt="4D Spatial Coordinate Space for Mathematical Expressions" width="100%">
</p>

### The Double Map Architecture ($\Phi_1 \circ \Phi_2$)

Planar 2D mathematics cannot be mapped using naive 1D string offsets without syntax displacement. Color Math guarantees mathematical rigor through a formal, two-tier bijective map:

$$\mathcal{R}_{\text{raw}} \xleftrightarrow[\quad\text{Map 2: Exact Span Provenance}\quad]{\Phi_2} \mathcal{M}_{\text{Canonical Math IR}} \xleftrightarrow[\quad\text{Map 1: Structural CHTML}\quad]{\Phi_1} \mathcal{D}_{\text{DOM}}$$

* **$\Phi_2$: Raw Source to Canonical Math IR ($\mathcal{R}_{\text{raw}} \longleftrightarrow \mathcal{M}_{\text{IR}}$)**: Maps author UTF-16 byte intervals `[from, to]` directly to Concrete Syntax Tree (CST) semantic nodes with 32-bit layout slot codes. Token length expansions (e.g., bare `sin` $\to$ `\sin` or Typst shorthands) are tracked without modifying source markdown on disk.
* **$\Phi_1$: Canonical Math IR to Structural DOM ($\mathcal{M}_{\text{IR}} \longleftrightarrow \mathcal{D}_{\text{DOM}}$)**: Generates rendered MathJax CHTML layout trees. Both the CodeMirror 6 IDE Styler and MathJax consume the identical CST semantic token stream, guaranteeing **100% forward visual color parity**.
* **$\Phi_1^{-1} \circ \Phi_2^{-1}$: Reverse Click-to-Edit Navigation ($\mathcal{D}_{\text{DOM}} \longrightarrow \mathcal{R}_{\text{raw}}$)**: Clicking any rendered CHTML glyph, fraction numerator, or matrix element immediately pulls back through the canonical AST token directly into the author's exact source span `[from, to]`, focusing and selecting the corresponding characters in the CodeMirror 6 editor.

---

## ✨ Features & Ergonomics

### ⚡ Max Speed Syntactic Sugar Suite (Shift-Free Ergonomics)

Zero-Shift typing shorthands inspired by modern mathematical notebooks, designed to maximize writing speed while preserving canonical LaTeX output:

- **Double-Quoted Text Strings**: Type `"hi there"` $\to$ `\text{hi there}` naturally without backslash or brace friction.
- **Shift-Free Matrix Shorthands**: Write matrices effortlessly using `mat[...]`, `pmat[...]`, `bmat[...]`, `vmat[...]`, or `dmat[...]` with semicolons (`;`), physical newlines, or `\\` row breaks. Also supports universal `\mat[...]` and `\mat{...}`.
- **ASCII Operator Ligatures**: Instant conversion of zero-Shift ligatures (`>=` $\to \ge$, `<=` $\to \le$, `!=` $\to \neq$, `:=` $\to \coloneqq$, `+-` $\to \pm$, `-+` $\to \mp$).
- **Bracket Infix Division & Chained Roots**: Visual fractions and roots with zero nesting errors: `[a+b]/[c+d]` $\to \frac{a+b}{c+d}$, `sqrt[x]` $\to \sqrt{x}$, and `sqrt[3][x]` $\to \sqrt[3]{x}$.
- **Bare Mathematical Functions**: Clean trigonometric and logarithmic functions without backslashes (`sin(x)`, `ln(x)`, `exp(x)`) via $\mathcal{O}(1)$ bracket-anchored hash dispatching.
- **Comprehensive Reference**: Full documentation and keystroke savings catalog available in [`docs/MAX_SPEED_GUIDE.md`](docs/MAX_SPEED_GUIDE.md).

### Typst Features

- **Backslash-Free Greek & Constants**: Write bare Greek letters (`alpha`, `beta`, `gamma`, `pi`, `omega`, `Delta`) and symbols (`oo` $\to \infty$, `hbar` $\to \hbar$, `nabla` $\to \nabla$, `partial` $\to \partial$, `ell` $\to \ell$) without tedious backslashes. Supports dotted Typst identifiers (`arrow.r`) and trailing primes (`hbar''`, `alpha'`).
- **Typst Font Callouts**: Clean font macros like `bb(R)` $\to \mathbb{R}$, `cal(L)` $\to \mathcal{L}$, `bold(v)` $\to \mathbf{v}$, `frak(g)` $\to \mathfrak{g}$, `scr(F)` $\to \mathscr{F}$, with full support for nested expressions (`bold(f(x))`, `bb(R^n)`).
- **Infix Inverted Division**: Visual-first slash divisions like `{a + b} / {c + d}` or `12 / 3` are rendered as vertical fractions ($\frac{a+b}{c+d}$, $\frac{12}{3}$) directly on screen in Live Preview without mutating raw markdown text on disk.
- **Double-Quoted String Literals (`"..."`)**: Typst-style string literals (`"..."`) and `\text{...}` blocks are completely shielded from mathematical variable coloring, supporting script coloring and upright styling in exponents (`x^"exp"`) and subscripts (`x_"label"`), while preserving consecutive spaces via LaTeX control spaces (`\ `).
- **Delimiter Auto-Scaling**: Standard parentheses `( \frac{a}{b} )`, single vertical bars `| \frac{a}{b} |`, and double bars `\| \mathbf{M} \|` automatically scale to matching `\left ... \right` heights for fractions, determinants, norms, and absolute values.

### Core Features

- **Floating Live Math Preview Tooltip**:
  - **Real-Time Caret Preview**: A rendered MathJax preview floats directly above your cursor while editing inline LaTeX (`$...$`), providing instant visual feedback as you type.
  - **Sub-Expression Targeted Navigation**: Hover or click any rendered token inside the preview tooltip to highlight or position your editor cursor directly on the corresponding LaTeX source span.
  - **Strict Table Cell Singleton Coordinator**: Enforces mutual exclusion in the DOM so that editing inside Markdown table cells (`<td>`, `.cm-table-widget`) never spawns duplicate tooltips.
  - **Top-Layer Stacking Priority**: Portaled directly to `document.body` with `position: fixed` and `z-index: var(--layer-tooltip, 99999)` without `!important`, rendering cleanly above note text, callouts, and modals without clipping.
- **Zero Note Modification (Live Interceptor)**: Hooks directly into Obsidian's internal MathJax rendering engine. Equations appear in full color in **Live Preview** and **Reading View** without altering your raw markdown notes on disk.
- **Live Syntax Warnings & Compiler Crash Immunity**:
  - **Live Preview Squiggly Warnings**: Unclosed quotes (`"`), stray braces (`}`), and unbalanced delimiters receive subtle red wavy underlines directly in Live Preview to flag syntax mistakes without interrupting your typing.
  - **Two-Tier Progressive Macro Auto-Sealing (`{▢}`, `[▢]`)**: Backed by an authoritative 613-signature KaTeX/MathJax macro dictionary. Mid-keystroke placeholder auto-sealing prevents MathJax from flashing red error boxes while typing unclosed macros (`\sqrt`, `\frac`, `\binom`), verified across 2,373 keystroke prefix slices.
  - **Auto-Healing & Compiler Crash Immunity**: Automatically auto-seals unclosed delimiters, converts unclosed quotes (`$x = 1 " if y = 0$`) into `\text{...}`, balances stray braces as `{}`, and heals unclosed `\left` with ghost closing tags so MathJax and KaTeX never throw fatal rendering errors while you type.
- **Delimiter Scope Flooding Immunity & Extensible Scaling**:
  - **Zero LaTeX Pollution**: Delimiter depth coloring is applied purely via CodeMirror 6 viewport DOM decorations with zero `\textcolor` wrapping on `\left...\right`, preserving pristine LaTeX source structure.
  - **MathJax v4 Extensible Stretchy Delimiters**: Automatic clip-path scaling for tall determinants (`\left| ... \right|`) and multi-line matrices without vertical cutoff.
  - **Universal Font Modifiers**: Universal delimiter support across `{...}`, `[...]`, and `(...)` for font modifiers (`bold`, `scr`, `cal`, `frak`, `bb`, `\text`).
- **Smart Whitespace & Function-Aware Normalization**:
  - Context-aware argument grouping replaces TeX's rigid single-token splitting. Intelligently groups multi-digit numbers (`\frac 12 3` $\to \frac{12}{3}$), cohesive monomials (`\frac 1 2x` $\to \frac{1}{2x}$), parenthesized terms (`\frac (a+b) c` $\to \frac{a+b}{c}$), and function calls (`\frac \sin(x) \cos(x)` $\to \frac{\sin(x)}{\cos(x)}$).
  - Strictly respects matrix and alignment cell walls (`&` and `\\`) to prevent arguments from overflowing across tabular boundaries.
- **Matrix & Tabular Alignment Polish**:
  - Adds comfortable cell breathing room and padding for matrix elements (`mjx-mtd`, `.matrix td`).
  - Protects `\substack{... \\ ...}` and tabular environments from delimiter misinterpretation and color flooding.
- **Zero-ReDoS Physical Units & Whitespace Affinity Grammar**:
  - **Static Unit Engine**: Instant $\mathcal{O}(1)$ table lookup for standard SI and compound units (`m/s^2`, `km/h`, `GeV`, `\mu m`, `kHz`), completely eliminating regex backtracking.
  - **Whitespace Affinity**: Tight spacing ($\le 1$ space / 0 spaces) treats expressions as dimensional units with automatic LaTeX thin spacing ($12\text{ m/s}^2 \to 12 \; \mathrm{m/s^2}$), while wide spacing ($\ge 2$ spaces) and arithmetic operators ($12 + m$) preserve standalone algebraic variables.
  - **Single-Letter Safety**: Single letters (`m`, `s`, `g`, `N`, `A`) are protected from accidental unit collision by default; activatable per-note via YAML frontmatter (`units: physics`), settings, or Typst quotes (`12 "m"`).
  - **Nested Unit Exponents**: Unit powers and exponents are colored harmoniously (`\textcolor{unit}{m/s^{\textcolor{upper}{2}}}`).
- **Rainbow Depth Coloring**: Nested parentheses, brackets, and braces `(((...)))` receive recursive rainbow depth coloring so you never lose your place in deep algebraic expressions.
- **Smart Mathematical Disambiguation**:
  - **Calculus Differentials**: Identifies infinitesimal differentials (`dx`, `dt`, `d\theta`) and derivative fractions (`\frac{df}{dx}`, `\frac{\partial u}{\partial t}`) while leaving standalone variables like distance `$d$` untouched.
  - **Quantum Bra-Ket**: Formats Dirac state vectors and expectation values (`|\psi\rangle`, `\langle\phi|`, `\langle\phi|\psi\rangle`).
  - **Piecewise Environments**: Full recognition of `\begin{cases}` environments, conditions, and relations.
- **Eye-Comfort Palettes**:
  - Calibrated default **Tokyo Night** palette designed to eliminate eye strain during long study and writing sessions.
  - Curated themes: **Catppuccin Mocha**, **Nord**, and **Clean Light**.
  - **Auto-Contrast Adaptation**: Automatically tunes operators (`=`, `\cdot`) for crisp readability across dark and light Obsidian themes.
- **100% Reversible (Zero Lock-In)**:
  - **Bake Colors**: Embeds standard LaTeX `\textcolor{...}{...}` wrappers when exporting notes to standard PDF or TeX.
  - **Clean / Undo**: Instantly strips all color markup back to pristine, uncolored LaTeX anytime.

---

## ⚡ Performance & Battle-Tested Reliability

- **👑 Lemire MPHF Engine (9,342+ Symbols)**: Full-string FNV-1a hashing with Daniel Lemire's branchless fast range reduction and a 16 KB L1 displacement table delivers **55 ns flat lookup** across 9,342 mathematical symbols with 100% collision-free resolution.
- **Balanced 3-Stage Lifecycle Pipeline & Predictive Session Cache**: Startup is split into Stage 1 `onload()` minimal mount ($<10\,\text{ms}$), Stage 2 `onLayoutReady()` predictive active-note targeting ($<15\,\text{ms}$) with 32-bit FNV-1a hash verification (priming the in-memory span cache in $<0.001\,\text{ms}$), and Stage 3 `requestIdleCallback` background warm-up. Eradicates whole-vault `iterateAllLeaves` reflow storms.
- **🧪 WebAssembly (WASM) Accelerator (Feature Preview)**: An upcoming high-performance Rust core (`color_math_wasm.wasm`) targeting `wasm32-unknown-unknown` designed for bare-metal CST tokenization, symbol queries, and delimiter matching. Currently in experimental feature preview testing; the plugin operates natively on its battle-tested, zero-dependency pure TypeScript engine.
- **Fast-Fail Predictive Lookahead Gating**: 6-door cascade eliminates 99.0% of false-positive hash lookups on bare variables (wasted lookups drop from 392,990 to 4,082 across 172,823 mathematical expressions in 6,392 corpus documents).
- **Battle-Tested Reliability (172,000+ Formulas)**: Validated across a corpus of **6,392 multi-page math documents** and **172,823 mathematical formulas** from university-level mathematics, physics, and engineering — resulting in **0 syntax regressions** and **0 parser crashes**.
- **144 Hz Display Latency Budget (<6.94 ms)**: Sub-microsecond tokenization ensures smooth, lag-free typing even on 144 Hz high-refresh displays (~6,944 μs per-frame budget).
- **Linear Time Complexity $\mathcal{O}(N)$**: Single-pass tokenization without backtracking — scales smoothly with note length.
- **Viewport-Constrained**: Live Preview highlights only equations currently visible on screen, keeping 10,000-word notes stutter-free.
- **Zero Idle CPU (0.0%)**: Purely event-driven; no background polling loops, watchers, or worker processes.
- **Hard-Bounded Memory**: Built-in LRU render cache keeps memory overhead under ~5 MB.
- **100% Local & Private**: Pure TypeScript core with zero mandatory binary dependencies, zero telemetry, and zero network calls. Fully compatible with desktop and mobile (iOS & Android).

### 📊 Empirical Performance Benchmark Ledger

Full synthetic and real-world micro-benchmarks executed across 15 discrete pipeline stages (`benchmark_results.json`). On a standard $144\,\text{Hz}$ high-refresh display ($6.94\,\text{ms}$ / $6,944\,\mu\text{s}$ per-frame budget), real-time Live Preview typing consumes **$<0.15\%$** of the available frame budget.

<!-- BENCHMARK_TABLE_START -->
| Benchmark Component | Category | Iterations | Median Latency ($\text{p50}$) | Mean Latency | 99th Percentile ($\text{p99}$) | Throughput | 144Hz Frame Budget ($6.94\,\text{ms}$) |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| MPHF Catalog Lemire Lookup | Micro-Benchmark | 50,000 | $100\,\text{ns}$ ($0.10\,\mu\text{s}$) | $133\,\text{ns}$ ($0.13\,\mu\text{s}$) | $500\,\text{ns}$ ($0.50\,\mu\text{s}$) | $7,491,647\,\text{ops/s}$ | < 0.01% |
| Markdown Document Scanner | Document Parsing | 500 | $409.40\,\mu\text{s}$ | $455.32\,\mu\text{s}$ | $1.05\,\text{ms}$ ($1,051\,\mu\text{s}$) | $2,196\,\text{ops/s}$ | 6.56% |
| Syntax Normalization & Typst Parsing | Grammar & Normalization | 10,000 | $11.40\,\mu\text{s}$ | $17.26\,\mu\text{s}$ | $93.80\,\mu\text{s}$ | $57,945\,\text{ops/s}$ | 0.25% |
| Sub-Parser: Units Parser | Sub-Parser Breakdown | 5,000 | $3.00\,\mu\text{s}$ | $3.57\,\mu\text{s}$ | $7.80\,\mu\text{s}$ | $280,170\,\text{ops/s}$ | 0.05% |
| Sub-Parser: Differentials Parser | Sub-Parser Breakdown | 5,000 | $2.00\,\mu\text{s}$ | $4.14\,\mu\text{s}$ | $10.60\,\mu\text{s}$ | $241,423\,\text{ops/s}$ | 0.06% |
| Sub-Parser: Dimensionless Numbers | Sub-Parser Breakdown | 5,000 | $500\,\text{ns}$ ($0.50\,\mu\text{s}$) | $714\,\text{ns}$ ($0.71\,\mu\text{s}$) | $2.30\,\mu\text{s}$ | $1,400,678\,\text{ops/s}$ | 0.01% |
| Sub-Parser: Delimiters & Rainbow | Sub-Parser Breakdown | 5,000 | $12.00\,\mu\text{s}$ | $17.79\,\mu\text{s}$ | $91.50\,\mu\text{s}$ | $56,212\,\text{ops/s}$ | 0.26% |
| Sub-Parser: Taxonomy Engine | Sub-Parser Breakdown | 5,000 | $31.40\,\mu\text{s}$ | $43.69\,\mu\text{s}$ | $192.90\,\mu\text{s}$ | $22,891\,\text{ops/s}$ | 0.63% |
| Sub-Parser: Variable Data-Flow Hash | Sub-Parser Breakdown | 5,000 | $41.50\,\mu\text{s}$ | $50.31\,\mu\text{s}$ | $188.70\,\mu\text{s}$ | $19,875\,\text{ops/s}$ | 0.72% |
| Equation Span Engine (Cold Cache) | Pipeline Engine | 13 | $1.07\,\text{ms}$ ($1,068\,\mu\text{s}$) | $1.41\,\text{ms}$ ($1,414\,\mu\text{s}$) | $4.00\,\text{ms}$ ($4,000\,\mu\text{s}$) | $707\,\text{ops/s}$ | 20.36% |
| Equation Span Engine (Warm Cache Hits) | Pipeline Engine | 50,000 | $500\,\text{ns}$ ($0.50\,\mu\text{s}$) | $554\,\text{ns}$ ($0.55\,\mu\text{s}$) | $1.30\,\mu\text{s}$ | $1,803,960\,\text{ops/s}$ | < 0.01% |
| Whole Document Bake (convertText) | Document Operations | 100 | $8.50\,\text{ms}$ ($8,505\,\mu\text{s}$) | $9.15\,\text{ms}$ ($9,154\,\mu\text{s}$) | $39.99\,\text{ms}$ ($39,989\,\mu\text{s}$) | $109\,\text{ops/s}$ | One-off Batch |
| Whole Document Undo (uncolorText) | Document Operations | 500 | $1.10\,\text{ms}$ ($1,104\,\mu\text{s}$) | $1.20\,\text{ms}$ ($1,202\,\mu\text{s}$) | $2.89\,\text{ms}$ ($2,888\,\mu\text{s}$) | $832\,\text{ops/s}$ | 17.30% |
| **Live Preview Keystroke Typing** | Interactive Editing | 2,150 | **$1.20\,\mu\text{s}$** | **$23.94\,\mu\text{s}$** | **$862.70\,\mu\text{s}$** | $41,774\,\text{ops/s}$ | **< 0.15%** (p99: 12.42%) |
| LRU Eviction & High-Capacity Churn | Cache Architecture | 5,000 | $1.40\,\mu\text{s}$ | $1.91\,\mu\text{s}$ | $5.40\,\mu\text{s}$ | $524,411\,\text{ops/s}$ | 0.03% |
| 970-Document Multi-Page University Math Corpus | Real-World Stress | 970 | $11.35\,\text{ms}$ ($11,353\,\mu\text{s}$) | $17.93\,\text{ms}$ ($17,932\,\mu\text{s}$) | $107.16\,\text{ms}$ ($107,156\,\mu\text{s}$) | $56\,\text{ops/s}$ | 258.22% |
<!-- BENCHMARK_TABLE_END -->

---

## 🚀 Quick Start

### Installation
1. In Obsidian, open **Settings > Community plugins**.
2. Turn off **Restricted mode**.
3. Click **Browse**, search for **`Color Math`**, then click **Install** and **Enable**.

### Everyday Usage
- **Read & Write**: Just write your equations naturally (`$...$` or `$$...$$`). Color Math renders them automatically in Live Preview and Reading View.
- **Click-to-Edit Navigation**: Click any rendered element in Live Preview to jump directly to its exact token in the raw LaTeX editor.
- **Ribbon Palette Icon (`fx`)**: Click the left ribbon icon for instant access to Bake and Clean actions.
- **Command Palette (`Ctrl+P` / `Cmd+P`)**:
  - `Color Math: Bake colors into note (Permanent)`: Embeds standard LaTeX `\textcolor{...}{...}` wrappers.
  - `Color Math: Clean baked colors from note`: Strips all color markup back to uncolored LaTeX.
  - `Color Math: Bake / Clean current math block`
  - `Color Math: Bake / Clean selection`
  - `Color Math: Convert Unicode math to LaTeX in active note (Restore TeX)`
  - `Color Math: Open syntax and operator reference guide`

---

## 🛠️ Settings & Customization

Open **Settings > Color Math** to customize:
- **Logical 4-Group Palette Hierarchy**: Fine-tune individual hex values organized logically into Group A (Core & Constants), Group B (Calculus & Transforms), Group C (Relations & Operators), and Group D (Structure & Sets).
- **Floating Tip Opacity & Backdrop**: Smooth $0\%\dots 100\%$ opacity slider and opaque background toggle for the live inline math tooltip.
- **Feature Toggles**: Individually enable or disable rainbow delimiters, calculus differentials, physical units, or bra-ket notation.
- **Instant Search Aliases**: Embedded search aliases across all sections (`tooltip`, `floating`, `opacity`, `slider`, `rainbow`, `hash`) for instant filtering in Obsidian's settings tab.
- **Interactive Preview**: Live equation sandbox inside the settings tab to test your palette in real time.

---

## 📄 License

Released under the [MIT License](https://github.com/36ty-blip/obsidian-color-math/blob/main/LICENSE).
