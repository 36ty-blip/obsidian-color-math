import { describe, it, expect } from "vitest";
import { colorLatexBody } from "../src/converters/generic";
import { convertText } from "../src/index";
import { DEFAULT_COLORS } from "../src/config";

describe("Performance & Speed Benchmark", () => {
  const equations = [
    "\\triangleleft G \\rtimes H = K",
    "\\oint_{\\partial \\Omega} \\vec{F} \\cdot d\\vec{S} = \\iiint_{\\Omega} (\\nabla \\cdot \\vec{F}) \\, dV",
    "\\frac{d^2 y}{dx^2} + \\omega^2 y = 0",
    "\\det(A - \\lambda I) = 0",
    "\\left( \\frac{\\alpha + \\beta}{\\theta} \\right) = \\psi2 + \\Psi",
    "\\sum_{i=1}^{n} x_i y_i = \\vec{x} \\cdot \\vec{y}",
    "\\nabla \\times \\vec{E} = -\\frac{\\partial \\vec{B}}{\\partial t}",
    "a \\le \\left( b + c \\right) \\le d",
    "\\mathbb{E}[X] = \\int_{-\\infty}^{\\infty} x f(x) dx",
    "\\ker(T) \\oplus \\operatorname{im}(T) = V",
  ];

  it("benchmarks single-equation conversion throughput across 5,000 iterations", () => {
    const iterations = 5000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      const eq = equations[i % equations.length];
      colorLatexBody(eq, undefined, {
        activeMode: "algebra",
        enableTaxonomy: true,
        variableDataFlow: true,
        rainbowDelimiters: true,
      });
    }

    const elapsedMs = performance.now() - start;
    const opsPerSec = Math.round((iterations / elapsedMs) * 1000);
    const avgLatencyUs = Math.round((elapsedMs / iterations) * 1000);

    console.log(`\n========================================`);
    console.log(`SPEED TEST: Single-Equation Throughput`);
    console.log(`Iterations:    ${iterations}`);
    console.log(`Elapsed Time:  ${elapsedMs.toFixed(2)} ms`);
    console.log(`Throughput:    ${opsPerSec.toLocaleString()} equations / sec`);
    console.log(`Average Latency: ${avgLatencyUs} µs / equation`);
    console.log(`========================================\n`);

    expect(opsPerSec).toBeGreaterThan(1000); // At least 1,000 ops/sec
  });

  it("benchmarks full Markdown document conversion throughput across 500 multiline equations", () => {
    const doc = equations
      .map((eq, i) => `### Section ${i + 1}\n\nHere is equation:\n$$\n${eq}\n$$\n`)
      .join("\n")
      .repeat(50); // 10 * 50 = 500 equations

    const start = performance.now();
    const converted = convertText(doc, DEFAULT_COLORS, {
      activeMode: "algebra",
      enableTaxonomy: true,
      variableDataFlow: true,
      rainbowDelimiters: true,
    });
    const elapsedMs = performance.now() - start;

    console.log(`\n========================================`);
    console.log(`SPEED TEST: Full Markdown Document`);
    console.log(`Equations Count: 500 equations in single document`);
    console.log(`Document Size:   ${(doc.length / 1024).toFixed(1)} KB`);
    console.log(`Elapsed Time:    ${elapsedMs.toFixed(2)} ms`);
    console.log(`Speed:           ${Math.round((500 / elapsedMs) * 1000).toLocaleString()} eq/sec`);
    console.log(`========================================\n`);

    expect(converted.length).toBeGreaterThan(doc.length);
    expect(elapsedMs).toBeLessThan(3000); // 500 full equations converted well under 3 seconds
  });
});
