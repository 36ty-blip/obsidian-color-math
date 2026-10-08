# 📌 Active Sprint Tasks & Major Architectural Decisions

> **Rule**: When completing a task, tick `[x]` the corresponding line. Major architectural decisions and algorithms are summarized here for immediate context; detailed specifications reside in `ROADMAP.md`.

---

## 🏛️ Major Architectural Decisions & Algorithms

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

---

## 📋 Active Tasks by Platform

### 🔮 `obsidian-color-math`
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

#### 🛠️ Source code

- [ ] **Warning**: Unsafe assignment of an `error` or `any` typed value
  - `@typescript-eslint/no-unsafe-assignment`
  - `src/converters/generic.ts:102`, `src/parsers/cst/parser.ts:1374-1376`, `src/parsers/cst/parser.ts:1819`, `src/parsers/cst/parser.ts:1821`, `src/parsers/cst/parser.ts:1831`, `src/utils/latex_helpers.ts:2367`, `src/utils/latex_helpers.ts:2477`, `src/utils/latex_helpers.ts:2480`
- [ ] **Warning**: Unexpected any. Specify a different type.
  - `src/editor/mathjax_interceptor.ts:61`, `src/editor/mathjax_interceptor.ts:62`, `src/editor/mathjax_interceptor.ts:69`, `src/editor/mathjax_interceptor.ts:70`, `src/editor/mathjax_interceptor.ts:76`, `src/editor/mathjax_interceptor.ts:77`, `src/parsers/cst/parser.ts:1376`, `src/parsers/cst/parser.ts:1818`, `src/parsers/cst/parser.ts:1819`, `src/parsers/cst/parser.ts:1820`, `src/parsers/cst/parser.ts:1821`, `src/parsers/cst/parser.ts:1831`, `src/parsers/cst/parser.ts:1831`, `src/parsers/cst/parser.ts:1930`, `src/parsers/engine_bridge.ts:39`, `src/parsers/engine_bridge.ts:40`
- [ ] **Warning**: Unsafe member access on an `error` or `any` typed value
  - `@typescript-eslint/no-unsafe-member-access`
  - `src/editor/mathjax_interceptor.ts:61`, `src/editor/mathjax_interceptor.ts:62`, `src/editor/mathjax_interceptor.ts:69`, `src/editor/mathjax_interceptor.ts:70`, `src/editor/mathjax_interceptor.ts:76`, `src/editor/mathjax_interceptor.ts:77`, `src/parsers/cst/parser.ts:1376`, `src/parsers/cst/parser.ts:1818`, `src/parsers/cst/parser.ts:1819`, `src/parsers/cst/parser.ts:1820`, `src/parsers/cst/parser.ts:1821`, `src/parsers/cst/parser.ts:1831`, `src/parsers/cst/parser.ts:1831`, `src/parsers/cst/parser.ts:1930`, `src/parsers/engine_bridge.ts:39`, `src/parsers/engine_bridge.ts:40`, `src/utils/latex_helpers.ts:2477`, `src/utils/latex_helpers.ts:2480`
- [ ] **Warning**: Unsafe call of an `error` or `any` typed value
  - `@typescript-eslint/no-unsafe-call`
  - `src/editor/mathjax_interceptor.ts:62`, `src/editor/mathjax_interceptor.ts:70`, `src/editor/mathjax_interceptor.ts:77`, `src/parsers/engine_bridge.ts:40`, `src/utils/latex_helpers.ts:2477`, `src/utils/latex_helpers.ts:2480`
- [ ] **Warning**: Passes unsafe values into typed parameters
  - `@typescript-eslint/no-unsafe-argument`
  - `src/editor/mathjax_interceptor.ts:77`, `src/parsers/cst/parser.ts:1873`, `src/parsers/cst/parser.ts:1882`, `src/parsers/cst/parser.ts:1885`, `src/parsers/cst/parser.ts:1891`, `src/parsers/cst/parser.ts:1903`, `src/parsers/cst/parser.ts:1908`, `src/parsers/cst/parser.ts:1914`, `src/parsers/cst/parser.ts:1916`, `src/parsers/cst/parser.ts:1918`, `src/utils/latex_helpers.ts:2476`
- [ ] **Warning**: Don't provide a default hotkey, as they might conflict with other hotkeys the user has already set, or that are included with Obsidian by default.
  - `src/main.ts:267`
- [ ] **Warning**: This PluginSettingTab does not implement getSettingDefinitions(); its settings will not appear in Obsidian's settings search for users on 1.13.0 or later. Consider adopting the declarative settings API.
  - `src/main.ts:1148`
- [ ] **Warning**: This assertion is unnecessary since it does not change the type of the expression.
  - `src/parsers/cst/parser.ts:1232`, `src/parsers/cst/parser.ts:1756`, `src/parsers/cst/parser.ts:1857`, `src/parsers/cst/parser.ts:1927`, `src/parsers/cst/parser.ts:2110`
- [ ] **Warning**: Unnecessary escape character: `\-`.
  - `src/parsers/cst/parser.ts:1344`, `src/parsers/cst/tokenizer.ts:105`
- [ ] **Warning**: Unnecessary escape character: `\}`.
  - `src/parsers/cst/parser.ts:1454`
- [ ] **Warning**: Unnecessary escape character: `\a`.
  - `src/parsers/cst/tokenizer.ts:105`
- [ ] **Warning**: Unnecessary escape character: `\m`.
  - `src/parsers/cst/tokenizer.ts:105`
- [ ] **Warning**: Returns unsafe values from typed code
  - `@typescript-eslint/no-unsafe-return`
  - `src/parsers/engine_bridge.ts:40`
- [ ] **Warning**: Empty block statement.
  - `src/parsers/engine_bridge.ts:97`
- [ ] **Warning**: Unnecessary escape character: `\^`.
  - `src/parsers/units.ts:176`
- [ ] **Recommendation**: 'normalizeLatexBraces' is defined but never used.
  - `src/converters/generic.ts:17`
- [ ] **Recommendation**: 'bareFunctions' is assigned a value but never used.
  - `src/editor/live_preview.ts:109`
- [ ] **Recommendation**: `display` is deprecated. Since 1.13.0. Use `{@link getSettingDefinitions}` instead.
  - `src/main.ts:1271`, `src/main.ts:1342`, `src/main.ts:1362`, `src/main.ts:1382`, `src/main.ts:1469`, `src/main.ts:1484`, `src/main.ts:1648`, `src/main.ts:1712`, `src/main.ts:1955`
- [ ] **Recommendation**: `setWarning` is deprecated. Use `{@link setDestructive}` for a destructive button, or `setDestructive().setCta()` for a destructive primary action.
  - `src/main.ts:1952`
- [ ] **Recommendation**: 'M' is assigned a value but never used.
  - `src/parsers/catalog.ts:46`
- [ ] **Recommendation**: 'GroupNode' is defined but never used.
  - `src/parsers/cst/collector.ts:5`
- [ ] **Recommendation**: 'ScriptNode' is defined but never used.
  - `src/parsers/cst/collector.ts:5`
- [ ] **Recommendation**: 'FractionNode' is defined but never used.
  - `src/parsers/cst/collector.ts:5`
- [ ] **Recommendation**: 'NumberNode' is defined but never used.
  - `src/parsers/cst/parser.ts:13`
- [ ] **Recommendation**: 'PunctuationNode' is defined but never used.
  - `src/parsers/cst/parser.ts:14`
- [ ] **Recommendation**: 'CommentNode' is defined but never used.
  - `src/parsers/cst/parser.ts:15`
- [ ] **Recommendation**: 'GREEK_COMMANDS' is defined but never used.
  - `src/parsers/cst/parser.ts:30`
- [ ] **Recommendation**: 'isQuantifier' is defined but never used.
  - `src/parsers/cst/parser.ts:32`
- [ ] **Recommendation**: 'isSubgroupOrMorphism' is defined but never used.
  - `src/parsers/cst/parser.ts:33`
- [ ] **Recommendation**: 'DIFF_RESERVED_COMMANDS' is assigned a value but never used.
  - `src/parsers/differentials.ts:14`
- [ ] **Recommendation**: 'RAINBOW_DELIMITER_COLORS' is defined but never used.
  - `src/parsers/engine_bridge.ts:1`
- [ ] **Recommendation**: 'DelimiterCollectorOptions' is defined but never used.
  - `src/parsers/engine_bridge.ts:2`
- [ ] **Recommendation**: 'isTallMath' is defined but never used.
  - `src/utils/latex_helpers.ts:1516`
- [ ] **Recommendation**: 'getDelimSizingLevel' is defined but never used.
  - `src/utils/latex_helpers.ts:1619`




### 🐍 `python-color-math`
- [ ] Implement Minimal Perfect Hash (MPHF) / Lexer catalog engine in `color_math/parsers/catalog.py` & `scanner.py` with bare function support (`sin(x)`, `range(A)`)
- [ ] Implement `ruff`-style output-agnostic Jupyter Notebook (`.ipynb`) traversal, isolating markdown cells while leaving heavy `outputs` unparsed
- [ ] Implement two-tier vault candidate filtering: global timestamp cache (`~/.cache/colormath/`) + C-level raw byte scan (`b'$'` / `b'\('`)
- [ ] Refactor `color_math/undo.py` and `core.py` to use a single-pass StringBuilder chunk buffer (replacing fixed-point regex loops)

### ⚡ `zed-color-math`
- [x] Implement initial Trie/DFA LaTeX catalog engine (2,710+ symbols) in language server with subscript absorption
- [ ] Implement native Rust `ptr_hash` (PtrHash) MPHF catalog engine with 64-bit fast range reduction, sub-15ns lookups, and bare function/Greek recognition (`sin(x)`, `alpha`, `range(A)`)
- [ ] Implement `textDocument/semanticTokens/full/delta` with `rust-analyzer` prefix-suffix token array diffing
- [ ] Implement content-hash block diffing (`data-math-hash`) in WebSocket live preview server to eliminate full-page KaTeX re-renders