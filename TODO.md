# 📌 Master Active Sprint Tasks & Major Architectural Decisions

> **Single Source of Truth**: This document is the unified active sprint tracker and decisions log for the entire **Color Math** ecosystem across all platforms:
> - 🔮 **Obsidian Platform** (`obsidian-color-math`)
> - ⚡ **Zed Platform** (`zed-color-math`)
> - 🐍 **Python Platform** (`python-color-math`)
> - 🔄 **Workspace Synchronization Engine** (`sync.mjs` / `sync.ps1`)
>
> **Rule**: When completing a task, tick `[x]` the corresponding line. Detailed architectural and mathematical specifications reside in [ROADMAP.md](file:///c:/Users/aditya/Documents/GitHub/color-math/ROADMAP.md) and [ROADMAP_MATHEMATICS.md](file:///c:/Users/aditya/Documents/GitHub/color-math/ROADMAP_MATHEMATICS.md).

---

## 🏛️ Part 0: Universal Architectural Decisions & Shared Algorithms

1. **Catalog & Lexer Engine (MPHF / Lexer)**: Minimal Perfect Hashing ($\mathcal{O}(1)$ direct array index) replaces regex and pointer-heavy Trie traversal. Automatically recognizes bare functions and bare Greek without backslashes (`sin(x)`, `alpha`, `range(A)`, `relu(z)`) alongside standard macros (`\sin`, `\alpha`). In TypeScript (`obsidian-color-math`), uses a branchless `Int32Array` CHD/PTHash engine (5.2 KB, zero V8 boxing). In Rust (`zed-color-math`), uses native `ptr_hash` (PtrHash) with 64-bit fast range reduction for sub-15ns lookups.
2. **LSP Semantic Token Delta Sync (`rust-analyzer` Prefix-Suffix Algorithm)**: $\mathcal{O}(\Delta)$ token array prefix/suffix diffing for instant updates without manual line-shift math or ghost token desync bugs.
3. **Live Preview Reconciliation (Content-Hash Diffing)**: Fast 32-bit `data-math-hash` per equation block. Re-renders only changed blocks; skips untouched DOM elements. Automatically self-heals macro updates.
4. **Notebook Processing (`ruff` Output-Agnostic Traversal)**: Navigates `.ipynb` JSON directly to `cell_type == "markdown"`, modifying only `source` text while leaving heavy `outputs` unparsed (saving 95% RAM).
5. **Vault Scanning (Two-Tier Architecture)**: Zero-I/O in-memory `metadataCache` query in Obsidian; persistent global timestamp cache (`~/.cache/colormath/`) + C-level raw byte probe (`b'$'` / `b'\('`) in Python.
6. **Bake & Undo (Single-Pass StringBuilder)**: Atomic non-destructive chunk buffer (`"".join(chunks)`), eliminating shifting string indices in Bake and fixed-point regex loops in Undo.
7. **Smart Whitespace & Function-Aware Normalization (Heuristic Grammar Repair)**: Context-aware mathematical argument consumption replacing TeX's dumb single-token splitting. Automatically groups multi-character numbers (`\frac 12 3` $\to$ `\frac{12}{3}`), cohesive monomials (`\frac 1 2x` $\to$ `\frac{1}{2x}`), parenthesized groups (`\frac (a+b) c` $\to$ `\frac{a+b}{c}`), and function calls (`\frac \sin(x) \cos(x)` & `\frac sin(x) cos(x)` $\to$ `\frac{\sin(x)}{\cos(x)}`). Strictly bounded by matrix cell walls (`&`, `\\`) and text isolation (`\text{...}`). Runs visually in Live Preview (Option A, zero cursor jumping) with permanent canonical `{...}` formatting on Bake (Option B), controlled via a dedicated settings toggle.
8. **Infix Inverted Division (`/` $\to$ `\frac` / `\dfrac`) with Brace & Number Awareness (Visual-First, Non-Destructive)**: Transforms natural infix division visually into vertical fractions on screen (`{a + b} / {c + d}` $\to$ $\frac{a + b}{c + d}$, `12 / 3` $\to$ $\frac{12}{3}$) without mutating the raw `.md` file on disk. Respects user shorthand and casual notes; only rewrites raw text to canonical `\frac` upon explicit user consent (e.g. Bake Math command). Uses invisible `{}` to preserve visible parentheses `()`, while protecting unbracketed unit slashes (`m/s`, `km/h`) and compact exponents (`e^{-t/\tau}`). Automatically promotes nested fractions to display fractions (`\dfrac{\dfrac{a}{b}}{a}`) to eliminate cramped script sizing and maintain full visual clarity.
9. **Live Preview Ghost Delimiters & Compiler Auto-Heal (`\left` $\to$ `\right`)**: Renders non-intrusive visual ghost closing delimiters (`\right)`) during active typing without keymap/Tab conflicts. Because an unclosed `\left(` is a fatal compiler-breaking crash in KaTeX/MathJax, the normalizer automatically seals the missing `\right)` into the document upon equation boundary termination (`$$`), on note close/blur, or during Bake.
10. **Backslash-Free Greek Letters & Constants (Typst-Style MPHF Token Matching)**: Direct $\mathcal{O}(1)$ MPHF lookup for bare Greek letters (`alpha`, `beta`, `gamma`, `pi`, `omega`, `Delta`, etc.) and mathematical constants (`oo` $\to \infty$, `hbar` $\to \hbar$, `nabla` $\to \nabla$, `partial` $\to \partial$, `ell` $\to \ell$). Because our lexer counts whitespace and operates on discrete tokens rather than naive global regex find-and-replace, multi-variable scalar multiplications (`p i` vs `pi`, `a l p h a` vs `alpha`) are cleanly separated by spaces, subscripts (`p_i`) have explicit `_`, and opaque text spans (`\text{...}`) are shielded from token collision.
11. **Blackboard & Calligraphic Font Shortcuts (`bb`, `cal`, `bold`, `frak`, `scr`)**: Maps Typst font call shortcuts (`bb(R)` $\to \mathbb{R}$, `cal(L)` $\to \mathcal{L}$, `bold(v)` $\to \mathbf{v}$, `frak(g)` $\to \mathfrak{g}$, `scr(F)` $\to \mathscr{F}$) into canonical LaTeX macros using balanced-parenthesis argument scanning (`readOperand`), cleanly supporting nested invocations (`bold(f(x))`, `bb(R^n)`) without premature delimiter truncation.
12. **Multi-Dialect Conversion Engine & Conflict Disambiguation (Settings + Interactive Quick Menu)**: Bidirectional $\mathcal{O}(1)$ conversion between Canonical LaTeX, Typst Math, and Unicode Glyphs. The primary target dialect (LaTeX, Typst, or Unicode) is configured globally in plugin settings for zero-friction typing. For ambiguous tokens (`*` $\to$ `\cdot` vs `\times` vs `\ast`; `->` $\to$ `\to` vs `\longrightarrow`; `/` $\to$ fraction vs slash vs `\div`), the engine applies standard mathematical convention by default, and provides an interactive Obsidian Suggestion Modal (`Alt+Enter` / Quick Menu) for instant manual selection with optional vault-level persistence. Includes an explicit setting toggle to completely disable the Quick Menu for users who prefer 100% silent, uninterrupted default resolution.
13. **Two-Tier Math Alphabet Engine (Curated Crucial Fast-Path + Dynamic Lexer Fallback)**: Eliminates 1,000+ redundant combinatorial keys from the hash table. The top ~25 most ubiquitous mathematical symbols (Number sets $\mathbb{R, C, N, Z, Q}$, Probability $\mathbb{E, P}$, Physics $\mathcal{L, H}$, Asymptotics $\mathcal{O}$, Linear Algebra $\mathbf{0, 1, x, y, v, A, W, X}$) are stored statically for instant $\mathcal{O}(1)$ resolution (~80 ns). All other expressions and macro roots (`\mathbb`, `\mathbf`, `bb`, `bold`, etc.) are resolved via dynamic lexer argument scanning (`readOperand`), cleanly supporting arbitrary formulas (`\mathbf{x_i + y_i}`, `\mathbb{R}^n`) and braceless shorthand (`\mathbb R`) without table bloat.
14. **👑 Lemire MPHF (FNV-1a Full-String) Engine**: Combines full-string FNV-1a non-cryptographic hashing with Daniel Lemire's branchless fast range reduction ($\lfloor \frac{h \times N}{2^{32}} \rfloor$) and a 16 KB `Uint16Array` displacement table residing 100% within the CPU L1 cache. Eliminates all modulo (`%`) division, removes probe chains and collision degradation, and executes in a rock-solid **55 ns flat** (~18,000,000 ops/sec) with 100.0% verified accuracy across all 6,879 catalog keys for both positive math hits and negative prose rejections.
15. **Zero-ReDoS Physical Units Engine & Whitespace Affinity Grammar**: Eliminates catastrophic regex backtracking (`(?:\s*|...)*`) by replacing dynamic prefix permutations with a static $\mathcal{O}(1)$ `WELL_KNOWN_UNITS` registry. Strictly excludes ambiguous single-letter alphabets (`m`, `s`, `g`, `N`, `A`, `J`, `W`, `V`, `C`) by default to protect algebraic expressions ($12m + 5n$). Employs whitespace affinity: tight spacing ($\le 1$ space / 0 spaces / `~` / `\,`) treats quantities as units ($12\text{ m/s}^2 \to 12 \; \mathrm{m/s^2}$), loose spacing ($\ge 2$ spaces) preserves independent algebraic variables ($12 \quad \text{m/s}^2$), and operators ($12+\text{m/s}^2$) remain pure arithmetic. Single-letter units are safely activated per-note via YAML (`units: physics`), settings toggle, or explicit Typst quotes (`12 "m"`). Auto-scales paired vertical bars `| ... |` and `\| ... \|` enclosing tall structures to `\left| ... \right|` and `\left\| ... \right\|`.
16. **View-Mode Segregated Execution Architecture & 3-Block Active Window**: Strictly segregates execution pathways across Obsidian's three distinct view modes:
    - **Source Mode**: Keeps raw editor syntax highlighting fully active across the visible viewport; completely disables the MathJax widget rendering interceptor (eliminating 100% of unused MathJax transforms and DOM overhead).
    - **Reading Mode**: Keeps MathJax widget rendering active for final document presentation; completely disables CodeMirror editor syntax highlighting (zero text scanning, zero CM6 decorations).
    - **Live Preview**: Employs cursor-focused 3-block sliding window culling — editor syntax highlighting is computed strictly for the **active math block containing the cursor** (`view.state.selection.main.head`) plus **one math block directly above it** and **one math block directly below it** (scaling down keystroke computation from 50+ equations to just 3), while MathJax renders collapsed inactive equation widgets. On edits, `this.decorations.map(update.changes)` anchors untouched decorations instantly in sub-microsecond time.
17. **Deterministic TypeScript Sync Engine (`sync.ts` / `sync.mjs`)**: High-reliability workspace synchronization engine replacing raw shell copies and PowerShell traversal quirks. Features recursive tree walk with `fs.promises.readdir(..., { withFileTypes: true })`, parallel cryptographic SHA-256 content verification (`node:crypto`), automatic pre-sync build and test gates (`npm run build && npm test`), post-write validation gate (read-back checksum matching), and inventory count parity assertion (`SourceFiles - ExcludedFiles === TargetFiles`) ensuring zero silently dropped files.
18. **Bidirectional Rendered-Math ↔ Source-Range Navigation (Targeted Click & Hover Selection)**: Enables granular navigation between rendered MathJax CHTML elements and raw LaTeX source. Maps native CHTML semantic tags (`<mjx-num>`, `<mjx-den>`, `<mjx-line>`, `<mjx-sqrt>`, `<mjx-surd>`, `<mjx-msup>`, `<mjx-script>`, `<mjx-mtr>`, `<mjx-mtd>`) directly to Concrete Syntax Tree (CST) nodes (`FractionNode`, `GroupNode`, `ScriptNode`) holding exact 0-indexed UTF-16 `[start, end]` spans. Provides delegated hover highlights (`.color-math-hover-target`) and capture-phase `mousedown` interception on `view.dom` to dispatch targeted CodeMirror 6 selections (`view.dispatch({ selection: { anchor, head } })`), collapsing Live Preview widgets with the clicked sub-expression instantly focused and selected.

---

## 🔮 Part 1: Active Sprint Tasks — Obsidian Platform (`obsidian-color-math`)

### 📦 Completed Milestones (v1.0.35 – v1.0.62)
- [x] Set Editor syntax highlighting (Live Preview) ON by default in initial settings
- [x] Implement Minimal Perfect Hash (MPHF) / Lexer catalog engine in TypeScript core with bare function support (`sin(x)`, `range(A)`)
- [x] Expand MPHF catalog to 5,211 symbols with bidirectional $\mathcal{O}(1)$ reverse lookup, BMP & Plane 1 Unicode mappings, canonical LaTeX aliases, and package origin metadata (v1.0.35)
- [x] Migrate Live Preview decoration builder to CodeMirror 6 native `EditorView.decorations` facets / `RangeSet.join`, eliminating manual $O(N \log N)$ sorting
- [x] Implement content-hash block reconciliation in MathJax interceptor to skip unmodified rendered DOM elements
- [x] Wire vault-wide scanning commands directly to Obsidian's in-memory `app.metadataCache` for instant zero-disk filtering
- [x] Refactor Bake & Undo commands to use a single-pass StringBuilder chunk assembler
- [x] Add bare Greek letters (lowercase, uppercase, variants) and constants (`oo`, `hbar`, `nabla`, `partial`, `ell`) to `symbols_catalog.json` and regenerate MPHF (`catalog.ts`) (v1.0.36)
- [x] Implement balanced-parenthesis Typst font shortcuts (`bb`, `cal`, `bold`, `frak`, `scr`) in `latex_helpers.ts` normalizer (v1.0.36)
- [x] Add unit test suite for bare Greek/constant MPHF lookup and balanced font shortcut transformations (v1.0.36)
- [x] Implement Smart Whitespace & Function-Aware Normalization in `latex_helpers.ts` (`\frac 12 3` $\to$ `\frac{12}{3}`, `\frac ab c` $\to$ `\frac{ab}{c}`, `\frac 1 2x` $\to$ `\frac{1}{2x}`, `\frac \sin(x) \cos(x)` $\to$ `\frac{\sin(x)}{\cos(x)}`, `\frac sin(x) cos(x)` $\to$ `\frac{\sin(x)}{\cos(x)}`) (v1.0.36)
- [x] Implement Infix Inverted Division (`/` $\to$ `\frac`) as a visual-only render in Live Preview/MathJax, leaving raw `.md` files untouched unless explicitly baked (v1.0.36)
- [x] Implement Live Preview ghost delimiter indicator for unclosed `\left(` with automatic compiler auto-heal insertion upon equation boundary termination (`$$`) or Bake (v1.0.37)
- [x] Implement matrix & alignment boundary hard stops (`&` and `\\`) to prevent fractions from swallowing cell walls (v1.0.36)
- [x] Implement prose isolation and nested inline math scanner (`markdown_scanner.ts` reuse) inside `\text{...}` with display math block (`$$`) error flagging (v1.0.36)
- [x] Add settings toggle "Smart Whitespace & Function Normalization" under Feature Previews with Option A (Live Preview visual render) and Option B (Bake permanent mutation) (v1.0.37)
- [x] Implement Multi-Dialect Conversion Engine (LaTeX $\longleftrightarrow$ Typst $\longleftrightarrow$ Unicode) with global target settings and interactive quick menu (`Alt+Enter`) for ambiguous tokens (v1.0.37)
- [x] Build Two-Tier Math Alphabet Engine into catalog (Fast-path ~25 crucial keys + font macro roots with `arity: 1`) (v1.0.37)
- [x] Deploy 👑 Lemire MPHF (FNV-1a Full-String) engine with 16 KB L1 displacement table into `catalog.ts` (55 ns flat lookup, 100% collision-free across 6,879 symbols) (v1.0.37)
- [x] Implement Zero-ReDoS Unit Parser with static `WELL_KNOWN_UNITS` HashMap (multi-character & compound units only, strictly excluding single letters by default) (v1.0.38)
- [x] Implement Whitespace Affinity grammar ($\le 1$ space $\to$ unit with `\;` insertion when `colorUnits` toggle is on; $\ge 2$ spaces $\to$ algebraic variables; operators $\to$ arithmetic) (v1.0.38)
- [x] Implement Single-Letter Unit activation via per-note YAML frontmatter (`units: physics`), options, and Typst quotes (`12 "m"`) (v1.0.38)
- [x] Implement nested unit exponent coloring (`\textcolor{unit}{m/s^{\textcolor{upper}{2}}}`) (v1.0.38)
- [x] Expand Typst Delimiter Auto-Scaling to support vertical bars `| ... |` and `\| ... \|` for determinants and matrices (v1.0.38)
- [x] Wire `normalizeMathSyntax` into `colorLatexBody` and prevent delimiter `\textcolor` from wrapping whole matrix environments (fixes vertical bar scaling and matrix color flooding) (v1.0.39)
- [x] Shield double-quoted string literals (`"..."`) from math variable coloring in Live Preview and preserve multi-space formatting with LaTeX control spaces in `\text{...}` (v1.0.40)
- [x] Remove Quick Suggestion (`Alt+Enter` / SuggestModal) toggle from Feature Previews in Settings tab (feature is not ready yet; keep internal until fully developed and tested) (v1.0.41)
- [x] Update `README.md` with newly implemented features (Typst syntax shortcuts, smart whitespace normalization, physical units grammar, vertical bar auto-scaling, and string literal isolation) (v1.0.41)
- [x] Performance & Resource Telemetry Suite with 120 Hz display budget calibration ($8.33\text{ ms}$), sub-microsecond latency benchmarks, and 157-file higher studies math corpus validation with limit controls fix (v1.0.41)
- [x] Standard Typst Symbol & Bare Function Alignment: Reclassify `zeta` and `\zeta` as parameter (matching `eta`, `beta`, `alpha`), unify `\nabla` as operator and `\partial` as differential (`palette.derivative`), classify arrow relations per Typst UTR #25, remove legacy `BARE_GREEK_AND_CONSTANTS` fallback bandages, and implement upright Roman KaTeX operator normalization (`normalizeBareFunctions` with `STANDARD_LATEX_OPERATORS` filter) (v1.0.45)
- [x] Execute 10-Point MPHF Migration Plan: document math conversion ($\mathcal{O}(1)$ reverse lookup), LaTeX span & operand tokenizer, delimiter detection & extensible fences with Unicode bracket pairs, quantum Dirac bra-ket notation ($|\psi\rangle, \langle\phi|\psi\rangle$), physics operators ($\nabla, \partial, \hbar$ font variants), constant & imaginary unit scanning ($i\alpha, i\beta, i\tau$), CST domain discipline tokenizer, variable data-flow hashing, LaTeX helper macro/function & tall operator auto-scaling, and global static fallback streamlining (v1.0.46)
- [x] Multi-Threaded Corpus Audit Runner (`npm run test:corpus`): 100% Zero-Error SLA verified across 6,392 files and 172,823 mathematical equations in 17.14 seconds on 6 worker threads (50% CPU allocation), resolving delimiter atomic coloring, text boundary shielding, cross-scope delimiter auto-scaling, combining diacritic protection, and differential boundary patterns (v1.0.46)
- [x] Unified Pipeline Reconciliation & Live Preview Synchronization: Unified Live Preview syntax highlighting and Reading View / MathJax widgets onto single shared pipeline (`computeSemanticMathSpans` in `generic.ts`), trimmed operator spans to avoid swallowing interior bounds in `\int_{a}^{b}` and `\sum_{i=1}^{n}`, protected extensible braces (`\underbrace`, `\overbrace`) from offset-inducing wrappers, ensured identical priority and color for bare and macro Greek symbols (`\eta` vs `eta`), and verified error highlighting for both unclosed `{` and stray `}` delimiters (v1.0.54)
- [x] Operator Display Limits & Ergonomic Matrix Padding: Implemented Approach A for LaTeX wrapping (`forLatexWrap: true`) to preserve top & bottom display limits for `\sum` and `\prod`, and added ergonomic matrix padding (`padMatrixEnvironment`) inserting extra leading `&` and trailing `&` delimiters across matrix environments for comfortable breathing room (v1.0.55)
- [x] Matrix Padding Setting & Cross-Cell Compiler Immunity: Made ergonomic matrix padding (`padMatrixPadding`) an opt-in configurable setting toggle, added cross-cell curly brace healing in matrix environments to prevent KaTeX/MathJax compilation crashes from unbalanced braces crossing cell boundaries, and established multi-worker execution rules (up to 50% CPU allocation on 6 worker threads) (v1.0.56)
- [x] Delimiter Warning Squiggles & Auto-Sealing Normalization: Added unclosed quote (`"`) delimiter tracking in `delimiters.ts` with Live Preview red squiggly error underlines, balanced stray closing braces (`}`) as `{}` (e.g. `\sum_{n=1}^{\infty}{}`), auto-sealed unclosed quotes at end of expression, and standardized system CPU baseline check to a 3-second average (v1.0.57)
- [x] Live Preview Quote Squiggly Warning Preservation & Auto-Conversion to `\text{...}`: Fixed string literal span filtering in `live_preview.ts` so unmatched delimiter warnings (`priority >= 90`) are always preserved and render `.color-math-unmatched-delimiter` wavy red underline under unclosed `"`, auto-converted unclosed quotes to `\text{...}` up to line/math boundary behind the scenes (`$$x = 1 " if  y = 0 $$` -> `$$x = 1 \text{ if  y = 0 }$$`), balanced stray closing braces inside unclosed quote text as `{}` (`x = 1 " if } y = 0` -> `x = 1 \text{ if {} y = 0}`), strictly preserved unclosed `{` behavior, and verified 100% green test suite (476/476 tests across 35 files) (v1.0.58)
- [x] Data-Driven Lemire MPHF Engine & Limit/Extensible Optimization: Encoded limit operators (`\lim`, `\limsup`, `\liminf`, `\varlimsup`, `\varliminf`, `\projlim`, `\injlim`, etc.) with native `"uncolored": true` and extensible annotations (`\overbrace`, `\underbrace`, `\overbracket`, `\underbracket`, `\overleftarrow`, `\overrightarrow`, `\underline`, `\overline`, etc.) with native `"extensible": true` in `data/symbols_catalog.json`; stripped runtime bloat (`detail`, `package`, `plane1`) reducing `catalog.ts` from 1.45 MB to 698 KB (52% reduction, over 754 KB saved); unified `plane1` into `unicode`; eliminated hardcoded `EXTENSIBLE_ANNOTATIONS` set from `taxonomy.ts`; verified 100% green test suite (480/480 tests across 35 files) and verified 0 regressions across 172,823 formulas in 6,392 files via 6 worker threads (50% CPU allocation) (v1.0.60)
- [x] View-Mode Segregated Execution & Zero-Waste Performance Engine (v1.0.61):
  - [x] Source Mode: Completely bypass MathJax interceptor/rendering in `mathjax_interceptor.ts` when editor is in Source Mode (`!view.state.field(editorLivePreviewField)`), running only viewport raw editor syntax highlighting
  - [x] Reading Mode: MathJax widget rendering active; CodeMirror editor syntax highlighting decoupled and inactive in Reading View
  - [x] Live Preview: Restrict CodeMirror syntax highlighting in `live_preview.ts` strictly to the 3-block active window (active math block containing cursor + 1 above + 1 below)
  - [x] Hybrid Incremental Mapping: Use `decorations.map(update.changes)` on typing to anchor existing decorations instantly, updating active window on selection changes
  - [x] Guard-Clause Early Exits in `latex_helpers.ts`: Added fast string containment guards before all 13 regex normalizer passes, including dual matrix check `text.includes("\\begin") && text.includes("matrix")`
  - [x] Note Mode Metadata Cache in `main.ts`: Eliminated `view.editor.getValue()` rogue fallback, reading only from frontmatter & cache tags, and caching mode by `file.path`
  - [x] $O(1)$ Set Lookups & Pre-Filtered Non-Slash Commands in `scanner.ts`: Replaced $O(M)$ linear array scan with `COLOR_COMMANDS.has()` and `NON_SLASH_FIRST_CHARS.has()`
- [x] Code Quality, Typing, Linting & Declarative Settings Migration (Phases 1–5): Fixed regex escapes, eliminated unexpected `any` and unsafe type assertions in AST/CST/DOM interceptor, pruned dead code, removed default command hotkeys, implemented `getSettingDefinitions()` for native Obsidian 1.13+ settings search indexing, modernized deprecated `setDestructive()` and `display()` re-render calls, eliminated all `!important` CSS overrides via selector specificity, replaced unknown type selector `mjx-container`, and audited with 0 regressions across 172,823 formulas (v1.0.62)
- [x] Settings Tab Architectural Redesign & Quality of Life Pillar: Reorganized settings tab into 7 clean, logically grouped sections; promoted Compiler Crash Immunity, Typst-style Delimiter Auto-Scaling, and Ergonomic Matrix Padding out of Previews into the primary Life Quality & Typing Ergonomics section; created dedicated Physics & Quantum Mechanics sub-group; reorganized Theme & Palettes; and updated default settings with full synchronization in `default.config.json` (v1.0.63)

### 🚀 Upcoming Active Tasks
- [ ] Bidirectional Rendered-Math ↔ Source-Range Navigation (Roadmap 0.20 / 1.4):
  - [ ] Implement CHTML tag matcher mapping `<mjx-num>`, `<mjx-den>`, `<mjx-line>`, `<mjx-sqrt>`, `<mjx-surd>`, `<mjx-msup>`, `<mjx-script>`, `<mjx-mtr>`, `<mjx-mtd>` to CST nodes (`FractionNode`, `GroupNode`, `ScriptNode`)
  - [ ] Add delegated `pointerover`/`pointermove` hover highlight (`.color-math-hover-target`) on `<mjx-container>`
  - [ ] Add capture-phase `mousedown` on `view.dom` intercepting math clicks to dispatch targeted selection (`view.dispatch({ selection: { anchor, head } })`) into raw LaTeX
- [ ] Interactive Live Equation Preview Box in Settings Tab (Roadmap 1.9):
  - [ ] Render a live MathJax sample formula ($\int_0^\infty \alpha f'(x) \, dx = \hbar \omega$) above the theme palette swatches
  - [ ] Clicking any token in the formula directly highlights and focuses that semantic role's color picker
- [ ] Custom High-Fidelity RGB/HSL Popover Color Picker (Roadmap 1.10):
  - [ ] Replace Chromium native OS `input[type="color"]` dialog with an in-app Obsidian-themed popover (Figma / VS Code style)
  - [ ] Support saturation/value 2D spectrum canvas, hue/alpha sliders, quick palette swatches, and hex/RGB/HSL direct editing
- [ ] Automated Multi-Core Release Pipeline (`npm run release`):
  - [ ] Implement a streamlined release orchestrator (`scripts/release.mjs` triggered via `npm run release`) to automate the end-to-end publishing workflow.
  - [ ] Run pre-release test suites and corpus validation utilizing performance cores (up to 50% CPU / 6 worker threads on Intel i5-13420H per system policy).
  - [ ] Synchronize and assert version parity across `package.json`, `manifest.json`, and `versions.json`.
  - [ ] Automate staging, semantic release commit creation (`feat(release): vX.Y.Z`), annotated Git tag creation (`vX.Y.Z`), and remote push (`git push origin main --follow-tags`) to trigger the GitHub Actions release builder.
- [ ] Real-Time Settings Reactivity & Multi-Tier Cache Eviction (Roadmap 1.11 - Zero-Lag Settings Updates):
  - [ ] Implement CodeMirror 6 `forceColorMathRefreshEffect` (`StateEffect.define<void>()`) in `live_preview.ts` so `cm.dispatch({ effects: forceRefresh })` forces an immediate editor syntax repaint without requiring user clicks or keystrokes
  - [ ] Evict MathJax DOM element cache (`interceptor.clearCache()`) and CST syntax span cache (`clearMathSpanCache()`) inside `saveSettings()` and `rerenderMath()`
  - [ ] Expand MathJax interceptor `getContextKey()` to incorporate all 13 semantic color roles, rainbow tiers, and taxonomy/delimiter options to prevent hash collision on color tweaks
  - [ ] Invalidate note mode detection cache (`noteModeCache.clear()`) on settings change so mode-based overrides update instantly across open notes
- [ ] Core Engine Optimization Plan (`core_engine_optimization_plan.md` - Deferred / Future Phase):
  - [ ] Sweep-Line Active-Interval Filter in `spans.ts`: Replace $O(N^2)$ `accepted.some(crosses)` loop with active interval pass; keep existing priority weights intact and strictly preserve atomic delimiter immunity (`\left`, `\right`, matrix groups)
  - [ ] Zero-Allocation In-Place Markdown Scanner in `markdown_scanner.ts`: Replace `lineRanges` array allocation with direct `indexOf("\n")` cursor, strictly preserving CommonMark container state stack for callouts and nested lists
  - [ ] Pre-Compiled Macro Regexes in `modes.ts`: Pre-compile static domain alternations sorted by length descending with command boundaries `(?![a-zA-Z])` to eliminate per-formula regex instantiation and avoid prefix shadowing
  - [ ] Real-World Stress Test Suite (`tests/real_world_environments.test.ts`): Verify math inside single/nested callouts (`> [!note]`), tables with pipes, deeply indented task lists, HTML wrappers, and footnotes
  - [ ] Lightweight Template DOM Caching in `mathjax_interceptor.ts` (Deferred: negligible gains, risks DOM event detachment)

---

## ⚡ Part 2: Active Sprint Tasks — Zed Platform (`zed-color-math`)

- [x] Implement initial Trie/DFA LaTeX catalog engine (2,710+ symbols) in language server with subscript absorption
- [ ] Phase 0: Scaffolding & Zed WASI Extension Skeleton (`wasm32-wasip1`)
  - [ ] Create `extension.toml`, `Cargo.toml`, and `.cargo/config.toml` targeting `wasm32-wasip1`
  - [ ] Implement JSON-RPC 2.0 loop over standard `stdin`/`stdout`
- [ ] Phase 1: Adapter Architecture & Language Server Binary
  - [ ] Implement `LanguageAdapter` trait isolating LaTeX, Markdown, and Typst syntaxes
  - [ ] Integrate lexer with token span emitter into the LSP binary
- [ ] Phase 2: Native Rust `ptr_hash` MPHF Engine & Semantic Tokens
  - [ ] Implement native Rust `ptr_hash` (PtrHash) MPHF catalog engine with 64-bit fast range reduction, sub-15ns lookups, and bare function/Greek recognition (`sin(x)`, `alpha`, `range(A)`)
  - [ ] Implement `textDocument/semanticTokens/full/delta` with `rust-analyzer` prefix-suffix token array diffing
  - [ ] Benchmark token generation: assert sub-5ms latency on 10,000-line LaTeX files
- [ ] Phase 3: Dynamic Theme Contrast & Rich Hover
  - [ ] Implement `textDocument/hover` returning Markdown hover cards with mathematical context, constant values, and differential orders
  - [ ] Hook `workspace/configuration` to adaptively switch Tokyo Night / Tokyo Day palettes based on Zed theme
- [ ] Phase 4: Formatting & Code Actions
  - [ ] Port smart whitespace normalization (`\frac 12 3` $\to$ `\frac{12}{3}`) into `textDocument/formatting`
  - [ ] Implement Code Action for auto-sealing missing `\right)` delimiters
- [ ] Phase 5: Live Math Preview Engine
  - [ ] Implement content-hash block diffing (`data-math-hash`) in WebSocket live preview server to eliminate full-page KaTeX re-renders
- [ ] Phase 6: Embedded Tectonic Compiler Integration
  - [ ] Embed Tectonic C/Rust bindings for zero-setup local PDF generation
- [ ] Phase 7: Typst Language Support
  - [ ] Implement Typst math mode adapter, converting Typst shorthand (`bb(R)`, `alpha`, `1/2`) to shared semantic AST
- [ ] Phase 8: Package & Submit to Zed Extension Registry

---

## 🐍 Part 3: Active Sprint Tasks — Python Platform (`python-color-math`)

- [ ] Implement Minimal Perfect Hash (MPHF) / Lexer catalog engine in `color_math/parsers/catalog.py` & `scanner.py` with bare function support (`sin(x)`, `range(A)`)
- [ ] Implement `ruff`-style output-agnostic Jupyter Notebook (`.ipynb`) traversal, isolating markdown cells while leaving heavy `outputs` unparsed (saving 95% RAM)
- [x] Implement two-tier vault candidate filtering: global timestamp cache (`~/.cache/colormath/`) + C-level raw byte scan (`b'$'` / `b'\('`)
- [x] Refactor `color_math/undo.py` and `core.py` to use a single-pass StringBuilder chunk buffer (replacing fixed-point regex loops)
- [ ] Implement CLI & Batch Directory Normalization Pipeline via Python multiprocessing

---

## 🔄 Part 4: Active Sprint Tasks — Workspace Synchronization Engine (`sync.mjs`)

- [x] Build `sync.ts` / `sync.mjs` CLI in `C:\Users\aditya\Documents\CODES\Sync\` mirroring `sync-config.json` profile definitions
- [x] Implement robust directory tree scanner using `fs.promises.readdir({ recursive: true, withFileTypes: true })` supporting deep nesting, hidden dotfiles, and exact exclusion globs
- [x] Implement SHA-256 cryptographic verification using `node:crypto` with multi-worker concurrency
- [x] Implement Mandatory Post-Write Validation Gate: read every written target file back, re-hash, and assert 100% bit-for-bit checksum parity against source
- [x] Implement Inventory Count Parity Assertion (`Source - Excluded === Target`) to make silent file omissions mathematically impossible
- [x] Implement Automated Pre-Sync Hooks (`npm run build && npm test`) with clean stderr diagnostic capture
- [x] Support `--dry-run --as-json` for AI agent consumption and `--execute --force` with centralized timestamped rollback snapshots in `.backups/`
- [ ] Compact Actionable JSON Output (`-AsJson` Optimization): Filter `Changes` array in `sync.mjs` / `engine.ts` to include only actionable items (`New`, `Newer`, `Conflict`), collapsing identical files into an `IdenticalCount` summary metric to prevent massive 58,000-line task logs when scanning large test corpora.
- [x] Unit test suite in `vitest` covering edge cases (deeply nested paths, empty files, dotfiles, file exclusions, conflict resolution)

### 🛡️ 7-Pillar Transactional Safety Shield (Crash-Proof Architecture)
- [ ] 1. Transaction Journal & Graceful Auto-Rollback: Active `transaction.json` with `SIGINT` / `SIGTERM` / error handlers auto-reverting partial writes from `.backups/` snapshot
- [ ] 2. Hardware-Level NVMe Flush: Force `filehandle.sync()` on written files prior to atomic rename to prevent NAND data loss on sudden power cut
- [ ] 3. Single-Instance Mutex Lockfile: Process PID lock (`.sync.lock`) in backup root with stale-PID auto-pruning to prevent concurrent sync collisions
- [ ] 4. Source Immutability Check: Post-read verification of source `mtime` and hash to catch mid-flight file edits from editors or background builds
- [ ] 5. Path Traversal Sandboxing: Strict canonical boundary assertion ensuring all writes stay bounded inside `path.resolve(cfg.target)`
- [ ] 6. Pre-Flight Target Writability & Disk Space Probe: Canary write/delete test and free disk space check before executing file writes
- [ ] 7. Symlink & NTFS Junction Loop Protection: Realpath tracking and symlink detection during recursive scanner traversal to prevent infinite loops
