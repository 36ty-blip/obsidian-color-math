#!/usr/bin/env node
/**
 * Unified Non-Interactive AI & CLI Test Orchestrator for Color Math
 *
 * Covers ALL 94 test targets in a single deterministic CLI:
 *   • 83 Vitest Unit, Integration & Parity Suites across 7 Semantic Stages (Stages 1–7)
 *   • 11 Standalone Multi-Threaded Corpus Audits, Bijective/Navigation Harnesses & Profilers (Stage 8)
 *
 * Modern AI-Friendly Features:
 *   • Low-token structured output with failure payloads & copy-pasteable rerun hints
 *   • Failure state persistence & instant rerun: `node scripts/run_tests.mjs --failed`
 *   • Pre-flight invariant protection: runs `scripts/generate_constructors.mjs` before tests
 *   • Sub-10ms dry-run discovery & introspection (`--help`, `--list`)
 *   • Dynamic CPU load scaling up to 50% (6 worker threads when system load <= 36%)
 *
 * Run `node scripts/run_tests.mjs --help` to view the complete catalog of all 94 tests.
 */

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Normalize Windows drive letter to uppercase (e.g., C:\...) to prevent Vitest 1.6 drive-letter casing bug
function normalizeWindowsRoot(p) {
  const resolved = path.resolve(p);
  if (/^[a-z]:/.test(resolved)) {
    return resolved[0].toUpperCase() + resolved.slice(1);
  }
  return resolved;
}

const PROJECT_ROOT = normalizeWindowsRoot(path.resolve(__dirname, ".."));
const PROJECT_ROOT_POSIX = PROJECT_ROOT.replace(/\\/g, "/");
const TESTS_DIR = path.join(PROJECT_ROOT, "tests");
const GENERATED_DIR = path.join(TESTS_DIR, "generated");
const LAST_RUN_FILE = path.join(GENERATED_DIR, ".last_run.json");
const PYTHON_VENV_EXE = "C:\\Users\\aditya\\Documents\\CODES\\Python\\Math\\.venv\\Scripts\\python.exe";

// ============================================================================
// 1. COMPLETE CATALOG OF ALL 7 VITEST STAGES (83 SUITES)
// ============================================================================
const VITEST_STAGES = [
  {
    id: 1,
    key: "tensor",
    aliases: ["1", "stage1", "tensor", "spatial", "nav", "tri-engine"],
    title: "Stage 1: 3D/4D Spatial Tensor, Bijective Provenance & Tri-Engine Navigation",
    suites: [
      { file: "quaternion_navigation.test.ts", desc: "4D Quaternion spatial navigation & directional cursor transitions" },
      { file: "spatial_tensor.test.ts", desc: "3D/4D spatial tensor coordinate projection & layout topology" },
      { file: "spatial_tensor_bijective.test.ts", desc: "Bijective source-to-DOM & DOM-to-source tensor isomorphism" },
      { file: "underover_tensor.test.ts", desc: "Under/over script & limit stacking tensor coordinates" },
      { file: "mathjax_v4_tensor.test.ts", desc: "MathJax v4 CHTML wrapper tag tensor mapping" },
      { file: "tri_engine_navigation.test.ts", desc: "Tri-Engine (M1 DOM Class, M2 WeakMap, M3 On-Demand CST) navigation parity" },
      { file: "real_mathjax_navigation.test.ts", desc: "Real MathJax CHTML live preview click navigation & sugar source mapping" },
      { file: "tri_engine.test.ts", desc: "Core Tri-Engine consensus & fallback resolution" },
      { file: "dom_stamper.test.ts", desc: "MathJax CHTML DOM stamping & provenance attribute injection" },
      { file: "lazy_navigation.test.ts", desc: "On-demand O(1)/O(N) lazy CST cursor navigation" },
      { file: "interceptor.test.ts", desc: "Pointer/click & keyboard event interceptor for live math widgets" },
      { file: "fourier_series_bijective.test.ts", desc: "Bijective provenance on complex Fourier series & nested summations" },
      { file: "quaternion_fourier_adversarial.test.ts", desc: "Adversarial quaternion & Fourier tensor stress cases" },
    ],
  },
  {
    id: 2,
    key: "cst",
    aliases: ["2", "stage2", "cst", "parser", "delimiters", "autoseal"],
    title: "Stage 2: CST Parser, Structural Grammar, Delimiters & Auto-Seal",
    suites: [
      { file: "cst_parser.test.ts", desc: "Core Concrete Syntax Tree (CST) parser & lossless token spans" },
      { file: "sprint2_cst.test.ts", desc: "CST Sprint 2: nested groups, scripts & fraction structures" },
      { file: "sprint3_cst.test.ts", desc: "CST Sprint 3: environments, matrices & alignment blocks" },
      { file: "sprint4_cst.test.ts", desc: "CST Sprint 4: macro expansion & multi-argument constructors" },
      { file: "sprint5_cst.test.ts", desc: "CST Sprint 5: edge-case recovery & malformed LaTeX resilience" },
      { file: "properties_cst.test.ts", desc: "Property-based (fast-check) CST round-trip & span invariants" },
      { file: "delimiters.test.ts", desc: "Rainbow delimiter depth tracking & \\left/\\right pairing" },
      { file: "delimiters_combinations.test.ts", desc: "Nested combinatoric delimiter & fence permutations" },
      { file: "lookahead_gating_and_autoseal.test.ts", desc: "Two-sided lookahead gating & unclosed delimiter auto-sealing" },
      { file: "boxed.test.ts", desc: "\\boxed & enclosing frame structural parsing" },
    ],
  },
  {
    id: 3,
    key: "domain",
    aliases: ["3", "stage3", "domain", "taxonomy", "physics", "units", "roles"],
    title: "Stage 3: Mathematical Taxonomy, Physics, Units, Differentials & Operators",
    suites: [
      { file: "taxonomy.test.ts", desc: "Mathematical taxonomy classification (functions, parameters, constants, indices)" },
      { file: "sixteen_roles.test.ts", desc: "Full 16 semantic color role orthogonal assignment verification" },
      { file: "ambiguity_matrix.test.ts", desc: "Contextual disambiguation matrix for overloaded mathematical symbols" },
      { file: "ascii_operators.test.ts", desc: "ASCII relational, arithmetic & arrow operator tokenization" },
      { file: "boundary_domain.test.ts", desc: "Token boundary & domain bitmask resolution" },
      { file: "braket_dimensionless.test.ts", desc: "Dirac Bra-Ket (\\langle|\\rangle) & dimensionless group parsing" },
      { file: "differentials.test.ts", desc: "Differential operators (dx, \\partial, \\nabla) & derivative fractions" },
      { file: "physics.test.ts", desc: "Physics package macros, tensors, quantum operators & vectors" },
      { file: "syntactic_sugar.test.ts", desc: "Fast syntactic sugar expansion & shorthand normalization" },
      { file: "units.test.ts", desc: "SI units, compound \\mathrm/\\pu units & single-letter unit gating" },
      { file: "variable_hash.test.ts", desc: "Variable data-flow deterministic hashing & color stability" },
      { file: "catalog.test.ts", desc: "Lemire MPHF catalog lookup, role & tag ID verification" },
      { file: "custom_definitions.test.ts", desc: "User-defined macros (\\newcommand, \\def, \\DeclareMathOperator)" },
      { file: "unicode_converter.test.ts", desc: "Unicode math symbol to LaTeX canonicalization" },
    ],
  },
  {
    id: 4,
    key: "editor",
    aliases: ["4", "stage4", "editor", "cm6", "themes", "settings", "undo"],
    title: "Stage 4: CodeMirror 6 Decorations, Modes, Multiblock, Themes & Undo",
    suites: [
      { file: "modes.test.ts", desc: "Active domain modes (Physics, Chemistry, CS, Pure Math) & frontmatter detection" },
      { file: "multiblock.test.ts", desc: "Multi-block markdown scanning & cross-block state isolation" },
      { file: "multiline_alignment_neighbor.test.ts", desc: "Multiline align/gather & alignment neighbor coloring" },
      { file: "interleaved_math.test.ts", desc: "Interleaved inline/display math within complex markdown prose/tables" },
      { file: "frontmatter.test.ts", desc: "YAML frontmatter parsing & per-note configuration overrides" },
      { file: "inline_tooltip.test.ts", desc: "Hover/cursor inline math tooltip & preview widget rendering" },
      { file: "ide_styler_parity.test.ts", desc: "Live CM6 IDE syntax styler vs static MathJax output parity" },
      { file: "natural_none_color.test.ts", desc: "'none' / natural inherit color role bypass verification" },
      { file: "theme_colors.test.ts", desc: "Dark/Light theme palette contrast & CSS variable resolution" },
      { file: "style_settings_schema.test.ts", desc: "Obsidian Style Settings plugin YAML schema validation" },
      { file: "settings_definitions.test.ts", desc: "Plugin settings definitions, defaults & Zod schema integrity" },
      { file: "settings_heuristics.test.ts", desc: "Settings heuristic toggles & option dependency propagation" },
      { file: "settings_reorganization.test.ts", desc: "Settings UI tab structure & migration compatibility" },
      { file: "config_tolerance.test.ts", desc: "Corrupted/partial data.json config tolerance & fallback recovery" },
      { file: "undo_comprehensive.test.ts", desc: "Lossless uncolorText (\\color / \\textcolor stripping) round-trip" },
      { file: "public_api.test.ts", desc: "Exported plugin public API surface & inter-plugin contract" },
    ],
  },
  {
    id: 5,
    key: "cache",
    aliases: ["5", "stage5", "cache", "keystroke", "regression", "integration"],
    title: "Stage 5: Bootloader, Render/Session Cache, Keystroke Gateway & Regression",
    suites: [
      { file: "bootloader_deferral.test.ts", desc: "Startup bootloader deferral & non-blocking plugin initialization" },
      { file: "render_cache.test.ts", desc: "L1/L2 LRU render cache hit/miss & eviction invariants" },
      { file: "session_cache.test.ts", desc: "Per-session AST/CST & span cache residency" },
      { file: "keystroke_gateway_telemetry.test.ts", desc: "144Hz (6.94ms) keystroke gateway SLA & telemetry counters" },
      { file: "math_engines.test.ts", desc: "MathJax 4 & KaTeX dual-engine validation & error handling" },
      { file: "features.test.ts", desc: "End-to-end feature integration matrix across all options" },
      { file: "fixtures.test.ts", desc: "Golden markdown fixture (tests/original -> tests/expected) regression" },
      { file: "self_test.test.ts", desc: "TypeScript port of core repository self-test invariants" },
      { file: "regression_audit.test.ts", desc: "Historical bug tracker & corpus edge-case regression suite" },
      { file: "release_pipeline.test.ts", desc: "Version bump, manifest sync & release pipeline verification" },
      { file: "tier1_fixes.test.ts", desc: "Tier-1 critical parser & decorator stability fixes" },
      { file: "quick_wins.test.ts", desc: "High-frequency macro & UX quick-win regression checks" },
      { file: "debug_user_issues.test.ts", desc: "User-reported complex equation reproduction cases" },
      { file: "issue4_vec.test.ts", desc: "Issue #4 \\vec / accent brace wrapping & subscript interaction" },
      { file: "user_formula.test.ts", desc: "Real-world user formula collection verification" },
      { file: "vault_real_world.test.ts", desc: "Live Obsidian vault note sampling & decoration stability" },
      { file: "mcp.test.ts", desc: "Model Context Protocol / external tool bridge integration tests" },
    ],
  },
  {
    id: 6,
    key: "dialects",
    aliases: ["6", "stage6", "dialects", "typst", "stress", "bench"],
    title: "Stage 6: Typst Syntax, Extreme Adversarial, Stress & Speed Benchmarks",
    suites: [
      { file: "typst_syntax.test.ts", desc: "Typst math dialect syntax parsing & semantic coloring" },
      { file: "extreme_adversarial.test.ts", desc: "Deeply nested (50+ levels), malformed & adversarial inputs" },
      { file: "hardcore_stress.test.ts", desc: "High-volume throughput & memory pressure stress tests" },
      { file: "stress_normalizer.test.ts", desc: "normalizeMathSyntax stress & idempotency verification" },
      { file: "performance.test.ts", desc: "Sub-millisecond parsing & decoration latency assertions" },
      { file: "benchmark_speed.test.ts", desc: "Core converter & tokenizer micro-benchmark assertions" },
      { file: "bridge_bench.test.ts", desc: "TS-to-WASM bridge serialization & call overhead benchmark" },
    ],
  },
  {
    id: 7,
    key: "wasm",
    aliases: ["7", "stage7", "wasm", "rust"],
    title: "Stage 7: Rust WebAssembly Parity & Engine Toggle",
    suites: [
      { file: "wasm_catalog_parity.test.ts", desc: "Rust WASM vs TypeScript catalog lookup 100% parity" },
      { file: "wasm_cst_parity.test.ts", desc: "Rust WASM vs TypeScript CST parser span parity" },
      { file: "wasm_delimiters_parity.test.ts", desc: "Rust WASM vs TypeScript rainbow delimiter parity" },
      { file: "wasm_engine.test.ts", desc: "WASM binary initialization, memory safety & lifecycle" },
      { file: "wasm_lexer_parity.test.ts", desc: "Rust WASM vs TypeScript lexer token stream parity" },
      { file: "wasm_sugar_parity.test.ts", desc: "Rust WASM vs TypeScript syntactic sugar parity" },
      { file: "wasm_toggle.test.ts", desc: "Runtime live switching between TS and WASM engines" },
    ],
  },
];

// ============================================================================
// 2. COMPLETE CATALOG OF STANDALONE MULTI-THREADED AUDITS & HARNESSES (11)
// ============================================================================
const STANDALONE_AUDITS = [
  {
    id: "corpus_audit",
    aliases: ["corpus_audit", "cobs", "cobs_audit", "corpus"],
    script: "tests/corpus_audit.ts",
    runner: "tsx",
    desc: "COBS / Full-Spectrum 16-Role Corpus Audit (MathJax 4 + CM6 RangeSet monotonicity across 10,500+ notes)",
    flagsHint: "[--corpus=<subfolder>] [--threads=<N>] [--all-errors]",
    supportedFlags: ["--corpus", "--threads", "--all-errors"],
  },
  {
    id: "corpus_bijective_audit",
    aliases: ["corpus_bijective_audit", "bidirectional", "bijective", "bijective_audit", "ablation"],
    script: "scripts/corpus_bijective_audit.ts",
    runner: "tsx",
    desc: "Bidirectional / 16-Schema Bijective & Causal Ablation Corpus Audit (Decoupled M1/M2/M3 + 26-Tag breakdown)",
    flagsHint: "[corpus_path] [--threads=<N>]",
    supportedFlags: ["--threads"],
    takesPositionalPath: true,
  },
  {
    id: "corpus_navigation_audit",
    aliases: ["corpus_navigation_audit", "navigation", "nav_audit", "corpus_nav"],
    script: "scripts/corpus_navigation_audit.ts",
    runner: "tsx",
    desc: "Full-Corpus Tri-Engine Navigation & 4D Tensor Audit (M1 DOM, M2 WeakMap, M3 On-Demand CST + Semantic Oracle)",
    flagsHint: "[--limit=<N>] [--corpus=<subfolder>] [--threads=<N>] [--stream-telemetry] [--no-fail]",
    supportedFlags: ["--limit", "--corpus", "--threads", "--stream-telemetry", "--telemetry", "--no-fail"],
  },
  {
    id: "corpus_keystroke_audit",
    aliases: ["corpus_keystroke_audit", "keystroke_corpus", "corpus_keystroke"],
    script: "scripts/corpus_keystroke_audit.ts",
    runner: "tsx",
    desc: "Real-World Corpus Keystroke Stress Audit (Character-by-character S[0..1]..S[0..N] slicing across 6,392+ notes)",
    flagsHint: "",
    supportedFlags: [],
  },
  {
    id: "corpus_split_audit",
    aliases: ["corpus_split_audit", "split_audit", "bench_split"],
    script: "tests/corpus_split_audit.ts",
    runner: "tsx",
    desc: "Multi-Threaded Engine Split Benchmark (Isolating Pure TS, Rust WASM, and Native MathJax 4 across corpus)",
    flagsHint: "[--threads=<N>]",
    supportedFlags: ["--threads"],
  },
  {
    id: "keystroke_prefix_audit",
    aliases: ["keystroke_prefix_audit", "prefix_audit", "keystroke_prefix"],
    script: "tests/keystroke_prefix_audit.ts",
    runner: "tsx",
    desc: "Character-by-Character Multi-Stage Macro Keystroke Prefix Audit (Radicals, Fractions, Styling, Arrows)",
    flagsHint: "",
    supportedFlags: [],
  },
  {
    id: "keystroke_profiler",
    aliases: ["keystroke_profiler", "profiler", "profile_keystroke"],
    script: "scripts/keystroke_profiler.ts",
    runner: "tsx",
    desc: "Multi-Threaded Keystroke Gateway Profiler, Two-Sided Gate Telemetry & Hysteresis Transition Harness",
    flagsHint: "",
    supportedFlags: [],
  },
  {
    id: "profile_token_matrix",
    aliases: ["profile_token_matrix", "token_matrix"],
    script: "tests/profile_token_matrix.ts",
    runner: "tsx",
    desc: "Multi-Threaded Exhaustive Feature & Permutation Token Matrix Profiler across the corpus",
    flagsHint: "",
    supportedFlags: [],
  },
  {
    id: "perf_runner",
    aliases: ["perf_runner", "perf", "full_bench"],
    script: "tests/perf_runner.ts",
    runner: "bench",
    desc: "Whole-Plugin Performance, CPU/RAM Resource & Latency Percentile Profiling Suite (builds & runs dist/perf_runner.cjs)",
    flagsHint: "",
    supportedFlags: [],
  },
  {
    id: "vault_suite_runner",
    aliases: ["vault_suite_runner", "vault_runner"],
    script: "tests/vault_suite_runner.mjs",
    runner: "tsx",
    desc: "Real-World Obsidian Vault Bake (convertText) & Uncolor (uncolorText) Verification Runner",
    flagsHint: "",
    supportedFlags: [],
  },
  {
    id: "python_self_test",
    aliases: ["python_self_test", "py_test", "python"],
    script: "tests/self_test.py",
    runner: "python",
    desc: "Python Reference Engine Regression Suite (via .venv\\Scripts\\python.exe)",
    flagsHint: "",
    supportedFlags: [],
  },
];

// ============================================================================
// 3. HELP & FULL CATALOG PRINTER (--help / --list)
// ============================================================================
function printHelpAndCatalog() {
  const totalVitest = VITEST_STAGES.reduce((acc, s) => acc + s.suites.length, 0);
  const totalAudits = STANDALONE_AUDITS.length;

  console.log(`====================================================================================
🚀 COLOR MATH UNIFIED AI & CLI TEST ORCHESTRATOR (${totalVitest + totalAudits} TOTAL TEST TARGETS)
====================================================================================
Non-interactive, deterministic test launcher built for fast AI agent & CLI usage.
Automatically measures 3s system CPU load and allocates up to 50% CPU (6 worker
threads on the 12-thread i5-13420H) when background CPU load <= 36%.

USAGE:
  node scripts/run_tests.mjs [flags] [test_names_or_audit_aliases...]

CORE FLAGS:
  --help, -h                Show this full usage guide and complete catalog of all ${totalVitest + totalAudits} tests
  --list, -l                List matching tests/stages without executing them (0ms dry-run)
  --stage <id|name,...>     Run specific semantic stage(s): 1..7, tensor, cst, domain, editor, cache, dialects, wasm, or 8/audits
  --audit <name,...>        Run specific standalone corpus/bijective/navigation audit(s) (see Stage 8 below)
  --all                     Run all ${totalVitest} Vitest suites (Stages 1-7) AND all ${totalAudits} standalone audits
  --failed, -f              Rerun ONLY the suites and audits that failed during the last execution
  --threads, -t <N>         Override worker thread count (1..12; default: auto 6 threads when CPU <= 36%)
  --batch, -b <N>           Suites per Vitest batch (default: per-stage batching, or 1 with --sequential)
  --sequential, -s          Execute matched test suites strictly one-by-one (batch size = 1)
  --bail                    Stop immediately on the first failing test suite or stage
  --compact, -c             AI-optimized concise output (suppresses passing noise, prints failures in full)
  --json                    Emit final machine-readable JSON summary report at the end of the run
  --no-generate             Skip automatic pre-flight dictionary constructor generation (scripts/generate_constructors.mjs)
  --pass-args "<args>"      Extra CLI flags forwarded to standalone audit scripts (e.g. "--limit=500 --no-fail")

QUICK AI / CLI EXAMPLES:
  # 1. Run all 83 Vitest unit/integration/parity suites across all 7 stages:
  node scripts/run_tests.mjs

  # 2. Run the COBS (Full-Spectrum Corpus) Audit, Bidirectional (Bijective) Audit, or Navigation Audit:
  node scripts/run_tests.mjs cobs
  node scripts/run_tests.mjs bidirectional
  node scripts/run_tests.mjs navigation
  node scripts/run_tests.mjs navigation --limit=500 --no-fail

  # 3. Rerun ONLY the tests that failed on the last run:
  node scripts/run_tests.mjs --failed
  node scripts/run_tests.mjs --failed --compact

  # 4. Run specific semantic stages (by stage number or name):
  node scripts/run_tests.mjs --stage 1,2 --bail
  node scripts/run_tests.mjs --stage tensor,wasm --compact

  # 5. Run any combination of specific unit tests or fuzzy substrings:
  node scripts/run_tests.mjs quaternion_navigation spatial_tensor_bijective tri_engine_navigation
  node scripts/run_tests.mjs --sequential stamper lookahead
`);

  console.log(`====================================================================================
📦 PART 1: STANDALONE MULTI-THREADED CORPUS, BIJECTIVE & NAVIGATION AUDITS (STAGE 8)
====================================================================================
Invoke any audit directly by its ID or alias: e.g. \`node scripts/run_tests.mjs <alias>\`
`);

  for (const audit of STANDALONE_AUDITS) {
    const aliasStr = audit.aliases.join(", ");
    console.log(`  • ${audit.id.padEnd(26)} [Aliases: ${aliasStr}]`);
    console.log(`    Script : ${audit.script}`);
    console.log(`    Desc   : ${audit.desc}`);
    if (audit.flagsHint) {
      console.log(`    Flags  : node scripts/run_tests.mjs ${audit.aliases[1] || audit.id} ${audit.flagsHint}`);
    }
    console.log("");
  }

  console.log(`====================================================================================
🧪 PART 2: ALL ${totalVitest} VITEST UNIT, INTEGRATION & PARITY SUITES (STAGES 1–7)
====================================================================================
Invoke an entire stage via \`--stage <id|key>\` or any individual test via \`node scripts/run_tests.mjs <name>\`
`);

  for (const stage of VITEST_STAGES) {
    console.log(`------------------------------------------------------------------------------------`);
    console.log(`${stage.title} (${stage.suites.length} suites)`);
    console.log(`Stage Flag: --stage ${stage.id}  OR  --stage ${stage.key}   (Aliases: ${stage.aliases.join(", ")})`);
    console.log(`------------------------------------------------------------------------------------`);
    for (const s of stage.suites) {
      const shortName = s.file.replace(/\.test\.ts$/, "");
      console.log(`  • ${shortName.padEnd(36)} ${s.desc}`);
    }
    console.log("");
  }

  // Also check if any new .test.ts files exist on disk that aren't in VITEST_STAGES yet
  const catalogedSet = new Set(VITEST_STAGES.flatMap((st) => st.suites.map((s) => s.file)));
  if (fs.existsSync(TESTS_DIR)) {
    const uncataloged = fs
      .readdirSync(TESTS_DIR)
      .filter((f) => f.endsWith(".test.ts") && !catalogedSet.has(f))
      .sort();
    if (uncataloged.length > 0) {
      console.log(`------------------------------------------------------------------------------------`);
      console.log(`Dynamic Uncategorized Suites (${uncataloged.length} suite(s) auto-discovered in tests/)`);
      console.log(`------------------------------------------------------------------------------------`);
      for (const f of uncataloged) {
        console.log(`  • ${f.replace(/\.test\.ts$/, "").padEnd(36)} (Auto-discovered Vitest suite)`);
      }
      console.log("");
    }
  }
  console.log(`====================================================================================`);
}

// ============================================================================
// 4. PRE-FLIGHT INVARIANT & CPU LOAD PROBES
// ============================================================================
function runPreflightConstructors() {
  const genScript = path.join(PROJECT_ROOT, "scripts", "generate_constructors.mjs");
  if (!fs.existsSync(genScript)) return;
  try {
    execFileSync(process.execPath, [genScript], {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
      env: { ...process.env, FORCE_COLOR: "0" },
    });
  } catch (err) {
    console.error("[Test Orchestrator] Warning: Pre-flight generate_constructors failed:", err.message);
  }
}

function measureCpuUsage3s() {
  function snap() {
    return os.cpus().reduce(
      (acc, c) => ({
        idle: acc.idle + c.times.idle,
        total: acc.total + Object.values(c.times).reduce((a, b) => a + b, 0),
      }),
      { idle: 0, total: 0 }
    );
  }
  const s1 = snap();
  return new Promise((resolve) => {
    setTimeout(() => {
      const s2 = snap();
      const idle = s2.idle - s1.idle;
      const total = s2.total - s1.total;
      const pct = total > 0 ? (1 - idle / total) * 100 : 0;
      resolve(Number(pct.toFixed(1)));
    }, 3000);
  });
}

// ============================================================================
// 5. FAILURE STATE CACHE MANAGEMENT (.last_run.json)
// ============================================================================
function saveLastRunState(failedSuites, failedAudits) {
  try {
    if (!fs.existsSync(GENERATED_DIR)) {
      fs.mkdirSync(GENERATED_DIR, { recursive: true });
    }
    const payload = {
      timestamp: new Date().toISOString(),
      failedSuites,
      failedAudits,
      allFailed: [...failedSuites, ...failedAudits],
    };
    fs.writeFileSync(LAST_RUN_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    // Non-fatal cache write failure
  }
}

function loadLastRunState() {
  if (!fs.existsSync(LAST_RUN_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(LAST_RUN_FILE, "utf8"));
  } catch {
    return null;
  }
}

// ============================================================================
// 6. CLI ARGUMENT PARSER
// ============================================================================
function parseArgs(argv) {
  let help = false;
  let listOnly = false;
  let runAllIncludingAudits = false;
  let rerunFailed = false;
  let noGenerate = false;
  let threads = null;
  let batchSize = null;
  let sequential = false;
  let bail = false;
  let compact = false;
  let json = false;
  const stages = [];
  const audits = [];
  const patterns = [];
  const forwardArgs = [];
  const auditTargetPaths = new Map(); // auditId -> positional path argument

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--list" || arg === "-l") {
      listOnly = true;
    } else if (arg === "--all") {
      runAllIncludingAudits = true;
    } else if (arg === "--failed" || arg === "-f" || arg === "--last-failed" || arg === "--rerun-failed") {
      rerunFailed = true;
    } else if (arg === "--no-generate") {
      noGenerate = true;
    } else if (arg === "--threads" || arg === "-t") {
      threads = parseInt(argv[++i], 10);
    } else if (arg.startsWith("--threads=")) {
      threads = parseInt(arg.split("=")[1], 10);
      forwardArgs.push(arg);
    } else if (arg === "--batch" || arg === "-b") {
      batchSize = parseInt(argv[++i], 10);
    } else if (arg.startsWith("--batch=")) {
      batchSize = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--sequential" || arg === "-s") {
      sequential = true;
    } else if (arg === "--bail") {
      bail = true;
    } else if (arg === "--compact" || arg === "-c") {
      compact = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--stage" || arg === "--stages") {
      const list = (argv[++i] || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      stages.push(...list);
    } else if (arg.startsWith("--stage=") || arg.startsWith("--stages=")) {
      const list = arg.split("=")[1].split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      stages.push(...list);
    } else if (arg === "--audit" || arg === "--audits") {
      const list = (argv[++i] || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      audits.push(...list);
    } else if (arg.startsWith("--audit=") || arg.startsWith("--audits=")) {
      const list = arg.split("=")[1].split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      audits.push(...list);
    } else if (arg === "--pass-args") {
      const extra = (argv[++i] || "").split(/\s+/).filter(Boolean);
      forwardArgs.push(...extra);
    } else if (arg.startsWith("--pass-args=")) {
      const extra = arg.slice("--pass-args=".length).split(/\s+/).filter(Boolean);
      forwardArgs.push(...extra);
    } else if (arg === "--tests") {
      const list = (argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
      patterns.push(...list);
    } else if (
      arg.startsWith("--limit=") ||
      arg.startsWith("--corpus=") ||
      arg.startsWith("--telemetry=") ||
      arg === "--stream-telemetry" ||
      arg === "--no-fail" ||
      arg === "--all-errors"
    ) {
      forwardArgs.push(arg);
    } else if (!arg.startsWith("-")) {
      patterns.push(...arg.split(",").map((s) => s.trim()).filter(Boolean));
    }
  }

  return {
    help,
    listOnly,
    runAllIncludingAudits,
    rerunFailed,
    noGenerate,
    threads,
    batchSize,
    sequential,
    bail,
    compact,
    json,
    stages,
    audits,
    patterns,
    forwardArgs,
    auditTargetPaths,
  };
}

// ============================================================================
// 7. TARGET RESOLUTION (STAGES, AUDITS, --failed & FUZZY SUITE MATCHING)
// ============================================================================
function resolveTargets(opts) {
  const allDiskVitest = fs.existsSync(TESTS_DIR)
    ? fs.readdirSync(TESTS_DIR).filter((f) => f.endsWith(".test.ts")).sort()
    : [];

  const selectedAuditMap = new Map();
  const selectedStageGroups = [];
  const seenVitestFiles = new Set();

  function findStandaloneAudit(token) {
    const clean = token.toLowerCase().replace(/^scripts[\\/]|^tests[\\/]/, "").replace(/\.(ts|mjs|py)$/, "");
    return STANDALONE_AUDITS.find(
      (a) => a.id.toLowerCase() === clean || a.aliases.some((al) => al.toLowerCase() === clean)
    );
  }

  // Handle --failed (rerun only failing targets from .last_run.json)
  if (opts.rerunFailed) {
    const lastRun = loadLastRunState();
    if (!lastRun || (lastRun.failedSuites.length === 0 && lastRun.failedAudits.length === 0)) {
      console.log("=================================================================");
      console.log("✨ ALL PREVIOUS TESTS PASSED! No failing tests recorded in cache.");
      console.log(`Cache: ${LAST_RUN_FILE}`);
      console.log("=================================================================");
      process.exit(0);
    }

    if (!opts.compact && !opts.json) {
      console.log(`[Test Orchestrator] Loaded ${lastRun.allFailed.length} failing target(s) from previous run (${lastRun.timestamp})`);
    }

    for (const f of lastRun.failedSuites) {
      const base = path.basename(f);
      if (allDiskVitest.includes(base) && !seenVitestFiles.has(base)) {
        seenVitestFiles.add(base);
      }
    }
    if (seenVitestFiles.size > 0) {
      selectedStageGroups.push({
        label: `Rerun Failed Suites (${seenVitestFiles.size} suite${seenVitestFiles.size > 1 ? "s" : ""})`,
        files: Array.from(seenVitestFiles).map((f) => `tests/${f}`),
      });
    }
    for (const aId of lastRun.failedAudits) {
      const found = findStandaloneAudit(aId);
      if (found) selectedAuditMap.set(found.id, found);
    }

    return {
      stageGroups: selectedStageGroups,
      audits: Array.from(selectedAuditMap.values()),
    };
  }

  // 1. Explicit --audit flags
  for (const aToken of opts.audits) {
    if (aToken === "all" || aToken === "8" || aToken === "stage8") {
      for (const a of STANDALONE_AUDITS) selectedAuditMap.set(a.id, a);
    } else {
      const found = findStandaloneAudit(aToken);
      if (found) {
        selectedAuditMap.set(found.id, found);
      } else {
        console.error(`[Test Orchestrator] Warning: Unknown standalone audit "${aToken}"`);
      }
    }
  }

  // 2. Explicit --stage flags
  for (const stToken of opts.stages) {
    if (stToken === "8" || stToken === "stage8" || stToken === "audits" || stToken === "audit") {
      for (const a of STANDALONE_AUDITS) selectedAuditMap.set(a.id, a);
      continue;
    }
    const matchedStage = VITEST_STAGES.find(
      (st) => st.id === Number(stToken) || st.key === stToken || st.aliases.includes(stToken)
    );
    if (matchedStage) {
      const files = matchedStage.suites
        .map((s) => s.file)
        .filter((f) => allDiskVitest.includes(f) && !seenVitestFiles.has(f));
      files.forEach((f) => seenVitestFiles.add(f));
      if (files.length > 0) {
        selectedStageGroups.push({
          label: matchedStage.title,
          files: files.map((f) => `tests/${f}`),
        });
      }
    } else {
      console.error(`[Test Orchestrator] Warning: Unknown stage "${stToken}"`);
    }
  }

  // 3. Positional arguments resolution with smart path routing for standalone audits
  const unmatchedPatterns = [];
  for (let pIdx = 0; pIdx < opts.patterns.length; pIdx++) {
    const pat = opts.patterns[pIdx];
    const auditMatch = findStandaloneAudit(pat);
    if (auditMatch) {
      selectedAuditMap.set(auditMatch.id, auditMatch);
      // Check if the next token is a positional path for audits that take one (e.g. bidirectional tests/corpus/...)
      if (auditMatch.takesPositionalPath && pIdx + 1 < opts.patterns.length) {
        const nextPat = opts.patterns[pIdx + 1];
        if (!findStandaloneAudit(nextPat) && (fs.existsSync(nextPat) || nextPat.includes("/") || nextPat.includes("\\"))) {
          opts.auditTargetPaths.set(auditMatch.id, nextPat);
          pIdx++; // Consumed path argument
        }
      }
      continue;
    }
    unmatchedPatterns.push(pat);
  }

  if (unmatchedPatterns.length > 0) {
    const matchedFiles = [];
    for (const pat of unmatchedPatterns) {
      const clean = pat.replace(/^tests[\\/]/, "").replace(/\.test\.ts$/, "");
      const matches = allDiskVitest.filter(
        (f) =>
          f === pat ||
          f === `${clean}.test.ts` ||
          f.toLowerCase().includes(clean.toLowerCase())
      );
      if (matches.length === 0) {
        console.error(`[Test Orchestrator] Warning: No test suite or audit matched "${pat}"`);
      }
      for (const m of matches) {
        if (!seenVitestFiles.has(m)) {
          seenVitestFiles.add(m);
          matchedFiles.push(`tests/${m}`);
        }
      }
    }
    if (matchedFiles.length > 0) {
      selectedStageGroups.push({
        label: `Custom Filter (${matchedFiles.length} suite${matchedFiles.length > 1 ? "s" : ""})`,
        files: matchedFiles,
      });
    }
  }

  // 4. Default when no specific stage, audit, or pattern was requested: run all 7 Vitest stages
  const nothingRequested =
    opts.stages.length === 0 && opts.audits.length === 0 && opts.patterns.length === 0;

  if (nothingRequested || opts.runAllIncludingAudits) {
    for (const st of VITEST_STAGES) {
      const files = st.suites
        .map((s) => s.file)
        .filter((f) => allDiskVitest.includes(f) && !seenVitestFiles.has(f));
      files.forEach((f) => seenVitestFiles.add(f));
      if (files.length > 0) {
        selectedStageGroups.push({
          label: st.title,
          files: files.map((f) => `tests/${f}`),
        });
      }
    }
    const extras = allDiskVitest.filter((f) => !seenVitestFiles.has(f));
    if (extras.length > 0) {
      extras.forEach((f) => seenVitestFiles.add(f));
      selectedStageGroups.push({
        label: "Stage 7+: Auto-Discovered Suites",
        files: extras.map((f) => `tests/${f}`),
      });
    }
    if (opts.runAllIncludingAudits) {
      for (const a of STANDALONE_AUDITS) {
        selectedAuditMap.set(a.id, a);
      }
    }
  }

  return {
    stageGroups: selectedStageGroups,
    audits: Array.from(selectedAuditMap.values()),
  };
}

// ============================================================================
// 8. FAILURE PAYLOAD EXTRACTOR (FOR AI-AGENT LOW-TOKEN CONSUMPTION)
// ============================================================================
function extractFailuresFromOutput(rawText, suiteFiles, targetName) {
  const clean = rawText.replace(/\x1b\[[0-9;]*m/g, "");
  const failures = [];

  // 1. Vitest assertion failure blocks (FAIL tests/xxx.test.ts > suite > test name)
  const failBlocks = clean.split(/(?=FAIL\s+tests[\\/])/);
  for (const block of failBlocks) {
    if (!block.startsWith("FAIL")) continue;
    const headerMatch = block.match(/FAIL\s+(tests[\\/][^\s]+)\s+>\s+([^>\n]+)(?:>\s*([^\n]+))?/);
    const file = headerMatch ? headerMatch[1] : suiteFiles[0] || targetName;
    const testName = headerMatch ? (headerMatch[3] ? `${headerMatch[2]} > ${headerMatch[3]}` : headerMatch[2]).trim() : "Unknown Test";

    const errorMatch = block.match(/(AssertionError:[^\n]+|Error:[^\n]+)/);
    const message = errorMatch ? errorMatch[1].trim() : "Test assertion failed";

    const lineColMatch = block.match(/at\s+[^\n]+(tests[\\/][^\s:]+):(\d+):(\d+)/);
    const line = lineColMatch ? parseInt(lineColMatch[2], 10) : undefined;
    const col = lineColMatch ? parseInt(lineColMatch[3], 10) : undefined;

    const diffMatch = block.match(/-\s+Expected[^\n]*\n\+\s+Received[^\n]*/);
    const diff = diffMatch ? diffMatch[0] : undefined;

    const shortName = path.basename(file, ".test.ts");
    failures.push({
      target: file,
      testName,
      line,
      col,
      message,
      diff,
      rerunHint: `node scripts/run_tests.mjs ${shortName}`,
    });
  }

  // Fallback: If no structured Vitest blocks matched, extract general error lines
  if (failures.length === 0 && clean.length > 0) {
    const errorLines = clean.split("\n").filter((l) => /error:|assertionerror:|fail/i.test(l)).slice(0, 5);
    const firstSuite = suiteFiles[0] || targetName;
    const shortName = path.basename(firstSuite, ".test.ts");
    failures.push({
      target: firstSuite,
      testName: targetName,
      message: errorLines.join(" | ") || "Execution failed with non-zero exit code",
      rerunHint: `node scripts/run_tests.mjs ${shortName}`,
    });
  }

  return failures;
}

// ============================================================================
// 9. SUBPROCESS RUNNERS (VITEST & STANDALONE AUDITS)
// ============================================================================
function runVitestBatch(testFiles, threads) {
  return new Promise((resolve) => {
    const vitestBin = path.join(PROJECT_ROOT, "node_modules", "vitest", "vitest.mjs");
    const args = [
      vitestBin,
      "run",
      "--root",
      PROJECT_ROOT_POSIX,
      `--poolOptions.threads.maxThreads=${threads}`,
      `--poolOptions.threads.minThreads=1`,
      ...testFiles,
    ];

    const startTime = performance.now();
    const child = spawn(process.execPath, args, {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      const durationMs = Math.round(performance.now() - startTime);
      resolve({ code: code ?? 1, stdout, stderr, durationMs });
    });
  });
}

function runStandaloneAudit(audit, threads, forwardArgs, positionalPath, compact) {
  return new Promise((resolve) => {
    const scriptPath = path.join(PROJECT_ROOT, audit.script);
    const tsxCli = path.join(PROJECT_ROOT, "node_modules", "tsx", "dist", "cli.mjs");

    let cmd = process.execPath;
    let args = [];

    // Filter forwardArgs to only those supported by this audit
    const applicableArgs = forwardArgs.filter((a) => {
      const flagName = a.split("=")[0];
      return audit.supportedFlags && audit.supportedFlags.includes(flagName);
    });

    // Thread routing: if supported and not already in applicableArgs, pass --threads
    if (
      audit.supportedFlags &&
      audit.supportedFlags.includes("--threads") &&
      !applicableArgs.some((a) => a.startsWith("--threads"))
    ) {
      applicableArgs.push(`--threads=${threads}`);
    }

    const pathArg = positionalPath ? [positionalPath] : [];

    if (audit.runner === "tsx") {
      if (fs.existsSync(tsxCli)) {
        args = [tsxCli, scriptPath, ...applicableArgs, ...pathArg];
      } else {
        cmd = process.platform === "win32" ? "npx.cmd" : "npx";
        args = ["tsx", scriptPath, ...applicableArgs, ...pathArg];
      }
    } else if (audit.runner === "bench") {
      const benchBuild = path.join(PROJECT_ROOT, "esbuild.bench.mjs");
      const perfCjs = path.join(PROJECT_ROOT, "dist", "perf_runner.cjs");
      args = [
        "-e",
        `const { execFileSync } = require('child_process'); execFileSync(process.execPath, [${JSON.stringify(benchBuild)}], { stdio: 'inherit', cwd: ${JSON.stringify(PROJECT_ROOT)} }); execFileSync(process.execPath, ['--expose-gc', ${JSON.stringify(perfCjs)}], { stdio: 'inherit', cwd: ${JSON.stringify(PROJECT_ROOT)} });`,
      ];
    } else if (audit.runner === "python") {
      cmd = fs.existsSync(PYTHON_VENV_EXE) ? PYTHON_VENV_EXE : "python";
      args = [scriptPath, ...applicableArgs, ...pathArg];
    } else {
      args = [scriptPath, ...applicableArgs, ...pathArg];
    }

    // Node on Windows refuses to spawn .cmd files directly without a shell (CVE-2024-27980)
    const useShell = process.platform === "win32" && /\.cmd$/i.test(cmd);
    if (useShell) {
      cmd = [cmd, ...args].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(" ");
      args = [];
    }

    const startTime = performance.now();
    const child = spawn(cmd, args, {
      cwd: PROJECT_ROOT,
      stdio: compact ? ["ignore", "pipe", "pipe"] : "inherit",
      env: { ...process.env, FORCE_COLOR: "0" },
      shell: useShell,
    });

    child.on("error", (err) => {
      const durationMs = Math.round(performance.now() - startTime);
      resolve({ code: 1, stdout: "", stderr: `[spawn error] ${err.message}`, durationMs });
    });

    let stdout = "";
    let stderr = "";

    if (compact) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on("close", (code) => {
      const durationMs = Math.round(performance.now() - startTime);
      resolve({ code: code ?? 1, stdout, stderr, durationMs });
    });
  });
}

// ============================================================================
// 10. MAIN ORCHESTRATOR ENTRYPOINT
// ============================================================================
async function main() {
  const opts = parseArgs(process.argv.slice(2));

  // Sub-10ms Introspection Fast-Path
  if (opts.help) {
    printHelpAndCatalog();
    process.exit(0);
  }

  const { stageGroups, audits } = resolveTargets(opts);

  // Flatten stage groups into execution batches depending on --sequential or --batch
  const executionBatches = [];
  for (const grp of stageGroups) {
    if (opts.sequential) {
      for (const f of grp.files) {
        executionBatches.push({
          label: `${grp.label} -> ${path.basename(f, ".test.ts")}`,
          files: [f],
        });
      }
    } else if (opts.batchSize && opts.batchSize > 0) {
      for (let i = 0; i < grp.files.length; i += opts.batchSize) {
        const slice = grp.files.slice(i, i + opts.batchSize);
        executionBatches.push({
          label: `${grp.label} (Batch ${Math.floor(i / opts.batchSize) + 1})`,
          files: slice,
        });
      }
    } else {
      executionBatches.push(grp);
    }
  }

  const totalVitestFiles = executionBatches.reduce((acc, b) => acc + b.files.length, 0);

  if (opts.listOnly) {
    console.log("=================================================================");
    console.log("🔍 MATCHED TEST TARGETS (--list dry-run)");
    console.log("=================================================================");
    console.log(`• Vitest Suites Matched : ${totalVitestFiles} across ${executionBatches.length} stage batch(es)`);
    for (let i = 0; i < executionBatches.length; i++) {
      const b = executionBatches[i];
      console.log(`  [${i + 1}] ${b.label}: ${b.files.map((f) => path.basename(f, ".test.ts")).join(", ")}`);
    }
    console.log(`• Standalone Audits     : ${audits.length}`);
    for (const a of audits) {
      const posPath = opts.auditTargetPaths.get(a.id);
      console.log(`  [Audit] ${a.id} (${a.script})${posPath ? ` TargetPath: ${posPath}` : ""} — ${a.desc}`);
    }
    console.log("=================================================================");
    process.exit(0);
  }

  if (totalVitestFiles === 0 && audits.length === 0) {
    console.error("[Test Orchestrator] No matching test suites or audits found. Run with --help to see all 94 tests.");
    process.exit(1);
  }

  // Pre-flight invariant check: generate macro dictionary constructors unless bypassed
  if (totalVitestFiles > 0 && !opts.noGenerate) {
    if (!opts.compact && !opts.json) {
      console.log("⚙️  Running pre-flight constructor generation (generate_constructors.mjs)...");
    }
    runPreflightConstructors();
  }

  // Dynamic CPU load probe (libuv os.cpus() 3s window)
  const totalCores = os.cpus().length;
  const halfCores = Math.max(1, Math.floor(totalCores * 0.5));
  let threads = opts.threads;
  let cpuAvg = null;

  if (!threads || Number.isNaN(threads) || threads < 1) {
    cpuAvg = await measureCpuUsage3s();
    if (cpuAvg <= 36.0) {
      threads = halfCores; // 50% CPU allocation (6 threads on 12-thread i5-13420H)
    } else {
      const remainingPct = Math.max(0.15, (100 - cpuAvg) / 100);
      threads = Math.max(1, Math.min(halfCores, Math.floor(totalCores * remainingPct * 0.5)));
    }
  } else {
    threads = Math.min(totalCores, Math.max(1, threads));
  }

  if (!opts.compact && !opts.json) {
    console.log("=================================================================");
    console.log("🚀 COLOR MATH UNIFIED MULTI-THREADED TEST ORCHESTRATOR");
    console.log("=================================================================");
    if (cpuAvg !== null) {
      console.log(`• 3s System CPU Average : ${cpuAvg}% (<= 36% threshold -> up to 50% CPU allowed)`);
    }
    console.log(`• Worker Threads        : ${threads} / ${totalCores} logical cores`);
    if (totalVitestFiles > 0) {
      console.log(`• Vitest Test Suites    : ${totalVitestFiles} files across ${executionBatches.length} stage(s)`);
    }
    if (audits.length > 0) {
      console.log(`• Standalone Audits     : ${audits.length} (${audits.map((a) => a.id).join(", ")})`);
    }
    console.log("=================================================================\n");
  }

  const stageResults = [];
  const auditResults = [];
  const allExtractedFailures = [];
  const failedSuiteFiles = [];
  const failedAuditIds = [];
  let totalFailedStages = 0;
  const overallStart = performance.now();

  // Execute Vitest stage batches
  for (let b = 0; b < executionBatches.length; b++) {
    const batch = executionBatches[b];
    const suiteNames = batch.files.map((f) => path.basename(f, ".test.ts")).join(", ");
    const label = `[${b + 1}/${executionBatches.length}] ${batch.label} (${batch.files.length} suite${batch.files.length > 1 ? "s" : ""})`;
    if (!opts.json) {
      console.log(`▶ ${label}`);
      if (!opts.compact) {
        console.log(`  Suites: ${suiteNames}`);
      }
    }

    const res = await runVitestBatch(batch.files, threads);
    const cleanOut = res.stdout.replace(/\x1b\[[0-9;]*m/g, "");
    const passedMatch = cleanOut.match(/Tests\s+(?:(\d+)\s+failed\s+\|\s+)?(\d+)\s+passed/);
    const failedTests = passedMatch && passedMatch[1] ? parseInt(passedMatch[1], 10) : 0;
    const passedTests = passedMatch && passedMatch[2] ? parseInt(passedMatch[2], 10) : 0;

    const status = res.code === 0 ? "PASS ✅" : "FAIL ❌";
    if (!opts.json) {
      console.log(`  └─ ${status} in ${(res.durationMs / 1000).toFixed(2)}s (${passedTests} passed, ${failedTests} failed)\n`);
    }

    if (res.code !== 0) {
      totalFailedStages++;
      failedSuiteFiles.push(...batch.files);
      const extracted = extractFailuresFromOutput(res.stdout + "\n" + res.stderr, batch.files, batch.label);
      allExtractedFailures.push(...extracted);

      if (!opts.json) {
        console.error("--- Stage Failure Diagnostic ---");
        for (const fail of extracted) {
          console.error(`  ❌ ${fail.target}${fail.line ? `:${fail.line}` : ""} -> ${fail.testName}`);
          console.error(`     Error : ${fail.message}`);
          if (fail.diff) console.error(`     Diff  : ${fail.diff}`);
          console.error(`     Hint  : ${fail.rerunHint}\n`);
        }
        if (!opts.compact) {
          console.error(res.stdout);
          if (res.stderr) console.error(res.stderr);
        }
      }

      if (opts.bail) {
        if (!opts.json) console.error("[Test Orchestrator] Stopping early due to --bail.");
        break;
      }
    }

    stageResults.push({
      stage: b + 1,
      label: batch.label,
      suites: batch.files.length,
      passedTests,
      failedTests,
      durationMs: res.durationMs,
      ok: res.code === 0,
    });
  }

  // Execute Standalone Audits (if any were selected and we haven't bailed)
  if (!(opts.bail && totalFailedStages > 0)) {
    for (let a = 0; a < audits.length; a++) {
      const audit = audits[a];
      const posPath = opts.auditTargetPaths.get(audit.id);
      if (!opts.json) {
        console.log(`▶ [Audit ${a + 1}/${audits.length}] ${audit.id} (${audit.script})${posPath ? ` [Target: ${posPath}]` : ""}...`);
      }
      const res = await runStandaloneAudit(audit, threads, opts.forwardArgs, posPath, opts.compact || opts.json);
      const status = res.code === 0 ? "PASS ✅" : "FAIL ❌";
      if (!opts.json) {
        console.log(`  └─ ${status} (${audit.id}) in ${(res.durationMs / 1000).toFixed(2)}s\n`);
      }
      if (res.code !== 0) {
        totalFailedStages++;
        failedAuditIds.push(audit.id);
        const extracted = extractFailuresFromOutput(res.stdout + "\n" + res.stderr, [audit.script], audit.id);
        allExtractedFailures.push(...extracted);

        if (!opts.json) {
          console.error(`--- Audit Failure Diagnostic (${audit.id}) ---`);
          for (const fail of extracted) {
            console.error(`  ❌ ${fail.target} -> ${fail.testName}`);
            console.error(`     Error : ${fail.message}`);
            console.error(`     Hint  : node scripts/run_tests.mjs ${audit.id}\n`);
          }
          if (!opts.compact) {
            console.error(res.stdout);
            if (res.stderr) console.error(res.stderr);
          }
        }

        if (opts.bail) {
          if (!opts.json) console.error("[Test Orchestrator] Stopping early due to --bail.");
          break;
        }
      }
      auditResults.push({
        id: audit.id,
        script: audit.script,
        durationMs: res.durationMs,
        ok: res.code === 0,
      });
    }
  }

  // Save failing state for instant --failed rerun
  saveLastRunState(failedSuiteFiles, failedAuditIds);

  const totalDurationSec = Number(((performance.now() - overallStart) / 1000).toFixed(2));
  const totalPassedTests = stageResults.reduce((acc, r) => acc + r.passedTests, 0);
  const totalFailedTests = stageResults.reduce((acc, r) => acc + r.failedTests, 0);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ok: totalFailedStages === 0,
          cpuAverage3s: cpuAvg,
          threads,
          totalDurationSec,
          vitest: {
            stagesCompleted: stageResults.length,
            stagesTotal: executionBatches.length,
            passedAssertions: totalPassedTests,
            failedAssertions: totalFailedTests,
            stages: stageResults,
          },
          audits: auditResults,
          failures: allExtractedFailures,
          lastRunStateSaved: LAST_RUN_FILE,
        },
        null,
        2
      )
    );
  } else {
    console.log("=================================================================");
    console.log("📊 FINAL TEST ORCHESTRATION SUMMARY");
    console.log("=================================================================");
    if (executionBatches.length > 0) {
      console.log(`• Vitest Stages    : ${stageResults.length} / ${executionBatches.length} completed`);
      console.log(`• Total Assertions : ${totalPassedTests} passed | ${totalFailedTests} failed`);
    }
    if (audits.length > 0) {
      const auditsPassed = auditResults.filter((r) => r.ok).length;
      console.log(`• Standalone Audits: ${auditsPassed} / ${audits.length} passed`);
    }
    console.log(`• Total Wall Time  : ${totalDurationSec}s (Threads: ${threads})`);
    console.log(`• Overall Status   : ${totalFailedStages === 0 ? "100% PASS ✅" : `${totalFailedStages} TARGET(S) FAILED ❌`}`);
    if (totalFailedStages > 0) {
      console.log(`• Rerun Failures   : node scripts/run_tests.mjs --failed`);
    }
    console.log("=================================================================");
  }

  process.exit(totalFailedStages === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[Test Orchestrator] Fatal error:", err);
  process.exit(1);
});
