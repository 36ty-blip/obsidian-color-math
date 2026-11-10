// src/config/setting_definitions.ts
// Single Source of Truth for Obsidian Native Settings Search Indexing

export interface ColorMathSettingMeta {
  id: string;
  sectionId: string;
  name: string;
  desc: string;
  aliases: string[];
  category?: string;
}

export const COLOR_MATH_SETTING_CATALOG: ColorMathSettingMeta[] = [
  // Section 0: Reference & Guides
  {
    id: "interactive-syntax-cheatsheet",
    sectionId: "section-syntax-reference",
    name: "Interactive Syntax Cheatsheet",
    desc: "Opens the full reference catalog modal detailing custom extensions (dmat[], cmat[], {a}/{b}, multi-dialect operators, font modifiers) with MathJax previews and toggle guides.",
    aliases: ["cheatsheet", "reference", "modal", "catalog", "help", "guide", "syntax", "documentation"],
    category: "Reference",
  },
  {
    id: "export-reference-note",
    sectionId: "section-syntax-reference",
    name: "Export Reference Note to Vault",
    desc: "Creates 'Color Math Reference.md' directly in your vault root for permanent side-by-side reading, offline search, and personal annotations.",
    aliases: ["export", "markdown", "note", "vault", "file", "offline", "reference"],
    category: "Reference",
  },

  // Section 1: Core & Viewport Rendering
  {
    id: "show-ribbon-icon",
    sectionId: "section-core",
    name: "Show ribbon icon",
    desc: "Displays the Color Math palette icon in the left ribbon for fast access to actions, menu, and settings.",
    aliases: ["ribbon", "sidebar", "icon", "button", "toggle"],
    category: "Core",
  },
  {
    id: "ribbon-click-action",
    sectionId: "section-core",
    name: "Ribbon click action",
    desc: "Action executed when left-clicking the ribbon icon (right-click / context menu always opens the action menu).",
    aliases: ["ribbon", "click", "menu", "action", "shortcut", "hotkey"],
    category: "Core",
  },
  {
    id: "ribbon-toggle-live",
    sectionId: "section-core",
    name: "Toggle dynamic live rendering (Ribbon)",
    desc: "Show toggle button for live rendering in the ribbon menu.",
    aliases: ["ribbon", "item", "live", "toggle"],
    category: "Core",
  },
  {
    id: "ribbon-bake-note",
    sectionId: "section-core",
    name: "Bake colors into note (Ribbon)",
    desc: "Show permanent note coloring action in the ribbon menu.",
    aliases: ["ribbon", "bake", "note", "permanent"],
    category: "Core",
  },
  {
    id: "ribbon-clean-note",
    sectionId: "section-core",
    name: "Clean baked colors from note (Ribbon)",
    desc: "Show undo/cleaning action in the ribbon menu.",
    aliases: ["ribbon", "clean", "undo", "strip"],
    category: "Core",
  },
  {
    id: "ribbon-convert-to-latex",
    sectionId: "section-core",
    name: "Convert note to pure LaTeX (Ribbon)",
    desc: "Show pure LaTeX conversion action in the ribbon menu.",
    aliases: ["ribbon", "latex", "convert", "pure latex", "export"],
    category: "Core",
  },
  {
    id: "live-rendering-reading-view",
    sectionId: "section-core",
    name: "Live rendering in Reading View (MathJax)",
    desc: "Dynamically styles math expressions in Reading View and Live Preview widgets via MathJax CHTML interception without modifying markdown.",
    aliases: ["reading view", "preview", "live rendering", "dynamic", "mathjax", "chtml"],
    category: "Core",
  },
  {
    id: "live-preview-editor-highlighting",
    sectionId: "section-core",
    name: "Live Preview editor syntax highlighting",
    desc: "Decorates LaTeX source syntax with Tokyo Night colors directly inside CodeMirror 6 editor viewports while typing.",
    aliases: ["live preview", "editor", "codemirror", "syntax highlighting", "real-time", "cm6"],
    category: "Core",
  },
  {
    id: "highlight-inline-math",
    sectionId: "section-core",
    name: "Highlight inline math ($...$)",
    desc: "Applies syntax coloring to inline mathematical expressions.",
    aliases: ["inline math", "inline", "dollar"],
    category: "Core",
  },
  {
    id: "highlight-display-math",
    sectionId: "section-core",
    name: "Highlight display math ($$...$$)",
    desc: "Applies syntax coloring to multiline display math blocks.",
    aliases: ["display math", "block math", "equation"],
    category: "Core",
  },
  {
    id: "inline-math-floating-tooltip",
    sectionId: "section-core",
    name: "Inline math floating preview tooltip",
    desc: "Displays an ambient floating MathJax preview above inline math expressions while typing in Live Preview.",
    aliases: ["tooltip", "hover", "preview", "floating", "inline preview", "popup"],
    category: "Core",
  },
  {
    id: "targeted-math-navigation",
    sectionId: "section-core",
    name: "Targeted sub-expression math navigation",
    desc: "Clicking sub-expressions in rendered MathJax CHTML directly positions the editor cursor at the corresponding LaTeX token.",
    aliases: ["navigation", "click", "cursor", "target", "bidirectional", "hit test"],
    category: "Core",
  },

  // Section 2: Mathematical Taxonomy & Semantic Roles
  {
    id: "enable-taxonomy",
    sectionId: "section-taxonomy",
    name: "Enable mathematical taxonomy",
    desc: "Activates mathematical semantic classification across functions, parameters, constants, and matrix indices.",
    aliases: ["taxonomy", "classification", "semantic", "functions", "constants", "parameters", "roles"],
    category: "Taxonomy",
  },
  {
    id: "taxonomy-functions",
    sectionId: "section-taxonomy",
    name: "Functions and operators",
    desc: "Color functions and standard mathematical operators with depth-aware nesting colors.",
    aliases: ["functions", "operators", "sin", "cos", "log", "exp"],
    category: "Taxonomy",
  },
  {
    id: "taxonomy-parameters",
    sectionId: "section-taxonomy",
    name: "Parameters and coordinates",
    desc: "Color continuous parameters, Greek coefficients, and manifold coordinates.",
    aliases: ["parameters", "greek", "alpha", "beta", "theta", "coordinates"],
    category: "Taxonomy",
  },
  {
    id: "taxonomy-constants",
    sectionId: "section-taxonomy",
    name: "Universal constants",
    desc: "Color universal physical and mathematical constants (pi, e, hbar, c).",
    aliases: ["constants", "pi", "hbar", "euler"],
    category: "Taxonomy",
  },
  {
    id: "color-units",
    sectionId: "section-taxonomy",
    name: "Physical units and dimensions",
    desc: "Highlight physical units and SI metric prefixes bound to numerical quantities (kg, m/s, GHz).",
    aliases: ["units", "dimensions", "si", "physics", "metrics"],
    category: "Taxonomy",
  },
  {
    id: "color-differentials",
    sectionId: "section-taxonomy",
    name: "Calculus differentials (dx, dt, d/dx)",
    desc: "Highlights differential 1-forms, Leibniz derivatives, and partial differential operators.",
    aliases: ["differentials", "calculus", "derivative", "dx", "dt", "partial", "integral"],
    category: "Taxonomy",
  },

  // Theme & Color Palettes: Rainbow Delimiters & Structural Brackets
  {
    id: "rainbow-delimiters",
    sectionId: "section-theme-palettes",
    name: "Rainbow delimiters",
    desc: "Colors nested parentheses, square brackets, and curly braces with depth-cycling rainbow colors.",
    aliases: ["rainbow", "delimiters", "brackets", "parentheses", "nesting", "depth"],
    category: "Theme & Palettes",
  },
  {
    id: "rainbow-bare-braces",
    sectionId: "section-theme-palettes",
    name: "Rainbow bare grouping braces ({...})",
    desc: "Includes LaTeX structural grouping braces in depth-cycling rainbow delimiter coloring.",
    aliases: ["braces", "bare braces", "grouping", "rainbow braces"],
    category: "Theme & Palettes",
  },
  {
    id: "rainbow-delimiter-tiers",
    sectionId: "section-theme-palettes",
    name: "Rainbow Delimiter Palette Swatches (Tiers 1–6)",
    desc: "Configure discrete Tokyo Night / Custom rainbow colors for nesting levels 1 through 6.",
    aliases: ["rainbow", "tiers", "depth", "palette", "swatches", "levels", "colors"],
    category: "Theme & Palettes",
  },
  {
    id: "highlight-unmatched-braces",
    sectionId: "section-theme-palettes",
    name: "Highlight unmatched delimiters",
    desc: "Visually highlights unmatched or unclosed parentheses and brackets in bright red.",
    aliases: ["unmatched", "unclosed", "syntax error", "bracket mismatch", "warning", "red", "rainbow"],
    category: "Theme & Palettes",
  },

  // Theme & Color Palettes: Variable Data-Flow Hashing
  {
    id: "variable-data-flow",
    sectionId: "section-theme-palettes",
    name: "Variable data-flow hashing",
    desc: "Hashes mathematical variable identifiers into deterministic colors so variables are tracked across formulas.",
    aliases: ["data flow", "variable hash", "hashing", "tracking", "identifier colors"],
    category: "Theme & Palettes",
  },

  // Dialects absorbed into Feature Preview & Experimental
  {
    id: "dialect-latex",
    sectionId: "section-feature-preview-experimental",
    name: "Standard LaTeX dialect",
    desc: "Enables standard LaTeX math syntax recognition and macro expansion.",
    aliases: ["latex", "tex", "standard latex", "dialect"],
    category: "Dialects",
  },
  {
    id: "dialect-typst",
    sectionId: "section-feature-preview-experimental",
    name: "Typst math dialect",
    desc: "Enables Typst math syntax shorthand and operator conversions.",
    aliases: ["typst", "typst math", "modern dialect"],
    category: "Dialects",
  },
  {
    id: "dialect-asciimath",
    sectionId: "section-feature-preview-experimental",
    name: "AsciiMath dialect",
    desc: "Enables AsciiMath shorthand and plain-text mathematical operators.",
    aliases: ["asciimath", "ascii math", "plain text"],
    category: "Dialects",
  },
  {
    id: "dialect-matlab",
    sectionId: "section-feature-preview-experimental",
    name: "MATLAB & Octave dialect",
    desc: "Recognizes MATLAB/Octave matrix definitions, array operations, and vector syntax.",
    aliases: ["matlab", "octave", "matrix", "engineering"],
    category: "Dialects",
  },
  {
    id: "dialect-python",
    sectionId: "section-feature-preview-experimental",
    name: "Python & SymPy dialect",
    desc: "Recognizes Python syntax, SymPy expressions, and NumPy math notation.",
    aliases: ["python", "sympy", "numpy"],
    category: "Dialects",
  },
  {
    id: "dialect-wolfram",
    sectionId: "section-feature-preview-experimental",
    name: "Wolfram Language & Mathematica dialect",
    desc: "Recognizes Wolfram Language capitalized functions and mathematical constructs.",
    aliases: ["wolfram", "mathematica", "cas"],
    category: "Dialects",
  },

  // Section 6: Syntactic Sugar & Accelerated ASCII Shorthand
  {
    id: "speed-syntactic-sugar",
    sectionId: "section-sugar",
    name: "Speed syntactic sugar master toggle",
    desc: "Master switch enabling streamlined shorthand syntax for faster math typesetting.",
    aliases: ["syntactic sugar", "sugar", "shorthand", "speed", "fast typing"],
    category: "Sugar",
  },
  {
    id: "sugar-bracket-matrices",
    sectionId: "section-sugar",
    name: "Bracket matrix shorthand (mat[a, b; c, d])",
    desc: "Enables concise bracket-based matrix syntax without writing verbose LaTeX environments.",
    aliases: ["matrix", "bracket matrix", "mat", "pmat", "bmat", "dmat", "cmat", "array", "sugar"],
    category: "Sugar",
  },
  {
    id: "sugar-ascii-operators",
    sectionId: "section-sugar",
    name: "ASCII relation ligatures (~=, >=, <=, ->)",
    desc: "Converts intuitive ASCII arrows and relation ligatures into formal mathematical symbols.",
    aliases: ["ascii operators", "ligatures", "arrows", "inequalities", "approximations", "sugar"],
    category: "Sugar",
  },
  {
    id: "sugar-chained-roots",
    sectionId: "section-sugar",
    name: "Chained roots shorthand (sqrt[n][x])",
    desc: "Expands chained bracket root syntax into proper LaTeX radical expressions.",
    aliases: ["roots", "sqrt", "radical", "nth root", "sugar"],
    category: "Sugar",
  },
  {
    id: "sugar-number-bound-units",
    sectionId: "section-sugar",
    name: "Number-bound unit shorthand (10kg, 5m/s)",
    desc: "Automatically detects and formats units directly following numbers without explicit text tags.",
    aliases: ["bound units", "numbers", "si units", "dimensions", "sugar"],
    category: "Sugar",
  },

  // Section 7: LaTeX Normalization & Strict Delimiter Gating
  {
    id: "preview-latex-normalization",
    sectionId: "section-normalization",
    name: "Automatic LaTeX syntax normalization",
    desc: "Auto-corrects minor syntax ambiguities, missing braces, and inconsistent macros.",
    aliases: ["normalization", "auto correct", "clean latex", "standardize"],
    category: "Normalization",
  },
  {
    id: "crash-immunity-auto-seal",
    sectionId: "section-normalization",
    name: "Crash-immunity virtual delimiter auto-seal",
    desc: "Dynamically seals unclosed delimiters in real-time to prevent MathJax parsing crashes during typing.",
    aliases: ["crash immunity", "auto seal", "unclosed delimiter", "real-time"],
    category: "Normalization",
  },
  {
    id: "auto-scale-delimiters",
    sectionId: "section-normalization",
    name: "Auto-scale extensible delimiters (\\left, \\right)",
    desc: "Automatically injects extensible delimiter scaling for multi-line expressions and fractions.",
    aliases: ["left right", "auto scale", "extensible delimiters", "tall brackets"],
    category: "Normalization",
  },

  // Section 8: Spatial Navigation & Keymap
  {
    id: "math-spatial-keymap",
    sectionId: "section-spatial",
    name: "4D Quaternion spatial cursor keymap",
    desc: "Enables 2D geometric arrow key navigation across fractions, exponents, and matrix cells.",
    aliases: ["spatial", "keymap", "arrow keys", "quaternion", "2d navigation", "fraction navigation"],
    category: "Spatial",
  },

  // Section 9: Feature Preview & Experimental
  {
    id: "use-webassembly",
    sectionId: "section-preview",
    name: "WebAssembly Accelerated Engine (WASM)",
    desc: "Enables ultra-fast compiled WebAssembly parsing pipeline with sub-microsecond tokenization.",
    aliases: ["wasm", "webassembly", "rust", "acceleration", "speed", "performance"],
    category: "Experimental",
  },
];
