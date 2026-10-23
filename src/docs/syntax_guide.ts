// src/docs/syntax_guide.ts
// Authoritative Color Math Syntax & Operator Reference Guide

export const COLOR_MATH_REFERENCE_FILENAME = "Color Math Reference.md";

export const SYNTAX_GUIDE_MD = `# 📐 Color Math — Syntax & Operator Reference Guide

This reference provides a comprehensive guide to the mathematical syntactic extensions, mnemonic matrix shorthands, infix rational expressions, and multi-dialect operator desugaring features in **Color Math**.

---

## 📑 Quick Navigation & Priority Ranking

1. [Rank #1: Infix Rational Expressions & Division \`{a}/{b}\`](#1-infix-rational-expressions--division-ab)
2. [Rank #2: Double-Quoted Text Strings \`"text"\`](#2-double-quoted-text-strings-text)
3. [Rank #3: Shift-Free Mnemonic Matrices \`dmat[]\`, \`cmat[]\`, etc.](#3-shift-free-mnemonic-matrices-dmat-cmat-etc)
4. [Rank #4: Multi-Dialect Shorthand Operators & Morphisms](#4-multi-dialect-shorthand-operators--morphisms)
5. [Rank #5: Universal Font Modifiers \`bb(...)\`, \`cal(...)\`, etc.](#5-universal-font-modifiers-bb-cal-etc)
6. [Rank #6: Chained Square & N-th Roots \`sqrt[n][x]\`](#6-chained-square--n-th-roots-sqrtnx)
7. [Rank #7: Contextual ASCII Ellipses \`...\`](#7-contextual-ascii-ellipses-)
8. [Rank #8: Automatic Delimiter Scaling & Compiler Crash Immunity](#8-automatic-delimiter-scaling--compiler-crash-immunity)

---

## 1. Infix Rational Expressions & Division \`{a}/{b}\`

Standard LaTeX requires verbose \`\\frac{numerator}{denominator}\` constructions. Color Math provides an intuitive infix division desugarer that translates braced or bracketed ratios into fractional forms in $\\mathcal{O}(1)$ time.

### Syntax Examples

| Shorthand Input | Desugared LaTeX Output | Visual Rendering | Notes |
| :--- | :--- | :---: | :--- |
| \`{a + b}/{c + d}\` | \`\\frac{a + b}{c + d}\` | $\\frac{a + b}{c + d}$ | Nested expressions with operator protection |
| \`[x^2 + 1]/[2x]\` | \`\\frac{x^2 + 1}{2x}\` | $\\frac{x^2 + 1}{2x}$ | Square bracket alternative |
| \`12 / 3\` | \`\\frac{12}{3}\` | $\\frac{12}{3}$ | Scalar numerical division |

### ⚙️ How to Enable & Configure

* **Master Engine**: 
  * Path: \`Settings → Color Math → Live Preview & Math Rendering\`
  * Setting: **Dynamic live rendering** (\`liveRendering\`) — *Must be ON (Default: ON)*.
* **Strict Brace Gating (Recommended for Physics & Engineering)**:
  * Path: \`Settings → Color Math → Live Preview & Math Rendering\`
  * Setting: **Require braces for infix slash division** (\`requireBracesForSlashDivision\`).
  * **Behavior**:
    * **OFF (Default)**: Converts both braced pairs (\`{a}/{b}\`) and bare numerical expressions (\`12 / 3\`).
    * **ON**: Restricts conversion strictly to braced pairs (\`{a}/{b}\`, \`[a]/[b]\`). This enforces a $\\mathbf{\\Theta}(1)$ sub-nanosecond bailout that eliminates ambiguity with physical unit slashes (e.g., $10\\text{ m/s}$) and date notations.

---

## 2. Double-Quoted Text Strings \`"text"\`

Typing text inside math mode typically requires \`\\text{...}\`, \`\\mathrm{...}\`, or \`\\operatorname{...}\`. Color Math desugars standard double quotes into shielded \`\\text{...}\` blocks with preserved inter-word whitespace.

### Syntax Examples

| Shorthand Input | Desugared LaTeX Output | Visual Rendering |
| :--- | :--- | :---: |
| \`"for all " x > 0\` | \`\\text{for all\\ } x > 0\` | $\\text{for all } x > 0$ |
| \`x \\in S \\quad "if and only if" \\quad y \\in T\` | \`x \\in S \\quad \\text{if and only if} \\quad y \\in T\` | $x \\in S \\quad \\text{if and only if} \\quad y \\in T$ |
| \`f(x) = 0 \\quad "where " x \\ne 0\` | \`f(x) = 0 \\quad \\text{where\\ } x \\ne 0\` | $f(x) = 0 \\quad \\text{where } x \\ne 0$ |

### ⚙️ How to Enable & Configure

* **Master Switch**: 
  * Path: \`Settings → Color Math → Ergonomics & Life Quality → ⚡ Max Speed Syntactic Sugar\`
  * Setting: **Max Speed Syntactic Sugar** (\`speedSyntacticSugar\`) — *Default: ON*.
* **Dedicated Toggle**:
  * Path: \`Settings → Color Math → Ergonomics & Life Quality → ⚡ Max Speed Syntactic Sugar\`
  * Setting: **Double-quote text strings ("...")** (\`sugarQuotedStrings\`) — *Default: ON*.
* **Algorithmic Guarantee**: Operates in single-pass $\\mathcal{O}(N)$ time with zero regex backtracking, preserving internal escaped quotes (\`\\"\`) and LaTeX math delimiters.

---

## 3. Shift-Free Mnemonic Matrices \`dmat[]\`, \`cmat[]\`, etc.

Standard LaTeX matrix environments require cumbersome \`\\begin{...matrix} ... \\end{...matrix}\` blocks, requiring up to 45 keystrokes for a simple $2 \\times 2$ matrix. Color Math introduces an ergonomic, shift-free mnemonic matrix family using direct bracket notation \`prefix[...]\`.

### The Mnemonic Matrix Family

| Shorthand Prefix | Environment | LaTeX Output | Visual Delimiter | Primary Use Case |
| :--- | :--- | :--- | :---: | :--- |
| **\`dmat[...]\`** *(or \`vmat[...]\`)* | \`vmatrix\` | \`\\begin{vmatrix} ... \\end{vmatrix}\` | $\\vert \\dots \\vert$ | **Determinants** (Eliminates pipe ambiguity) |
| **\`cmat[...]\`** *(or \`Bmat[...]\`)* | \`Bmatrix\` | \`\\begin{Bmatrix} ... \\end{Bmatrix}\` | $\\{ \\dots \\}$ | **Curly Braces** (Eliminates \`b\` vs \`B\` capitalization error) |
| **\`bmat[...]\`** | \`bmatrix\` | \`\\begin{bmatrix} ... \\end{bmatrix}\` | $[ \\dots ]$ | **Square Brackets** (Standard algebraic matrices) |
| **\`pmat[...]\`** | \`pmatrix\` | \`\\begin{pmatrix} ... \\end{pmatrix}\` | $( \\dots )$ | **Parentheses** (Coordinate vectors, transitions) |
| **\`nmat[...]\`** *(or \`Vmat[...]\`)* | \`Vmatrix\` | \`\\begin{Vmatrix} ... \\end{Vmatrix}\` | $\\Vert \\dots \\Vert$ | **Matrix Norms** & Double vertical bars |
| **\`mat[...]\`** | \`matrix\` | \`\\begin{matrix} ... \\end{matrix}\` | None | Borderless arrays & alignment tables |

### Ergonomic Separators

* **Cell Separator**: Comma \`,\` or traditional ampersand \`&\`.
* **Row Separator**: Semicolon \`;\`, newline \`\\n\`, or traditional double backslash \`\\\\\`.
* **Depth Shielding**: Nested commas or semicolons inside functions (e.g. \`f(a, b)\`, \`a_{1,1}\`) are shielded by bracket depth counters and never trigger false column breaks.

### Delimiter-Wrapped Matrix Shorthands

You can also wrap bare \`mat[...]\` in outer delimiters for identical desugaring:
* \`|mat[1, 2; 3, 4]|\` $\\to \\begin{vmatrix} 1 & 2 \\\\ 3 & 4 \\end{vmatrix}$
* \`||mat[1, 2; 3, 4]||\` $\\to \\begin{Vmatrix} 1 & 2 \\\\ 3 & 4 \\end{Vmatrix}$
* \`{mat[1, 2; 3, 4]}\` or \`\\{mat[...]\\}\` $\\to \\begin{Bmatrix} 1 & 2 \\\\ 3 & 4 \\end{Bmatrix}$
* \`(mat[1, 2; 3, 4])\` $\\to \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$
* \`[mat[1, 2; 3, 4]]\` $\\to \\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$

### ⚙️ How to Enable & Configure

* **Master Switch**: 
  * Path: \`Settings → Color Math → Ergonomics & Life Quality → ⚡ Max Speed Syntactic Sugar\`
  * Setting: **Max Speed Syntactic Sugar** (\`speedSyntacticSugar\`) — *Default: ON*.
* **Dedicated Toggle**:
  * Path: \`Settings → Color Math → Ergonomics & Life Quality → ⚡ Max Speed Syntactic Sugar\`
  * Setting: **Shift-free breathing-room matrices (mat[1, 2; 3, 4])** (\`sugarBracketMatrices\`) — *Default: ON*.
* **Padding Option**:
  * Path: \`Settings → Color Math → Live Preview & Math Rendering\`
  * Setting: **Ergonomic matrix padding** (\`padMatrixPadding\`) — Inserts breathing-room padding around outer matrix delimiters so parentheses do not cling to glyphs.

---

## 4. Multi-Dialect Shorthand Operators & Morphisms

Typing mathematical operators often requires memorizing extensive LaTeX macro names. Color Math incorporates multi-dialect shorthands from Typst, AsciiMath, MATLAB, and Python that desugar into canonical LaTeX with $\\mathcal{O}(1)$ nanosecond lookahead.

### Binary Products, Arithmetic & Logic

| Shorthand Input | Desugared LaTeX | Visual Glyph | Mathematical Name |
| :--- | :--- | :---: | :--- |
| \`xx\` | \`\\times\` | $\\times$ | Cartesian cross product / scalar multiplication |
| \`xxx\` | \`\\bigotimes\` | $\\bigotimes$ | Extensible tensor / cross product |
| \`ox\` | \`\\otimes\` | $\\otimes$ | Tensor product |
| \`o+\` | \`\\oplus\` | $\\oplus$ | Direct sum |
| \`o.\` | \`\\odot\` | $\\odot$ | Hadamard entrywise product |
| \`+-\` | \`\\pm\` | $\\pm$ | Plus-minus sign |
| \`-+\` | \`\\mp\` | $\\mp$ | Minus-plus sign |
| \`vv\` | \`\\vee\` | $\\vee$ | Logical disjunction (OR) |
| \`vvv\` | \`\\bigvee\` | $\\bigvee$ | Extensible n-ary disjunction |
| \`^^\` | \`\\wedge\` | $\\wedge$ | Logical conjunction (AND) |
| \`^^^\` | \`\\bigwedge\` | $\\bigwedge$ | Extensible n-ary conjunction |
| \`uu\` | \`\\cup\` | $\\cup$ | Set union |
| \`uuu\` | \`\\bigcup\` | $\\bigcup$ | Extensible n-ary union |
| \`nn\` | \`\\cap\` | $\\cap$ | Set intersection |
| \`nnn\` | \`\\bigcap\` | $\\bigcap$ | Extensible n-ary intersection |

### Arrows, Morphisms & Transitions

| Shorthand Input | Desugared LaTeX | Visual Glyph | Primary Use Case |
| :--- | :--- | :---: | :--- |
| \`->\` | \`\\to\` | $\\to$ | Limit trajectory or function mapping |
| \`-->\` | \`\\longrightarrow\` | $\\longrightarrow$ | Long transformation arrow |
| \`=>\` | \`\\implies\` | $\\implies$ | Logical implication |
| \`==>\` | \`\\Longrightarrow\` | $\\Longrightarrow$ | Long logical implication |
| \`<=>\` | \`\\iff\` | $\\iff$ | Logical equivalence (If and only if) |
| \`<->\` | \`\\longleftrightarrow\` | $\\longleftrightarrow$ | Bidirectional relation |
| \`\\|->\` | \`\\mapsto\` | $\\mapsto$ | Element mapping rule |

### Relations & Definitions

| Shorthand Input | Desugared LaTeX | Visual Glyph | Mathematical Meaning |
| :--- | :--- | :---: | :--- |
| \`:=\` | \`\\coloneqq\` *(or \`:=\`)* | $\\coloneqq$ | Defined as (Definition equality) |
| \`=:\` | \`\\eqqcolon\` | $\\eqqcolon$ | Defines (Reverse definition) |
| \`!=\` | \`\\neq\` | $\\neq$ | Inequality |
| \`>=\` | \`\\ge\` | $\\ge$ | Greater than or equal to |
| \`<=\` | \`\\le\` | $\\le$ | Less than or equal to |
| \`~=\` or \`~~\` | \`\\approx\` | $\\approx$ | Approximately equal to |
| \`-=\` | \`\\equiv\` | $\\equiv$ | Identically equal / Congruent |

### ⚙️ How to Enable & Configure

* **Master Switch**: 
  * Path: \`Settings → Color Math → Ergonomics & Life Quality → ⚡ Max Speed Syntactic Sugar\`
  * Setting: **Max Speed Syntactic Sugar** (\`speedSyntacticSugar\`) — *Default: ON*.
* **Dedicated Toggle**:
  * Path: \`Settings → Color Math → Ergonomics & Life Quality → ⚡ Max Speed Syntactic Sugar\`
  * Setting: **Pure ASCII operator ligatures (>=, <=, !=, :=, +-, ~=)** (\`sugarAsciiOperators\`) — *Default: ON*.

---

## 5. Universal Font Modifiers \`bb(...)\`, \`cal(...)\`, etc.

Standard LaTeX requires distinct backslash macros for different mathematical fonts (e.g. \`\\mathbb{R}\`, \`\\mathcal{H}\`). Color Math harmonizes font modifications with universal delimiters (\`()\`, \`[]\`, \`{}\`) across both bare tokens and backslashed commands.

### Supported Font Modifiers

| Shorthand Prefix | Canonical LaTeX | Example Input | Visual Rendering | Field / Discipline |
| :--- | :--- | :--- | :---: | :--- |
| **\`bb\`** *(or \`\\bb\`, \`\\mathbb\`)* | \`\\mathbb{...}\` | \`bb(R)\`, \`bb[C]\`, \`bb{Z}\` | $\\mathbb{R}, \\mathbb{C}, \\mathbb{Z}$ | Blackboard bold (Number systems) |
| **\`cal\`** *(or \`\\cal\`, \`\\mathcal\`)* | \`\\mathcal{...}\` | \`cal(L)\`, \`cal[H]\`, \`cal{F}\` | $\\mathcal{L}, \\mathcal{H}, \\mathcal{F}$ | Calligraphic (Lagrangians, Hilbert spaces) |
| **\`bold\`** *(or \`\\bold\`, \`\\mathbf\`)* | \`\\mathbf{...}\` | \`bold(v)\`, \`bold[x]\`, \`bold{w}\` | $\\mathbf{v}, \\mathbf{x}, \\mathbf{w}$ | Boldface vectors and matrices |
| **\`frak\`** *(or \`\\frak\`, \`\\mathfrak\`)* | \`\\mathfrak{...}\` | \`frak(g)\`, \`frak[h]\`, \`frak{sl}\` | $\\mathfrak{g}, \\mathfrak{h}$ | Fraktur (Lie algebras, ideals) |
| **\`scr\`** *(or \`\\scr\`, \`\\mathscr\`)* | \`\\mathscr{...}\` | \`scr(E)\`, \`scr[B]\`, \`scr{P}\` | $\\mathscr{E}, \\mathscr{B}$ | Script (Electrodynamics, sheaves) |

### ⚙️ How to Enable & Configure

* **Master Engine**: 
  * Path: \`Settings → Color Math → Live Preview & Math Rendering\`
  * Setting: **Dynamic live rendering** (\`liveRendering\`) — *Default: ON*.
* **Typst & Shorthand Grammar**:
  * Automatically desugars within all math blocks with $\\mathcal{O}(1)$ lookahead and arity depth validation.

---

## 6. Chained Square & N-th Roots \`sqrt[n][x]\`

Standard LaTeX requires \`\\sqrt[n]{x}\`. Color Math allows shift-free bracket chains with arity gating to avoid greedy trailing bracket consumption.

### Syntax Examples

| Shorthand Input | Desugared LaTeX Output | Visual Rendering |
| :--- | :--- | :---: |
| \`sqrt[3][x^2 + 1]\` | \`\\sqrt[3]{x^2 + 1}\` | $\\sqrt[3]{x^2 + 1}$ |
| \`sqrt[x + 1]\` | \`\\sqrt{x + 1}\` | $\\sqrt{x + 1}$ |
| \`\\sqrt[n][a + b]\` | \`\\sqrt[n]{a + b}\` | $\\sqrt[n]{a + b}$ |

### ⚙️ How to Enable & Configure

* **Master Switch**: \`Settings → Color Math → Ergonomics & Life Quality → ⚡ Max Speed Syntactic Sugar\`.
* **Dedicated Toggle**: **Arity-gated chained roots (sqrt[3][x])** (\`sugarChainedRoots\`) — *Default: ON*.

---

## 7. Contextual ASCII Ellipses \`...\`

Typing three or more consecutive periods (\`...\`) dynamically resolves to the mathematically correct TeX ellipsis based on neighboring syntax:
* **Between binary operations**: \`1 + ... + n\` $\\to$ \`1 + \\cdots + n\` ($1 + \\cdots + n$)
* **Between commas & punctuation**: \`x_1, ..., x_n\` $\\to$ \`x_1, \\ldots, x_n\` ($x_1, \\ldots, x_n$)

### ⚙️ How to Enable & Configure

* **Master Switch**: \`Settings → Color Math → Ergonomics & Life Quality → ⚡ Max Speed Syntactic Sugar\`.
* **Dedicated Toggle**: **Contextual ASCII ellipses (... / .....)** (\`sugarAsciiEllipses\`) — *Default: ON*.

---

## 8. Automatic Delimiter Scaling & Compiler Crash Immunity

### Extensible Delimiter Auto-Scaling
Pairs of tall structures (such as fractions or matrices) enclosed by standard parentheses, brackets, or absolute value bars automatically scale dynamically:
* \`( \\frac{a}{b} )\` $\\to \\left( \\frac{a}{b} \\right)$
* \`\\| \\frac{df}{dx} \\|\` $\\to \\left\\| \\frac{df}{dx} \\right\\|$
* Determinants (\`| \\begin{matrix} ... \\end{matrix} |\`) automatically promote to extensible $\\left| \\dots \\right|$ delimiters when exceeding 3.0 lines of vertical height.

### Real-Time Typing Crash Immunity
During live typing in Obsidian Live Preview, incomplete formulas (e.g. dangling carets \`x^\`, unclosed square roots \`\\sqrt{\`, or open matrices) can crash MathJax. Color Math intercepts these states and injects non-destructive Unicode placeholder sentinels (\`▢\`, $U+25A2$) to ensure real-time render stability with zero editor stutter.

### ⚙️ How to Enable & Configure

* Path: \`Settings → Color Math → Live Preview & Math Rendering\`
* Setting: **Auto-scale delimiters** (\`autoScaleDelimiters\`) — *Default: ON*.
* Setting: **Crash immunity & sentinel auto-sealing** (\`crashImmunityAutoSeal\`) — *Default: ON*.

---

## 🛠️ Summary of Key Settings

| Feature Category | Setting Path | Key Setting Name | Default State |
| :--- | :--- | :--- | :---: |
| **Infix Fractions** | Live Preview & Math Rendering | *Require braces for infix slash division* | OFF (Flexible) |
| **Quoted Strings** | ⚡ Max Speed Syntactic Sugar | *Double-quote text strings ("...")* | ON |
| **Mnemonic Matrices** | ⚡ Max Speed Syntactic Sugar | *Shift-free breathing-room matrices* | ON |
| **Operator Ligatures** | ⚡ Max Speed Syntactic Sugar | *Pure ASCII operator ligatures* | ON |
| **Chained Roots** | ⚡ Max Speed Syntactic Sugar | *Arity-gated chained roots* | ON |
| **Context Ellipses** | ⚡ Max Speed Syntactic Sugar | *Contextual ASCII ellipses* | ON |
| **Delimiter Scaling** | Live Preview & Math Rendering | *Auto-scale delimiters* | ON |
| **Crash Immunity** | Live Preview & Math Rendering | *Crash immunity & sentinel auto-sealing* | ON |
`;
