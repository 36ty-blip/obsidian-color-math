import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "./transaction.mjs";

export function parseSemver(versionStr) {
  const match = String(versionStr).trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    throw new Error(`Invalid SemVer format: "${versionStr}"`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
  };
}

export function bumpVersion(currentVersion, bumpType = "patch") {
  const parsed = parseSemver(currentVersion);
  switch (bumpType) {
    case "major":
      return `${parsed.major + 1}.0.0`;
    case "minor":
      return `${parsed.major}.${parsed.minor + 1}.0`;
    case "patch":
    default:
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }
}

export async function readCurrentVersions(rootDir) {
  const pkgPath = path.join(rootDir, "package.json");
  const manifestPath = path.join(rootDir, "manifest.json");
  const versionsPath = path.join(rootDir, "versions.json");

  const [pkgRaw, manifestRaw, versionsRaw] = await Promise.all([
    fs.readFile(pkgPath, "utf-8"),
    fs.readFile(manifestPath, "utf-8"),
    fs.readFile(versionsPath, "utf-8"),
  ]);

  const pkg = JSON.parse(pkgRaw);
  const manifest = JSON.parse(manifestRaw);
  const versions = JSON.parse(versionsRaw);

  return {
    pkgVersion: pkg.version,
    manifestVersion: manifest.version,
    minAppVersion: manifest.minAppVersion,
    versionsKeys: Object.keys(versions),
    pkg,
    manifest,
    versions,
  };
}

export async function atomicVersionSync(rootDir, targetVersion, dryRun = false) {
  parseSemver(targetVersion); // Validate syntax

  const pkgPath = path.join(rootDir, "package.json");
  const manifestPath = path.join(rootDir, "manifest.json");
  const versionsPath = path.join(rootDir, "versions.json");

  const current = await readCurrentVersions(rootDir);
  const previousVersion = current.pkgVersion;

  current.pkg.version = targetVersion;
  current.manifest.version = targetVersion;
  current.versions[targetVersion] = current.manifest.minAppVersion;

  if (dryRun) {
    return {
      previousVersion,
      targetVersion,
      dryRun: true,
      files: [pkgPath, manifestPath, versionsPath],
    };
  }

import { atomicWriteFile } from "./transaction.mjs";

  // Write all 3 files via staged hardware-synced atomic writes
  await Promise.all([
    atomicWriteFile(pkgPath, JSON.stringify(current.pkg, null, 2) + "\n"),
    atomicWriteFile(manifestPath, JSON.stringify(current.manifest, null, 2) + "\n"),
    atomicWriteFile(versionsPath, JSON.stringify(current.versions, null, 2) + "\n"),
  ]);

  // Re-read and assert bit-level equality
  const verified = await readCurrentVersions(rootDir);
  if (
    verified.pkgVersion !== targetVersion ||
    verified.manifestVersion !== targetVersion ||
    !verified.versions[targetVersion]
  ) {
    throw new Error(
      `Version synchronization verification failed: Expected "${targetVersion}", but verified pkg="${verified.pkgVersion}", manifest="${verified.manifestVersion}"`
    );
  }

  return {
    previousVersion,
    targetVersion,
    verified: true,
    files: [pkgPath, manifestPath, versionsPath],
  };
}
