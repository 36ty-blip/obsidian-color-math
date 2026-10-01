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
$$ \frac{d}{dx} f(g(y)) = f'(g(y)) \cdot g'(y)y' $$

**After (Semantic Color Math):**
$$ \textcolor{#bb9af7}{\frac{d}{dx}} \textcolor{#7aa2f7}{f}\textcolor{#e0af68}{(}\textcolor{#bb9af7}{g}\textcolor{#7aa2f7}{(}\textcolor{#e0af68}{y}\textcolor{#7aa2f7}{)}\textcolor{#e0af68}{)} = \textcolor{#7aa2f7}{f'}\textcolor{#e0af68}{(}\textcolor{#bb9af7}{g}\textcolor{#7aa2f7}{(}\textcolor{#e0af68}{y}\textcolor{#7aa2f7}{)}\textcolor{#e0af68}{)} \cdot \textcolor{#7aa2f7}{g'}\textcolor{#e0af68}{(}\textcolor{#e0af68}{y}\textcolor{#e0af68}{)}\textcolor{#e0af68}{y'} $$

### 2. Quantum Mechanics & Bra-Ket

**Before (Monochrome LaTeX):**
$$ i\hbar \frac{\partial}{\partial t} |\psi(t)\rangle = \hat{H} |\psi(t)\rangle $$

**After (Semantic Color Math):**
$$ \textcolor{#e0af68}{i}\textcolor{#e0af68}{\hbar} \textcolor{#bb9af7}{\frac{\partial}{\partial t}} \textcolor{#e0af68}{|}\textcolor{#ff9e64}{\psi}\textcolor{#e0af68}{(}\textcolor{#7dcfff}{t}\textcolor{#e0af68}{)}\textcolor{#e0af68}{\rangle} = \textcolor{#ff9e64}{\hat{\textcolor{#7aa2f7}{H}}} \textcolor{#e0af68}{|}\textcolor{#ff9e64}{\psi}\textcolor{#e0af68}{(}\textcolor{#7dcfff}{t}\textcolor{#e0af68}{)}\textcolor{#e0af68}{\rangle} $$

---

## ✨ Quality-of-Life Improvements

- **Zero Note Modification (Live Interceptor)**: Hooks directly into Obsidian's internal MathJax rendering engine. Equations appear in full color in **Live Preview** and **Reading View** without adding any code or modifying your raw markdown notes.
- **Typst Syntax Shortcuts & Modern Ergonomics**:
  - **Backslash-Free Greek & Constants**: Write bare Greek letters (`alpha`, `beta`, `gamma`, `pi`, `omega`, `Delta`) and symbols (`oo` $\to \infty$, `hbar` $\to \hbar$, `nabla` $\to \nabla$, `partial` $\to \partial$, `ell` $\to \ell$) without tedious backslashes, resolved in $\mathcal{O}(1)$ via Lemire Minimal Perfect Hashing.
  - **Typst Font Callouts**: Clean font macros like `bb(R)` $\to \mathbb{R}$, `cal(L)` $\to \mathcal{L}$, `bold(v)` $\to \mathbf{v}$, `frak(g)` $\to \mathfrak{g}$, `scr(F)` $\to \mathscr{F}$, fully supporting nested operands (`bold(f(x))`, `bb(R^n)`).
  - **Infix Inverted Division**: Natural slash divisions like `{a + b} / {c + d}` or `12 / 3` are rendered as vertical fractions ($\frac{a+b}{c+d}$, $\frac{12}{3}$) directly on screen in Live Preview without mutating raw markdown text on disk.
- **Smart Whitespace & Function-Aware Normalization**:
  - Context-aware LaTeX normalization replacing rigid single-token splitting. Intelligently groups multi-digit numbers (`\frac 12 3` $\to \frac{12}{3}$), cohesive monomials (`\frac 1 2x` $\to \frac{1}{2x}$), parenthesized terms (`\frac (a+b) c` $\to \frac{a+b}{c}$), and function calls (`\frac \sin(x) \cos(x)` $\to \frac{\sin(x)}{\cos(x)}$).
  - Strictly respects matrix and alignment cell walls (`&` and `\\`) to prevent arguments from overflowing across tabular boundaries.
- **Zero-ReDoS Physical Units & Whitespace Affinity Grammar**:
  - **Static Unit Engine**: Instant $\mathcal{O}(1)$ table lookup for standard SI and compound units (`m/s^2`, `km/h`, `GeV`, `\mu m`, `kHz`), completely eliminating catastrophic regex backtracking.
  - **Whitespace Affinity**: Spacing determines mathematical semantics: tight spacing ($\le 1$ space / 0 spaces) treats expressions as dimensional units with automatic LaTeX thin spacing ($12\text{ m/s}^2 \to 12 \; \mathrm{m/s^2}$), while wide spacing ($\ge 2$ spaces) and arithmetic operators ($12 + m$) preserve standalone algebraic variables.
  - **Single-Letter Safety**: Single letters (`m`, `s`, `g`, `N`, `A`) are protected from accidental unit collision by default, and can be activated per-note via YAML frontmatter (`units: physics`), settings, or explicit Typst quotes (`12 "m"`).
  - **Nested Unit Exponents**: Unit powers and exponents are colored harmoniously (`\textcolor{unit}{m/s^{\textcolor{upper}{2}}}`).
- **Delimiter Auto-Scaling & Compiler Crash Immunity**:
  - **Auto-Scaling Delimiters & Vertical Bars**: Standard parentheses `( \frac{a}{b} )`, single vertical bars `| \frac{a}{b} |`, and double bars `\| \mathbf{M} \|` automatically scale to matching `\left ... \right` heights for fractions, determinants, norms, and absolute values.
  - **Matrix Isolation**: Delimiter coloring is prevented from wrapping whole matrix environments (`\begin{matrix}` ... `\end{matrix}`), preserving crisp matrix alignment and preventing color flooding.
  - **Compiler Crash Immunity**: Automatically heals unclosed `\left(` delimiters with ghost closing seals to prevent KaTeX/MathJax compilation crashes while typing.
- **String Literal Isolation & Formatting**:
  - Double-quoted strings (`"..."`) and `\text{...}` spans are completely shielded from mathematical variable detection and coloring.
  - Preserves multi-space formatting inside string literals using LaTeX control spaces (`\ `), preventing collapsed spaces in code labels and prose annotations.
- **Eliminates Delimiter Blindness**: Nested parentheses, brackets, and braces `(((...)))` receive recursive rainbow depth coloring so you never lose your place in deep algebraic expressions.
- **Smart Mathematical Disambiguation**:
  - **Calculus Differentials**: Identifies infinitesimal differentials (`dx`, `dt`, `d\theta`) and derivative fractions (`\frac{df}{dx}`, `\frac{\partial u}{\partial t}`) while leaving standalone variables like distance `$d$` untouched.
  - **Quantum Bra-Ket**: Formats Dirac state vectors and expectation values (`|\psi\rangle`, `\langle\phi|`, `\langle\phi|\psi\rangle`).
  - **Piecewise Environments**: Full recognition of `\begin{cases}` environments, conditions, and relations without line swallowing.
- **Eye-Comfort Palettes**:
  - Calibrated default **Tokyo Night** palette designed to eliminate eye strain during long study and writing sessions.
  - Curated themes: **Catppuccin Mocha**, **Nord**, and **Clean Light**.
  - **Auto-Contrast Adaptation**: Shifter ensures operators (`=`, `\cdot`) maintain crisp contrast on both dark and light Obsidian themes.
- **100% Reversible (Zero Lock-In)**:
  - **Bake Colors**: Embeds standard LaTeX `\textcolor{...}{...}` wrappers when you want to export notes to standard PDF or TeX.
  - **Clean / Undo**: Instantly strips all color markup back to pristine, uncolored LaTeX anytime.

---

## ⚡ Performance & Resource Footprint

- **👑 Lemire MPHF (FNV-1a Full-String) Engine**: Branchless fast range reduction with 16 KB L1 displacement table delivers 55 ns flat lookup across 6,800+ mathematical symbols with zero collision degradation.
- **Linear Time Complexity $\mathcal{O}(N)$**: Single-pass tokenization without backtracking — scales smoothly with note length.
- **Viewport-Constrained**: Live Preview only highlights equations currently visible on screen, keeping 10,000-word notes stutter-free.
- **Zero Idle CPU (0.0%)**: Purely event-driven; no background polling loops, watchers, or worker processes.
- **Hard-Bounded Memory**: Built-in LRU render cache keeps memory overhead under ~5 MB.
- **100% Local & Private**: Pure TypeScript with zero binary dependencies, zero telemetry, and zero network calls. Fully compatible with desktop and mobile (iOS & Android).

---

## 🚀 Quick Start

### Installation
1. In Obsidian, open **Settings > Community plugins**.
2. Turn off **Restricted mode**.
3. Click **Browse**, search for **`Color Math`**, then click **Install** and **Enable**.

### Everyday Usage
- **Read & Write**: Just write your equations naturally (`$...$` or `$$...$$`). Color Math renders them automatically in Live Preview and Reading View.
- **Ribbon Palette Icon (`fx`)**: Click the left ribbon icon for instant access to Bake and Clean actions.
- **Command Palette (`Ctrl+P` / `Cmd+P`)**:
  - `Color Math: Bake colors into note (Permanent)`
  - `Color Math: Clean baked colors from note`
  - `Color Math: Bake / Clean current math block`
  - `Color Math: Bake / Clean selection`

---

## 🛠️ Settings & Customization

Open **Settings > Color Math** to customize:
- **Palette**: Fine-tune individual hex values for variables, numbers, operators, differentials, and constants.
- **Feature Toggles**: Individually enable or disable rainbow delimiters, calculus differentials, physical units, or bra-ket notation.
- **Interactive Preview**: Live equation sandbox inside the settings tab to test your palette in real time.

---

## 📄 License

Released under the [MIT License](https://github.com/36ty-blip/obsidian-color-math/blob/main/LICENSE).
