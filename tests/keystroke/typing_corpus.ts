// tests/keystroke/typing_corpus.ts
// Authentic mathematical typing corpus and character-by-character prefix generator
// Models real-world interactive typing in Obsidian Live Preview (CodeMirror 6).

export interface TypingScript {
  name: string;
  category: "calculus" | "linear_algebra" | "quantum" | "ml" | "typst" | "adversarial";
  raw: string;
  keystrokeSequence: string[];
}

/**
 * Generates character-by-character sequential keystroke prefixes (0 -> N).
 */
export function generateKeystrokePrefixes(expression: string): string[] {
  const prefixes: string[] = [];
  for (let i = 1; i <= expression.length; i++) {
    prefixes.push(expression.slice(0, i));
  }
  return prefixes;
}

/**
 * Generates interactive typing with a typo and backspace correction.
 * Simulates real human typing churn.
 */
export function generateTypoCorrectionSequence(
  target: string,
  typoPos: number,
  typoChars: string
): string[] {
  const steps: string[] = [];
  const safePos = Math.min(typoPos, target.length);
  for (let i = 1; i <= safePos; i++) {
    steps.push(target.slice(0, i));
  }
  let current = target.slice(0, safePos);
  for (const ch of typoChars) {
    current += ch;
    steps.push(current);
  }
  for (let i = 0; i < typoChars.length; i++) {
    current = current.slice(0, -1);
    steps.push(current);
  }
  for (let i = safePos + 1; i <= target.length; i++) {
    steps.push(target.slice(0, i));
  }
  return steps;
}

/**
 * Master typing corpus covering 6 core mathematical domains
 * with both compact (no spaces) and spaced mathematical styling.
 */
export const RAW_MATHEMATICAL_CORPUS: {
  name: string;
  category: TypingScript["category"];
  raw: string;
  typo?: { pos: number; chars: string };
}[] = [
  // 1. Calculus & Analysis
  {
    name: "Dirichlet Integral",
    category: "calculus",
    raw: "\\int_{0}^{\\infty} \\frac{\\sin(x)}{x} \\, dx = \\frac{\\pi}{2}",
    typo: { pos: 25, chars: "xx" },
  },
  {
    name: "Cauchy-Riemann Differential Equations",
    category: "calculus",
    raw: "\\frac{\\partial u}{\\partial x} = \\frac{\\partial v}{\\partial y}, \\quad \\frac{\\partial u}{\\partial y} = -\\frac{\\partial v}{\\partial x}",
  },
  {
    name: "Taylor Series with Spaced Sin",
    category: "calculus",
    raw: "sin x = x - \\frac{x^3}{3!} + \\frac{x^5}{5!} - \\cdots",
    typo: { pos: 3, chars: "n" },
  },
  {
    name: "Euler Totient Limit",
    category: "calculus",
    raw: "\\lim_{x \\to 0} \\frac{e^x - 1}{x} = 1",
  },
  {
    name: "Riemann Zeta Series",
    category: "calculus",
    raw: "\\zeta(s) = \\sum_{n=1}^{\\infty} \\frac{1}{n^s} = \\prod_{p} \\frac{1}{1 - p^{-s}}",
  },
  {
    name: "Natural Log Spaced and Compact",
    category: "calculus",
    raw: "ln 2 + ln(x) = \\int_1^2 \\frac{1}{t} \\, dt + \\ln x",
  },

  // 2. Linear Algebra & Matrices
  {
    name: "Typst Bracket Matrix (Compact)",
    category: "linear_algebra",
    raw: "mat[1, 0, a; 0, 1, b; 0, 0, 1]",
    typo: { pos: 4, chars: "t" },
  },
  {
    name: "Determinant Matrix (Spaced)",
    category: "linear_algebra",
    raw: "dmat[ a , b ; c , d ] = a d - b c",
  },
  {
    name: "Characteristic Polynomial",
    category: "linear_algebra",
    raw: "p(\\lambda) = \\det(\\mathbf{A} - \\lambda \\mathbf{I}) = 0",
  },
  {
    name: "Rank-Nullity Theorem",
    category: "linear_algebra",
    raw: "rank(A) + nullity(A) = \\dim(V)",
  },
  {
    name: "Augmented Partition Matrix",
    category: "linear_algebra",
    raw: "mat[1, 0 | 4; 0, 1 | 5]",
  },

  // 3. Quantum Mechanics & Physics
  {
    name: "Time-Dependent Schrödinger Equation",
    category: "quantum",
    raw: "i \\hbar \\frac{\\partial}{\\partial t} | \\psi(t) \\rangle = \\hat{H} | \\psi(t) \\rangle",
  },
  {
    name: "Harmonic Oscillator Hamiltonian",
    category: "quantum",
    raw: "\\hat{H} = \\frac{\\hat{p}^2}{2m} + \\frac{1}{2} m \\omega^2 \\hat{x}^2 = \\hbar \\omega \\left( \\hat{a}^\\dagger \\hat{a} + \\frac{1}{2} \\right)",
  },
  {
    name: "Maxwell Ampère-Maxwell Law",
    category: "quantum",
    raw: "\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}",
  },
  {
    name: "Bra-Ket Expectation Value",
    category: "quantum",
    raw: "\\langle \\psi | \\hat{A} | \\psi \\rangle = \\sum_{n} |c_n|^2 a_n",
  },

  // 4. Machine Learning & Probability
  {
    name: "Softmax Probability Vector",
    category: "ml",
    raw: "softmax(z_i) = \\frac{e^{z_i}}{\\sum_{j=1}^K e^{z_j}}",
    typo: { pos: 4, chars: "t" },
  },
  {
    name: "GELU Activation Function",
    category: "ml",
    raw: "gelu(x) = x \\cdot \\Phi(x) = x P(X \\le x)",
  },
  {
    name: "Gaussian Normal Distribution",
    category: "ml",
    raw: "f(x; \\mu, \\sigma^2) = \\frac{1}{\\sqrt{2\\pi\\sigma^2}} \\exp\\left( -\\frac{(x-\\mu)^2}{2\\sigma^2} \\right)",
  },
  {
    name: "KL Divergence",
    category: "ml",
    raw: "D_{\\text{KL}}(P \\parallel Q) = \\sum_{x \\in \\mathcal{X}} P(x) \\log\\left( \\frac{P(x)}{Q(x)} \\right)",
  },

  // 5. Typst Shorthand & ASCII Operators
  {
    name: "Font Shortcuts and Infix Division",
    category: "typst",
    raw: "bold(v) \\cdot scr(F) + [a + b] / [c + d]",
  },
  {
    name: "Chained Root and Unit Suffixes",
    category: "typst",
    raw: "sqrt[3][x + y] + 25 degC + 10 ohm",
  },
  {
    name: "ASCII Arrow and Inequality Normalization",
    category: "typst",
    raw: "A => B <=> C != D <= E >= F",
  },
  {
    name: "Extensible Left-Right Arrow",
    category: "typst",
    raw: "X <-----> Y |-> Z := W",
  },

  // 6. Pathological & Adversarial Edge Cases
  {
    name: "Dangling Carets and Incomplete Fractions",
    category: "adversarial",
    raw: "x^ + y_ + \\frac{a} + \\sqrt",
  },
  {
    name: "Lone Trailing Backslash and Lone Pipe",
    category: "adversarial",
    raw: "a + b + \\",
  },
  {
    name: "Unclosed Deeply Nested Delimiters",
    category: "adversarial",
    raw: "mat[1, 2; 3, (a + {b * [c]])",
  },
  {
    name: "Consecutive Bare Multi-Letter Variables",
    category: "adversarial",
    raw: "foo + bar * baz - qux = 100",
  },
];

/**
 * Builds the complete list of typing scripts for the benchmark.
 */
export function buildTypingCorpus(): TypingScript[] {
  return RAW_MATHEMATICAL_CORPUS.map((item) => {
    let keystrokes: string[];
    if (item.typo) {
      keystrokes = generateTypoCorrectionSequence(
        item.raw,
        item.typo.pos,
        item.typo.chars
      );
    } else {
      keystrokes = generateKeystrokePrefixes(item.raw);
    }
    return {
      name: item.name,
      category: item.category,
      raw: item.raw,
      keystrokeSequence: keystrokes,
    };
  });
}
