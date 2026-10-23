# Different Very Hard Original Equations

## 1. Nested logarithmic-trigonometric power chain rule

$$
\frac{d}{dx}
\textcolor{#7aa2f7}{\left[
\ln\left(1+\cos\left(f(g(y))^p\right)\right)
\right]^q}
=
\textcolor{#e0af68}{q}
\textcolor{#7aa2f7}{\left[
\ln\left(1+\cos\left(f(g(y))^p\right)\right)
\right]^{q-1}}
\cdot
\textcolor{#bb9af7}{\frac{
-\textcolor{#bb9af7}{\sin\left(f(g(y))^p\right)}
}{
\textcolor{#e0af68}{1}+\textcolor{#bb9af7}{\cos\left(f(g(y))^p\right)}
}}
\cdot
\textcolor{#e0af68}{p} \textcolor{#7aa2f7}{f(g(y))^{p-1}}
\cdot
\textcolor{#bb9af7}{f'(g(y))}\textcolor{#9ece6a}{g'(y)}\textcolor{#9ece6a}{y'}
$$

---

## 2. Exponential of rational matrix-like scalar expression

$$
\frac{d}{dx}
\textcolor{#7aa2f7}{e^{\frac{f(y)^n}{1+g(y)^m}}}
=
\textcolor{#bb9af7}{e^{\frac{f(y)^n}{1+g(y)^m}}}
\cdot
\textcolor{#bb9af7}{\frac{
\textcolor{#e0af68}{n} \textcolor{#7aa2f7}{f(y)^{n-1}}\textcolor{#bb9af7}{f'(y)}\textcolor{#9ece6a}{y'}\textcolor{#7aa2f7}{(1+g(y)^m)}
-
\textcolor{#7aa2f7}{f(y)^n} \textcolor{#e0af68}{m} \textcolor{#7aa2f7}{g(y)^{m-1}}\textcolor{#bb9af7}{g'(y)}\textcolor{#9ece6a}{y'}
}{
\textcolor{#7aa2f7}{(1+g(y)^m)^2}
}}
$$

---

## 3. Square root of nested tangent composition

$$
\frac{d}{dx}
\textcolor{#7aa2f7}{\sqrt{
\tan\left(
\left[f(g(h(y)))\right]^n
\right)
}}
=
\textcolor{#bb9af7}{\frac{\textcolor{#e0af68}{1}}{
\textcolor{#e0af68}{2}\textcolor{#bb9af7}{\sqrt{
\tan\left(
\left[f(g(h(y)))\right]^n
\right)
}}
}}
\cdot
\textcolor{#bb9af7}{\sec^2\left(
\left[f(g(h(y)))\right]^n
\right)}
\cdot
\textcolor{#e0af68}{n}\textcolor{#7aa2f7}{\left[f(g(h(y)))\right]^{n-1}}
\cdot
\textcolor{#bb9af7}{f'(g(h(y)))}\textcolor{#9ece6a}{g'(h(y))}\textcolor{#9ece6a}{h'(y)}\textcolor{#9ece6a}{y'}
$$
