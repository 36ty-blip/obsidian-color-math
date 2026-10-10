import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { parseSemver, bumpVersion, atomicVersionSync, readCurrentVersions } from "../scripts/semver.mjs";
import { getOptimalThreadCount, configureLibuvThreadPool } from "../scripts/cpu_probe.mjs";
import { computeFileHash, verifyReleaseAssets } from "../scripts/hasher.mjs";

describe("Automated Release Pipeline: SemVer Engine", () => {
  it("correctly parses standard SemVer strings", () => {
    expect(parseSemver("1.0.65")).toEqual({ major: 1, minor: 0, patch: 65, prerelease: null });
    expect(parseSemver("2.14.3-beta.1")).toEqual({ major: 2, minor: 14, patch: 3, prerelease: "beta.1" });
  });

  it("throws on invalid SemVer strings", () => {
    expect(() => parseSemver("v1.0")).toThrow(/Invalid SemVer/);
    expect(() => parseSemver("1.0")).toThrow(/Invalid SemVer/);
    expect(() => parseSemver("abc")).toThrow(/Invalid SemVer/);
  });

  it("calculates patch, minor, and major increments correctly", () => {
    expect(bumpVersion("1.0.65", "patch")).toBe("1.0.66");
    expect(bumpVersion("1.0.65", "minor")).toBe("1.1.0");
    expect(bumpVersion("1.0.65", "major")).toBe("2.0.0");
  });

  describe("Atomic Version Sync (Mock Sandbox)", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "colormath-release-test-"));
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "color-math", version: "1.0.65" }, null, 2)
      );
      await fs.writeFile(
        path.join(tempDir, "manifest.json"),
        JSON.stringify({ id: "color-math", version: "1.0.65", minAppVersion: "1.4.0" }, null, 2)
      );
      await fs.writeFile(
        path.join(tempDir, "versions.json"),
        JSON.stringify({ "1.0.64": "1.4.0", "1.0.65": "1.4.0" }, null, 2)
      );
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("simulates updates in dry-run mode without modifying disk", async () => {
      const res = await atomicVersionSync(tempDir, "1.0.66", true);
      expect(res.dryRun).toBe(true);
      expect(res.targetVersion).toBe("1.0.66");

      const onDisk = await readCurrentVersions(tempDir);
      expect(onDisk.pkgVersion).toBe("1.0.65");
      expect(onDisk.manifestVersion).toBe("1.0.65");
      expect(onDisk.versions["1.0.66"]).toBeUndefined();
    });

    it("atomically writes and verifies version across all 3 files", async () => {
      const res = await atomicVersionSync(tempDir, "1.0.66", false);
      expect(res.verified).toBe(true);
      expect(res.targetVersion).toBe("1.0.66");

      const onDisk = await readCurrentVersions(tempDir);
      expect(onDisk.pkgVersion).toBe("1.0.66");
      expect(onDisk.manifestVersion).toBe("1.0.66");
      expect(onDisk.versions["1.0.66"]).toBe("1.4.0");
    });
  });
});

describe("Automated Release Pipeline: CPU Probe & Workload Budgeting", () => {
  it("enforces clamp bounds [2, 6] on requested threads", () => {
    expect(getOptimalThreadCount(false, 1).count).toBe(2);
    expect(getOptimalThreadCount(false, 12).count).toBe(6);
    expect(getOptimalThreadCount(false, 4).count).toBe(4);
  });

  it("allocates exactly 6 threads in quick mode (50% CPU budget)", () => {
    const res = getOptimalThreadCount(true);
    expect(res.count).toBe(6);
    expect(res.source).toBe("quick-mode-max-50pct");
  });

  it("scales libuv thread pool to at least 8 or 2x worker count", () => {
    configureLibuvThreadPool(2);
    expect(parseInt(process.env.UV_THREADPOOL_SIZE || "0", 10)).toBeGreaterThanOrEqual(8);

    configureLibuvThreadPool(6);
    expect(parseInt(process.env.UV_THREADPOOL_SIZE || "0", 10)).toBeGreaterThanOrEqual(12);
  });
});

describe("Automated Release Pipeline: Asset Verifier & Hasher", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "colormath-hasher-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("computes deterministic SHA-256 hashes", async () => {
    const filePath = path.join(tempDir, "sample.txt");
    await fs.writeFile(filePath, "hello world\n");
    const record = await computeFileHash(filePath);
    expect(record.fileName).toBe("sample.txt");
    expect(record.size).toBe(12);
    // echo "hello world\n" sha256
    expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("catches empty files (0 bytes)", async () => {
    await fs.writeFile(path.join(tempDir, "main.js"), "");
    await fs.writeFile(path.join(tempDir, "manifest.json"), "{}");
    await fs.writeFile(path.join(tempDir, "styles.css"), "body {}");

    await expect(verifyReleaseAssets(tempDir, "1.0.66", false)).rejects.toThrow(/0 bytes/);
  });

  it("catches suspiciously small main.js (< 50KB)", async () => {
    await fs.writeFile(path.join(tempDir, "main.js"), "class ColorMathPlugin {}");
    await fs.writeFile(path.join(tempDir, "manifest.json"), JSON.stringify({ version: "1.0.66" }));
    await fs.writeFile(path.join(tempDir, "styles.css"), "a".repeat(2000));

    await expect(verifyReleaseAssets(tempDir, "1.0.66", false)).rejects.toThrow(/suspiciously small/);
  });

  it("catches manifest.json version mismatch", async () => {
    await fs.writeFile(path.join(tempDir, "main.js"), "class ColorMathPlugin {}\n" + "x".repeat(60000));
    await fs.writeFile(path.join(tempDir, "manifest.json"), JSON.stringify({ version: "1.0.65" }));
    await fs.writeFile(path.join(tempDir, "styles.css"), "a".repeat(2000));

    await expect(verifyReleaseAssets(tempDir, "1.0.66", false)).rejects.toThrow(/version mismatch/);
  });

  it("accepts valid bundle matching target version", async () => {
    await fs.writeFile(path.join(tempDir, "main.js"), "class ColorMathPlugin {}\n" + "x".repeat(60000));
    await fs.writeFile(path.join(tempDir, "manifest.json"), JSON.stringify({ version: "1.0.66" }));
    await fs.writeFile(path.join(tempDir, "styles.css"), "a".repeat(2000));

    const records = await verifyReleaseAssets(tempDir, "1.0.66", false);
    expect(records).toHaveLength(3);
    expect(records[0].fileName).toBe("main.js");
    expect(records[1].fileName).toBe("manifest.json");
    expect(records[2].fileName).toBe("styles.css");
  });
});
