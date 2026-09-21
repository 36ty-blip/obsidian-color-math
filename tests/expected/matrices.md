# Matrix and Tensor Original Equations

## 1. Matrix-vector multiplication

$$
\textcolor{#7aa2f7}{\mathbf{y}}\textcolor{white}{=}\textcolor{#9d7cd8}{\mathbf{A}}\textcolor{#9ece6a}{\mathbf{x}}
$$

---

## 2. Matrix multiplication

$$
\textcolor{#7aa2f7}{\mathbf{C}}\textcolor{white}{=}\textcolor{#9d7cd8}{\mathbf{A}}\textcolor{#9ece6a}{\mathbf{B}}
$$

---

## 3. Matrix transpose product

$$
\textcolor{#7aa2f7}{\mathbf{G}}\textcolor{white}{=}\textcolor{#9d7cd8}{\mathbf{X}^{T}}\textcolor{#9ece6a}{\mathbf{X}}
$$

---

## 4. Linear system

$$
\textcolor{#9d7cd8}{\mathbf{A}}\textcolor{#9ece6a}{\mathbf{x}}\textcolor{white}{=}\textcolor{#7aa2f7}{\mathbf{b}}
$$

---

## 5. Matrix inverse solution

$$
\textcolor{#7aa2f7}{\mathbf{x}}\textcolor{white}{=}\textcolor{#9d7cd8}{\mathbf{A}^{-1}}\textcolor{#9ece6a}{\mathbf{b}}
$$

---

## 6. Determinant of a product

$$
\textcolor{#9d7cd8}{\det(\mathbf{A}\mathbf{B})}\textcolor{white}{=}\textcolor{#7aa2f7}{\det(\mathbf{A})}\textcolor{#9ece6a}{\det(\mathbf{B})}
$$

---

## 7. Trace cyclic property

$$
\textcolor{#9d7cd8}{\operatorname{tr}(\mathbf{A}\mathbf{B}\mathbf{C})}
\textcolor{white}{=}
\textcolor{#7aa2f7}{\operatorname{tr}(\mathbf{B}\mathbf{C}\mathbf{A})}
$$

---

## 8. Frobenius norm

$$
\textcolor{#7aa2f7}{\|\mathbf{A}\|_{F}}
\textcolor{white}{=}
\textcolor{#9d7cd8}{\sqrt{\textcolor{#e0af68}{\sum_{i=1}^{m}}\textcolor{#e0af68}{\sum_{j=1}^{n}}a_{ij}^{2}}}
$$

---

## 9. Matrix derivative of quadratic form

$$
\textcolor{#9d7cd8}{\frac{\partial}{\partial \mathbf{x}}}
\textcolor{#7aa2f7}{\left(\mathbf{x}^{T}\mathbf{A}\mathbf{x}\right)}
\textcolor{white}{=}
\textcolor{#9ece6a}{(\mathbf{A}+\mathbf{A}^{T})}\textcolor{#7aa2f7}{\mathbf{x}}
$$

---

## 10. Gradient of least squares

$$
\textcolor{#9d7cd8}{\nabla_{\mathbf{x}}}
\textcolor{#7aa2f7}{\|\mathbf{A}\mathbf{x}-\mathbf{b}\|_{2}^{2}}
\textcolor{white}{=}
\textcolor{#e0af68}{2}\textcolor{#9d7cd8}{\mathbf{A}^{T}}\textcolor{#9ece6a}{(\mathbf{A}\mathbf{x}-\mathbf{b})}
$$

---

## 11. Tensor element indexing

$$
\textcolor{#7aa2f7}{\mathcal{Y}_{ijk}}
\textcolor{white}{=}
\textcolor{#e0af68}{\sum_{p=1}^{P}}\textcolor{#e0af68}{\sum_{q=1}^{Q}}\textcolor{#e0af68}{\sum_{r=1}^{R}}
\textcolor{#9d7cd8}{\mathcal{A}_{pqr}}
\textcolor{#9ece6a}{\mathbf{U}_{ip}}
\textcolor{#9ece6a}{\mathbf{V}_{jq}}
\textcolor{#9ece6a}{\mathbf{W}_{kr}}
$$

---

## 12. Tensor contraction

$$
\textcolor{#7aa2f7}{\mathbf{C}_{ij}}
\textcolor{white}{=}
\textcolor{#e0af68}{\sum_{k=1}^{n}}
\textcolor{#9d7cd8}{\mathcal{T}_{ijk}}\textcolor{#9ece6a}{\mathbf{x}_{k}}
$$

---

## 13. Einstein summation

$$
\textcolor{#7aa2f7}{y_i}\textcolor{white}{=}\textcolor{#9d7cd8}{A_{ij}}\textcolor{#9ece6a}{x_j}
$$

---

## 14. Rank-one tensor outer product

$$
\textcolor{#7aa2f7}{\mathcal{T}}
\textcolor{white}{=}
\textcolor{#9d7cd8}{\mathbf{a}}\textcolor{white}{\otimes}\textcolor{#9ece6a}{\mathbf{b}}\textcolor{white}{\otimes}\textcolor{#e0af68}{\mathbf{c}}
$$

---

## 15. Tensor mode-1 unfolding

$$
\textcolor{#7aa2f7}{\mathbf{Y}_{(1)}}
\textcolor{white}{=}
\textcolor{#9d7cd8}{\mathbf{U}}\textcolor{#9ece6a}{\mathbf{X}_{(1)}}
\textcolor{#e0af68}{(\mathbf{W}\textcolor{white}{\otimes}\mathbf{V})^{T}}
$$
