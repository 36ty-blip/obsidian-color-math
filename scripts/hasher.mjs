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

// Byte Budget Limits (bytes)
export const BYTE_BUDGETS = {
  "main.js": {
    min: 500 * 1024,         // 500 KB
    warn: 4500 * 1024,       // 4.5 MB
    max: 5120 * 1024,        // 5.0 MB
  },
  "styles.css": {
    min: 1000,               // 1 KB
    warn: 100 * 1024,        // 100 KB
    max: 150 * 1024,         // 150 KB
  },
  "manifest.json": {
    min: 100,                // 100 B
    warn: 5 * 1024,          // 5 KB
    max: 10 * 1024,          // 10 KB
  },
};

export async function generateChecksumsFile(rootDir, assetRecords) {
  const checksumsPath = path.join(rootDir, "checksums.txt");
  const lines = assetRecords
    .filter((r) => r.fileName !== "checksums.txt")
    .map((r) => `${r.sha256}  ${r.fileName}`);

  const content = lines.join("\n") + "\n";
  await fs.writeFile(checksumsPath, content, "utf-8");

  const checksumRecord = await computeFileHash(checksumsPath);
  console.log(`  • [hasher] ✔ Generated cryptographic verification ledger: checksums.txt (${lines.length} files)`);
  return checksumRecord;
}

export async function verifyReleaseAssets(rootDir, targetVersion, isDryRun = false) {
  const assets = ["main.js", "manifest.json", "styles.css"];
  const records = [];

  for (const assetName of assets) {
    const assetPath = path.join(rootDir, assetName);
    const record = await computeFileHash(assetPath);
    const budget = BYTE_BUDGETS[assetName];

    if (record.size === 0) {
      throw new Error(`Release asset ${assetName} is 0 bytes (empty file)`);
    }

    // Byte Budget Guard
    if (budget) {
      if (record.size < budget.min) {
        throw new Error(
          `Byte Budget Violation: ${assetName} size (${record.size} bytes) is suspiciously small (< ${budget.min} bytes)`
        );
      }
      if (record.size > budget.max) {
        throw new Error(
          `Byte Budget Violation: ${assetName} size (${(record.size / 1024).toFixed(1)} KB) exceeds hard limit of ${(budget.max / 1024).toFixed(1)} KB`
        );
      }
      if (record.size > budget.warn) {
        console.warn(
          `⚠️ [hasher] Advisory: ${assetName} size (${(record.size / 1024).toFixed(1)} KB) exceeds soft warning threshold of ${(budget.warn / 1024).toFixed(1)} KB.`
        );
      }
    }

    // Specific structural sanity assertions
    if (assetName === "main.js") {
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
    }

    records.push(record);
  }

  // Generate checksums.txt asset
  if (!isDryRun) {
    const checksumRecord = await generateChecksumsFile(rootDir, records);
    records.push(checksumRecord);
  }

  return records;
}
