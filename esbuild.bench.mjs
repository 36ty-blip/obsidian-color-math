import esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  await esbuild.build({
    entryPoints: ["tests/perf_runner.ts"],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    alias: {
      obsidian: path.resolve(__dirname, "tests/mocks/obsidian.ts"),
    },
    external: ["obsidian", "electron", "katex"],
    outfile: "dist/perf_runner.cjs",
    logLevel: "info",
    sourcemap: "inline",
  });
  console.log("✓ Benchmark runner successfully built to dist/perf_runner.cjs");
} catch (err) {
  console.error("Failed to build benchmark runner:", err);
  process.exit(1);
}
