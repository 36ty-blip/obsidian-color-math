// src/parsers/cst/parser.ts
//! Fast single-pass mathematical Concrete Syntax Tree (CST) Parser.
//! Delimiter pushdown automaton, balanced group parsing, and pure AST construction.

import {
  CSTNode,
  BoundaryNode,
  GroupNode,
  FractionNode,
  ScriptNode,
  IdentifierNode,
  OperatorNode,
} from "./types";
import { DelimiterStack } from "./stack";
import {
  CHAR_BACKSLASH,
  CHAR_LBRACE,
  CHAR_RBRACE,
  CHAR_LPAREN,
  CHAR_RPAREN,
  CHAR_LBRACKET,
  CHAR_RBRACKET,
  CHAR_UNDERSCORE,
  CHAR_CARET,
  CHAR_PERCENT,
  CHAR_PRIME,
  isGreekCommand,
  OPTIONAL_BRACKET_COMMANDS,
  COMMON_DIMENSIONLESS_SET,
  TENSOR_BASE_SYMBOLS,
  TENSOR_INDEX_GREEK,
  FLOW_MAP_SYMBOLS,
  INVARIANT_MANIFOLD_BASES,
  CONVEX_FUNCTION_SYMBOLS,
  OPTIMIZER_VARIABLE_SYMBOLS,
  KKT_MULTIPLIER_SYMBOLS,
  MATRIX_TRANSFORMATION_SYMBOLS,
  MATRIX_BASE_PATTERN,
  LADDER_BASE_SYMBOLS,
  PAULI_INDICES,
  MODULUS_COMMANDS,
  QUANTIFIER_COMMANDS,
  TURNSTILE_COMMANDS,
  SUBGROUP_COMMANDS,
  MORPHISM_COMMANDS,
  ARITHMETIC_FUNCTION_COMMANDS,
  TENSOR_IDENTIFIER_PATTERN,
  TENSOR_INDEX_PATTERN,
  HIGHER_ORDER_DERIV_PATTERN,
  PRIME_PATTERN,
  BACKSLASH_PRIME_PATTERN,
  POISSON_CHARS_PATTERN,
  CONVECTIVE_ADVECTION_PATTERN,
  BOUNDARY_SURFACE_INNER_PATTERN,
  BOUNDARY_SURFACE_DIRECT_PATTERN,
  WIRTINGER_DEN_HOLOMORPHIC,
  WIRTINGER_DEN_ANTIHOLOMORPHIC,
} from "./tokenizer";

const STOP_NONE = 0;
const STOP_RBRACE = 1;              // '}' (125)
const STOP_PAREN_OR_BRACKET = 2;    // ')' (41) or ']' (93)
const STOP_ESCAPED_RBRACE = 3;      // '\}'
const STOP_PIPE = 4;                // '|' or '\|'
const STOP_ANGLE_OR_PIPE = 5;       // '\rangle' or '|'

export class MathCSTParser {
  private text: string;
  private len: number;
  private index: number = 0;
  private expectingResidueArgs: boolean = false;
  private inProbabilityContext: boolean = false;
  private stack: DelimiterStack = new DelimiterStack();

  constructor(text: string) {
    this.text = text;
    this.len = text.length;
  }

  public parse(): CSTNode[] {
    return this.parseNodeList(0, STOP_NONE);
  }

  private parseNodeList(depth: number, stopMode: number): CSTNode[] {
    const nodes: CSTNode[] = [];

    while (this.index < this.len) {
      const code = this.text.charCodeAt(this.index);

      // Check stop conditions
      if (stopMode === STOP_RBRACE && code === CHAR_RBRACE) {
        break;
      }
      if (stopMode === STOP_PAREN_OR_BRACKET && (code === CHAR_RPAREN || code === CHAR_RBRACKET)) {
        break;
      }
      if (stopMode === STOP_ESCAPED_RBRACE && code === CHAR_BACKSLASH && this.text.startsWith("\\}", this.index)) {
        break;
      }
      if (stopMode === STOP_PIPE && (code === 124 || (code === CHAR_BACKSLASH && (this.text.startsWith("\\|", this.index) || this.text.startsWith("\\Vert", this.index))))) {
        break;
      }
      if (stopMode === STOP_ANGLE_OR_PIPE && (code === 124 || (code === CHAR_BACKSLASH && this.text.startsWith("\\rangle", this.index)))) {
        break;
      }

      // 1. Whitespace
      if (code <= 32) {
        this.index++;
        continue;
      }

      // 2. Comments (%)
      if (code === CHAR_PERCENT) {
        const start = this.index;
        while (this.index < this.len && this.text.charCodeAt(this.index) !== 10 && this.text.charCodeAt(this.index) !== 13) {
          this.index++;
        }
        nodes.push({
          kind: "comment",
          start,
          end: this.index,
          text: this.text.slice(start, this.index),
        });
        continue;
      }

      // 3. LaTeX Commands (\frac, \partial, \left, \right, etc.)
      if (code === CHAR_BACKSLASH) {
        const isRightCmd = this.text.startsWith("\\right", this.index) &&
          (this.index + 6 >= this.len || !/[a-zA-Z]/.test(this.text[this.index + 6]));
        if (depth > 0 && isRightCmd) {
          break;
        }
        const cmdNode = this.parseCommand(depth, nodes.length > 0 ? nodes[nodes.length - 1] : undefined);
        if (cmdNode) {
          nodes.push(cmdNode);
        }
        continue;
      }

      // 4. Standard Parentheses and Brackets: (, [
      if (code === CHAR_LPAREN || code === CHAR_LBRACKET) {
        const wasResidue = this.expectingResidueArgs;
        this.expectingResidueArgs = false;
        const groupNode = this.parseStandardGroup(depth, code === CHAR_LPAREN ? "(" : "[", wasResidue);
        nodes.push(groupNode);
        continue;
      }

      // 5. Bare Grouping Braces: {
      if (code === CHAR_LBRACE) {
        const groupNode = this.parseBareBraceGroup(depth);
        nodes.push(groupNode);
        continue;
      }

      // 6. Stray Unmatched Closing Delimiters: ), ], }
      if (code === CHAR_RPAREN || code === CHAR_RBRACKET || code === CHAR_RBRACE) {
        const start = this.index;
        this.index++;
        const isSyntaxError = code === CHAR_RBRACE;
        const delimType = code === CHAR_RBRACE ? "bare_brace" : code === CHAR_RPAREN ? "paren" : "bracket";
        nodes.push({
          kind: "group",
          delimType,
          openStart: start,
          openEnd: start,
          openText: "",
          closeStart: start,
          closeEnd: this.index,
          closeText: this.text.slice(start, this.index),
          isSyntaxError,
          depth,
          start,
          end: this.index,
          children: [],
        });
        continue;
      }

      // 7. Scripts (Subscript _ and Superscript ^)
      if (code === CHAR_UNDERSCORE || code === CHAR_CARET) {
        const char = code === CHAR_UNDERSCORE ? "_" : "^";
        const scriptNode = this.parseScript(depth, char, nodes.length > 0 ? nodes[nodes.length - 1] : undefined);
        nodes.push(scriptNode);
        continue;
      }

      // 7b. Prime notation (e.g. f', y''')
      if (code === CHAR_PRIME) {
        const primeStart = this.index;
        while (this.index < this.len && this.text.charCodeAt(this.index) === CHAR_PRIME) {
          this.index++;
        }
        const primeText = this.text.slice(primeStart, this.index);
        const prev = nodes.length > 0 ? nodes[nodes.length - 1] : undefined;
        const isFunction = prev && (prev.kind === "identifier" || prev.kind === "command");
        nodes.push({
          kind: "script",
          scriptType: "superscript",
          base: prev,
          arg: [{ kind: "identifier", start: primeStart, end: this.index, text: primeText }],
          isHigherOrderDerivative: Boolean(isFunction),
          start: primeStart,
          end: this.index,
        });
        continue;
      }

      // 8. Numbers (0-9)
      if (code >= 48 && code <= 57) {
        const start = this.index;
        while (this.index < this.len) {
          const c = this.text.charCodeAt(this.index);
          if ((c >= 48 && c <= 57) || c === 46) {
            this.index++;
          } else {
            break;
          }
        }
        nodes.push({
          kind: "number",
          start,
          end: this.index,
          value: this.text.slice(start, this.index),
        });
        continue;
      }

      // 8b. Unicode Partial Differential / Domain Boundary Surface: ∂
      const ch = this.text[this.index];
      if (ch === "∂" || code === 8706) {
        const start = this.index;
        this.index++;
        const boundaryNode = this.tryParseBoundarySurface(start, "∂");
        if (boundaryNode) {
          nodes.push(boundaryNode);
          continue;
        }

        // Check 3.2 Subdifferential set operator: ∂f(x), ∂g, ∂\phi
        let curAfter = this.index;
        while (curAfter < this.len && this.text.charCodeAt(curAfter) <= 32) curAfter++;
        if (curAfter < this.len) {
          const c = this.text.charCodeAt(curAfter);
          if (c === 102 || c === 103 || c === 104) { // f, g, h
            const next = curAfter + 1 < this.len ? this.text.charCodeAt(curAfter + 1) : 0;
            if (!((next >= 65 && next <= 90) || (next >= 97 && next <= 122))) {
              nodes.push({
                kind: "command",
                start,
                end: this.index,
                name: "∂",
                isSubdifferential: true,
              });
              continue;
            }
          }
        }

        nodes.push({
          kind: "operator",
          start,
          end: this.index,
          text: "∂",
          operatorType: "differential",
        });
        continue;
      }

      // 9. Operators & Relations
      if ("=<>+-*/:·×#".includes(ch)) {
        const start = this.index;
        this.index++;
        let opType: OperatorNode["operatorType"] =
          "=<>".includes(ch) ? "relation" : "binary";

        // 2.2 Double contraction colon operator: \boldsymbol{\sigma} : \boldsymbol{\varepsilon}
        if (ch === ":") {
          const prev = nodes.length > 0 ? nodes[nodes.length - 1] : undefined;
          const nextRest = this.text.slice(this.index).trimStart();
          const prevText = prev ? (prev.kind === "command" ? prev.name : prev.kind === "identifier" ? prev.text : "") : "";
          const prevIsTensor = Boolean(
            prevText &&
            (prevText.includes("sigma") || prevText.includes("varep") || prevText === "C" || prevText === "S" || prevText === "T")
          );
          const nextIsTensor = TENSOR_IDENTIFIER_PATTERN.test(nextRest);
          if (prevIsTensor || nextIsTensor) {
            opType = "contraction";
          }
        }

        // 4.2 Connected sum topological operator: M_1 # M_2
        if (ch === "#") {
          opType = "connected_sum";
        }

        nodes.push({
          kind: "operator",
          start,
          end: this.index,
          text: ch,
          operatorType: opType,
        });
        continue;
      }

      // 10. Vertical Bars: Dirac Ket |\psi\rangle, Matrix Determinant |A|, p-Adic |x|_p, or Punctuation
      if (code === 124) { // '|'
        const pipeNode = this.parsePipeDelimited(depth, nodes);
        if (pipeNode) {
          nodes.push(pipeNode);
          continue;
        }
      }

      // 10b. Punctuation (, ;)
      if (",;".includes(ch)) {
        const start = this.index;
        this.index++;
        nodes.push({
          kind: "punctuation",
          start,
          end: this.index,
          char: ch,
        });
        continue;
      }

      // 6.3 Stochastic Differentials: dW_t, dB_t, dW(t), dB(t), dW, dB
      if (code === 100 && this.index + 1 < this.len) { // 'd'
        const nextC = this.text.charCodeAt(this.index + 1);
        if (nextC === 87 || nextC === 66) { // 'W' or 'B'
          const rest = this.text.slice(this.index);
          const stochMatch = rest.match(/^d[WB](?:_[a-zA-Z0-9]+|\([a-zA-Z0-9]+\)|(?![a-zA-Z]))/);
          if (stochMatch) {
            const start = this.index;
            this.index += stochMatch[0].length;
            nodes.push({
              kind: "identifier",
              start,
              end: this.index,
              text: stochMatch[0],
              isStochasticDifferential: true,
            });
            continue;
          }
        }
      }

      // 11. Identifiers (Multi-letter Dimensionless Numbers vs Single Identifiers)
      if (code >= 65 && code <= 90 && this.index + 1 < this.len) {
        const nextCode = this.text.charCodeAt(this.index + 1);
        if (nextCode >= 97 && nextCode <= 122) {
          const thirdCode = this.index + 2 < this.len ? this.text.charCodeAt(this.index + 2) : 0;
          const isLetter = (thirdCode >= 65 && thirdCode <= 90) || (thirdCode >= 97 && thirdCode <= 122);
          if (!isLetter) {
            const twoLetter = this.text.slice(this.index, this.index + 2);
            if (COMMON_DIMENSIONLESS_SET.has(twoLetter)) {
              const start = this.index;
              this.index += 2;
              nodes.push({
                kind: "identifier",
                start,
                end: this.index,
                text: twoLetter,
                isDimensionless: true,
              });
              continue;
            }
          }
        }
      }

      // 3.1 Wronskian Determinant W(y_1, y_2)
      if (code === 87 && this.index + 1 < this.len && this.text.charCodeAt(this.index + 1) === CHAR_LPAREN) {
        const start = this.index;
        this.index++; // consume 'W'
        nodes.push({
          kind: "command",
          start,
          end: this.index,
          name: "W",
          isWronskian: true,
        });
        continue;
      }

      // 1.2 Imaginary unit i / j in complex arithmetic (e.g. 2i, 2\pi i, e^{i\theta}, x + iy)
      const isImaginary = (code === 105 || code === 106) && this.isImaginaryUnitContext(nodes);
      const idStart = this.index;
      this.index++;
      nodes.push({
        kind: "identifier",
        start: idStart,
        end: this.index,
        text: ch,
        isImaginaryUnit: isImaginary,
      });
    }

    return nodes;
  }

  private parseCommand(depth: number, prevNode?: CSTNode): CSTNode | null {
    const start = this.index;
    this.index++; // skip '\'

    if (this.index >= this.len) {
      return { kind: "command", start, end: this.index, name: "\\" };
    }

    const firstCode = this.text.charCodeAt(this.index);
    if (!((firstCode >= 65 && firstCode <= 90) || (firstCode >= 97 && firstCode <= 122))) {
      this.index++;
    } else {
      while (this.index < this.len) {
        const c = this.text.charCodeAt(this.index);
        if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) {
          this.index++;
        } else {
          break;
        }
      }
    }

    const cmd = this.text.slice(start, this.index);

    // Skip color commands: \textcolor{...}{...} or \color{...}
    if (cmd === "\\textcolor" || cmd === "\\color") {
      this.skipBracedGroup();
      return null;
    }

    // Skip environment headers: \begin{...} or \end{...}
    if (cmd === "\\begin" || cmd === "\\end") {
      this.skipBracedGroup();
      this.skipBracedGroup(); // optional format argument e.g. {cc|c}
      return null;
    }

    // Math font styling commands: \mathbf{w}, \boldsymbol{\sigma}, \vec{x}, \bm{u}
    if (cmd === "\\mathbf" || cmd === "\\boldsymbol" || cmd === "\\vec" || cmd === "\\bm") {
      this.skipWhitespace();
      if (this.index < this.len && this.text.charCodeAt(this.index) === CHAR_LBRACE) {
        const close = this.text.indexOf("}", this.index + 1);
        if (close !== -1) {
          const inner = this.text.slice(this.index + 1, close).trim();
          this.index = close + 1;
          return {
            kind: "identifier",
            start,
            end: this.index,
            text: `${cmd}{${inner}}`,
          };
        }
      }
    }

    // 0.4 & 2.1 Domain Boundary Surfaces vs 3.2 Subdifferential vs 4.2 Chain Boundary
    if (cmd === "\\partial" || cmd === "∂") {
      // Check 4.2 Nilpotent chain boundary: \partial_n or \partial_{n+1}
      if (this.index < this.len && this.text.charCodeAt(this.index) === CHAR_UNDERSCORE) {
        const boundaryNode = this.tryParseBoundarySurface(start, cmd);
        if (boundaryNode) return boundaryNode;
        return {
          kind: "command",
          start,
          end: this.index,
          name: cmd,
          isChainBoundary: true,
        };
      }

      // Check 0.4 & 2.1 Boundary Surface Manifold: \partial\Omega, \partial V, \partial D
      const boundaryNode = this.tryParseBoundarySurface(start, cmd);
      if (boundaryNode) return boundaryNode;

      // Check 3.2 Subdifferential set operator: \partial f(x), \partial g, \partial\phi
      let curAfter = this.index;
      while (curAfter < this.len && this.text.charCodeAt(curAfter) <= 32) curAfter++;
      if (curAfter < this.len) {
        const c = this.text.charCodeAt(curAfter);
        if (c === 102 || c === 103 || c === 104) { // f, g, h
          const next = curAfter + 1 < this.len ? this.text.charCodeAt(curAfter + 1) : 0;
          if (!((next >= 65 && next <= 90) || (next >= 97 && next <= 122))) {
            return {
              kind: "command",
              start,
              end: this.index,
              name: cmd,
              isSubdifferential: true,
            };
          }
        } else if (c === CHAR_BACKSLASH) {
          if (
            this.text.startsWith("\\ell", curAfter) ||
            this.text.startsWith("\\phi", curAfter) ||
            this.text.startsWith("\\psi", curAfter)
          ) {
            return {
              kind: "command",
              start,
              end: this.index,
              name: cmd,
              isSubdifferential: true,
            };
          }
        }
      }
    }

    // Fractions: \frac, \dfrac, \tfrac, \cfrac
    if (cmd === "\\frac" || cmd === "\\dfrac" || cmd === "\\tfrac" || cmd === "\\cfrac") {
      return this.parseFraction(start, cmd, depth);
    }

    // Sized delimiters: \left...\right and \middle
    if (cmd === "\\left") {
      return this.parseLeftRightGroup(start, depth);
    }
    if (cmd === "\\right") {
      this.skipWhitespace();
      const token = this.readDelimiterToken();
      return {
        kind: "group",
        delimType: token ? token.text : "right",
        openStart: start,
        openEnd: token ? token.end : this.index,
        closeStart: start,
        closeEnd: token ? token.end : this.index,
        openText: "\\right",
        closeText: token ? token.text : "",
        isLeftRight: true,
        isSyntaxError: true,
        children: [],
        depth,
      };
    }
    if (cmd === "\\middle") {
      this.skipWhitespace();
      const token = this.readDelimiterToken();
      return {
        kind: "punctuation",
        start,
        end: token ? token.end : this.index,
        char: token ? token.text : "|",
      };
    }

    // Escaped set braces: \{ and \} (including 3.1 Poisson brackets \{q, p\})
    if (cmd === "\\{") {
      return this.parseEscapedBraceGroup(start, depth);
    }

    // Angle brackets: \langle and \rangle
    if (cmd === "\\langle") {
      return this.parseAngleGroup(start, depth);
    }

    // Double vertical norm bars: \| or \Vert or \left\|
    if (cmd === "\\|" || cmd === "\\Vert") {
      return this.parseNormGroup(start, depth);
    }

    // 1.2 Complex Conjugation: \bar{z}, \overline{z}
    if (cmd === "\\bar" || cmd === "\\overline") {
      const conjNode = this.tryParseConjugate(start, cmd);
      if (conjNode) return conjNode;
    }

    // 4.2 Connected sum topological operator: \#
    if (cmd === "\\#") {
      return {
        kind: "operator",
        start,
        end: this.index,
        text: "\\#",
        operatorType: "connected_sum",
      };
    }

    // 4.1 Exterior Calculus: \wedge, \bigwedge
    if (cmd === "\\wedge" || cmd === "\\bigwedge") {
      return {
        kind: "operator",
        start,
        end: this.index,
        text: cmd,
        operatorType: "wedge",
      };
    }

    // 4.1 Hodge star dual: \star
    if (cmd === "\\star") {
      return {
        kind: "operator",
        start,
        end: this.index,
        text: cmd,
        operatorType: "hodge_star",
      };
    }

    // 4.1 Covariant derivative connection: \nabla
    if (cmd === "\\nabla") {
      return {
        kind: "operator",
        start,
        end: this.index,
        text: cmd,
        operatorType: "covariant_connection",
      };
    }

    // 4.1 Lie derivatives & Interior contractions: \mathcal{L}, \pounds, \iota
    if (cmd === "\\mathcal" || cmd === "\\pounds" || cmd === "\\iota") {
      if (cmd === "\\mathcal") {
        this.skipWhitespace();
        if (this.text.startsWith("{L}", this.index)) {
          this.index += 3;
          return {
            kind: "operator",
            start,
            end: this.index,
            text: "\\mathcal{L}",
            operatorType: "lie_derivative",
          };
        }
      } else if (cmd === "\\pounds") {
        return {
          kind: "operator",
          start,
          end: this.index,
          text: cmd,
          operatorType: "lie_derivative",
        };
      } else if (cmd === "\\iota") {
        return {
          kind: "operator",
          start,
          end: this.index,
          text: cmd,
          operatorType: "interior_contraction",
        };
      }
    }

    // 4.2 Cup and Cap topological cohomology products: \smile, \frown
    if (cmd === "\\smile" || cmd === "\\frown") {
      return {
        kind: "operator",
        start,
        end: this.index,
        text: cmd,
        operatorType: "cup_cap",
      };
    }

    // 4.2 Euler characteristic: \chi
    if (cmd === "\\chi") {
      let curAfter = this.index;
      while (curAfter < this.len && this.text.charCodeAt(curAfter) <= 32) curAfter++;
      if (curAfter < this.len && (this.text.charCodeAt(curAfter) === CHAR_LPAREN || this.text.charCodeAt(curAfter) === CHAR_LBRACE)) {
        return {
          kind: "command",
          start,
          end: this.index,
          name: "\\chi",
          isEulerChar: true,
        };
      }
    }

    // 1.2 Residue Operator & Proximal Operator: \operatorname{Res}, \mathrm{Res}, \Res, \operatorname{prox}
    if (cmd === "\\operatorname" || cmd === "\\mathrm" || cmd === "\\text") {
      const specialNode = this.tryParseSpecialOperator(start, cmd, depth);
      if (specialNode) return specialNode;
    }
    if (cmd === "\\Res") {
      this.expectingResidueArgs = true;
      return {
        kind: "operator",
        start,
        end: this.index,
        text: "\\Res",
        operatorType: "binary",
      };
    }
    if (cmd === "\\prox") {
      return {
        kind: "command",
        start,
        end: this.index,
        name: "\\prox",
        isProximal: true,
      };
    }

    // 2.2 Hyperbolic Wave D'Alembertian: \Box, \square
    if (cmd === "\\Box" || cmd === "\\square") {
      return {
        kind: "operator",
        start,
        end: this.index,
        text: cmd,
        operatorType: "wave",
      };
    }

    // 1.2 Real & Imaginary Projection Operators: \Re, \Im
    if (cmd === "\\Re" || cmd === "\\Im") {
      return {
        kind: "operator",
        start,
        end: this.index,
        text: cmd,
        operatorType: "relation",
      };
    }

    // 5.1 Kronecker & Hadamard: \otimes, \bigotimes, \odot
    if (cmd === "\\otimes" || cmd === "\\bigotimes") {
      return {
        kind: "operator",
        start,
        end: this.index,
        text: cmd,
        operatorType: "kronecker",
      };
    }
    if (cmd === "\\odot") {
      return {
        kind: "operator",
        start,
        end: this.index,
        text: cmd,
        operatorType: "hadamard",
      };
    }

    // 5.2 Abstract Algebra: Subgroups \triangleleft, Morphisms \hookrightarrow, Adjunction \dashv
    if (SUBGROUP_COMMANDS.has(cmd)) {
      return {
        kind: "operator",
        start,
        end: this.index,
        text: cmd,
        operatorType: "subgroup",
      };
    }
    if (MORPHISM_COMMANDS.has(cmd)) {
      return {
        kind: "operator",
        start,
        end: this.index,
        text: cmd,
        operatorType: "morphism",
      };
    }
    if (cmd === "\\dashv") {
      return {
        kind: "operator",
        start,
        end: this.index,
        text: cmd,
        operatorType: "turnstile",
      };
    }

    // 5.3 Number Theory: \pmod{m}, \pod{m}, \mod{m}, \mid, \parallel, \nmid
    if (MODULUS_COMMANDS.has(cmd)) {
      this.skipWhitespace();
      let modArg = "";
      if (this.index < this.len && this.text.charCodeAt(this.index) === CHAR_LBRACE) {
        const close = this.text.indexOf("}", this.index + 1);
        if (close !== -1) {
          modArg = this.text.slice(this.index, close + 1);
          this.index = close + 1;
        }
      } else if (this.index < this.len && this.text.charCodeAt(this.index) > 32) {
        modArg = this.text[this.index];
        this.index++;
      }
      return {
        kind: "command",
        start,
        end: this.index,
        name: `${cmd}${modArg ? " " + modArg : ""}`,
        isModulus: true,
      };
    }
    if (cmd === "\\mid" || cmd === "\\parallel" || cmd === "\\nmid") {
      const isCond = this.inProbabilityContext;
      return {
        kind: "operator",
        start,
        end: this.index,
        text: cmd,
        operatorType: isCond && cmd === "\\mid" ? "conditioning" : "divisibility",
      };
    }

    // 5.4 Logic & Sets: \forall, \exists, \nexists, \vdash, \models, \Vdash, \setminus
    if (QUANTIFIER_COMMANDS.has(cmd)) {
      return {
        kind: "operator",
        start,
        end: this.index,
        text: cmd,
        operatorType: "quantifier",
      };
    }
    if (TURNSTILE_COMMANDS.has(cmd)) {
      return {
        kind: "operator",
        start,
        end: this.index,
        text: cmd,
        operatorType: "turnstile",
      };
    }
    if (cmd === "\\setminus") {
      return {
        kind: "operator",
        start,
        end: this.index,
        text: cmd,
        operatorType: "set_diff",
      };
    }

    // 6.1 & 6.2 Probability: \mathbb{P}, \mathbb{E}, \circ
    if (cmd === "\\mathbb") {
      this.skipWhitespace();
      if (this.index < this.len && this.text.charCodeAt(this.index) === CHAR_LBRACE) {
        const close = this.text.indexOf("}", this.index + 1);
        if (close !== -1) {
          const inner = this.text.slice(this.index + 1, close).trim();
          if (inner === "P" || inner === "E") {
            this.index = close + 1;
            this.inProbabilityContext = true;
            return {
              kind: "command",
              start,
              end: this.index,
              name: `\\mathbb{${inner}}`,
              isProbabilityOperator: true,
            };
          }
        }
      }
    }
    if (cmd === "\\circ") {
      const rest = this.text.slice(this.index).trimStart();
      if (rest.startsWith("dW") || rest.startsWith("dB")) {
        return {
          kind: "operator",
          start,
          end: this.index,
          text: cmd,
          operatorType: "stratonovich",
        };
      }
    }

    // 5.3 Arithmetic Functions: \phi(n), \varphi(n), \mu(n)
    if (ARITHMETIC_FUNCTION_COMMANDS.has(cmd)) {
      const rest = this.text.slice(this.index).trimStart();
      if (/^\([a-zA-Z0-9+\- ]+\)/.test(rest) || /^_[a-zA-Z0-9]+\([a-zA-Z0-9+\- ]+\)/.test(rest)) {
        return {
          kind: "identifier",
          start,
          end: this.index,
          text: cmd,
          isGreek: true,
          isArithmeticFunction: true,
        };
      }
    }

    // Greek symbols & KKT multipliers
    if (isGreekCommand(cmd)) {
      const isKkt = KKT_MULTIPLIER_SYMBOLS.has(cmd);
      return {
        kind: "identifier",
        start,
        end: this.index,
        text: cmd,
        isGreek: true,
        isKktMultiplier: isKkt,
      };
    }

    // Command exemptions with optional brackets: \sqrt[3]{x}
    if (OPTIONAL_BRACKET_COMMANDS.has(cmd)) {
      this.skipOptionalBracket();
    }

    return {
      kind: "command",
      start,
      end: this.index,
      name: cmd,
    };
  }

  private tryParseBoundarySurface(start: number, cmd: string): BoundaryNode | null {
    let cur = this.index;
    while (cur < this.len && this.text.charCodeAt(cur) <= 32) {
      cur++;
    }
    if (cur >= this.len) return null;

    let target = "";
    if (this.text.charCodeAt(cur) === CHAR_LBRACE) {
      const close = this.text.indexOf("}", cur + 1);
      if (close !== -1) {
        const inner = this.text.slice(cur + 1, close).trim();
        if (BOUNDARY_SURFACE_INNER_PATTERN.test(inner)) {
          target = inner;
          cur = close + 1;
        }
      }
    } else {
      const rest = this.text.slice(cur, cur + 20);
      const m = rest.match(BOUNDARY_SURFACE_DIRECT_PATTERN);
      if (m) {
        target = m[0];
        cur += target.length;
      }
    }

    if (!target) return null;

    // Check optional subscript: _1, _0, _{in}, etc.
    let subscript: string | undefined;
    if (cur < this.len && this.text.charCodeAt(cur) === CHAR_UNDERSCORE) {
      const subStart = cur;
      cur++;
      if (cur < this.len && this.text.charCodeAt(cur) === CHAR_LBRACE) {
        const close = this.text.indexOf("}", cur + 1);
        if (close !== -1) {
          subscript = this.text.slice(subStart, close + 1);
          cur = close + 1;
        }
      } else if (cur < this.len && this.text.charCodeAt(cur) > 32) {
        cur++;
        subscript = this.text.slice(subStart, cur);
      }
    }

    this.index = cur;
    return {
      kind: "boundary",
      operatorText: cmd,
      targetText: target,
      subscript,
      start,
      end: cur,
    };
  }

  private tryParseConjugate(start: number, cmd: string): IdentifierNode | null {
    this.skipWhitespace();
    if (this.index >= this.len) return null;

    let target = "";
    if (this.text.charCodeAt(this.index) === CHAR_LBRACE) {
      const close = this.text.indexOf("}", this.index + 1);
      if (close !== -1) {
        target = this.text.slice(this.index + 1, close).trim();
        this.index = close + 1;
      }
    } else {
      target = this.text[this.index];
      this.index++;
    }

    if (!target) return null;
    return {
      kind: "identifier",
      text: `${cmd}{${target}}`,
      isConjugate: true,
      start,
      end: this.index,
    };
  }

  private tryParseSpecialOperator(start: number, cmd: string, depth: number): CSTNode | null {
    this.skipWhitespace();
    if (this.index >= this.len || this.text.charCodeAt(this.index) !== CHAR_LBRACE) {
      return null;
    }
    const close = this.text.indexOf("}", this.index + 1);
    if (close === -1) return null;

    const inner = this.text.slice(this.index + 1, close).trim();

    // 1. Dimensionless: \mathrm{Re}, \text{Ma}, etc.
    if (COMMON_DIMENSIONLESS_SET.has(inner)) {
      this.index = close + 1;
      return {
        kind: "identifier",
        text: `${cmd}{${inner}}`,
        isDimensionless: true,
        start,
        end: this.index,
      };
    }

    // 2. Residue operator: \operatorname{Res}
    if (inner === "Res") {
      this.index = close + 1;
      this.expectingResidueArgs = true;
      return {
        kind: "operator",
        start,
        end: this.index,
        text: `${cmd}{${inner}}`,
        operatorType: "binary",
      };
    }

    // 3. Proximal operator: \operatorname{prox}
    if (inner === "prox") {
      this.index = close + 1;
      return {
        kind: "command",
        start,
        end: this.index,
        name: `${cmd}{${inner}}`,
        isProximal: true,
      };
    }

    // 4. Cauchy Principal Value: \text{P.V.} \int or \text{PV} \int
    if (inner === "P.V." || inner === "PV" || inner === "P.V") {
      this.index = close + 1;
      this.skipWhitespace();
      if (this.text.startsWith("\\int", this.index) || this.text.startsWith("\\oint", this.index)) {
        const intLen = this.text.startsWith("\\oint", this.index) ? 5 : 4;
        this.index += intLen;
        return {
          kind: "operator",
          start,
          end: this.index,
          text: "P.V.\\int",
          operatorType: "principal_value",
        };
      }
    }

    // 5. Probability operators: \operatorname{Var}, \operatorname{Cov}, \operatorname{bias}, \operatorname{corr}, \operatorname{Pois}
    if (
      inner === "Var" ||
      inner === "Cov" ||
      inner === "bias" ||
      inner === "corr" ||
      inner === "Pois" ||
      inner === "Bin" ||
      inner === "Beta"
    ) {
      this.index = close + 1;
      this.inProbabilityContext = true;
      return {
        kind: "command",
        start,
        end: this.index,
        name: `${cmd}{${inner}}`,
        isProbabilityOperator: true,
      };
    }

    return null;
  }

  private parseFraction(start: number, cmd: string, depth: number): FractionNode {
    const numRes = this.parseBracedArgument(depth + 1);
    const denRes = this.parseBracedArgument(depth + 1);

    // 1.2 Wirtinger Differentials: \frac{\partial f}{\partial z} vs \frac{\partial f}{\partial \bar{z}}
    let isWirtinger = false;
    let isHolomorphic: boolean | undefined;

    const numText = this.nodesToRawText(numRes.nodes).trim();
    const denText = this.nodesToRawText(denRes.nodes).trim();

    if (
      (numText.includes("\\partial") || numText.includes("∂")) &&
      (denText.includes("\\partial") || denText.includes("∂"))
    ) {
      if (WIRTINGER_DEN_HOLOMORPHIC.test(denText)) {
        isWirtinger = true;
        isHolomorphic = true;
      } else if (WIRTINGER_DEN_ANTIHOLOMORPHIC.test(denText)) {
        isWirtinger = true;
        isHolomorphic = false;
      }
    }

    // 5.3 Legendre Symbol Candidate: \left(\frac{a}{p}\right) or (\frac{a}{p})
    const isLegendreCandidate =
      /^[a-zA-Z0-9]$/.test(numText) && /^[a-zA-Z0-9]$/.test(denText);

    return {
      kind: "fraction",
      command: cmd,
      start,
      end: this.index,
      numerator: numRes.nodes,
      denominator: denRes.nodes,
      hasUnclosedBrace: numRes.isUnclosed || denRes.isUnclosed,
      isWirtinger,
      isHolomorphic,
      isLegendreCandidate,
    };
  }

  private parseStandardGroup(depth: number, openChar: "(" | "[", isResidueGroup: boolean = false): GroupNode {
    const openStart = this.index;
    this.index++;
    let openEnd = this.index;
    const delimType = openChar === "(" ? "paren" : "bracket";
    let isInterfaceJump = false;

    // 2.1 Interface Jump double bracket [[u]]
    if (openChar === "[" && this.index < this.len && this.text.charCodeAt(this.index) === CHAR_LBRACKET) {
      this.index++;
      openEnd = this.index;
      isInterfaceJump = true;
    }

    const expectedCloseCode = openChar === "(" ? CHAR_RPAREN : CHAR_RBRACKET;
    const altCloseCode = openChar === "(" ? CHAR_RBRACKET : CHAR_RPAREN;

    const children = this.parseNodeList(depth + 1, STOP_PAREN_OR_BRACKET);
    let closeStart: number | undefined;
    let closeEnd: number | undefined;
    let closeText: string | undefined;
    let isHalfOpenInterval = false;

    if (this.index < this.len) {
      const code = this.text.charCodeAt(this.index);
      if (code === expectedCloseCode) {
        closeStart = this.index;
        this.index++;
        if (isInterfaceJump && this.index < this.len && this.text.charCodeAt(this.index) === CHAR_RBRACKET) {
          this.index++;
        }
        closeEnd = this.index;
        closeText = openChar === "(" ? ")" : isInterfaceJump ? "]]" : "]";
      } else if (code === altCloseCode && this.hasTopLevelComma(openEnd, this.index)) {
        closeStart = this.index;
        this.index++;
        closeEnd = this.index;
        closeText = openChar === "(" ? "]" : ")";
        isHalfOpenInterval = true;
      }
    }

    // 6.3 Stochastic Quadratic Variation: [X]_t, [M]_t
    let isStochasticVariation = false;
    if (closeEnd !== undefined && openChar === "[") {
      const raw = this.nodesToRawText(children).trim();
      if (/^[XMBWST]$/i.test(raw)) {
        const cur = this.index;
        if (cur < this.len && this.text.charCodeAt(cur) === CHAR_UNDERSCORE) {
          const nextC = cur + 1 < this.len ? this.text[cur + 1] : "";
          if (nextC === "t" || nextC === "T" || (nextC === "{" && this.text.slice(cur + 1).startsWith("{t}"))) {
            isStochasticVariation = true;
          }
        }
      }
    }

    // 1.1 Evaluation bar limits attached to closing bracket: [F(x)]_a^b
    const evaluationLimits: CSTNode[] = [];
    let isEvaluationBar = false;
    if (closeEnd !== undefined && openChar === "[" && !isStochasticVariation) {
      let cur = this.index;
      while (
        cur < this.len &&
        (this.text.charCodeAt(cur) === CHAR_UNDERSCORE || this.text.charCodeAt(cur) === CHAR_CARET)
      ) {
        const char = this.text.charCodeAt(cur) === CHAR_UNDERSCORE ? "_" : "^";
        const script = this.parseScript(depth, char);
        evaluationLimits.push(script);
        cur = this.index;
      }
      if (evaluationLimits.length > 0) {
        isEvaluationBar = true;
      }
    }

    // 2.1 Convective nonlinear derivative: (\mathbf{u} \cdot \nabla)\mathbf{u}
    let isConvectiveAdvection = false;
    if (openChar === "(" && closeEnd !== undefined) {
      const rawChildren = this.nodesToRawText(children);
      if (CONVECTIVE_ADVECTION_PATTERN.test(rawChildren)) {
        this.skipWhitespace();
        const nextRest = this.text.slice(this.index);
        const nextVec = nextRest.match(/^(?:\\mathbf\{[uvw]\}|\\vec\{[uvw]\}|[uvw])(?![a-zA-Z])/);
        if (nextVec) {
          this.index += nextVec[0].length;
          closeEnd = this.index;
          isConvectiveAdvection = true;
        }
      }
    }

    // 5.2 Subgroup Index [G : H] or [L : K]
    let isSubgroupIndex = false;
    let isQuantumCommutator = false;
    let isLegendreSymbol = false;

    if (openChar === "[" && closeEnd !== undefined) {
      const raw = this.nodesToRawText(children).trim();
      if (/^[A-Z]\s*:\s*[A-Z]$/.test(raw) || /^[A-Z]\s*:\s*\\mathcal\{[A-Za-z]+\}$/.test(raw)) {
        isSubgroupIndex = true;
      } else if (raw.includes("\\hat") || raw.includes("\\dagger")) {
        isQuantumCommutator = true;
      }
    } else if (openChar === "(" && children.length === 1 && children[0].kind === "fraction") {
      const f = children[0];
      if (f.isLegendreCandidate) {
        f.isLegendreSymbol = true;
        isLegendreSymbol = true;
      }
    }

    // 1.2 Pole recognition in Residue arguments: \operatorname{Res}(f, z_0)
    if (isResidueGroup) {
      this.markResiduePoleArguments(children);
    }

    return {
      kind: "group",
      delimType,
      openStart,
      openEnd,
      openText: isInterfaceJump ? "[[" : openChar,
      closeStart,
      closeEnd,
      closeText,
      isHalfOpenInterval,
      isInterfaceJump,
      isEvaluationBar,
      isConvectiveAdvection,
      isSubgroupIndex,
      isQuantumCommutator,
      isStochasticVariation,
      isLegendreSymbol,
      evaluationLimits,
      isSyntaxError: false, // relaxed math delimiter
      depth,
      start: openStart,
      end: closeEnd ?? this.index,
      children,
    };
  }

  private parsePipeDelimited(depth: number, prevNodes: CSTNode[]): CSTNode | null {
    const start = this.index;
    const rest = this.text.slice(start);

    // 1. Dirac Ket: |\psi\rangle or |0\rangle or |n\rangle
    const ketMatch = rest.match(/^\|([^|\r\n\\]*(?:\\[a-zA-Z]+)*[^|\r\n]*?)\\rangle/);
    if (ketMatch) {
      this.index++; // skip '|'
      const openEnd = this.index;
      const innerText = ketMatch[1];
      const innerStart = this.index;
      const sub = new MathCSTParser(innerText).parse();
      const children: CSTNode[] = [];
      for (const n of sub) {
        children.push({
          ...n,
          start: innerStart + n.start,
          end: innerStart + n.end,
        });
      }
      this.index = start + ketMatch[0].length;
      return {
        kind: "group",
        delimType: "pipe",
        openStart: start,
        openEnd,
        openText: "|",
        closeStart: this.index - 7,
        closeEnd: this.index,
        closeText: "\\rangle",
        isKet: true,
        depth,
        start,
        end: this.index,
        children,
      };
    }

    // 2. Matrix Determinant / Group Order: |A|, |M|, |B|, |G|, |\mathbf{A}|
    const detMatch = rest.match(/^\|([A-Z]|\\mathbf\{[A-Za-z]+\}|\\boldsymbol\{[A-Za-z]+\})\|(?![a-zA-Z0-9])/);
    if (detMatch) {
      this.index++; // skip '|'
      const openEnd = this.index;
      const innerText = detMatch[1];
      const idStart = this.index;
      this.index += innerText.length;
      const idEnd = this.index;
      const child: IdentifierNode = {
        kind: "identifier",
        start: idStart,
        end: idEnd,
        text: innerText,
      };
      const closeStart = this.index;
      this.index++; // skip '|'
      const closeEnd = this.index;
      return {
        kind: "group",
        delimType: "pipe",
        openStart: start,
        openEnd,
        openText: "|",
        closeStart,
        closeEnd,
        closeText: "|",
        isMatrixDeterminant: true,
        depth,
        start,
        end: this.index,
        children: [child],
      };
    }

    // 3. p-Adic Norm: |x|_p, |x+y|_p
    const padicMatch = rest.match(/^\|([a-zA-Z0-9+-]+?)\|_p/);
    if (padicMatch) {
      this.index++; // skip '|'
      const openEnd = this.index;
      const innerText = padicMatch[1];
      const idStart = this.index;
      this.index += innerText.length;
      const idEnd = this.index;
      const closeStart = this.index;
      this.index += 3; // '|' + '_p'
      return {
        kind: "group",
        delimType: "pipe",
        openStart: start,
        openEnd,
        openText: "|",
        closeStart,
        closeEnd: this.index,
        closeText: "|_p",
        isPadicNorm: true,
        depth,
        start,
        end: this.index,
        children: [{ kind: "identifier", start: idStart, end: idEnd, text: innerText }],
      };
    }

    // 4. Standalone pipe
    this.index++;
    const prev = prevNodes.length > 0 ? prevNodes[prevNodes.length - 1] : undefined;
    const isProb =
      this.inProbabilityContext ||
      (prev !== undefined && prev.kind === "command" && Boolean(prev.isProbabilityOperator));
    if (isProb) {
      return {
        kind: "operator",
        start,
        end: this.index,
        text: "|",
        operatorType: "conditioning",
      };
    }

    return {
      kind: "operator",
      start,
      end: this.index,
      text: "|",
      operatorType: "divisibility",
    };
  }

  private parseBareBraceGroup(depth: number): GroupNode {
    const openStart = this.index;
    this.index++;
    const openEnd = this.index;

    const children = this.parseNodeList(depth + 1, STOP_RBRACE);
    let closeStart: number | undefined;
    let closeEnd: number | undefined;
    let closeText: string | undefined;

    if (this.index < this.len && this.text.charCodeAt(this.index) === CHAR_RBRACE) {
      closeStart = this.index;
      this.index++;
      closeEnd = this.index;
      closeText = "}";
    }

    const isUnclosed = closeStart === undefined;
    return {
      kind: "group",
      delimType: "bare_brace",
      openStart,
      openEnd,
      openText: "{",
      closeStart,
      closeEnd,
      closeText,
      isSyntaxError: isUnclosed, // TRUE SYNTAX ERROR
      depth,
      start: openStart,
      end: closeEnd ?? this.index,
      children,
    };
  }

  private parseEscapedBraceGroup(openStart: number, depth: number): GroupNode {
    let openEnd = this.index;
    let isInterfaceAverage = false;

    // 2.1 Interface Average double brace \{\{u\}\}
    if (this.text.startsWith("\\{", this.index)) {
      this.index += 2;
      openEnd = this.index;
      isInterfaceAverage = true;
    }

    let closeStart: number | undefined;
    let closeEnd: number | undefined;
    let closeText: string | undefined;

    const children = this.parseNodeList(depth + 1, STOP_ESCAPED_RBRACE);
    if (this.index < this.len && this.text.startsWith("\\}", this.index)) {
      closeStart = this.index;
      this.index += 2;
      if (isInterfaceAverage && this.text.startsWith("\\}", this.index)) {
        this.index += 2;
      }
      closeEnd = this.index;
      closeText = isInterfaceAverage ? "\\}\\}" : "\\}";
    }

    // 6.1 Quantum Anticommutator: \{\hat{A}, \hat{B}\} vs 3.1 Symplectic Poisson Bracket: \{q_i, H\}
    let isAnticommutator = false;
    let isPoissonBracket = false;
    if (!isInterfaceAverage && this.hasTopLevelComma(openEnd, closeStart ?? this.index)) {
      const raw = this.nodesToRawText(children);
      if (raw.includes("\\hat") || raw.includes("\\dagger")) {
        isAnticommutator = true;
      } else if (POISSON_CHARS_PATTERN.test(raw)) {
        isPoissonBracket = true;
      }
    }

    return {
      kind: "group",
      delimType: "brace",
      openStart,
      openEnd,
      openText: isInterfaceAverage ? "\\{\\{" : "\\{",
      closeStart,
      closeEnd,
      closeText,
      isInterfaceAverage,
      isPoissonBracket,
      isAnticommutator,
      isSyntaxError: false,
      depth,
      start: openStart,
      end: closeEnd ?? this.index,
      children,
    };
  }

  private parseAngleGroup(openStart: number, depth: number): GroupNode {
    const openEnd = this.index;
    let closeStart: number | undefined;
    let closeEnd: number | undefined;
    let closeText: string | undefined;

    let isBra = false;
    let isBraKet = false;
    let isStochasticVariation = false;

    const children: CSTNode[] = [];
    const firstPart = this.parseNodeList(depth + 1, STOP_ANGLE_OR_PIPE);
    for (const node of firstPart) children.push(node);

    if (this.index < this.len && this.text.startsWith("\\rangle", this.index)) {
      closeStart = this.index;
      this.index += 7;
      closeEnd = this.index;
      closeText = "\\rangle";
    } else if (this.index < this.len && this.text.charCodeAt(this.index) === 124) {
      const nextRest = this.text.slice(this.index + 1);
      const nextRanglePos = nextRest.indexOf("\\rangle");
      const nextLanglePos = nextRest.indexOf("\\langle");
      const between = nextRanglePos !== -1 ? nextRest.slice(0, nextRanglePos) : "";
      const isKetFollows =
        nextRanglePos !== -1 &&
        (nextLanglePos === -1 || nextRanglePos < nextLanglePos) &&
        !/[+=,\\](?:quad|text|begin|end)/.test(between) &&
        !/[+=]/.test(between);

      if (isKetFollows) {
        isBraKet = true;
        const barStart = this.index;
        this.index++;
        children.push({
          kind: "punctuation",
          start: barStart,
          end: this.index,
          char: "|",
        });
        const secondPart = this.parseNodeList(depth + 1, STOP_ANGLE_OR_PIPE);
        for (const node of secondPart) children.push(node);
        if (this.index < this.len && this.text.startsWith("\\rangle", this.index)) {
          closeStart = this.index;
          this.index += 7;
          closeEnd = this.index;
          closeText = "\\rangle";
        }
      } else {
        isBra = true;
        closeStart = this.index;
        this.index++;
        closeEnd = this.index;
        closeText = "|";
      }
    }

    // 6.3 Stochastic Predictable Variation: \langle M \rangle_t
    if (closeEnd !== undefined && closeText === "\\rangle" && !isBra && !isBraKet) {
      const cur = this.index;
      if (cur < this.len && this.text.charCodeAt(cur) === CHAR_UNDERSCORE) {
        const nextChar = cur + 1 < this.len ? this.text[cur + 1] : "";
        if (nextChar === "t" || nextChar === "T" || (nextChar === "{" && this.text.slice(cur + 1).startsWith("{t}"))) {
          isStochasticVariation = true;
        }
      }
    }

    return {
      kind: "group",
      delimType: "angle",
      openStart,
      openEnd,
      openText: "\\langle",
      closeStart,
      closeEnd,
      closeText,
      isBra,
      isBraKet,
      isStochasticVariation,
      isSyntaxError: false,
      depth,
      start: openStart,
      end: closeEnd ?? this.index,
      children,
    };
  }

  private parseNormGroup(openStart: number, depth: number): GroupNode {
    const openEnd = this.index;
    const openText = this.text.slice(openStart, openEnd);

    const children = this.parseNodeList(depth + 1, STOP_PIPE);
    let closeStart: number | undefined;
    let closeEnd: number | undefined;
    let closeText: string | undefined;

    if (this.index < this.len) {
      if (this.text.startsWith("\\|", this.index) || this.text.startsWith("\\Vert", this.index)) {
        closeStart = this.index;
        this.index += this.text.startsWith("\\|", this.index) ? 2 : 5;
        closeEnd = this.index;
        closeText = this.text.slice(closeStart, closeEnd);
      } else if (this.text.charCodeAt(this.index) === 124) {
        closeStart = this.index;
        this.index++;
        closeEnd = this.index;
        closeText = "|";
      }
    }

    // 3.2 Regularization Norms & 5.1 Matrix Norms: \|A\|_F, \|A\|_2, \|A\|_*
    let isRegularizationNorm = false;
    let isMatrixNorm = false;
    let normOrder: string | undefined;
    const normLimits: CSTNode[] = [];
    if (closeEnd !== undefined) {
      let cur = this.index;
      while (
        cur < this.len &&
        (this.text.charCodeAt(cur) === CHAR_UNDERSCORE || this.text.charCodeAt(cur) === CHAR_CARET)
      ) {
        const char = this.text.charCodeAt(cur) === CHAR_UNDERSCORE ? "_" : "^";
        const script = this.parseScript(depth, char);
        normLimits.push(script);
        cur = this.index;
      }
      if (normLimits.length > 0) {
        isRegularizationNorm = true;
        normOrder = this.nodesToRawText(normLimits).trim();
        const rawChildren = this.nodesToRawText(children).trim();
        if (normOrder.includes("F") || normOrder.includes("*") || MATRIX_BASE_PATTERN.test(rawChildren)) {
          isMatrixNorm = true;
        }
      }
    }

    return {
      kind: "group",
      delimType: "pipe",
      openStart,
      openEnd,
      openText,
      closeStart,
      closeEnd,
      closeText,
      isRegularizationNorm,
      isMatrixNorm,
      normOrder,
      normLimits,
      depth,
      start: openStart,
      end: closeEnd ?? this.index,
      children,
    };
  }

  private parseLeftRightGroup(openStart: number, depth: number): GroupNode {
    this.skipWhitespace();
    const token = this.readDelimiterToken();
    const openEnd = token ? token.end : this.index;
    const openText = token ? token.text : "";

    let closeStart: number | undefined;
    let closeEnd: number | undefined;
    let closeText: string | undefined;

    const children: CSTNode[] = [];
    while (this.index < this.len) {
      const isRightCmd = this.text.startsWith("\\right", this.index) &&
        (this.index + 6 >= this.len || !/[a-zA-Z]/.test(this.text[this.index + 6]));
      if (isRightCmd) {
        closeStart = this.index;
        this.index += 6;
        this.skipWhitespace();
        const closeToken = this.readDelimiterToken();
        closeEnd = closeToken ? closeToken.end : this.index;
        closeText = closeToken ? closeToken.text : "";
        break;
      }
      const sub = this.parseNodeList(depth + 1, STOP_NONE);
      for (const n of sub) children.push(n);
    }

    // Distinguish double vertical norm bars (\| or \Vert) from evaluation bars
    const isDoubleNormBar =
      closeText?.includes("\\|") ||
      closeText?.includes("\\Vert") ||
      openText.includes("\\|") ||
      openText.includes("\\Vert");

    // 1.1 Evaluation bar limits on sized delimiters: \left. \frac{df}{dx} \right|_{x=x_0}^{x=x_1}
    const evaluationLimits: CSTNode[] = [];
    let isEvaluationBar = false;
    if (closeEnd !== undefined && !isDoubleNormBar && (closeText?.includes("|") || closeText?.includes(".") || openText.includes("."))) {
      let cur = this.index;
      while (
        cur < this.len &&
        (this.text.charCodeAt(cur) === CHAR_UNDERSCORE || this.text.charCodeAt(cur) === CHAR_CARET)
      ) {
        const char = this.text.charCodeAt(cur) === CHAR_UNDERSCORE ? "_" : "^";
        const script = this.parseScript(depth, char);
        evaluationLimits.push(script);
        cur = this.index;
      }
      if (evaluationLimits.length > 0) {
        isEvaluationBar = true;
      }
    }

    // 3.2 Regularization Norm on Sized Delimiters: \left\| \mathbf{w} \right\|_1
    let isRegularizationNorm = false;
    let isMatrixNorm = false;
    let normOrder: string | undefined;
    const normLimits: CSTNode[] = [];
    if (closeEnd !== undefined && isDoubleNormBar) {
      let cur = this.index;
      while (
        cur < this.len &&
        (this.text.charCodeAt(cur) === CHAR_UNDERSCORE || this.text.charCodeAt(cur) === CHAR_CARET)
      ) {
        const char = this.text.charCodeAt(cur) === CHAR_UNDERSCORE ? "_" : "^";
        const script = this.parseScript(depth, char);
        normLimits.push(script);
        cur = this.index;
      }
      if (normLimits.length > 0) {
        isRegularizationNorm = true;
        normOrder = this.nodesToRawText(normLimits).trim();
        const raw = this.nodesToRawText(children).trim();
        if (normOrder.includes("F") || normOrder.includes("*") || MATRIX_BASE_PATTERN.test(raw)) {
          isMatrixNorm = true;
        }
      }
    }

    // Check Dirac Bra-Ket with \left and \right
    let isKet = false;
    let isBra = false;
    let isBraKet = false;
    let isMatrixDeterminant = false;
    let isLegendreSymbol = false;
    let isStochasticVariation = false;

    if (openText.includes("|") && closeText?.includes("\\rangle")) {
      isKet = true;
    } else if (openText.includes("\\langle") && closeText?.includes("|")) {
      isBra = true;
    } else if (openText.includes("\\langle") && closeText?.includes("\\rangle")) {
      const rawChildren = this.nodesToRawText(children);
      if (rawChildren.includes("|") || rawChildren.includes("\\mid") || rawChildren.includes("\\middle|")) {
        isBraKet = true;
      } else {
        const cur = this.index;
        if (cur < this.len && this.text.charCodeAt(cur) === CHAR_UNDERSCORE) {
          const nextC = cur + 1 < this.len ? this.text[cur + 1] : "";
          if (nextC === "t" || nextC === "T" || (nextC === "{" && this.text.slice(cur + 1).startsWith("{t}"))) {
            isStochasticVariation = true;
          }
        }
      }
    } else if (openText.includes("|") && closeText?.includes("|") && !isDoubleNormBar) {
      const raw = this.nodesToRawText(children).trim();
      if (MATRIX_BASE_PATTERN.test(raw)) {
        isMatrixDeterminant = true;
      }
    } else if (openText.includes("(") && closeText?.includes(")") && children.length === 1 && children[0].kind === "fraction") {
      const f = children[0];
      if (f.isLegendreCandidate) {
        f.isLegendreSymbol = true;
        isLegendreSymbol = true;
      }
    }

    const isUnclosed = closeStart === undefined;
    return {
      kind: "group",
      delimType: "sized",
      openStart,
      openEnd,
      openText: `\\left${openText}`,
      closeStart,
      closeEnd,
      closeText: closeText ? `\\right${closeText}` : undefined,
      isLeftRight: true,
      isEvaluationBar,
      isRegularizationNorm,
      isMatrixNorm,
      isMatrixDeterminant,
      isKet,
      isBra,
      isBraKet,
      isLegendreSymbol,
      isStochasticVariation,
      normOrder,
      normLimits,
      evaluationLimits,
      isSyntaxError: isUnclosed, // TRUE SYNTAX ERROR
      depth,
      start: openStart,
      end: closeEnd ?? this.index,
      children,
    };
  }

  private parseScript(depth: number, char: "_" | "^", prevNode?: CSTNode): ScriptNode {
    const start = this.index;
    this.index++; // skip '_' or '^'
    const scriptType = char === "_" ? "subscript" : "superscript";

    let arg: CSTNode[];
    if (this.index < this.len && this.text.charCodeAt(this.index) === CHAR_LBRACE) {
      const braced = this.parseBracedArgument(depth);
      arg = braced.nodes;
    } else if (this.index < this.len && this.text.charCodeAt(this.index) === CHAR_BACKSLASH) {
      const cmdNode = this.parseCommand(depth, prevNode);
      arg = cmdNode ? [cmdNode] : [];
    } else if (this.index < this.len && this.text.charCodeAt(this.index) > 32) {
      const single = this.text[this.index];
      const argStart = this.index;
      this.index++;
      arg = [{ kind: "identifier", start: argStart, end: this.index, text: single }];
    } else {
      arg = [];
    }

    let innerText: string;
    if (arg.length === 1) {
      const a0 = arg[0];
      if (a0.kind === "identifier" || a0.kind === "operator") {
        innerText = a0.text;
      } else if (a0.kind === "command") {
        innerText = a0.name;
      } else if (a0.kind === "number") {
        innerText = a0.value;
      } else {
        innerText = this.nodesToRawText(arg).trim();
      }
    } else if (arg.length === 0) {
      innerText = "";
    } else {
      innerText = this.nodesToRawText(arg).trim();
    }

    const prevText =
      prevNode?.kind === "identifier" || prevNode?.kind === "operator"
        ? prevNode.text
        : prevNode?.kind === "command"
        ? prevNode.name
        : prevNode?.kind === "number"
        ? prevNode.value
        : "";

    let isHigherOrderDerivative = false;
    let isConjugate = false;
    let isContravariantTensorIndex = false;
    let isFlowEvolution = false;
    let isInvariantManifold = false;
    let isFenchelDual = false;
    let isOptimalMinimizer = false;
    let isMusicalIsomorphism = false;
    let isIndexCovariantDerivative = false;
    let isIndexPartialDerivative = false;
    let isChainBoundary = false;
    let isMatrixTransformation = false;
    let isLadderOperator = false;
    let isPauliMatrix = false;
    let isStochasticVariation = false;

    if (scriptType === "superscript") {
      const isFunctionBase =
        prevNode &&
        (prevNode.kind === "identifier" || prevNode.kind === "command");

      // 1.1 Higher-order derivative detection: f^{(3)}(x), f^{(n)}(x), f'''(x) vs (x)^3
      if (isFunctionBase) {
        if (arg.length === 1 && arg[0].kind === "group") {
          const g = arg[0];
          if (g.delimType === "paren" && g.children.length >= 1) {
            const parenInner = this.nodesToRawText(g.children).trim();
            if (HIGHER_ORDER_DERIV_PATTERN.test(parenInner)) {
              isHigherOrderDerivative = true;
            }
          }
        } else if (arg.length >= 1) {
          if (PRIME_PATTERN.test(innerText) || BACKSLASH_PRIME_PATTERN.test(innerText)) {
            isHigherOrderDerivative = true;
          }
        }
      }

      // 5.1 Matrix Transformations: \mathbf{A}^T, A^T, \mathbf{A}^*, \mathbf{A}^\dagger, A^\dagger, \mathbf{A}^{-1}, \mathbf{A}^+
      const baseText = this.extractBaseText(prevNode);
      if (MATRIX_BASE_PATTERN.test(prevText) || MATRIX_BASE_PATTERN.test(baseText)) {
        if (MATRIX_TRANSFORMATION_SYMBOLS.has(innerText)) {
          isMatrixTransformation = true;
        }
      }

      // 6.1 Creation & Annihilation Ladder Operators: \hat{a}^\dagger, \hat{c}_k^\dagger, a^\dagger
      if (
        (innerText === "\\dagger" || innerText === "†") &&
        (LADDER_BASE_SYMBOLS.has(prevText) ||
          LADDER_BASE_SYMBOLS.has(baseText) ||
          /^[abcABC]/.test(baseText) ||
          /^[abcABC]/.test(prevText))
      ) {
        isLadderOperator = true;
      }

      // 4.1 Contravariant Upper Tensor Indices: T^{\mu\nu}, V^\mu, g^{\mu\nu}
      if (TENSOR_BASE_SYMBOLS.has(prevText)) {
        if (TENSOR_INDEX_GREEK.has(innerText) || TENSOR_INDEX_PATTERN.test(innerText)) {
          isContravariantTensorIndex = true;
        }
      }

      // 4.1 Musical Isomorphisms: X^\flat (lowering), \omega^\sharp (raising)
      if (innerText === "\\flat" || innerText === "\\sharp" || innerText === "♭" || innerText === "♯") {
        isMusicalIsomorphism = true;
      }

      // 3.1 Flow evolution time parameter: \Phi^t(x_0)
      if (FLOW_MAP_SYMBOLS.has(prevText) && (innerText === "t" || innerText === "\\tau")) {
        isFlowEvolution = true;
      }

      // 3.1 Invariant Manifold bundles: W^s, W^u, W^c, E^s, E^u, E^c
      if (INVARIANT_MANIFOLD_BASES.has(prevText) && (innerText === "s" || innerText === "u" || innerText === "c")) {
        isInvariantManifold = true;
      }

      // 3.2 Fenchel Dual function: f^*(y) vs Optimal minimizer x^* vs Complex conjugate z^*
      if (innerText === "*" || innerText === "\\ast" || innerText === "\\star") {
        if (CONVEX_FUNCTION_SYMBOLS.has(prevText)) {
          isFenchelDual = true;
        } else if (OPTIMIZER_VARIABLE_SYMBOLS.has(prevText)) {
          isOptimalMinimizer = true;
        } else if (["z", "w", "Z", "W", "\\zeta"].includes(prevText)) {
          isConjugate = true;
        }
      }
    } else {
      // Subscript
      // 6.1 Pauli Spin Matrices: \sigma_x, \sigma_y, \sigma_z, \sigma_1, \sigma_2, \sigma_3
      if ((prevText === "\\sigma" || prevText === "\\boldsymbol{\\sigma}") && PAULI_INDICES.has(innerText)) {
        isPauliMatrix = true;
      } else if (prevNode && prevNode.kind === "group" && prevNode.isStochasticVariation) {
        // 6.3 Stochastic Quadratic Variation subscript: [X]_t, \langle M \rangle_t
        isStochasticVariation = true;
      } else if (prevNode && prevNode.kind === "command" && prevNode.isChainBoundary) {
        // 4.2 Nilpotent chain boundary subscript: \partial_n, \partial_{n+1}
        isChainBoundary = true;
      } else if (innerText.includes(";")) {
        // 4.1 Tensor Index Differentiation: A_{\mu;\nu} (partial) vs A_{\mu;\nu} (covariant)
        isIndexCovariantDerivative = true;
      } else if (innerText.includes(",") && !innerText.includes(" ")) {
        isIndexPartialDerivative = true;
      }
    }

    return {
      kind: "script",
      scriptType,
      base: prevNode,
      arg,
      isHigherOrderDerivative,
      isConjugate,
      isContravariantTensorIndex,
      isFlowEvolution,
      isInvariantManifold,
      isFenchelDual,
      isOptimalMinimizer,
      isMusicalIsomorphism,
      isIndexCovariantDerivative,
      isIndexPartialDerivative,
      isChainBoundary,
      isMatrixTransformation,
      isLadderOperator,
      isPauliMatrix,
      isStochasticVariation,
      start,
      end: this.index,
    };
  }

  private parseBracedArgument(depth: number): { nodes: CSTNode[]; isUnclosed: boolean } {
    if (this.index >= this.len || this.text.charCodeAt(this.index) !== CHAR_LBRACE) {
      return { nodes: [], isUnclosed: false };
    }
    const openStart = this.index;
    this.index++; // skip '{'
    const nodes = this.parseNodeList(depth, STOP_RBRACE);
    let isUnclosed = false;
    if (this.index < this.len && this.text.charCodeAt(this.index) === CHAR_RBRACE) {
      this.index++; // consume '}'
    } else {
      isUnclosed = true;
      nodes.push({
        kind: "group",
        delimType: "bare_brace",
        openStart,
        openEnd: openStart + 1,
        openText: "{",
        isSyntaxError: true,
        depth,
        start: openStart,
        end: this.index,
        children: [],
      });
    }
    return { nodes, isUnclosed };
  }

  private skipBracedGroup(): void {
    this.skipWhitespace();
    if (this.index >= this.len || this.text.charCodeAt(this.index) !== CHAR_LBRACE) return;
    this.index++;
    let depth = 1;
    while (this.index < this.len && depth > 0) {
      const c = this.text.charCodeAt(this.index);
      if (c === CHAR_LBRACE) depth++;
      else if (c === CHAR_RBRACE) depth--;
      this.index++;
    }
  }

  private skipOptionalBracket(): void {
    this.skipWhitespace();
    if (this.index >= this.len || this.text.charCodeAt(this.index) !== CHAR_LBRACKET) return;
    this.index++;
    let depth = 1;
    while (this.index < this.len && depth > 0) {
      const c = this.text.charCodeAt(this.index);
      if (c === CHAR_LBRACKET) depth++;
      else if (c === CHAR_RBRACKET) depth--;
      this.index++;
    }
  }

  private skipWhitespace(): void {
    while (this.index < this.len && this.text.charCodeAt(this.index) <= 32) {
      this.index++;
    }
  }

  private readDelimiterToken(): { text: string; start: number; end: number } | null {
    if (this.index >= this.len) return null;
    const start = this.index;
    const c0 = this.text.charCodeAt(this.index);
    if (c0 === CHAR_BACKSLASH && this.index + 1 < this.len) {
      const c1 = this.text.charCodeAt(this.index + 1);
      if (c1 === CHAR_LBRACE || c1 === CHAR_RBRACE || c1 === 124) { // \{, \}, \|
        this.index += 2;
        return { text: this.text.slice(start, this.index), start, end: this.index };
      }
      if (this.text.startsWith("\\langle", this.index) || this.text.startsWith("\\rangle", this.index)) {
        this.index += 7;
        return { text: this.text.slice(start, this.index), start, end: this.index };
      }
      if (this.text.startsWith("\\Vert", this.index) || this.text.startsWith("\\vert", this.index)) {
        this.index += 5;
        return { text: this.text.slice(start, this.index), start, end: this.index };
      }
    }
    const ch = this.text[this.index];
    if (
      c0 === CHAR_LPAREN ||
      c0 === CHAR_RPAREN ||
      c0 === CHAR_LBRACKET ||
      c0 === CHAR_RBRACKET ||
      c0 === CHAR_LBRACE ||
      c0 === CHAR_RBRACE ||
      c0 === 124 ||
      c0 === 46
    ) {
      this.index++;
      return { text: ch, start, end: this.index };
    }
    return null;
  }

  private hasTopLevelComma(start: number, end: number): boolean {
    let parenDepth = 0;
    let bracketDepth = 0;
    let braceDepth = 0;
    for (let i = start; i < end; i++) {
      const c = this.text.charCodeAt(i);
      if (c === CHAR_LPAREN) parenDepth++;
      else if (c === CHAR_RPAREN) { if (parenDepth > 0) parenDepth--; }
      else if (c === CHAR_LBRACKET) bracketDepth++;
      else if (c === CHAR_RBRACKET) { if (bracketDepth > 0) bracketDepth--; }
      else if (c === CHAR_LBRACE) braceDepth++;
      else if (c === CHAR_RBRACE) { if (braceDepth > 0) braceDepth--; }
      else if (c === 44 && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) { // ',' is 44
        return true;
      }
    }
    return false;
  }

  private nodesToRawText(nodes: CSTNode[]): string {
    if (nodes.length === 0) return "";
    const minStart = nodes[0].start;
    const maxEnd = nodes[nodes.length - 1].end;
    return this.text.slice(minStart, maxEnd);
  }

  private extractBaseText(node?: CSTNode): string {
    if (!node) return "";
    if (node.kind === "identifier") return node.text;
    if (node.kind === "command") return node.name;
    if (node.kind === "group") return this.nodesToRawText(node.children).trim();
    if (node.kind === "script") return this.extractBaseText(node.base);
    return "";
  }

  private markResiduePoleArguments(children: CSTNode[]): void {
    let foundComma = false;
    for (const child of children) {
      if (child.kind === "punctuation" && child.char === ",") {
        foundComma = true;
        continue;
      }
      if (foundComma) {
        if (child.kind === "identifier") {
          child.isSingularityPole = true;
        } else if (child.kind === "script") {
          child.isSingularityPole = true;
          if (child.base && child.base.kind === "identifier") {
            child.base.isSingularityPole = true;
          }
        }
      }
    }
  }

  private isImaginaryUnitContext(nodes: CSTNode[]): boolean {
    const prev = nodes.length > 0 ? nodes[nodes.length - 1] : undefined;
    if (!prev) return false;
    if (prev.kind === "number") return true;
    if (prev.kind === "command" && (prev.name === "\\pi" || prev.name === "\\hbar")) return true;
    if (prev.kind === "identifier" && (prev.text === "\\pi" || prev.text === "\\hbar")) return true;
    return false;
  }
}
