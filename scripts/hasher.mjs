import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export async function computeFileHash(filePath) {
  try {
    const data = await fs.readFile(filePath);
    const hash = crypto.createHash("sha256").update(data).digest("hex").toLowerCase();
    const stat = await fs.stat(filePath);
    return {
      filePath,
      fileName: path.basename(filePath),
      size: stat.size,
      sha256: hash,
    };
  } catch (err) {
    throw new Error(`Failed to compute hash for ${filePath}: ${err.message}`);
  }
}

export async function verifyReleaseAssets(rootDir, targetVersion, isDryRun = false) {
  const assets = ["main.js", "manifest.json", "styles.css"];
  const records = [];

  for (const assetName of assets) {
    const assetPath = path.join(rootDir, assetName);
    const record = await computeFileHash(assetPath);

    if (record.size === 0) {
      throw new Error(`Release asset ${assetName} is 0 bytes (empty file)`);
    }

    // Specific structural sanity assertions
    if (assetName === "main.js") {
      if (record.size < 50 * 1024) {
        throw new Error(`main.js size (${record.size} bytes) is suspiciously small (< 50KB)`);
      }
      const head = (await fs.readFile(assetPath, "utf-8")).slice(0, 10000);
      if (!head.includes("ColorMathPlugin") && !head.includes("Plugin")) {
        throw new Error(`main.js missing required ColorMathPlugin class definition`);
      }
    } else if (assetName === "manifest.json") {
      const parsed = JSON.parse(await fs.readFile(assetPath, "utf-8"));
      if (!isDryRun && parsed.version !== targetVersion) {
        throw new Error(
          `manifest.json version mismatch: expected "${targetVersion}", found "${parsed.version}"`
        );
      }
    } else if (assetName === "styles.css") {
      if (record.size < 1000) {
        throw new Error(`styles.css size (${record.size} bytes) is suspiciously small (< 1KB)`);
      }
    }

    records.push(record);
  }

  return records;
}
