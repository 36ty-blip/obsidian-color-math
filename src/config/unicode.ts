// src/config/unicode.ts

/**
 * Bidirectional mapping between canonical LaTeX commands and Unicode math symbols.
 * Enables native recognition and coloring for clean/decluttered math syntax (e.g. \frac{∂}{∂t}, ℏ, ∫, ∑, ≤, →).
 */

export const UNICODE_DIFFERENTIALS: Record<string, string> = {
  "\\partial": "∂",
};

export const UNICODE_CONSTANTS: Record<string, string> = {
  "\\hbar": "ℏ",
  "\\infty": "∞",
};

export const UNICODE_VECTORS: Record<string, string> = {
  "\\nabla": "∇",
};

export const UNICODE_INTEGRALS: Record<string, string> = {
  "\\int": "∫",
  "\\iint": "∬",
  "\\iiint": "∭",
  "\\oint": "∮",
};

export const UNICODE_BIG_OPERATORS: Record<string, string> = {
  "\\sum": "∑",
  "\\prod": "∏",
  "\\coprod": "∐",
  "\\bigcup": "⋃",
  "\\bigcap": "⋂",
};

export const UNICODE_RELATIONS: Record<string, string> = {
  "\\le": "≤",
  "\\leq": "≤",
  "\\ge": "≥",
  "\\geq": "≥",
  "\\ne": "≠",
  "\\neq": "≠",
  "\\approx": "≈",
  "\\sim": "∼",
  "\\equiv": "≡",
  "\\propto": "∝",
};

export const UNICODE_ARROWS: Record<string, string> = {
  "\\to": "→",
  "\\rightarrow": "→",
  "\\leftarrow": "←",
  "\\leftrightarrow": "⟷",
  "\\mapsto": "↦",
  "\\implies": "⟹",
  "\\Longrightarrow": "⟹",
  "\\Rightarrow": "⇒",
  "\\Leftarrow": "⇐",
  "\\impliedby": "⟸",
  "\\Longleftarrow": "⟸",
  "\\iff": "⇔",
  "\\Leftrightarrow": "⇔",
  "\\uparrow": "↑",
  "\\downarrow": "↓",
};

export const UNICODE_SETS: Record<string, string> = {
  "\\in": "∈",
  "\\notin": "∉",
  "\\subset": "⊂",
  "\\subseteq": "⊆",
  "\\supset": "⊃",
  "\\supseteq": "⊇",
  "\\cup": "∪",
  "\\cap": "∩",
  "\\emptyset": "∅",
  "\\setminus": "∖",
  "\\forall": "∀",
  "\\exists": "∃",
  "\\nexists": "∄",
  "\\therefore": "∴",
  "\\because": "∵",
};

export const UNICODE_MULTIPLICATION: Record<string, string> = {
  "\\times": "×",
  "\\cdot": "·",
};

export const UNICODE_ADDITIVE: Record<string, string> = {
  "\\pm": "±",
  "\\mp": "∓",
};

// Standard Greek letters (BMP: U+0370 to U+03FF)
export const UNICODE_GREEK_LOWER_STANDARD: Record<string, string> = {
  "\\alpha": "α",
  "\\beta": "β",
  "\\gamma": "γ",
  "\\delta": "δ",
  "\\epsilon": "ε",
  "\\varepsilon": "ε",
  "\\zeta": "ζ",
  "\\eta": "η",
  "\\theta": "θ",
  "\\vartheta": "ϑ",
  "\\iota": "ι",
  "\\kappa": "κ",
  "\\lambda": "λ",
  "\\mu": "μ",
  "\\nu": "ν",
  "\\xi": "ξ",
  "\\pi": "π",
  "\\varpi": "ϖ",
  "\\rho": "ρ",
  "\\varrho": "ϱ",
  "\\sigma": "σ",
  "\\varsigma": "ς",
  "\\tau": "τ",
  "\\upsilon": "υ",
  "\\phi": "φ",
  "\\varphi": "ϕ",
  "\\chi": "χ",
  "\\psi": "ψ",
  "\\omega": "ω",
};

// Mathematical Alphanumeric Greek letters (Plane 1 - Espanso style)
export const UNICODE_GREEK_LOWER_PLANE1: Record<string, string> = {
  "\\alpha": "α",
  "\\beta": "β",
  "\\gamma": "γ",
  "\\delta": "δ",
  "\\epsilon": "ε",
  "\\varepsilon": "ϵ",
  "\\zeta": "𝜁", // U+1D70F
  "\\eta": "η",
  "\\theta": "θ",
  "\\vartheta": "ϑ",
  "\\iota": "ι",
  "\\kappa": "κ",
  "\\lambda": "λ",
  "\\mu": "μ",
  "\\nu": "ν",
  "\\xi": "ξ",
  "\\pi": "𝜋", // U+1D70B
  "\\varpi": "ϖ",
  "\\rho": "ρ",
  "\\varrho": "ϱ",
  "\\sigma": "σ",
  "\\varsigma": "ς",
  "\\tau": "τ",
  "\\upsilon": "υ",
  "\\phi": "φ",
  "\\varphi": "ϕ",
  "\\chi": "χ",
  "\\psi": "𝜓", // U+1D713 (Mathematical Italic Small Psi)
  "\\omega": "𝜔", // U+1D714
};

export const UNICODE_GREEK_UPPER_STANDARD: Record<string, string> = {
  "\\Gamma": "Γ",
  "\\Delta": "Δ",
  "\\Theta": "Θ",
  "\\Lambda": "Λ",
  "\\Xi": "Ξ",
  "\\Pi": "Π",
  "\\Sigma": "Σ",
  "\\Upsilon": "Υ",
  "\\Phi": "Φ",
  "\\Psi": "Ψ",
  "\\Omega": "Ω",
};

export const UNICODE_GREEK_UPPER_PLANE1: Record<string, string> = {
  "\\Gamma": "𝚪", // U+1D6AA
  "\\Delta": "Δ",
  "\\Theta": "Θ",
  "\\Lambda": "Λ",
  "\\Xi": "Ξ",
  "\\Pi": "Π",
  "\\Sigma": "Σ",
  "\\Upsilon": "Υ",
  "\\Phi": "Φ",
  "\\Psi": "Ψ",
  "\\Omega": "Ω",
};

// Delimiters that MUST NOT be converted to Unicode when attached to \left, \right, or sizing commands
export const PROTECTED_DELIMITER_MACROS = new Set([
  "langle",
  "rangle",
  "lceil",
  "rceil",
  "lfloor",
  "rfloor",
  "vert",
  "Vert",
  "uparrow",
  "downarrow",
  "updownarrow",
  "Uparrow",
  "Downarrow",
  "Updownarrow",
]);

// Auto-repair mapping for broken TeX syntax (e.g. \left⟨ -> \left\langle)
export const DELIMITER_AUTO_REPAIR: Record<string, string> = {
  "⟨": "\\langle",
  "⟩": "\\rangle",
  "⌈": "\\lceil",
  "⌉": "\\rceil",
  "⌊": "\\lfloor",
  "⌋": "\\rfloor",
  "‖": "\\|",
  "⎸": "\\vert",
};
