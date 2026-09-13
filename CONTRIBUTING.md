# Contributing to Obsidian Color Math

Thank you for your interest in improving Color Math! Whether you are reporting an equation parsing quirk, adding a new mathematical symbol, suggesting a color palette, or submitting code, your contributions are warmly appreciated.

---

## 🔬 How You Can Contribute

### 1. Submit Formula Edge Cases (No Coding Required!)
For a LaTeX parser, mathematicians, physicists, researchers, and students are the most valuable contributors!
If you find an equation from your field that isn't parsed or colored cleanly:
- Open a **[Formula Edge-Case Issue](https://github.com/36ty-blip/obsidian-color-math/issues/new?template=formula_edge_case.yml)**.
- Provide:
  1. The raw LaTeX string (`$...$` or `$$...$$`).
  2. The expected visual rendering vs. what was rendered.
  3. Mathematical context (e.g. quantum mechanics, general relativity, chemistry, statistics).

### 2. Suggest Color Palettes & Themes
Color Math organizes expressions using **12 semantic color roles**:
- `main`: Primary expression / function color
- `orange`: Constants, coefficients, and major operators
- `dot`: Multiplication dots and symbols
- `derivative`: Outer derivatives and prime markers
- `chain`: Chain rule factors and subscripts
- `upper`: Superscripts and matrix outer wrappers
- `relation`: Relations, equalities, and tensors
- `arrow`: Arrows and mappings
- `set`: Set theory symbols
- `spacing`: LaTeX spacing commands
- `parameter`: Parameters, angles, and Greek coefficients
- `unit`: Physical units and metric prefixes (e.g. μm, m/s, nm)

Have a favorite theme (Catppuccin, Gruvbox, Nord, Solarized, Dracula, Rosé Pine)? Open a **[Palette Submission](https://github.com/36ty-blip/obsidian-color-math/issues/new?template=palette_submission.yml)** sharing your hex color mappings!

### 3. Code Contributions & Bug Fixes
Pull requests for parser improvements, performance optimizations, and documentation are always welcome.

---

## 🛠️ Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/36ty-blip/obsidian-color-math.git
   cd obsidian-color-math
   npm install
   ```

2. **Link to your Obsidian vault:**
   Create a symbolic link (or copy the folder) into your vault's plugin directory:
   - **Windows (PowerShell as Admin):**
     ```powershell
     New-Item -ItemType SymbolicLink -Path "C:\path\to\your\vault\.obsidian\plugins\obsidian-color-math" -Target (Get-Location)
     ```
   - **macOS / Linux:**
     ```bash
     ln -s "$(pwd)" "/path/to/your/vault/.obsidian/plugins/obsidian-color-math"
     ```

3. **Start development watch mode:**
   ```bash
   npm run dev
   ```
   Press `Ctrl+R` or `Cmd+R` inside Obsidian to reload the plugin and see your live changes.

---

## 🧪 Testing & Dual-Engine Verification

Color Math enforces a dual-engine testing standard: all math expressions must validate in **both KaTeX and MathJax v3**.

Before submitting a pull request, run the test suite:
```bash
npm test
```
All 150+ tests (including markdown regression fixtures, quantum bra-ket states, multivariable calculus, and matrix environments) must pass.

To create an optimized production build:
```bash
npm run build
```

---

## 📋 Pull Request Guidelines

- Keep changes focused, atomic, and well-described.
- Add a test case in `tests/` for any new parser feature or fixed formula.
- Maintain zero runtime dependencies to keep the plugin lightweight and instant on mobile and desktop.
