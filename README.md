# 🎨 Obsidian Color Math

> Automatically apply beautiful, semantic colors to LaTeX and MathJax equations in Obsidian Markdown.

Obsidian Color Math dynamically transforms plain monochrome equations into rich, readable mathematical expressions. It operates seamlessly across both **Live Preview** and **Reading View**, with support for dynamic real-time coloring and permanent Markdown exports.

![Obsidian Color Math Preview](https://raw.githubusercontent.com/36ty-blip/obsidian-color-math/main/docs/assets/obsidian-color-math-preview.png)

*Rendered MathJax equations displayed with signature Tokyo Night semantic color roles.*

> [!TIP]
> **100% Local, Pure TypeScript & Zero Dependencies:** Color Math runs completely offline on Desktop and Mobile (iOS & Android). It makes zero network requests, collects no telemetry, and requires no external tools or AI services.

---

## ✨ Key Features

### 1. ⚡ Dynamic MathJax Interceptor (Zero Note Modification)
- **Automatic Rendering:** Color Math hooks directly into Obsidian's internal MathJax pipeline (`tex2chtml` and `tex2svg`). Rendered equations in **Live Preview** and **Reading View** appear in full color automatically without altering your raw notes!
- **Both Inline & Display Math:** Full support for inline equations (`$...$`) and display blocks (`$$...$$`).

### 2. 🌈 Rich Semantic Palette & Theme Integration
- **Signature Tokyo Night Palette:** Carefully calibrated pastel tones designed to reduce visual clutter and eye strain.
- **Theme Auto-Sync:** One-click extraction of accent and syntax colors from your active Obsidian theme.
- **Light / Dark Mode Contrast Adaptability:** Automatically shifts operator contrast (e.g. `=`, `\cdot`, spacing) so equations never wash out on light backgrounds.

### 3. 🧠 Smart Mathematical Disambiguation
- **Physical Units & Metric Prefixes:** Distinguishes metric prefixes (e.g. `1.064\, \mu m`, `10 m/s`, `500 nm`, `50 kg`) from algebraic variables, with a dedicated **"Natural Color"** option to keep units uncolored if desired.
- **Calculus Differentials & Derivatives:** Identifies infinitesimal differentials (`dx`, `dt`, `d\theta`) and derivative fractions (`\frac{d}{dx}`, `\frac{df}{dx}`, `\frac{\partial \psi}{\partial t}`) so calculus operators stay unified, while preserving standalone distance `$d$`.
- **Quantum Bra-Ket Notation (Dirac):** Recognizes kets (`|\psi\rangle`), bras (`\langle\phi|`), and brackets (`\langle\phi|\psi\rangle`, `\langle\psi|\hat{H}|\psi\rangle`), keeping delimiters cleanly styled.
- **Dimensionless Numbers:** Recognizes contiguous engineering numbers (`Re`, `Ma`, `Pr`, `Nu`), while preserving separated variables (`R e`) as distinct entities.

### 4. 🛠️ IDE Visual Enhancements
- **Rainbow Delimiters:** Recursively colors nested parentheses, brackets, and braces by depth to eliminate delimiter blindness in complex algebraic expressions.
- **Symbol Taxonomy:** Distinguishes constants ($\pi, \hbar, \infty$), Greek parameters ($\alpha, \theta, \lambda$), standard functions ($\sin, \cos, \ln$), and bound iteration indices ($\sum_{i=1}^n$).
- **Variable Data-Flow Hashing:** Deterministically assigns unique, consistent colors to distinct identifiers across an equation to visually trace the flow of variables.

---

## 🚀 Usage

### Ribbon Menu
Click the **Color Math** palette icon on the left ribbon to access quick actions:
- **Bake colors into note (Permanent):** Permanently embeds LaTeX `\textcolor{...}{...}` wrappers into all math blocks in your note.
- **Clean baked colors from note:** Safely strips all color wrappers back to clean, plain LaTeX.
- **Bake / Clean current math block:** Targets only the equation under your cursor.
- **Bake / Clean selection:** Targets highlighted text in the editor.

### Command Palette
Open the Command Palette (`Ctrl+P` or `Cmd+P`) and search for:
- `Color Math: Bake colors into note (Permanent)`
- `Color Math: Clean baked colors from note`
- `Color Math: Bake colors into current math block`
- `Color Math: Clean baked colors from current math block`
- `Color Math: Bake colors into selection`
- `Color Math: Clean baked colors from selection`

---

## ⚙️ Settings

| Setting | Description | Default |
| --- | --- | --- |
| **Live rendered math coloring** | Automatically colorizes MathJax equations without modifying raw Markdown. | `Enabled` |
| **Real-time editor syntax highlighting** | Live syntax highlighting inside the CodeMirror editor as you type. | `Disabled` |
| **Rainbow delimiters** | Colors nested brackets, parentheses, and braces by depth. | `Enabled` |
| **Mathematical symbol taxonomy** | Categorizes constants, parameters, functions, and bound indices. | `Enabled` |
| **Color physical units** | Highlights physical units (`\mu m`, `m/s`, `nm`) or leaves them in natural theme font. | `Enabled` |
| **Calculus differentials & derivatives** | Highlights differentials (`dx`, `dt`) and derivative operators. | `Enabled` |
| **Quantum bra-ket notation** | Highlights Dirac state vectors and brackets. | `Enabled` |
| **Engineering dimensionless numbers** | Recognizes unified numbers (`Re`, `Ma`, `Pr`). | `Enabled` |
| **Variable data-flow hashing** | Hashes unique variables to distinct colors across expressions. | `Disabled` |
| **Auto-adapt for light / dark mode** | Adjusts operator contrast dynamically on light themes. | `Enabled` |
| **Auto-match on theme change** | Re-extracts colors whenever you change your Obsidian theme. | `Disabled` |

---

## 📦 Installation

### From Obsidian Community Plugins (Recommended)
1. In Obsidian, open **Settings > Community plugins**.
2. Turn off **Restricted mode**.
3. Click **Browse** and search for `Color Math`.
4. Click **Install**, then **Enable**.

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/36ty-blip/obsidian-color-math/releases).
2. Create a folder named `color-math` inside `<vault>/.obsidian/plugins/`.
3. Move the downloaded files into that folder.
4. Reload Obsidian and enable **Color Math** under **Settings > Community plugins**.

---

## 📄 License

## 🛠️ Development & Testing

```bash
npm install
npm run build     # Builds production main.js
npm run test      # Runs Vitest test suite (97/97 passing)
npm run dev       # Watch mode with inline sourcemaps
```

---

## 📄 License

Released under the [MIT License](https://github.com/36ty-blip/obsidian-color-math/blob/main/LICENSE).



