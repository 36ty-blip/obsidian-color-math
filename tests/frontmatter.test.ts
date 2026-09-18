import { describe, it, expect } from "vitest";
import { detectNoteField, parseFrontmatterText } from "../src/parsers/frontmatter";

describe("Frontmatter & Tag Detection", () => {
  it("detects explicit color-math block with field: quantum", () => {
    const note = `---
title: My QM Note
color-math:
  field: quantum
---
# Quantum Note
$$i\\hbar\\frac{\\partial}{\\partial t}\\psi = \\hat{H}\\psi$$
`;
    const detection = detectNoteField(note);
    expect(detection.isQuantum).toBe(true);
    expect(detection.overrides.colorQuantumOperators).toBe(true);
    expect(detection.overrides.field).toBe("quantum");
  });

  it("detects explicit inline color-math block", () => {
    const note = `---
color-math: { field: quantum }
---
`;
    const detection = detectNoteField(note);
    expect(detection.isQuantum).toBe(true);
  });

  it("detects standard YAML keys: field, subject, topic, discipline, category", () => {
    const keys = ["field", "subject", "topic", "discipline", "category"];
    for (const key of keys) {
      const note = `---
${key}: Quantum Mechanics
---
Some content
`;
      const detection = detectNoteField(note);
      expect(detection.isQuantum).toBe(true);
    }
  });

  it("detects tags in frontmatter as an array", () => {
    const note = `---
tags:
  - physics
  - math
---
Content
`;
    const detection = detectNoteField(note);
    expect(detection.isQuantum).toBe(true);
  });

  it("detects tags in frontmatter as flow sequence", () => {
    const note = `---
tags: [notes, qm, study]
---
`;
    const detection = detectNoteField(note);
    expect(detection.isQuantum).toBe(true);
  });

  it("detects in-body tag #quantum-mechanics", () => {
    const note = `Regular note without YAML frontmatter.
Tags: #quantum-mechanics for studying.
$$i\\hbar\\frac{\\partial}{\\partial t}\\psi = E\\psi$$
`;
    const detection = detectNoteField(note);
    expect(detection.isQuantum).toBe(true);
  });

  it("does not trigger quantum mode on unrelated notes", () => {
    const note = `---
subject: Differential Equations
topic: Calculus
tags:
  - math
  - calculus
---
$$\\frac{df}{dx} = f(x)$$
`;
    const detection = detectNoteField(note);
    expect(detection.isQuantum).toBe(false);
    expect(detection.overrides.colorQuantumOperators).toBeUndefined();
  });
});
