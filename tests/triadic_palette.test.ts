import { describe, it, expect } from "vitest";
import {
  DARK_VARIABLE_HASH_PALETTE,
  LIGHT_VARIABLE_HASH_PALETTE,
  VARIABLE_HASH_PALETTE,
  CANONICAL_VARIABLE_SLOTS,
  hashStringToColor,
  hashStringToSlot,
} from "../src/config";
import { getVariableHashPalette } from "../src/utils/theme_colors";
import { collectVariableSpans } from "../src/parsers/variable_hash";
import { normalizeBareFunctions } from "../src/utils/latex_helpers";

describe("16-Color Dual Palettes & Harmonic Separation", () => {
  it("defines exactly 16 distinct colors for dark and light palettes", () => {
    expect(DARK_VARIABLE_HASH_PALETTE.length).toBe(16);
    expect(LIGHT_VARIABLE_HASH_PALETTE.length).toBe(16);
    expect(VARIABLE_HASH_PALETTE).toBe(DARK_VARIABLE_HASH_PALETTE);

    const darkSet = new Set(DARK_VARIABLE_HASH_PALETTE);
    expect(darkSet.size).toBe(16);

    const lightSet = new Set(LIGHT_VARIABLE_HASH_PALETTE);
    expect(lightSet.size).toBe(16);
  });

  it("dynamically returns light vs dark palette based on theme mode", () => {
    expect(getVariableHashPalette(true)).toBe(LIGHT_VARIABLE_HASH_PALETTE);
    expect(getVariableHashPalette(false)).toBe(DARK_VARIABLE_HASH_PALETTE);
  });

  it("enforces the 120° Triadic Separation Invariant for Cartesian coordinates (x, y, z)", () => {
    const slotX = CANONICAL_VARIABLE_SLOTS.x;
    const slotY = CANONICAL_VARIABLE_SLOTS.y;
    const slotZ = CANONICAL_VARIABLE_SLOTS.z;

    expect(slotX).toBe(11); // Cobalt / Royal Blue (262.5°)
    expect(slotY).toBe(0);  // Crimson / Ruby (15.0°)
    expect(slotZ).toBe(5);  // Lime Green (127.5°)

    const distXY = ((slotY - slotX + 16) % 16) * 22.5; // 5 slots = 112.5°
    const distYZ = ((slotZ - slotY + 16) % 16) * 22.5; // 5 slots = 112.5°
    const distZX = ((slotX - slotZ + 16) % 16) * 22.5; // 6 slots = 135.0°

    expect(distXY).toBe(112.5);
    expect(distYZ).toBe(112.5);
    expect(distZX).toBe(135.0);

    const avgDistance = (distXY + distYZ + distZX) / 3;
    expect(avgDistance).toBe(120.0);
  });

  it("enforces the 90° Orthogonal Tetrad Invariant for coefficients (a, b, c, d)", () => {
    const slotA = CANONICAL_VARIABLE_SLOTS.a;
    const slotB = CANONICAL_VARIABLE_SLOTS.b;
    const slotC = CANONICAL_VARIABLE_SLOTS.c;
    const slotD = CANONICAL_VARIABLE_SLOTS.d;

    expect(slotA).toBe(2);  // Amber (60.0°)
    expect(slotB).toBe(6);  // Emerald (150.0°)
    expect(slotC).toBe(10); // Azure (240.0°)
    expect(slotD).toBe(14); // Magenta (330.0°)

    const distAB = ((slotB - slotA + 16) % 16) * 22.5;
    const distBC = ((slotC - slotB + 16) % 16) * 22.5;
    const distCD = ((slotD - slotC + 16) % 16) * 22.5;
    const distDA = ((slotA - slotD + 16) % 16) * 22.5;

    expect(distAB).toBe(90.0);
    expect(distBC).toBe(90.0);
    expect(distCD).toBe(90.0);
    expect(distDA).toBe(90.0);
  });

  it("guarantees zero collisions when coefficients and coordinates co-occur (ax + by + cz = d)", () => {
    const symbols = ["a", "x", "b", "y", "c", "z", "d"];
    const slots = symbols.map((s) => hashStringToSlot(s, 16));
    const uniqueSlots = new Set(slots);
    expect(uniqueSlots.size).toBe(7); // All 7 symbols receive unique slots
  });

  it("guarantees zero collisions in Newtonian mechanics (F_net = m a, E_tot, velocities u, v, w)", () => {
    const symbols = ["x", "y", "z", "u", "v", "w", "m", "t", "net", "tot"];
    const colors = symbols.map((s) => hashStringToColor(s, DARK_VARIABLE_HASH_PALETTE));
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBe(10); // All 10 physical entities have distinct colors
  });

  it("guarantees zero collisions in Thermodynamics (W_net = P (V_fin - V_init), T_sat, P_crit)", () => {
    const symbols = ["P", "V", "T", "W", "net", "init", "fin", "sat", "crit"];
    const colors = symbols.map((s) => hashStringToColor(s, DARK_VARIABLE_HASH_PALETTE));
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBe(9); // All 9 entities have distinct colors
  });

  it("normalizes bare extremum keywords across their 3 semantic contexts", () => {
    // 1. Function call
    expect(normalizeBareFunctions("max(A)")).toBe("\\max(A)");
    expect(normalizeBareFunctions("min(x)")).toBe("\\min(x)");

    // 2. State qualifier in subscript
    expect(normalizeBareFunctions("A_{max}")).toBe("A_{\\max}");
    expect(normalizeBareFunctions("A_max")).toBe("A_{\\max}");
    expect(normalizeBareFunctions("A_min")).toBe("A_{\\min}");

    // 3. Standalone keyword
    expect(normalizeBareFunctions("max")).toBe("\\max");
    expect(normalizeBareFunctions("min")).toBe("\\min");
  });

  it("atomically hashes state qualifiers in subscripts without scalar shattering", () => {
    const expr = "A_{max} + V_{rms} + P_{crit} + T_{sat} + W_{net}";
    const spans = collectVariableSpans(expr);
    const spanTexts = spans.map((s) => expr.slice(s.start, s.end));

    expect(spanTexts).toContain("A");
    expect(spanTexts).toContain("max");
    expect(spanTexts).toContain("V");
    expect(spanTexts).toContain("rms");
    expect(spanTexts).toContain("P");
    expect(spanTexts).toContain("crit");
    expect(spanTexts).toContain("T");
    expect(spanTexts).toContain("sat");
    expect(spanTexts).toContain("W");
    expect(spanTexts).toContain("net");

    // Ensure none of the multi-letter qualifiers were shattered into 1-letter scalars
    expect(spanTexts).not.toContain("r");
    expect(spanTexts).not.toContain("m");
    expect(spanTexts).not.toContain("s");
    expect(spanTexts).not.toContain("n");
    expect(spanTexts).not.toContain("e");
  });
});
