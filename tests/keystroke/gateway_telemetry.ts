// tests/keystroke/gateway_telemetry.ts
// Precision nanosecond telemetry instrumentation for the Priority Gateway Race
// Measures isolated unconditional metrics (Phase 1) and sequential cascade tournament (Phase 2)
// Captures asymmetric branch latencies (C_yes vs C_no) and computes the Huffman Probability-to-Cost ratio (R_i = P_yes / E[C])

import { lookupCatalog } from "../../src/parsers/catalog";

export interface TwoSidedGateMetrics {
  gateId: string;
  name: string;
  evaluations: number;
  hitsYes: number;
  hitsNo: number;
  totalNsYes: bigint;
  totalNsNo: bigint;
  costYesNs: number;
  costNoNs: number;
  expectedCostNs: number;
  probabilityYes: number;
  ratio: number; // P_yes / E[Cost] (decisions per nanosecond)
  optimalRank?: number;
  currentRank?: number;
}

export interface CascadeRaceResult {
  totalKeystrokes: number;
  totalCascadeNs: bigint;
  meanKeystrokeNs: number;
  winnerDistribution: Record<string, number>;
  isolatedMetrics: TwoSidedGateMetrics[];
  cascadeMetrics: TwoSidedGateMetrics[];
  optimalPermutation: string[];
}

export class KeystrokeGatewayTelemetry {
  private timerOverheadNs: number = 0;

  constructor() {
    this.calibrateTimer();
  }

  /**
   * Calibrates baseline timer loop overhead by measuring 100,000 back-to-back hrtime calls.
   */
  private calibrateTimer(): void {
    const N = 100_000;
    const start = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      process.hrtime.bigint();
    }
    const end = process.hrtime.bigint();
    this.timerOverheadNs = Math.max(0, Number(end - start) / N);
  }

  public getTimerOverheadNs(): number {
    return this.timerOverheadNs;
  }

  /**
   * Gate 1: Sovereign TeX Backslash Fast-Path
   * Says YES if character is '\\' (0.3ns)
   */
  public evalGate1(text: string, index: number): boolean {
    return index < text.length && text.charCodeAt(index) === 92; // '\\'
  }

  /**
   * Gate 2: Single-Letter Atom Bailout (L = 1)
   * Says YES (bails out) if word length is 1 (e.g. x, y, z)
   */
  public evalGate2(wordLen: number): boolean {
    return wordLen === 1;
  }

  /**
   * Gate 3: Immediate Touching Operator / Closing Fence Bailout
   * Says YES (bails out) if the character touching the word is an operator or closing fence (no space)
   */
  public evalGate3(text: string, end: number): boolean {
    if (end >= text.length) return false;
    const ch = text.charCodeAt(end);
    return (
      ch === 41 || // ')'
      ch === 93 || // ']'
      ch === 125 || // '}'
      ch === 44 || // ','
      ch === 59 || // ';'
      ch === 36 || // '$'
      ch === 43 || // '+'
      ch === 45 || // '-'
      ch === 61 || // '='
      ch === 60 || // '<'
      ch === 62 || // '>'
      ch === 42    // '*'
    );
  }

  /**
   * Gate 4: Structural Opening Delimiter Follower Gate
   * Says YES (passes) if immediately followed by '(', '[', '{', '^', or space
   * (Returns true if valid follower, false if invalid bail)
   */
  public evalGate4(text: string, end: number): boolean {
    if (end >= text.length) return false;
    const ch = text.charCodeAt(end);
    return (
      ch === 40 || // '('
      ch === 91 || // '['
      ch === 123 || // '{'
      ch === 94 || // '^'
      ch === 32 || // ' '
      ch === 9     // '\t'
    );
  }

  /**
   * Gate 5: Spaced Follower Guard
   * Handles space: if followed by space, ensures Tier 1 length <= 4 and followed by valid argument leader
   * Says YES (bails out) if space is followed by an operator/invalid follower, or word is too long
   */
  public evalGate5(text: string, start: number, end: number, wordLen: number): boolean {
    if (end >= text.length) return false;
    const ch = text.charCodeAt(end);
    if (ch !== 32 && ch !== 9) return false; // not a space case

    const firstChar = text.charCodeAt(start);
    if (wordLen > 4 || firstChar < 97 || firstChar > 122) {
      return true; // Bail out: long word or not lowercase
    }

    let p = end;
    while (p < text.length && (text.charCodeAt(p) === 32 || text.charCodeAt(p) === 9)) {
      p++;
    }
    if (p >= text.length) return true; // Bail out: trailing whitespace, no argument yet

    const afterSpace = text.charCodeAt(p);
    // If not a valid argument leader, bail out!
    const isValidLeader =
      afterSpace === 40 || // '('
      afterSpace === 91 || // '['
      afterSpace === 123 || // '{'
      afterSpace === 92 || // '\'
      (afterSpace >= 48 && afterSpace <= 57) || // digit
      (afterSpace >= 65 && afterSpace <= 90) || // A-Z
      (afterSpace >= 97 && afterSpace <= 122);  // a-z

    return !isValidLeader; // bails out if invalid
  }

  /**
   * Gate 3+5 Unified: Whitespace-Skipping Operator & Closing Fence Bailout
   * Skips optional whitespace once, then checks if follower is operator or closing fence.
   */
  public evalGate3Unified(text: string, end: number): boolean {
    let p = end;
    while (p < text.length && (text.charCodeAt(p) === 32 || text.charCodeAt(p) === 9)) {
      p++;
    }
    if (p >= text.length) return false;
    const ch = text.charCodeAt(p);
    return (
      ch === 41 || // ')'
      ch === 93 || // ']'
      ch === 125 || // '}'
      ch === 44 || // ','
      ch === 59 || // ';'
      ch === 36 || // '$'
      ch === 43 || // '+'
      ch === 45 || // '-'
      ch === 61 || // '='
      ch === 60 || // '<'
      ch === 62 || // '>'
      ch === 42    // '*'
    );
  }

  /**
   * Gate 6: Lemire MPHF Catalog Query
   * Computes FNV-1a hash + displacement table lookup in L1 cache
   * Says YES if catalog entry exists and is function/operator
   */
  public evalGate6(word: string): boolean {
    const entry = lookupCatalog(word.toLowerCase());
    return entry !== null && (entry.role === "function" || entry.role === "operator");
  }

  /**
   * Runs Phase 1 (Isolated Unconditional Measurement) across a token sample.
   * Every gate is evaluated independently on 100% of tokens without short-circuiting.
   */
  public measureIsolatedGates(
    tokens: { text: string; start: number; end: number; word: string }[],
    iterations: number = 20
  ): TwoSidedGateMetrics[] {
    const gateDefs = [
      { id: "Gate1_Backslash", name: "Gate 1: Backslash Fast-Path (\\)" },
      { id: "Gate2_Len1Bail", name: "Gate 2: Single-Letter Bailout (L=1)" },
      { id: "Gate3_ImmediateOp", name: "Gate 3: Touching Operator Bailout" },
      { id: "Gate4_OpeningFence", name: "Gate 4: Structural Follower Check" },
      { id: "Gate5_SpacedGuard", name: "Gate 5: Spaced Argument Guard" },
      { id: "Gate6_LemireMphf", name: "Gate 6: Lemire MPHF Catalog Query" },
      { id: "Gate3_Unified", name: "Gate 3-Unified: Whitespace-Skipping Op Bailout" },
    ];

    const stats: Record<
      string,
      {
        evals: number;
        yes: number;
        no: number;
        nsYes: bigint;
        nsNo: bigint;
      }
    > = {};

    for (const g of gateDefs) {
      stats[g.id] = { evals: 0, yes: 0, no: 0, nsYes: 0n, nsNo: 0n };
    }

    // Warm-up JIT
    for (let i = 0; i < Math.min(tokens.length, 50); i++) {
      const t = tokens[i];
      this.evalGate1(t.text, t.start);
      this.evalGate2(t.word.length);
      this.evalGate3(t.text, t.end);
      this.evalGate4(t.text, t.end);
      this.evalGate5(t.text, t.start, t.end, t.word.length);
      this.evalGate6(t.word);
      this.evalGate3Unified(t.text, t.end);
    }

    // Helper for safe BigInt non-negative cost
    const calcCost = (e: bigint, s: bigint): bigint => {
      const diff = e - s - BigInt(Math.round(this.timerOverheadNs));
      return diff > 0n ? diff : 0n;
    };

    // Measurement loops
    for (let iter = 0; iter < iterations; iter++) {
      for (const t of tokens) {
        // Measure Gate 1
        let s = process.hrtime.bigint();
        const r1 = this.evalGate1(t.text, t.start);
        let e = process.hrtime.bigint();
        let cost = calcCost(e, s);
        stats["Gate1_Backslash"].evals++;
        if (r1) {
          stats["Gate1_Backslash"].yes++;
          stats["Gate1_Backslash"].nsYes += cost;
        } else {
          stats["Gate1_Backslash"].no++;
          stats["Gate1_Backslash"].nsNo += cost;
        }

        // Measure Gate 2
        s = process.hrtime.bigint();
        const r2 = this.evalGate2(t.word.length);
        e = process.hrtime.bigint();
        cost = calcCost(e, s);
        stats["Gate2_Len1Bail"].evals++;
        if (r2) {
          stats["Gate2_Len1Bail"].yes++;
          stats["Gate2_Len1Bail"].nsYes += cost;
        } else {
          stats["Gate2_Len1Bail"].no++;
          stats["Gate2_Len1Bail"].nsNo += cost;
        }

        // Measure Gate 3
        s = process.hrtime.bigint();
        const r3 = this.evalGate3(t.text, t.end);
        e = process.hrtime.bigint();
        cost = calcCost(e, s);
        stats["Gate3_ImmediateOp"].evals++;
        if (r3) {
          stats["Gate3_ImmediateOp"].yes++;
          stats["Gate3_ImmediateOp"].nsYes += cost;
        } else {
          stats["Gate3_ImmediateOp"].no++;
          stats["Gate3_ImmediateOp"].nsNo += cost;
        }

        // Measure Gate 4
        s = process.hrtime.bigint();
        const r4 = this.evalGate4(t.text, t.end);
        e = process.hrtime.bigint();
        cost = calcCost(e, s);
        stats["Gate4_OpeningFence"].evals++;
        if (r4) {
          stats["Gate4_OpeningFence"].yes++;
          stats["Gate4_OpeningFence"].nsYes += cost;
        } else {
          stats["Gate4_OpeningFence"].no++;
          stats["Gate4_OpeningFence"].nsNo += cost;
        }

        // Measure Gate 5
        s = process.hrtime.bigint();
        const r5 = this.evalGate5(t.text, t.start, t.end, t.word.length);
        e = process.hrtime.bigint();
        cost = calcCost(e, s);
        stats["Gate5_SpacedGuard"].evals++;
        if (r5) {
          stats["Gate5_SpacedGuard"].yes++;
          stats["Gate5_SpacedGuard"].nsYes += cost;
        } else {
          stats["Gate5_SpacedGuard"].no++;
          stats["Gate5_SpacedGuard"].nsNo += cost;
        }

        // Measure Gate 6
        s = process.hrtime.bigint();
        const r6 = this.evalGate6(t.word);
        e = process.hrtime.bigint();
        cost = calcCost(e, s);
        stats["Gate6_LemireMphf"].evals++;
        if (r6) {
          stats["Gate6_LemireMphf"].yes++;
          stats["Gate6_LemireMphf"].nsYes += cost;
        } else {
          stats["Gate6_LemireMphf"].no++;
          stats["Gate6_LemireMphf"].nsNo += cost;
        }

        // Measure Gate 3-Unified
        s = process.hrtime.bigint();
        const r3u = this.evalGate3Unified(t.text, t.end);
        e = process.hrtime.bigint();
        cost = calcCost(e, s);
        stats["Gate3_Unified"].evals++;
        if (r3u) {
          stats["Gate3_Unified"].yes++;
          stats["Gate3_Unified"].nsYes += cost;
        } else {
          stats["Gate3_Unified"].no++;
          stats["Gate3_Unified"].nsNo += cost;
        }
      }
    }

    const results: TwoSidedGateMetrics[] = [];
    for (let i = 0; i < gateDefs.length; i++) {
      const g = gateDefs[i];
      const s = stats[g.id];
      const costYesNs = s.yes > 0 ? Number(s.nsYes) / s.yes : 0.001;
      const costNoNs = s.no > 0 ? Number(s.nsNo) / s.no : 0.001;
      const probYes = s.evals > 0 ? s.yes / s.evals : 0;
      const expectedCostNs = probYes * costYesNs + (1 - probYes) * costNoNs;
      const ratio = expectedCostNs > 0 ? probYes / expectedCostNs : 0;

      results.push({
        gateId: g.id,
        name: g.name,
        evaluations: s.evals,
        hitsYes: s.yes,
        hitsNo: s.no,
        totalNsYes: s.nsYes,
        totalNsNo: s.nsNo,
        costYesNs: Number(costYesNs.toFixed(3)),
        costNoNs: Number(costNoNs.toFixed(3)),
        expectedCostNs: Number(expectedCostNs.toFixed(3)),
        probabilityYes: Number(probYes.toFixed(4)),
        ratio: Number(ratio.toFixed(4)),
        currentRank: i + 1,
      });
    }

    // Compute optimal rank based on empirical ratio R_i = P_yes / E[Cost] descending
    const sorted = [...results].sort((a, b) => b.ratio - a.ratio);
    sorted.forEach((item, idx) => {
      const found = results.find((r) => r.gateId === item.gateId);
      if (found) found.optimalRank = idx + 1;
    });

    return results;
  }

  /**
   * Runs Phase 2: Sequential Cascade Tournament.
   * Evaluates the gates in order. The first gate that opens and stays open wins the race.
   */
  public runCascadeTournament(
    tokens: { text: string; start: number; end: number; word: string }[]
  ): CascadeRaceResult {
    const winnerCounts: Record<string, number> = {
      Gate1_Backslash: 0,
      Gate2_Len1Bail: 0,
      Gate3_ImmediateOp: 0,
      Gate4_OpeningFence: 0,
      Gate5_SpacedGuard: 0,
      Gate6_LemireMphf: 0,
      Fallthrough_Variable: 0,
    };

    const startHr = process.hrtime.bigint();

    for (const t of tokens) {
      // 1. Gate 1: Backslash
      if (this.evalGate1(t.text, t.start)) {
        winnerCounts["Gate1_Backslash"]++;
        continue;
      }

      // 2. Gate 2: Len 1
      if (this.evalGate2(t.word.length)) {
        winnerCounts["Gate2_Len1Bail"]++;
        continue;
      }

      // 3. Gate 3: Immediate Op
      if (this.evalGate3(t.text, t.end)) {
        winnerCounts["Gate3_ImmediateOp"]++;
        continue;
      }

      // 4. Gate 4: Opening Fence
      if (!this.evalGate4(t.text, t.end)) {
        winnerCounts["Gate4_OpeningFence"]++;
        continue;
      }

      // 5. Gate 5: Spaced Guard
      if (this.evalGate5(t.text, t.start, t.end, t.word.length)) {
        winnerCounts["Gate5_SpacedGuard"]++;
        continue;
      }

      // 6. Gate 6: MPHF
      if (this.evalGate6(t.word)) {
        winnerCounts["Gate6_LemireMphf"]++;
        continue;
      }

      winnerCounts["Fallthrough_Variable"]++;
    }

    const endHr = process.hrtime.bigint();
    const totalCascadeNs = endHr - startHr;
    const meanKeystrokeNs =
      tokens.length > 0 ? Number(totalCascadeNs) / tokens.length : 0;

    const isolatedMetrics = this.measureIsolatedGates(tokens, 10);
    const optimalPermutation = [...isolatedMetrics]
      .filter((m) => m.gateId !== "Gate3_Unified")
      .sort((a, b) => b.ratio - a.ratio)
      .map((m) => m.gateId);

    return {
      totalKeystrokes: tokens.length,
      totalCascadeNs,
      meanKeystrokeNs: Number(meanKeystrokeNs.toFixed(2)),
      winnerDistribution: winnerCounts,
      isolatedMetrics,
      cascadeMetrics: isolatedMetrics,
      optimalPermutation,
    };
  }
}
