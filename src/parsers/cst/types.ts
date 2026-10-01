// src/parsers/cst/types.ts
//! Concrete Syntax Tree (CST) Node definitions & options.

import { ColorSpan } from "../../utils/spans";
import { ColorPalette } from "../../config";

export interface BaseNode {
  start: number;
  end: number;
}

export interface CommandNode extends BaseNode {
  kind: "command";
  name: string; // e.g. "\int", "\partial", "\alpha", "\sin"
  isSubdifferential?: boolean; // \partial f(x)
  isChainBoundary?: boolean;   // \partial_n : C_n \to C_{n-1}
  isProximal?: boolean;        // \operatorname{prox}
  isWronskian?: boolean;       // W(y_1, y_2)
  isEulerChar?: boolean;       // \chi(M)
  isModulus?: boolean;         // \pmod{m}, \mod{m}
  isProbabilityOperator?: boolean; // \mathbb{P}, \mathbb{E}, \operatorname{Var}, \operatorname{Cov}
}

export interface BoundaryNode extends BaseNode {
  kind: "boundary";
  operatorText: string; // "\partial" or "∂"
  targetText: string;   // "\Omega", "V", "D", "M", "\Sigma", etc.
  subscript?: string;   // e.g. "1" in "\partial\Omega_1"
}

export interface EvaluationBarNode extends BaseNode {
  kind: "evaluation_bar";
  barType: "bracket" | "pipe";
  limits: CSTNode[];
}

export interface GroupNode extends BaseNode {
  kind: "group";
  delimType: "paren" | "bracket" | "brace" | "bare_brace" | "angle" | "pipe" | "sized";
  openStart: number;
  openEnd: number;
  openText: string;
  closeStart?: number;
  closeEnd?: number;
  closeText?: string;
  isHalfOpenInterval?: boolean;
  isLeftRight?: boolean;
  isSyntaxError?: boolean;
  isEvaluationBar?: boolean;
  isConvectiveAdvection?: boolean;
  isInterfaceJump?: boolean;
  isInterfaceAverage?: boolean;
  isPoissonBracket?: boolean;
  isRegularizationNorm?: boolean;
  isMatrixDeterminant?: boolean;  // |A|, |M|, |B|, |G|
  isMatrixNorm?: boolean;         // \|A\|_F, \|A\|_2, \|A\|_*
  isSubgroupIndex?: boolean;      // [G : H], [L : K]
  isLegendreSymbol?: boolean;     // (\frac{a}{p})
  isKet?: boolean;                // |\psi\rangle, |0\rangle
  isBra?: boolean;                // \langle\phi|
  isBraKet?: boolean;             // \langle\phi|\psi\rangle
  isQuantumCommutator?: boolean;  // [\hat{x}, \hat{p}]
  isAnticommutator?: boolean;     // \{\hat{A}, \hat{B}\}
  isStochasticVariation?: boolean;// [X]_t, \langle M \rangle_t
  isPadicNorm?: boolean;          // |x|_p
  normOrder?: string;             // "1", "2", "\infty", "F"
  normLimits?: CSTNode[];
  evaluationLimits?: CSTNode[];
  depth: number;
  children: CSTNode[];
}

export interface FractionNode extends BaseNode {
  kind: "fraction";
  command: string; // "\frac", "\dfrac", "\tfrac", "\cfrac"
  numerator: CSTNode[];
  denominator: CSTNode[];
  hasUnclosedBrace?: boolean;
  isWirtinger?: boolean;
  isHolomorphic?: boolean; // true for \partial z, false for \partial \bar{z}
  isLegendreSymbol?: boolean; // \left(\frac{a}{p}\right)
  isLegendreCandidate?: boolean;
}

export interface ScriptNode extends BaseNode {
  kind: "script";
  scriptType: "subscript" | "superscript";
  base?: CSTNode;
  arg: CSTNode[];
  isHigherOrderDerivative?: boolean;
  isConjugate?: boolean; // e.g. z^*
  isSingularityPole?: boolean;
  isContravariantTensorIndex?: boolean; // T^{\mu\nu}, V^\mu
  isFlowEvolution?: boolean;            // \Phi^t(x_0)
  isInvariantManifold?: boolean;        // W^s, W^u, W^c
  isFenchelDual?: boolean;              // f^*(y)
  isOptimalMinimizer?: boolean;         // x^*, p^*
  isMusicalIsomorphism?: boolean;       // X^\flat, \omega^\sharp
  isIndexCovariantDerivative?: boolean; // A_{\mu;\nu}
  isIndexPartialDerivative?: boolean;   // A_{\mu,\nu}
  isChainBoundary?: boolean;            // \partial_n
  isMatrixTransformation?: boolean;     // \mathbf{A}^T, \mathbf{A}^*, \mathbf{A}^\dagger, \mathbf{A}^{-1}, \mathbf{A}^+
  isLadderOperator?: boolean;           // \hat{a}^\dagger, \hat{c}_k^\dagger
  isPauliMatrix?: boolean;              // \sigma_x, \sigma_y, \sigma_z
  isStochasticVariation?: boolean;      // [X]_t
}

export interface IdentifierNode extends BaseNode {
  kind: "identifier";
  text: string;
  isGreek?: boolean;
  isDomainSurface?: boolean;
  isDimensionless?: boolean;  // Re, Ma, Pr, Kn, Pe, etc.
  isConjugate?: boolean;      // \bar{z}, \overline{z}
  isSingularityPole?: boolean;// z_0 in \operatorname{Res}(f, z_0)
  isImaginaryUnit?: boolean;  // i or j in complex terms
  isKktMultiplier?: boolean;  // \lambda_i, \nu_j
  isTopologicalInvariant?: boolean; // \chi, \pi_1, b_i
  isArithmeticFunction?: boolean;   // \phi(n), \mu(n), \sigma(n)
  isStochasticDifferential?: boolean; // dW_t, dB_t, dW(t)
}

export interface OperatorNode extends BaseNode {
  kind: "operator";
  text: string;
  operatorType:
    | "relation"
    | "binary"
    | "boundary"
    | "differential"
    | "contraction"
    | "advection"
    | "wave"
    | "principal_value"
    | "evaluation"
    | "wedge"
    | "hodge_star"
    | "interior_contraction"
    | "lie_derivative"
    | "connected_sum"
    | "cup_cap"
    | "quantifier"
    | "turnstile"
    | "set_diff"
    | "subgroup"
    | "morphism"
    | "kronecker"
    | "hadamard"
    | "divisibility"
    | "conditioning"
    | "covariant_connection"
    | "stratonovich";
}

export interface NumberNode extends BaseNode {
  kind: "number";
  value: string;
}

export interface PunctuationNode extends BaseNode {
  kind: "punctuation";
  char: string;
}

export interface CommentNode extends BaseNode {
  kind: "comment";
  text: string;
}

export type CSTNode =
  | CommandNode
  | GroupNode
  | FractionNode
  | ScriptNode
  | IdentifierNode
  | OperatorNode
  | NumberNode
  | PunctuationNode
  | CommentNode
  | BoundaryNode
  | EvaluationBarNode;

export interface CSTCollectorOptions {
  palette?: ColorPalette;
  rainbowColors?: string[];
  errorColor?: string;
  highlightUnmatched?: boolean;
  strictBracketWarnings?: boolean;
  forLatexWrap?: boolean;
  activeMode?: string;
}

export interface DisciplineRule {
  name: string;
  match(node: CSTNode, parent?: CSTNode): ColorSpan[] | null;
}
