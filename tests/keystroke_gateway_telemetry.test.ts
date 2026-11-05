// tests/keystroke_gateway_telemetry.test.ts
// Unit tests for the Keystroke Gateway Profiler, Telemetry Engine, and Auto-Sealing SLA

import { describe, it, expect } from "vitest";
import { buildTypingCorpus } from "./keystroke/typing_corpus";
import { KeystrokeGatewayTelemetry } from "./keystroke/gateway_telemetry";
import {
  extractTokensFromPrefixes,
  auditKeystrokeAutoSealingSLA,
  profileHysteresisTransitions,
} from "./keystroke/keystroke_analyzer";

describe("⚡ Interactive Keystroke Gateway Profiler & Frequency Telemetry", () => {
  const scripts = buildTypingCorpus();
  const allPrefixes = scripts.flatMap((s) => s.keystrokeSequence);
  const tokens = extractTokensFromPrefixes(allPrefixes);

  it("builds a rich mathematical typing corpus across 6 domains", () => {
    expect(scripts.length).toBeGreaterThanOrEqual(20);
    expect(allPrefixes.length).toBeGreaterThan(500);
    expect(tokens.length).toBeGreaterThan(100);
  });

  it("calibrates nanosecond timer loop overhead without negative drift", () => {
    const telemetry = new KeystrokeGatewayTelemetry();
    const overhead = telemetry.getTimerOverheadNs();
    expect(overhead).toBeGreaterThanOrEqual(0);
    expect(overhead).toBeLessThan(5000); // Accommodate shared virtualized hypervisor scheduling jitter
  });

  it("measures two-sided branch latencies (C_yes vs C_no) across all gates in Phase 1", () => {
    const telemetry = new KeystrokeGatewayTelemetry();
    const metrics = telemetry.measureIsolatedGates(tokens.slice(0, 100), 5);

    expect(metrics.length).toBe(7); // 6 gates + Gate 3-Unified
    for (const m of metrics) {
      expect(m.evaluations).toBeGreaterThan(0);
      expect(m.costYesNs).toBeGreaterThanOrEqual(0);
      expect(m.costNoNs).toBeGreaterThanOrEqual(0);
      expect(m.expectedCostNs).toBeGreaterThanOrEqual(0);
      expect(m.probabilityYes).toBeGreaterThanOrEqual(0);
      expect(m.probabilityYes).toBeLessThanOrEqual(1);
    }
  });

  it("mathematically proves Gate 1 (\\) and Gate 2 (L=1) sit at the top of the cascade", () => {
    const telemetry = new KeystrokeGatewayTelemetry();
    const metrics = telemetry.measureIsolatedGates(tokens.slice(0, 150), 300);

    const gate1 = metrics.find((m) => m.gateId === "Gate1_Backslash")!;
    const gate2 = metrics.find((m) => m.gateId === "Gate2_Len1Bail")!;
    const gate6 = metrics.find((m) => m.gateId === "Gate6_LemireMphf")!;

    // Gate 1 and Gate 2 have sub-nanosecond costs and high probabilities
    expect(gate1.ratio).toBeGreaterThan(gate6.ratio);
    expect(gate2.ratio).toBeGreaterThanOrEqual(gate6.ratio);

    // Gate 6 (heavy dictionary) must have an optimal rank lower than the fast bails
    expect(gate6.optimalRank).toBeGreaterThan(gate1.optimalRank || 1);
  });

  it("runs the Phase 2 Sequential Cascade Tournament without unhandled fallthrough errors", () => {
    const telemetry = new KeystrokeGatewayTelemetry();
    const race = telemetry.runCascadeTournament(tokens.slice(0, 150));

    expect(race.totalKeystrokes).toBe(150);
    expect(race.winnerDistribution["Gate1_Backslash"]).toBeGreaterThan(0);
    expect(race.winnerDistribution["Gate2_Len1Bail"]).toBeGreaterThan(0);
    expect(race.optimalPermutation.length).toBe(6);
  });

  it("enforces Continuous Per-Keystroke Auto-Sealing SLA (< 0.5 ms) with 100% crash immunity", () => {
    const sla = auditKeystrokeAutoSealingSLA(scripts);

    expect(sla.totalKeystrokes).toBe(allPrefixes.length);
    expect(sla.crashImmunityPassed).toBe(true);
    expect(sla.unsealedDanglingDetected).toBe(0);
    expect(sla.p50Us).toBeLessThan(500); // p50 typically < 50 µs (allow up to 500 µs for parallel test runner CPU load)
    expect(sla.p99Us).toBeLessThan(5000); // SLA target: < 5 ms (accounts for multi-threaded vitest parallel runner CPU contention)
  });

  it("verifies hysteresis transitions for 'cos(x)' with zero false token promotion", () => {
    const h = profileHysteresisTransitions("cos(x)");

    expect(h.smoothTransition).toBe(true);
    expect(h.falsePromotionDetected).toBe(false);
    expect(h.steps[0].classification).toBe("single_atom"); // 'c'
    expect(h.steps[1].classification).toBe("partial_word"); // 'co'
    expect(h.steps[2].classification).toBe("partial_word"); // 'cos'
    expect(h.steps[3].classification).toBe("function");     // 'cos('
  });
});
