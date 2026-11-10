# ⚡ Obsidian Color Math — Performance Benchmarks & Frame Budget SLA

> **Target Release**: v1.0.115  
> **Frame Latency Budget SLA**: $144\,\text{Hz}$ ($\approx 6.94\,\text{ms}$ / $6,944\,\mu\text{s}$)  
> **Telemetry Source**: [`benchmark_results.json`](../benchmark_results.json) / [`benchmarks/benchmark_results.json`](benchmark_results.json)

---

## 🎯 Executive Benchmark Summary

Real-time Live Preview mathematical syntax highlighting operates with strict sub-frame latency budgets. Keystroke tokenization and decoration must yield to the compositor before the $144\,\text{Hz}$ display frame boundary ($6.94\,\text{ms}$).

* **Typing Keystroke Latency**: Mean **$10.80\,\mu\text{s}$**, Median **$800\,\text{ns}$** ($0.80\,\mu\text{s}$), and 99th percentile ($\text{p99}$) **$279.30\,\mu\text{s}$**.
* **144 Hz Frame Budget Consumption**: Live keystroke updates consume strictly **$<0.15\%$** of the available frame budget ($\text{p99} \le 4.02\%$), leaving $>99.85\%$ of the frame cycle for Obsidian's editor rendering and layout compositing.
* **Symbol Catalog Dispatch**: Lemire Minimal Perfect Hash Function (MPHF) resolves across 9,342+ symbols in **$200\,\text{ns}$** median / **$260\,\text{ns}$** mean ($3.82\times 10^6\,\text{ops/s}$).
* **Cache Architecture**: Warm LRU render cache hits resolve in **$500\,\text{ns}$** median ($1.40\times 10^6\,\text{ops/s}$).

---

## 📊 Empirical Performance Benchmark Ledger (v1.0.115)

The following ledger details the 15 discrete pipeline stages profiled under Node.js 20/22 runtime with native V8 telemetry:

<!-- BENCHMARK_TABLE_START -->
| Benchmark Component | Category | Iterations | Median Latency ($\text{p50}$) | Mean Latency | 99th Percentile ($\text{p99}$) | Throughput | 144Hz Frame Budget ($6.94\,\text{ms}$) |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| MPHF Catalog Lemire Lookup | Micro-Benchmark | 50,000 | $100\,\text{ns}$ ($0.10\,\mu\text{s}$) | $133\,\text{ns}$ ($0.13\,\mu\text{s}$) | $500\,\text{ns}$ ($0.50\,\mu\text{s}$) | $7,491,647\,\text{ops/s}$ | < 0.01% |
| Markdown Document Scanner | Document Parsing | 500 | $409.40\,\mu\text{s}$ | $455.32\,\mu\text{s}$ | $1.05\,\text{ms}$ ($1,051\,\mu\text{s}$) | $2,196\,\text{ops/s}$ | 6.56% |
| Syntax Normalization & Typst Parsing | Grammar & Normalization | 10,000 | $11.40\,\mu\text{s}$ | $17.26\,\mu\text{s}$ | $93.80\,\mu\text{s}$ | $57,945\,\text{ops/s}$ | 0.25% |
| Sub-Parser: Units Parser | Sub-Parser Breakdown | 5,000 | $3.00\,\mu\text{s}$ | $3.57\,\mu\text{s}$ | $7.80\,\mu\text{s}$ | $280,170\,\text{ops/s}$ | 0.05% |
| Sub-Parser: Differentials Parser | Sub-Parser Breakdown | 5,000 | $2.00\,\mu\text{s}$ | $4.14\,\mu\text{s}$ | $10.60\,\mu\text{s}$ | $241,423\,\text{ops/s}$ | 0.06% |
| Sub-Parser: Dimensionless Numbers | Sub-Parser Breakdown | 5,000 | $500\,\text{ns}$ ($0.50\,\mu\text{s}$) | $714\,\text{ns}$ ($0.71\,\mu\text{s}$) | $2.30\,\mu\text{s}$ | $1,400,678\,\text{ops/s}$ | 0.01% |
| Sub-Parser: Delimiters & Rainbow | Sub-Parser Breakdown | 5,000 | $12.00\,\mu\text{s}$ | $17.79\,\mu\text{s}$ | $91.50\,\mu\text{s}$ | $56,212\,\text{ops/s}$ | 0.26% |
| Sub-Parser: Taxonomy Engine | Sub-Parser Breakdown | 5,000 | $31.40\,\mu\text{s}$ | $43.69\,\mu\text{s}$ | $192.90\,\mu\text{s}$ | $22,891\,\text{ops/s}$ | 0.63% |
| Sub-Parser: Variable Data-Flow Hash | Sub-Parser Breakdown | 5,000 | $41.50\,\mu\text{s}$ | $50.31\,\mu\text{s}$ | $188.70\,\mu\text{s}$ | $19,875\,\text{ops/s}$ | 0.72% |
| Equation Span Engine (Cold Cache) | Pipeline Engine | 13 | $1.07\,\text{ms}$ ($1,068\,\mu\text{s}$) | $1.41\,\text{ms}$ ($1,414\,\mu\text{s}$) | $4.00\,\text{ms}$ ($4,000\,\mu\text{s}$) | $707\,\text{ops/s}$ | 20.36% |
| Equation Span Engine (Warm Cache Hits) | Pipeline Engine | 50,000 | $500\,\text{ns}$ ($0.50\,\mu\text{s}$) | $554\,\text{ns}$ ($0.55\,\mu\text{s}$) | $1.30\,\mu\text{s}$ | $1,803,960\,\text{ops/s}$ | < 0.01% |
| Whole Document Bake (convertText) | Document Operations | 100 | $8.50\,\text{ms}$ ($8,505\,\mu\text{s}$) | $9.15\,\text{ms}$ ($9,154\,\mu\text{s}$) | $39.99\,\text{ms}$ ($39,989\,\mu\text{s}$) | $109\,\text{ops/s}$ | One-off Batch |
| Whole Document Undo (uncolorText) | Document Operations | 500 | $1.10\,\text{ms}$ ($1,104\,\mu\text{s}$) | $1.20\,\text{ms}$ ($1,202\,\mu\text{s}$) | $2.89\,\text{ms}$ ($2,888\,\mu\text{s}$) | $832\,\text{ops/s}$ | 17.30% |
| **Live Preview Keystroke Typing** | Interactive Editing | 2,150 | **$1.20\,\mu\text{s}$** | **$23.94\,\mu\text{s}$** | **$862.70\,\mu\text{s}$** | $41,774\,\text{ops/s}$ | **< 0.15%** (p99: 12.42%) |
| LRU Eviction & High-Capacity Churn | Cache Architecture | 5,000 | $1.40\,\mu\text{s}$ | $1.91\,\mu\text{s}$ | $5.40\,\mu\text{s}$ | $524,411\,\text{ops/s}$ | 0.03% |
| 970-Document Multi-Page University Math Corpus | Real-World Stress | 970 | $11.35\,\text{ms}$ ($11,353\,\mu\text{s}$) | $17.93\,\text{ms}$ ($17,932\,\mu\text{s}$) | $107.16\,\text{ms}$ ($107,156\,\mu\text{s}$) | $56\,\text{ops/s}$ | 258.22% |
<!-- BENCHMARK_TABLE_END -->

---

## 🛠️ Reproducing the Benchmarks Locally

### 1. Whole-Plugin Profiler Suite
Runs the comprehensive 15-stage benchmark suite and updates `benchmark_results.json`:
```bash
npm run bench
```
*(Executes `esbuild.bench.mjs` $\to$ `dist/perf_runner.cjs` with `--expose-gc`)*

### 2. High-Frequency Keystroke Profiler
Simulates continuous keystroke prefixes across 2,373 mathematical macro fragments:
```bash
npm run profile:keystroke
```

### 3. CST Throughput Micro-Benchmarks
Runs Vitest benchmark suite targeting the Concrete Syntax Tree (CST) engine:
```bash
npx vitest bench benchmarks/cst_engine.bench.ts
```
