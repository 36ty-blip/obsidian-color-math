# 📐 Master Mathematical Disciplines & Taxonomy Roadmap

> **Companion Document**: For compiler architecture, lexers, CodeMirror 6 facet integration, MathJax interceptors, and platform release foundations, see [ROADMAP.md](file:///c:/Users/aditya/Documents/CODES/TypeScript/obsidian-color-math/ROADMAP.md). Active sprints and architectural decisions are tracked in [TODO.md](file:///c:/Users/aditya/Documents/CODES/TypeScript/obsidian-color-math/TODO.md).

This document is the visual mathematical reference and progress checklist for all **14 Granular Disciplines** organized under **6 Super-Families**.

Every item includes:
1. **Mathematical Expression / Equation**: Concrete LaTeX formulas so notations can be identified visually on sight.
2. **Ambiguity / Conflict Target**: What standard syntax it collides with (e.g., powers vs. tensor indices, fractions vs. Legendre symbols).
3. **Context-Aware Styling Rule**: How Color Math resolves and renders it in the Concrete Syntax Tree (CST) and Tokyo Night palette.

---

## 📐 Super-Family 1: Analysis & Calculus

### 1.1 `calculus` — Classical Calculus & Real Analysis
- [x] **Interval Notation & Domain Endpoints**:
  $$x \in [a, b], \quad x \in (a, b], \quad x \in [a, b), \quad x \in (-\infty, \infty)$$
  - *Conflict*: `[a, b]` collides with commutators $[A, B]$; `(a, b)` collides with 2D points $(x, y)$.
  - *Styling*: Brackets receive delimiter colors; endpoints $a, b$ receive domain bound styling (`palette.parameter` / Tokyo Coral).
  - *Implementation*: Verified in `src/parsers/cst/rules/calculus.ts` (`isHalfOpenInterval`).

- [x] **Evaluation Limit Bars**:
  $$[F(x)]_a^b = F(b) - F(a) \quad \text{and} \quad \left. \frac{df}{dx} \right|_{x=x_0}^{x=x_1}$$
  - *Conflict*: Vertical bar collides with absolute value $|x|$ or conditional probability $\mathbb{P}(A \mid B)$.
  - *Styling*: Style the evaluation bar and its limits $a, b$ as an evaluation operator, bound to the integral's target.
  - *Implementation*: Verified in `src/parsers/cst/rules/calculus.ts` (`isEvaluationBar`).

- [x] **Higher-Order Derivative Powers**:
  $$f^{(n)}(x) = \frac{d^n f}{dx^n} \quad \text{e.g.} \quad f^{(3)}(x) \quad \text{vs.} \quad (f(x))^3$$
  - *Conflict*: Parenthesized numerical superscript $f^{(3)}$ represents the 3rd derivative, **not** an exponent/power!
  - *Styling*: Color $(n)$ with `palette.derivative` rather than exponent `palette.upper`.
  - *Implementation*: Verified in `src/parsers/cst/rules/calculus.ts` (`isHigherOrderDerivative`).

- [ ] **Partition Mesh Norm**:
  $$\|P\| = \max_{1 \le i \le n} (x_i - x_{i-1}) \to 0, \quad \lim_{\|P\| \to 0} \sum_{i=1}^n f(t_i) \Delta x_i = \int_a^b f(x) \, dx$$
  - *Conflict*: Double bars $\|P\|$ look identical to vector norm $\|\mathbf{v}\|$.
  - *Styling*: When applied to a partition $P$ adjacent to $\to 0$, style as mesh norm operator.

- [ ] **Epsilon-Delta Metric Bounds**:
  $$\forall \varepsilon > 0, \; \exists \delta > 0 \quad \text{s.t.} \quad 0 < |x - c| < \delta \implies |f(x) - L| < \varepsilon$$
  - *Conflict*: $\varepsilon$ and $\delta$ are typically parsed as generic variables or parameters.
  - *Styling*: Harmonize $(\varepsilon, \delta)$ pairs as metric tolerance parameters.

---

### 1.2 `complex` — Complex Analysis & Residues
- [x] **Wirtinger Differentials**:
  $$\frac{\partial f}{\partial z} = \frac{1}{2}\left(\frac{\partial f}{\partial x} - i\frac{\partial f}{\partial y}\right), \quad \frac{\partial f}{\partial \bar{z}} = \frac{1}{2}\left(\frac{\partial f}{\partial x} + i\frac{\partial f}{\partial y}\right)$$
  - *Conflict*: $z$ and $\bar{z}$ in denominators look like ordinary variables.
  - *Styling*: Highlight $\frac{\partial}{\partial z}$ (holomorphic) and $\frac{\partial}{\partial \bar{z}}$ (anti-holomorphic) coordinate operators.
  - *Implementation*: Verified in `src/parsers/cst/rules/complex.ts` (`isWirtinger`).

- [x] **Residue Operator & Singularity Poles**:
  $$\oint_{\gamma} \frac{f(z)}{z - z_0} \, dz = 2\pi i \, \operatorname{Res}(f, z_0) = 2\pi i \, f(z_0)$$
  - *Conflict*: In $\operatorname{Res}(f, z_0)$, $z_0$ is an isolated singularity pole, not a running integration variable $z$.
  - *Styling*: Highlight $\operatorname{Res}$ as a complex operator and style pole $z_0$ distinctly from variable $z$.
  - *Implementation*: Verified in `src/parsers/cst/rules/complex.ts` (`isSingularityPole`).

- [x] **Complex Conjugation**:
  $$z = x + iy \implies \bar{z} = x - iy \quad (\text{or } z^* = x - iy)$$
  - *Conflict*: $\bar{z}$ collides with sample mean $\bar{X}$; $z^*$ collides with optimal value $x^*$ or adjoint $A^*$.
  - *Styling*: Keep conjugation bar/asterisk unified with the variable in Tokyo Sky Cyan (`palette.set`).
  - *Implementation*: Verified in `src/parsers/cst/rules/complex.ts` (`isConjugate`).

- [x] **Cauchy Principal Value**:
  $$\text{P.V.} \int_{-\infty}^{\infty} \frac{f(x)}{x - x_0} \, dx = \lim_{\varepsilon \to 0^+} \left[ \int_{-\infty}^{x_0 - \varepsilon} + \int_{x_0 + \varepsilon}^{\infty} \right]$$
  - *Conflict*: $\text{P.V.}$ or $\mathcal{P}$ directly preceding $\int$ gets parsed as generic text or variables.
  - *Styling*: Colorize $\text{P.V.} \int$ as a unified singular contour operator.
  - *Implementation*: Verified in `src/parsers/cst/rules/complex.ts` (`principal_value`).

- [x] **Real & Imaginary Projections**:
  $$\operatorname{Re}(z) = \frac{z + \bar{z}}{2}, \quad \operatorname{Im}(z) = \frac{z - \bar{z}}{2i}, \quad e^{i\theta} = \cos\theta + i\sin\theta$$
  - *Conflict*: $i$ in exponents is easily confused with index variable $i$.
  - *Styling*: Highlight $\operatorname{Re}$ and $\operatorname{Im}$ as projection operators, with imaginary unit $i$ in constant orange.
  - *Implementation*: Verified in `src/parsers/cst/rules/complex.ts` (`isImaginaryUnit`).

---

## 🌊 Super-Family 2: Fields & PDEs

### 2.1 `pde_transport` — Transport & Fluid PDEs
- [x] **Domain Boundaries & Surface Manifolds**:
  $$\int_{\Omega} \nabla \cdot (\rho \mathbf{u}) \, dV = \oint_{\partial\Omega} (\rho \mathbf{u}) \cdot \mathbf{n} \, dS, \quad \partial V, \quad \partial D$$
  - *Conflict*: $\partial\Omega$ is parsed as a partial derivative fraction numerator!
  - *Styling*: Color $\partial\Omega$ as a geometric boundary surface manifold (`palette.chain` / green).
  - *Implementation*: Verified in `src/parsers/cst/rules/continuum.ts` & `src/parsers/differentials.ts`.

- [x] **Nonlinear Convective Derivative**:
  $$\frac{\partial \mathbf{u}}{\partial t} + (\mathbf{u} \cdot \nabla)\mathbf{u} = -\frac{1}{\rho}\nabla p + \nu \nabla^2 \mathbf{u}$$
  - *Conflict*: $(\mathbf{u} \cdot \nabla)$ gets fragmented into separate paren and operator tokens.
  - *Styling*: Treat $(\mathbf{u} \cdot \nabla)\mathbf{u}$ as a unified nonlinear directional momentum advection operator.
  - *Implementation*: Verified in `src/parsers/cst/rules/continuum.ts`.

- [ ] **Fluid State Variables**:
  $$\text{Scalars: } p \text{ (pressure)}, \; \rho \text{ (density)}, \; T \text{ (temperature)} \quad \text{vs. Vectors: } \mathbf{u} = (u, v, w)$$
  - *Conflict*: Fluid scalars, velocity fields, and kinematic viscosity ($\nu$) collide with coordinates.
  - *Styling*: Harmonize scalar fields distinctly from velocity vector fields and transport coefficients ($\mu, \nu$).

- [x] **Interface Jumps & Averages**:
  $$[[u]] = u^+ - u^-, \quad \{\{u\}\} = \frac{u^+ + u^-}{2}, \quad [[\rho \mathbf{u}]] \cdot \mathbf{n} = 0$$
  - *Conflict*: Double brackets $[[u]]$ collide with code syntax or array indexing; double braces $\{\{u\}\}$ collide with sets.
  - *Styling*: Recognize $[[\dots]]$ and $\{\{\dots\}\}$ as shock/discontinuity interface operators.
  - *Implementation*: Verified in `src/parsers/cst/rules/continuum.ts`.

- [x] **Dimensionless Numbers Registry**:
  $$\mathrm{Re} = \frac{\rho u L}{\mu}, \quad \mathrm{Pe} = \frac{u L}{\alpha}, \quad \mathrm{Ma} = \frac{u}{c}, \quad \mathrm{Pr} = \frac{\nu}{\alpha}, \quad \mathrm{Kn} = \frac{\lambda}{L}$$
  - *Conflict*: Multi-letter roman identifiers ($\mathrm{Re}, \mathrm{Pe}, \mathrm{Ma}$) are split into products of variables ($R \cdot e, P \cdot e$).
  - *Styling*: Recognize and preserve them as atomic dimensionless physical constants.
  - *Implementation*: Verified in `src/parsers/dimensionless.ts` & `src/parsers/cst/rules/continuum.ts`.

---

### 2.2 `continuum` — Continuum & Wave Mechanics
- [x] **Double Contraction Colon Operator**:
  $$W = \frac{1}{2} \boldsymbol{\sigma} : \boldsymbol{\varepsilon} = \frac{1}{2} \sigma_{ij} \varepsilon_{ij} = \frac{1}{2}\operatorname{tr}(\boldsymbol{\sigma}^T \boldsymbol{\varepsilon})$$
  - *Conflict*: The colon `:` is treated as punctuation, mapping $f: X \to Y$, or ratio $a : b$.
  - *Styling*: Color `:` between tensor matrices as the Frobenius tensor double contraction operator.
  - *Implementation*: Verified in `src/parsers/cst/rules/continuum.ts`.

- [x] **Stress & Strain Tensors**:
  $$\sigma_{ij} = \lambda \varepsilon_{kk} \delta_{ij} + 2\mu \varepsilon_{ij}, \quad \varepsilon_{ij} = \frac{1}{2}(\partial_j u_i + \partial_i u_j)$$
  - *Conflict*: Cauchy stress $\sigma_{ij}$ and strain $\varepsilon_{ij}$ look like scalar coordinates with indices.
  - *Styling*: Contextually pair $\sigma_{ij}$ and $\varepsilon_{ij}$ as symmetric 2nd-order mechanics tensors.
  - *Implementation*: Verified in `src/parsers/cst/rules/continuum.ts`.

- [x] **Fourth-Order Elasticity Tensors**:
  $$\sigma_{ij} = \mathbb{C}_{ijkl} \varepsilon_{kl} \quad \text{or} \quad \boldsymbol{\sigma} = \mathcal{C} : \boldsymbol{\varepsilon}$$
  - *Conflict*: $\mathbb{C}_{ijkl}$ looks like complex number field $\mathbb{C}$ with subscripts.
  - *Styling*: Style blackboard/calligraphic $\mathbb{C}_{ijkl}, \mathcal{C}_{ijkl}$ as 4th-order constitutive stiffness tensors.
  - *Implementation*: Verified in `src/parsers/cst/rules/continuum.ts`.

- [ ] **Hyperbolic Wave D'Alembertian**:
  $$\Box \phi = \left(\frac{1}{c^2}\frac{\partial^2}{\partial t^2} - \nabla^2\right) \phi = 0$$
  - *Conflict*: $\Box$ collides with modal logic necessity $\Box \varphi$ or Q.E.D. proof squares.
  - *Styling*: Color $\Box$ as a unified hyperbolic wave operator in PDE mode.

- [ ] **Constitutive Elasticity Parameters**:
  $$E \text{ (Young's)}, \quad \nu \text{ (Poisson's)}, \quad \lambda, \mu \text{ (Lamé constants)}, \quad K = \lambda + \frac{2}{3}\mu \text{ (Bulk)}$$
  - *Conflict*: $\lambda, \mu$ collide with eigenvalues or dynamic viscosity; $E$ collides with electric field.
  - *Styling*: Highlight as material coefficient parameters in continuum mode.

---

## ⏱️ Super-Family 3: Dynamics & Optimization

### 3.1 `ode_dynamics` — Dynamical Systems & State-Space ODEs
- [x] **Symplectic Poisson Brackets**:
  $$\dot{q}_i = \{q_i, H\} = \frac{\partial H}{\partial p_i}, \quad \dot{p}_i = \{p_i, H\} = -\frac{\partial H}{\partial q_i}$$
  - *Conflict*: $\{q, p\}$ is parsed as a set definition $\{a, b\}$.
  - *Styling*: Style $\{ \cdot, \cdot \}$ with distinct symplectic operator coloring.
  - *Implementation*: Verified in `src/parsers/cst/rules/dynamics.ts`.

- [x] **Phase Space Coordinate Pairs**:
  $$(q_i, p_i) \quad \text{(generalized position and conjugate momentum)}, \quad (\mathbf{x}, \dot{\mathbf{x}})$$
  - *Conflict*: $q$ and $p$ get unrelated random hash colors.
  - *Styling*: Harmonize $q_i$ and $p_i$ as conjugate Hamiltonian coordinates.
  - *Implementation*: Verified in `src/parsers/cst/rules/dynamics.ts`.

- [x] **Flow Evolution Time Superscripts**:
  $$\dot{x} = f(x) \implies x(t) = \Phi^t(x_0) \quad \text{or} \quad \varphi_t(x_0)$$
  - *Conflict*: Superscript $t$ in $\Phi^t$ is colored as an algebraic exponent ($\Phi$ to the power $t$).
  - *Styling*: Color $t$ as a temporal evolution parameter.
  - *Implementation*: Verified in `src/parsers/cst/rules/dynamics.ts`.

- [x] **Invariant Manifold Bundles**:
  $$W^s(p) = \{x \mid \lim_{t\to\infty} \Phi^t(x) = p\}, \quad W^u(p), \quad W^c(p), \quad E^s, E^u, E^c$$
  - *Conflict*: Superscripts $s, u, c$ are misidentified as powers.
  - *Styling*: Style $W^s, W^u, W^c$ as stable/unstable/center invariant manifold bundles.
  - *Implementation*: Verified in `src/parsers/cst/rules/dynamics.ts`.

- [x] **Wronskian Functional Determinant**:
  $$W(y_1, y_2)(t) = \det \begin{pmatrix} y_1(t) & y_2(t) \\ y_1'(t) & y_2'(t) \end{pmatrix} = y_1 y_2' - y_1' y_2$$
  - *Conflict*: $W$ collides with work in physics or generic variables.
  - *Styling*: Style $W(y_1, \dots, y_n)$ as an ODE functional determinant operator.
  - *Implementation*: Verified in `src/parsers/cst/rules/dynamics.ts`.

---

### 3.2 `optimization` — Optimization & Variational Calculus
- [x] **Subdifferential Set Operator**:
  $$\partial f(x_0) = \{ g \in \mathbb{R}^n \mid \forall y, \; f(y) \ge f(x_0) + \langle g, y - x_0 \rangle \}$$
  - *Conflict*: $\partial f(x)$ uses the exact partial derivative symbol $\partial$ applied to a function name.
  - *Styling*: Color $\partial f$ as a subgradient set operator, distinctly from derivative fractions $\frac{\partial f}{\partial x}$.
  - *Implementation*: Verified in `src/parsers/cst/rules/optimization.ts`.

- [x] **Fenchel Convex Conjugate (Dual Function)**:
  $$f^*(y) = \sup_{x \in \operatorname{dom} f} (\langle y, x \rangle - f(x))$$
  - *Conflict*: Superscript $*$ collides with complex conjugate $z^*$, matrix adjoint $A^*$, or multiplication.
  - *Styling*: Style $f^*$ as the dual Legendre-Fenchel transformation operator.
  - *Implementation*: Verified in `src/parsers/cst/rules/optimization.ts`.

- [x] **KKT Dual Multipliers**:
  $$\mathcal{L}(x, \lambda, \nu) = f_0(x) + \sum_{i=1}^m \lambda_i f_i(x) + \sum_{j=1}^p \nu_j h_j(x), \quad \lambda_i \ge 0, \; \lambda_i f_i(x^*) = 0$$
  - *Conflict*: $\lambda_i, \nu_j$ look like eigenvalues or frequencies.
  - *Styling*: Color KKT multipliers as constrained dual weights in Tokyo Coral (`palette.parameter`).
  - *Implementation*: Verified in `src/parsers/cst/rules/optimization.ts`.

- [x] **Optimal Minimizers & Values**:
  $$x^* = \arg\min_x f_0(x), \quad p^* = f_0(x^*), \quad d^* = g(\lambda^*, \nu^*)$$
  - *Conflict*: Asterisk $*$ in $x^*, p^*$ is treated as multiplication or adjoint.
  - *Styling*: Style the $*$ as an optimality indicator.
  - *Implementation*: Verified in `src/parsers/cst/rules/optimization.ts`.

- [x] **Proximal Operator**:
  $$\operatorname{prox}_{\lambda f}(v) = \arg\min_{x \in \mathbb{R}^n} \left( f(x) + \frac{1}{2\lambda} \|x - v\|_2^2 \right)$$
  - *Conflict*: $\operatorname{prox}$ is parsed as an unknown text identifier.
  - *Styling*: Highlight $\operatorname{prox}$ with subscript regularization weight $\lambda$ and function target $f$.
  - *Implementation*: Verified in `src/parsers/cst/rules/optimization.ts`.

- [x] **Regularization Norms**:
  $$\min_{\mathbf{w}} \left( \frac{1}{2n}\|\mathbf{X}\mathbf{w} - \mathbf{y}\|_2^2 + \lambda_1 \|\mathbf{w}\|_1 + \lambda_2 \|\mathbf{w}\|_2^2 \right)$$
  - *Conflict*: L1 Lasso norm $\|\mathbf{w}\|_1$ and L2 Ridge norm $\|\mathbf{w}\|_2^2$ blend with generic norms.
  - *Styling*: Distinctly highlight sparsity-inducing L1 norms from quadratic L2 penalties.
  - *Implementation*: Verified in `src/parsers/cst/rules/optimization.ts`.

---

## 🌐 Super-Family 4: Geometry & Tensors

### 4.1 `geometry_tensors` — Differential Geometry & Tensors
- [x] **Contravariant Upper Indices vs. Exponents**:
  $$V^\mu \quad \text{and} \quad T^{\mu\nu} \quad \text{vs.} \quad x^2, \; r^3$$
  $$V^\mu W_\mu = g_{\mu\nu} V^\mu W^\nu = g^{\mu\nu} V_\mu W_\nu$$
  - *Conflict*: Upper indices $T^{\mu\nu}$ are currently colored as powers (`palette.upper`).
  - *Styling*: Differentiate contravariant upper indices from powers; highlight Einstein index contraction ($\mu$ upper with $\mu$ lower).
  - *Implementation*: Verified in `src/parsers/cst/rules/geometry.ts`.

- [x] **Tensor Index Differentiation (Comma vs. Semicolon)**:
  $$A_{\mu,\nu} = \partial_\nu A_\mu = \frac{\partial A_\mu}{\partial x^\nu} \quad \text{vs.} \quad A_{\mu;\nu} = \nabla_\nu A_\mu = \partial_\nu A_\mu - \Gamma^\lambda_{\mu\nu} A_\lambda$$
  - *Conflict*: `,` and `;` inside tensor subscripts are parsed as generic punctuation.
  - *Styling*: Style the index following `,` as partial derivative, and following `;` as covariant derivative with connection.
  - *Implementation*: Verified in `src/parsers/cst/rules/geometry.ts`.

- [x] **Musical Isomorphisms (Flat $\flat$ and Sharp $\sharp$)**:
  $$X^\flat = g(X, \cdot) = g_{\mu\nu} X^\nu dx^\mu \quad (\flat \text{ lowers index}), \quad \omega^\sharp = g^{-1}(\omega, \cdot) = g^{\mu\nu} \omega_\nu \partial_\mu \quad (\sharp \text{ raises index})$$
  - *Conflict*: $\flat$ and $\sharp$ collide with musical symbols.
  - *Styling*: Style as metric-induced index raising and lowering operators.
  - *Implementation*: Verified in `src/parsers/cst/rules/geometry.ts`.

- [x] **Exterior Calculus & Differential Forms**:
  $$d(\alpha \wedge \beta) = d\alpha \wedge \beta + (-1)^p \alpha \wedge d\beta, \quad \star(dx \wedge dy) = dz$$
  - *Conflict*: Wedge $\wedge$ collides with logical AND; star $\star$ collides with multiplication.
  - *Styling*: Highlight exterior derivative $d$, wedge product $\wedge$, and Hodge dual $\star$ as exterior algebra operators.
  - *Implementation*: Verified in `src/parsers/cst/rules/geometry.ts`.

- [x] **Interior Contraction Operator**:
  $$\iota_X \omega(Y_1, \dots, Y_{k-1}) = \omega(X, Y_1, \dots, Y_{k-1}) \quad (\text{or } i_X \omega)$$
  - *Conflict*: $\iota_X$ looks like variable $\iota$ with subscript.
  - *Styling*: Colorize $\iota_X$ or $i_X$ as an interior contraction operator.
  - *Implementation*: Verified in `src/parsers/cst/rules/geometry.ts`.

- [x] **Lie Derivatives & Lie Brackets**:
  $$\mathcal{L}_X Y = [X, Y] = X Y - Y X, \quad \mathcal{L}_X \omega = (d \circ \iota_X + \iota_X \circ d) \omega$$
  - *Conflict*: $[X, Y]$ collides with commutators or intervals; $\mathcal{L}_X$ collides with Lagrangian $\mathcal{L}$.
  - *Styling*: Color $\mathcal{L}_X$ and $[X, Y]$ as directional vector field transport.
  - *Implementation*: Verified in `src/parsers/cst/rules/geometry.ts`.

---

### 4.2 `topology` — Topology & Invariants
- [x] **Nilpotent Chain Boundary Operators**:
  $$\partial_n : C_n \to C_{n-1} \quad \text{where} \quad \partial_n \circ \partial_{n+1} = 0 \quad (\partial^2 = 0)$$
  - *Conflict*: $\partial_n$ looks like a normal derivative or partial differential.
  - *Styling*: Color $\partial_n$ as an algebraic chain boundary operator.
  - *Implementation*: Verified in `src/parsers/cst/rules/topology.ts`.

- [x] **Homology Quotient Groups**:
  $$H_n(X; \mathbb{Z}) = \frac{\ker \partial_n}{\operatorname{im} \partial_{n+1}} = \frac{Z_n(X)}{B_n(X)}$$
  - *Conflict*: Fraction quotient collides with numerical division.
  - *Styling*: Highlight cycle group $Z_n$, boundary group $B_n$, and homology group $H_n$.
  - *Implementation*: Verified in `src/parsers/cst/rules/topology.ts`.

- [ ] **Cup $\smile$ and Cap $\frown$ Products**:
  $$\smile : H^p(X) \times H^q(X) \to H^{p+q}(X), \quad \frown : H_n(X) \times H^k(X) \to H_{n-k}(X)$$
  - *Conflict*: `\smile` and `\frown` are rarely recognized and left uncolored.
  - *Styling*: Style as cohomology ring and duality operations.

- [ ] **Connected Sum Manifold Operator**:
  $$M_1 \# M_2, \quad \mathbb{T}^2 \# \mathbb{T}^2 \quad (\# \text{ is topological manifold surgery})$$
  - *Conflict*: `#` collides with hashtags, markdown headers, or set cardinality.
  - *Styling*: Parse `\#` between manifolds as the connected sum topological operator.

- [x] **Topological Invariants & Characteristic Classes**:
  $$\chi(M) = V - E + F = \sum_{i=0}^n (-1)^i b_i, \quad b_i = \operatorname{rank} H_i(X), \quad \pi_1(X, x_0)$$
  - *Conflict*: $\chi$ looks like parameter chi; $b_i$ looks like generic variable.
  - *Styling*: Highlight Euler characteristic $\chi$, Betti numbers $b_i$, and fundamental group $\pi_1$.
  - *Implementation*: Verified in `src/parsers/cst/rules/topology.ts`.

---

## 🔣 Super-Family 5: Algebra & Discrete

### 5.1 `linear_algebra` — Linear Algebra & Matrix Theory
- [x] **Matrix Determinant Vertical Bars**:
  $$|A| = \det(A) = \sum_{\sigma \in S_n} \operatorname{sgn}(\sigma) \prod_{i=1}^n A_{i, \sigma(i)} \quad \text{vs. absolute value } |x|$$
  - *Conflict*: Single vertical bars around uppercase matrices $|A|$ mean volume scaling / determinant, not absolute value!
  - *Styling*: Style $|A|$ as a determinant operator, visually distinct from real $|x|$.
  - *Implementation*: Verified in `src/parsers/cst/rules/linear_algebra.ts`.

- [x] **Matrix Transformation Superscripts**:
  $$\mathbf{A}^T \text{ (Transpose)}, \quad \mathbf{A}^* / \mathbf{A}^\dagger \text{ (Adjoint)}, \quad \mathbf{A}^{-1} \text{ (Inverse)}, \quad \mathbf{A}^+ \text{ (Pseudoinverse)}$$
  $$\mathbf{A} = \mathbf{U} \mathbf{\Sigma} \mathbf{V}^T = \sum_{i=1}^r \sigma_i \mathbf{u}_i \mathbf{v}_i^T$$
  - *Conflict*: $T, *, \dagger, -1, +$ are colored as generic exponent powers (`palette.upper`).
  - *Styling*: Style with transformation operator colors (`palette.orange` / `palette.derivative`).
  - *Implementation*: Verified in `src/parsers/cst/rules/linear_algebra.ts`.

- [x] **Matrix Norms**:
  $$\|A\|_F = \sqrt{\sum_{i,j} A_{ij}^2} \text{ (Frobenius)}, \quad \|A\|_2 = \sigma_{\max}(A) \text{ (Spectral)}, \quad \|A\|_* = \sum \sigma_i \text{ (Nuclear)}$$
  - *Conflict*: Subscripts $F, 2, *$ look like standard array indices.
  - *Styling*: Highlight matrix norm subscripts with specialized norm coloring.
  - *Implementation*: Verified in `src/parsers/cst/rules/linear_algebra.ts`.

- [x] **Kronecker vs. Hadamard Matrix Products**:
  $$\mathbf{A} \otimes \mathbf{B} = \begin{pmatrix} a_{11}B & \dots \\ \dots & a_{mn}B \end{pmatrix} \quad \text{vs.} \quad \mathbf{A} \odot \mathbf{B} = [A_{ij} B_{ij}]$$
  - *Conflict*: $\otimes$ (Kronecker block tensor) and $\odot$ (Hadamard elementwise) look like generic dots/circles.
  - *Styling*: Distinctly differentiate block Kronecker from elementwise Hadamard.
  - *Implementation*: Verified in `src/parsers/cst/rules/linear_algebra.ts`.

- [x] **Schur Complements**:
  $$\mathbf{M} = \begin{pmatrix} \mathbf{A} & \mathbf{B} \\ \mathbf{C} & \mathbf{D} \end{pmatrix} \implies \mathbf{M} / \mathbf{A} = \mathbf{D} - \mathbf{C} \mathbf{A}^{-1} \mathbf{B}$$
  - *Conflict*: Slash $/$ looks like scalar numerical division.
  - *Styling*: Parse block slash elimination as Schur complement formation.
  - *Implementation*: Verified in `src/parsers/cst/rules/linear_algebra.ts`.

---

### 5.2 `abstract_algebra` — Abstract Algebra & Category Theory
- [x] **Normal Subgroups & Ring Ideals**:
  $$H \triangleleft G \iff \forall g \in G, \; g H g^{-1} = H; \quad \mathfrak{a} \triangleleft R$$
  - *Conflict*: $\triangleleft$ and $\trianglelefteq$ collide with geometric triangles.
  - *Styling*: Parse as algebraic structural sub-object relation operators.
  - *Implementation*: Verified in `src/parsers/cst/rules/abstract_algebra.ts`.

- [x] **Quotient Factor Groups & Rings**:
  $$G / N = \{ g N \mid g \in G \}, \quad R / I, \quad G / \ker(\phi) \cong \operatorname{im}(\phi)$$
  - *Conflict*: Slash $/$ looks like scalar division $a / b$.
  - *Styling*: Style capital letter quotients as algebraic factor quotient structures.
  - *Implementation*: Verified in `src/parsers/cst/rules/abstract_algebra.ts`.

- [x] **Group Orders & Subgroup Indices**:
  $$|G| = [G : H] \cdot |H| \quad (\text{Lagrange's Theorem})$$
  - *Conflict*: $|G|$ collides with absolute value; $[G : H]$ collides with bracket intervals.
  - *Styling*: Style $|G|$ as group order and $[G : H]$ as subgroup coset index.
  - *Implementation*: Verified in `src/parsers/cst/rules/abstract_algebra.ts`.

- [x] **Field Extension Degrees**:
  $$[L : K] = \dim_K(L), \quad [L : F] = [L : K] \cdot [K : F]$$
  - *Conflict*: $[L : K]$ collides with array slicing or ratios.
  - *Styling*: Parse brackets enclosing a colon as field extension dimension degree.
  - *Implementation*: Verified in `src/parsers/cst/rules/abstract_algebra.ts`.

- [x] **Group Commutator Subgroups**:
  $$[g, h] = g^{-1} h^{-1} g h \quad \text{and} \quad [G, G] = G'$$
  - *Conflict*: $[g, h]$ collides with quantum commutators $[\hat{x}, \hat{p}]$ and intervals $[a, b]$.
  - *Styling*: Style group commutators distinctly under abstract algebra mode.
  - *Implementation*: Verified in `src/parsers/cst/rules/abstract_algebra.ts`.

- [ ] **Category Theory Morphisms & Adjunctions**:
  $$A \hookrightarrow B \text{ (Monomorphism)}, \quad A \twoheadrightarrow B \text{ (Epimorphism)}, \quad F \dashv G \text{ (Adjunction)}$$
  $$\operatorname{Hom}_{\mathcal{D}}(F(C), D) \cong \operatorname{Hom}_{\mathcal{C}}(C, G(D))$$
  - *Conflict*: $\hookrightarrow, \twoheadrightarrow, \dashv$ are uncolored.
  - *Styling*: Color category arrows and adjunction pairs with functorial morphism colors.

---

### 5.3 `number_theory` — Discrete Math & Number Theory
- [x] **Divisibility Relations**:
  $$d \mid n \iff \exists k \in \mathbb{Z}, \; n = k d \quad \text{and exact divisibility } p^k \parallel n \iff p^k \mid n \text{ and } p^{k+1} \nmid n$$
  - *Conflict*: Vertical bar $\mid$ in $d \mid n$ collides with absolute value $|x|$ and conditional $\mathbb{P}(A \mid B)$.
  - *Styling*: Style $\mid$ in $d \mid n$ and $\parallel$ in $p^k \parallel n$ as divisibility relation operators.
  - *Implementation*: Verified in `src/parsers/cst/rules/number_theory.ts`.

- [x] **Legendre & Jacobi Symbols**:
  $$\left(\frac{a}{p}\right) \equiv a^{\frac{p-1}{2}} \pmod{p} \in \{-1, 0, 1\} \quad (\text{quadratic character, NOT a fraction})$$
  - *Conflict*: Written using `\left(\frac{a}{p}\right)`, but it is **not a division fraction**!
  - *Styling*: In number theory mode, colorize as an atomic quadratic residue character.
  - *Implementation*: Verified in `src/parsers/cst/rules/number_theory.ts` (`isLegendreSymbol`).

- [x] **Modular Congruence Relations**:
  $$a \equiv b \pmod{m} \iff m \mid (a - b), \quad a^{\phi(n)} \equiv 1 \pmod{n} \text{ (Euler's totient)}$$
  - *Conflict*: `\pmod{m}` blends in as plain text.
  - *Styling*: Highlight $\pmod{m}$ as an algebraic congruence modulus.
  - *Implementation*: Verified in `src/parsers/cst/rules/number_theory.ts`.

- [x] **Arithmetic Functions & Divisor Sums**:
  $$\phi(n) = n \prod_{p \mid n} \left(1 - \frac{1}{p}\right), \quad \sigma_k(n) = \sum_{d \mid n} d^k, \quad \mu(n) \text{ (Möbius)}$$
  - *Conflict*: $\sum_{d \mid n}$ has a divisibility condition in its lower bound.
  - *Styling*: Style arithmetic function names and divisor sum bounds $\sum_{d \mid n}$.
  - *Implementation*: Verified in `src/parsers/cst/rules/number_theory.ts`.

- [x] **Dirichlet Convolutions**:
  $$(f * g)(n) = \sum_{d \mid n} f(d) g\left(\frac{n}{d}\right), \quad \mu * \mathbf{1} = \delta$$
  - *Conflict*: Asterisk $*$ looks like scalar multiplication $a * b$.
  - *Styling*: Style $*$ between arithmetic functions as Dirichlet convolution.
  - *Implementation*: Verified in `src/parsers/cst/rules/number_theory.ts`.

- [x] **$p$-Adic Valuation & Norms**:
  $$v_p(n) = \max\{k \mid p^k \mid n\}, \quad |x|_p = p^{-v_p(x)}, \quad |x + y|_p \le \max(|x|_p, |y|_p)$$
  - *Conflict*: $|x|_p$ looks like vector norm or absolute value with subscript.
  - *Styling*: Style $|x|_p$ as an ultrametric non-Archimedean norm.
  - *Implementation*: Verified in `src/parsers/cst/rules/number_theory.ts`.

---

### 5.4 `logic_sets` — Logic & Set Theory
- [x] **Turnstile Hierarchy**:
  $$\Gamma \vdash \varphi \text{ (Syntactic Proof)}, \quad \mathcal{M} \models \varphi \text{ (Model Truth)}, \quad p \Vdash \varphi \text{ (Set Forcing)}$$
  - *Conflict*: Single $\vdash$, double $\models$, and forcing $\Vdash$ turnstiles are often unstyled.
  - *Styling*: Distinctly style proof, semantic entailment, and forcing relations.
  - *Implementation*: Verified in `src/parsers/cst/rules/logic.ts`.

- [x] **Modal Truth Operators**:
  $$\Box \varphi \iff \neg \Diamond \neg \varphi \quad (\Box = \text{Necessity / Gödel Provability}, \; \Diamond = \text{Possibility})$$
  - *Conflict*: $\Box$ collides with wave D'Alembertian or Q.E.D. boxes; $\Diamond$ with diamonds.
  - *Styling*: Highlight as unary modal truth qualifiers.
  - *Implementation*: Verified in `src/parsers/cst/rules/logic.ts`.

- [x] **Set-Builder Comprehension Delimiters**:
  $$\{ x \in X \mid P(x) \} \quad \text{or} \quad \{ x \in X : P(x) \}$$
  - *Conflict*: Braces and divider $\mid$ or $:$ collide with Poisson brackets or ratios.
  - *Styling*: Coordinate enclosing braces $\{ \dots \}$ and dividing bar/colon as comprehension delimiters.
  - *Implementation*: Verified in `src/parsers/cst/rules/logic.ts`.

- [x] **Set Relations & Boolean Operations**:
  $$x \in A \setminus (B \cup C) \iff x \in A \land x \notin B \land x \notin C, \quad A \subset B, \quad A \subseteq B$$
  - *Conflict*: Set difference $\setminus$ collides with spacing commands; $\cup, \cap$ with logic operators.
  - *Styling*: Color all set relations and boolean operations in Tokyo Sky Cyan (`#7dcfff`).
  - *Implementation*: Verified in `src/parsers/cst/rules/logic.ts`.

- [x] **Power Sets & Cardinalities**:
  $$\mathcal{P}(A) = 2^A = \{ S \mid S \subseteq A \}, \quad |\mathcal{P}(A)| = 2^{|A|}, \quad \aleph_0 < 2^{\aleph_0} = \mathfrak{c}$$
  - *Conflict*: $|A|$ collides with absolute value; $2^A$ looks like exponentiation.
  - *Styling*: Style power set operators and set cardinality distinctly.
  - *Implementation*: Verified in `src/parsers/cst/rules/logic.ts`.

---

## ⚛️ Super-Family 6: Quantum & Stochastics

### 6.1 `quantum` — Quantum Mechanics & Information
- [x] **Complete Dirac Bra-Ket Ecosystem**:
  $$|\psi\rangle \text{ (Ket)}, \quad \langle\phi| \text{ (Bra)}, \quad \langle\phi|\psi\rangle \text{ (Inner Product)}, \quad \langle\psi|\hat{H}|\psi\rangle \text{ (Expectation)}, \quad |\psi\rangle\langle\psi| \text{ (Projector)}$$
  - *Conflict*: Angle brackets collide with inner products or averages.
  - *Styling*: Coordinated Dirac state colors with Quantum Cyan (`#2ac3de`).
  - *Implementation*: Verified in `src/parsers/cst/rules/quantum.ts` & `src/parsers/braket.ts`.

- [x] **Quantum Commutators & Anticommutators**:
  $$[\hat{x}, \hat{p}] = i\hbar \hat{\mathbf{I}} \quad \text{vs. fermionic anticommutator } \{\hat{A}, \hat{B}\} = \hat{A}\hat{B} + \hat{B}\hat{A} = \delta_{AB} \hat{\mathbf{I}}$$
  - *Conflict*: $[\hat{x}, \hat{p}]$ collides with intervals; $\{\hat{A}, \hat{B}\}$ collides with sets.
  - *Styling*: Color quantum commutators and anticommutators with operator styling.
  - *Implementation*: Verified in `src/parsers/cst/rules/quantum.ts`.

- [x] **Creation & Annihilation Ladder Operators**:
  $$[\hat{a}, \hat{a}^\dagger] = \hat{\mathbf{I}}, \quad \hat{N} = \hat{a}^\dagger \hat{a}, \quad \hat{a}^\dagger |n\rangle = \sqrt{n+1} |n+1\rangle, \quad \hat{c}_k^\dagger, \hat{c}_k$$
  - *Conflict*: Dagger $\dagger$ is parsed as a generic exponent.
  - *Styling*: Style $a, a^\dagger$ as ladder raising/lowering operators in Fock space.
  - *Implementation*: Verified in `src/parsers/cst/rules/quantum.ts`.

- [x] **Density Matrices & Subsystem Partial Traces**:
  $$\rho = \sum_i p_i |\psi_i\rangle\langle\psi_i|, \quad \rho_A = \operatorname{Tr}_B(\rho_{AB})$$
  - *Conflict*: $\operatorname{Tr}_B$ looks like standard trace with index $B$.
  - *Styling*: Style partial trace with subsystem identifier $B$.
  - *Implementation*: Verified in `src/parsers/cst/rules/quantum.ts`.

- [x] **Spin Observables & Pauli Matrices**:
  $$\sigma_x = \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix}, \quad \sigma_y = \begin{pmatrix} 0 & -i \\ i & 0 \end{pmatrix}, \quad \sigma_z = \begin{pmatrix} 1 & 0 \\ 0 & -1 \end{pmatrix}, \quad \mathbf{S} = \frac{\hbar}{2}\boldsymbol{\sigma}$$
  - *Conflict*: $\sigma_x, \sigma_y, \sigma_z$ collide with standard deviation $\sigma$ with index.
  - *Styling*: Highlight Pauli spin matrices as Hermitian observables.
  - *Implementation*: Verified in `src/parsers/cst/rules/quantum.ts`.

---

### 6.2 `probability` — Probability & Statistics
- [x] **Conditioning Vertical Bars**:
  $$\mathbb{P}(A \mid B) = \frac{\mathbb{P}(A \cap B)}{\mathbb{P}(B)}, \quad \mathbb{E}[X \mid \mathcal{F}_t], \quad f(x \mid \theta) = L(\theta \mid x)$$
  - *Conflict*: The `\mid` or `|` bar collides with divisibility $d \mid n$ or set builder $\{x \mid P(x)\}$.
  - *Styling*: Style as probabilistic conditioning delimiter.
  - *Implementation*: Verified in `src/parsers/cst/rules/probability.ts`.

- [x] **Unified Expectation, Variance & Covariance Operators**:
  $$\operatorname{Var}(X) = \mathbb{E}[(X - \mu)^2] = \mathbb{E}[X^2] - (\mathbb{E}[X])^2, \quad \operatorname{Cov}(X, Y) = \mathbb{E}[XY] - \mathbb{E}[X]\mathbb{E}[Y]$$
  - *Conflict*: $\mathbb{E}, \operatorname{Var}, \operatorname{Cov}$ have mismatched operator styling.
  - *Styling*: Highlight as unified statistical moment operators.
  - *Implementation*: Verified in `src/parsers/cst/rules/probability.ts`.

- [x] **Distribution Families**:
  $$X \sim \mathcal{N}(\mu, \sigma^2), \quad Y \sim \operatorname{Pois}(\lambda), \quad Z \sim \operatorname{Bin}(n, p), \quad W \sim \operatorname{Beta}(\alpha, \beta)$$
  - *Conflict*: Distribution parameters blend into generic variable arguments.
  - *Styling*: Harmonize probability distribution names and their parameter tuples.
  - *Implementation*: Verified in `src/parsers/cst/rules/probability.ts`.

- [x] **Stochastic Convergence Arrows**:
  $$X_n \xrightarrow{d} X \text{ (Distribution)}, \quad X_n \xrightarrow{P} X \text{ (Probability)}, \quad X_n \xrightarrow{\text{a.s.}} X \text{ (Almost Surely)}, \quad X_n \xrightarrow{L^2} X \text{ (Mean Square)}$$
  - *Conflict*: `\xrightarrow{...}` arrows are treated as standard arrows without convergence modes.
  - *Styling*: Highlight convergence mode superscripts ($d, P, \text{a.s.}, L^p$) with probability operator styling.
  - *Implementation*: Verified in `src/parsers/cst/rules/probability.ts`.

---

### 6.3 `stochastic` — Stochastic Calculus & Itô Differentials
- [x] **Wiener Brownian Motion Differentials**:
  $$dX_t = \mu(X_t, t) \, dt + \sigma(X_t, t) \, dW_t \quad \text{where} \quad (dW_t)^2 = dt, \quad dt \cdot dW_t = 0$$
  - *Conflict*: $dW_t, dB_t$ look like standard deterministic differentials $dx$.
  - *Styling*: Highlight Brownian differentials with active stochastic diffusion styling (`palette.unit` / Teal).
  - *Implementation*: Verified in `src/parsers/cst/rules/stochastic.ts`.

- [x] **Itô vs. Stratonovich Integrals**:
  $$\text{Itô: } \int_0^T X_t \, dW_t \quad \text{vs. Stratonovich Midpoint: } \int_0^T X_t \circ dW_t = \int_0^T X_t \, dW_t + \frac{1}{2}[X, W]_T$$
  - *Conflict*: Circle $\circ$ collides with function composition $(f \circ g)(x)$.
  - *Styling*: Parse $\circ$ directly preceding a Brownian differential as the Stratonovich integration operator.
  - *Implementation*: Verified in `src/parsers/cst/rules/stochastic.ts`.

- [x] **Observable vs. Predictable Variation Processes**:
  $$\text{Observable Quadratic: } [X]_t = \lim_{\|\Pi\| \to 0} \sum_{i} (X_{t_{i+1}} - X_{t_i})^2 \quad \text{vs. Meyer Predictable: } \langle M \rangle_t$$
  - *Conflict*: $[X]_t$ collides with intervals or commutators; $\langle M \rangle_t$ collides with quantum brackets.
  - *Styling*: Style $[X]_t$ and $\langle M \rangle_t$ with subscript $t$ as stochastic variation processes.
  - *Implementation*: Verified in `src/parsers/cst/rules/stochastic.ts`.

- [x] **Financial Black-Scholes SDE Decomposition**:
  $$df(S_t, t) = \underbrace{\left(\frac{\partial f}{\partial t} + \mu S_t \frac{\partial f}{\partial S} + \frac{1}{2}\sigma^2 S_t^2 \frac{\partial^2 f}{\partial S^2}\right) dt}_{\text{Deterministic Drift Term}} + \underbrace{\sigma S_t \frac{\partial f}{\partial S} \, dW_t}_{\text{Stochastic Diffusion Term}}$$
  - *Conflict*: Drift and diffusion terms are visually indistinguishable.
  - *Styling*: Distinctly highlight deterministic drift components ($dt$) from stochastic diffusion components ($dW_t$).
  - *Implementation*: Verified in `src/parsers/cst/rules/stochastic.ts`.
