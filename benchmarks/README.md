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

| Benchmark Component | Category | Iterations | Median Latency ($\text{p50}$) | Mean Latency | 99th Percentile ($\text{p99}$) | Throughput | 144Hz Frame Budget ($6.94\,\text{ms}$) |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Live Preview Keystroke Typing** | Interactive Editing | 2,150 | **$800\,\text{ns}$** ($0.80\,\mu\text{s}$) | **$10.80\,\mu\text{s}$** | **$279.30\,\mu\text{s}$** | $92,605\,\text{ops/s}$ | **$< 0.15\%$** (p99: $4.02\%$) |
| **MPHF Catalog Lemire Lookup** | Micro-Benchmark | 50,000 | $200\,\text{ns}$ ($0.20\,\mu\text{s}$) | $0.26\,\mu\text{s}$ | $0.90\,\mu\text{s}$ | $3,827,634\,\text{ops/s}$ | $< 0.01\%$ |
| **Equation Span Engine (Warm Hits)** | Pipeline Engine | 50,000 | $500\,\text{ns}$ ($0.50\,\mu\text{s}$) | $0.72\,\mu\text{s}$ | $2.60\,\mu\text{s}$ | $1,399,216\,\text{ops/s}$ | $0.01\%$ |
| **LRU Eviction & Churn** | Cache Architecture | 5,000 | $600\,\text{ns}$ ($0.60\,\mu\text{s}$) | $0.97\,\mu\text{s}$ | $2.50\,\mu\text{s}$ | $1,032,120\,\text{ops/s}$ | $0.01\%$ |
| **Dimensionless Numbers** | Sub-Parser | 20,000 | $200\,\text{ns}$ ($0.20\,\mu\text{s}$) | $0.45\,\mu\text{s}$ | $0.80\,\mu\text{s}$ | $2,225,090\,\text{ops/s}$ | $< 0.01\%$ |
| **Differentials Parser** | Sub-Parser | 10,000 | $1.60\,\mu\text{s}$ | $2.89\,\mu\text{s}$ | $4.40\,\mu\text{s}$ | $346,251\,\text{ops/s}$ | $0.04\%$ |
| **Units Parser** | Sub-Parser | 10,000 | $3.00\,\mu\text{s}$ | $3.60\,\mu\text{s}$ | $6.50\,\mu\text{s}$ | $277,920\,\text{ops/s}$ | $0.05\%$ |
| **Delimiters & Rainbow** | Sub-Parser | 10,000 | $11.80\,\mu\text{s}$ | $13.85\,\mu\text{s}$ | $63.60\,\mu\text{s}$ | $72,194\,\text{ops/s}$ | $0.20\%$ |
| **Syntax Normalization & Typst** | Grammar & Normalization | 10,000 | $11.70\,\mu\text{s}$ | $19.41\,\mu\text{s}$ | $129.40\,\mu\text{s}$ | $51,515\,\text{ops/s}$ | $0.28\%$ |
| **Taxonomy Engine** | Sub-Parser | 5,000 | $29.80\,\mu\text{s}$ | $40.25\,\mu\text{s}$ | $194.50\,\mu\text{s}$ | $24,844\,\text{ops/s}$ | $0.58\%$ |
| **Variable Data-Flow Hash** | Sub-Parser | 5,000 | $39.20\,\mu\text{s}$ | $49.16\,\mu\text{s}$ | $241.80\,\mu\text{s}$ | $20,342\,\text{ops/s}$ | $0.71\%$ |
| **Markdown Document Scanner** | Document Parsing | 500 | $381.20\,\mu\text{s}$ | $542.76\,\mu\text{s}$ | $3,209.10\,\mu\text{s}$ | $1,842\,\text{ops/s}$ | $7.82\%$ |
| **Whole Document Undo** | Document Operations | 500 | $544.50\,\mu\text{s}$ | $762.32\,\mu\text{s}$ | $2,362.00\,\mu\text{s}$ | $1,312\,\text{ops/s}$ | $10.98\%$ |
| **Equation Span Engine (Cold)** | Pipeline Engine | 200 | $1,184.70\,\mu\text{s}$ | $2,136.71\,\mu\text{s}$ | $7,787.80\,\mu\text{s}$ | $468\,\text{ops/s}$ | $30.79\%$ |
| **Whole Document Bake** | Document Operations | 100 | $7,624.90\,\mu\text{s}$ | $7,812.41\,\mu\text{s}$ | $17,512.00\,\mu\text{s}$ | $128\,\text{ops/s}$ | One-off Batch |

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
