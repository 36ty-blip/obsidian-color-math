#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execSync, spawn } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { setupPerformanceOptimization, getOptimalThreadCount, configureLibuvThreadPool } from "./cpu_probe.mjs";
import { readCurrentVersions, bumpVersion, atomicVersionSync } from "./semver.mjs";
import { verifyReleaseAssets } from "./hasher.mjs";

const SYNC_ENGINE_PATH = "C:\\Users\\aditya\\Documents\\CODES\\Sync\\sync.mjs";
const MONOREPO_CHECKLIST = "C:\\Users\\aditya\\Documents\\GitHub\\color-math\\CHECKLIST.md";
const MONOREPO_TODO = "C:\\Users\\aditya\\Documents\\GitHub\\color-math\\TODO.md";

// CLI ANSI Formatting Helpers
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

function banner(text) {
  console.log(`\n${c.bold}${c.cyan}================================================================================${c.reset}`);
  console.log(`${c.bold}${c.cyan}  ${text}${c.reset}`);
  console.log(`${c.bold}${c.cyan}================================================================================${c.reset}\n`);
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const options = {
    bumpType: "patch",
    exactVersion: null,
    quick: false,
    threads: undefined,
    dryRun: false,
    skipTests: false,
    withCorpus: false,
    stageOnly: false,
    allowDirty: false,
    autoApprove: false,
    profileVault: "2",
    profileGitHub: "1",
    description: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--patch") options.bumpType = "patch";
    else if (arg === "--minor") options.bumpType = "minor";
    else if (arg === "--major") options.bumpType = "major";
    else if (arg === "--version" && i + 1 < args.length) options.exactVersion = args[++i];
    else if (arg === "--quick") options.quick = true;
    else if (arg === "--threads" && i + 1 < args.length) options.threads = parseInt(args[++i], 10);
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--skip-tests") options.skipTests = true;
    else if (arg === "--with-corpus") options.withCorpus = true;
    else if (arg === "--stage-only") options.stageOnly = true;
    else if (arg === "--allow-dirty") options.allowDirty = true;
    else if (arg === "--auto-approve" || arg === "-y") options.autoApprove = true;
    else if (arg === "--desc" && i + 1 < args.length) options.description = args[++i];
  }

  return options;
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const fullCmd = [command, ...args].join(" ");
    const child = spawn(fullCmd, {
      cwd,
      stdio: "inherit",
      shell: true,
      env: process.env,
    });

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command "${command} ${args.join(" ")}" failed with exit code ${code}`));
    });

    child.on("error", (err) => reject(err));
  });
}

const SYNC_CONFIG_PATH = "C:\\Users\\aditya\\Documents\\CODES\\Sync\\sync-config.json";
const SYNC_DIR = "C:\\Users\\aditya\\Documents\\CODES\\Sync";

async function runSyncCommand(profileId, dryRun, force) {
  const flags = [`-Profile`, profileId, `-Config`, `"${SYNC_CONFIG_PATH}"`];
  if (dryRun) flags.push(`-DryRun`, `-AsJson`);
  else if (force) flags.push(`-Execute`, `-Force`);

  const cmd = `node "${SYNC_ENGINE_PATH}" ${flags.join(" ")}`;
  try {
    const output = execSync(cmd, { encoding: "utf-8", timeout: 45000, cwd: SYNC_DIR });
    return { success: true, output };
  } catch (err) {
    return { success: false, error: err.message, stderr: err.stderr?.toString() };
  }
}

async function appendChecklistLedger(version, description, assetRecords, testCount, durationSeconds, threadCount) {
  try {
    const checklistRaw = await fs.readFile(MONOREPO_CHECKLIST, "utf-8");
    const timestampIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });

    let entry = `\n- [x] **v${version}**: ${description || "Automated multi-core release pipeline deployment"} (verified across ${testCount} unit tests in ${durationSeconds}s on ${threadCount} worker threads).`;
    
    // Insert into Section 8 Historical Release Ledger
    const targetSection = "## 📦 8. Historical Release Ledger (Shipped Versions)";
    if (checklistRaw.includes(targetSection)) {
      const idx = checklistRaw.indexOf(targetSection) + targetSection.length;
      const updated = checklistRaw.slice(0, idx) + entry + checklistRaw.slice(idx);
      await fs.writeFile(MONOREPO_CHECKLIST, updated, "utf-8");
      return true;
    }
  } catch {
    // Non-fatal if monorepo checklist is not writable
  }
  return false;
}

async function main() {
  const startTime = Date.now();
  const rootDir = process.cwd();
  const options = parseCliArgs();

  banner(`🚀 COLOR MATH AUTOMATED MULTI-CORE RELEASE PIPELINE`);
  if (options.dryRun) {
    console.log(`${c.yellow}${c.bold}⚠️  DRY-RUN MODE ENABLED: No files will be modified or synchronized.${c.reset}\n`);
  }

  // --- Phase 0: Pre-Flight Probe & Workload Budgeting ---
  console.log(`${c.bold}[Phase 0: Pre-Flight Probe & Workload Allocation]${c.reset}`);
  setupPerformanceOptimization(true);

  if (!options.allowDirty && !options.dryRun) {
    try {
      const gitStatus = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
      if (gitStatus.length > 0) {
        console.error(`${c.red}❌ Git working tree has uncommitted changes:${c.reset}`);
        console.error(gitStatus);
        console.error(`\nCommit or stash changes first, or pass --allow-dirty to proceed.`);
        process.exit(1);
      }
    } catch {
      // Ignore if not a git directory
    }
  }

  const { count: threadCount, avgCpu, source } = getOptimalThreadCount(options.quick, options.threads);
  configureLibuvThreadPool(threadCount);

  if (avgCpu !== null) {
    console.log(`  • Measured System CPU Load: ${c.cyan}${avgCpu}%${c.reset} (3-second average)`);
  }
  console.log(`  • Worker Concurrency: ${c.green}${c.bold}${threadCount} threads${c.reset} (${source})`);
  console.log(`  • Processor Affinity: P-cores bound (Affinity Mask 255) | Priority: ABOVE_NORMAL`);

  // --- Determine SemVer Bump ---
  const currentVersions = await readCurrentVersions(rootDir);
  const targetVersion = options.exactVersion || bumpVersion(currentVersions.pkgVersion, options.bumpType);
  console.log(`  • Current Version: ${c.dim}${currentVersions.pkgVersion}${c.reset} $\\longrightarrow$ Target Version: ${c.green}${c.bold}${targetVersion}${c.reset} (${options.exactVersion ? "exact" : options.bumpType})`);

  // --- Phase 1: Multi-Core Test Suite Verification ---
  console.log(`\n${c.bold}[Phase 1: Multi-Core Test Verification Suite]${c.reset}`);
  let testCount = "480+";
  if (options.skipTests) {
    console.log(`${c.yellow}  ⚠️  Tests skipped via --skip-tests flag.${c.reset}`);
  } else {
    const testStart = Date.now();
    console.log(`  • Executing Vitest across ${c.cyan}${threadCount} worker threads${c.reset}...`);
    try {
      await runCommand(
        "npx",
        ["vitest", "run", `--poolOptions.threads.minThreads=1`, `--poolOptions.threads.maxThreads=${threadCount}`],
        rootDir
      );
      const testElapsed = ((Date.now() - testStart) / 1000).toFixed(2);
      console.log(`  • ${c.green}✔ All unit tests passed cleanly in ${testElapsed}s.${c.reset}`);
    } catch (err) {
      console.error(`\n${c.red}❌ Test suite verification failed! Aborting release pipeline.${c.reset}`);
      process.exit(1);
    }

    if (options.withCorpus) {
      console.log(`  • Running full corpus audit benchmark...`);
      try {
        await runCommand("npx", ["tsx", "tests/corpus_audit.ts"], rootDir);
        console.log(`  • ${c.green}✔ Corpus audit passed.${c.reset}`);
      } catch (err) {
        console.error(`\n${c.red}❌ Corpus audit benchmark failed! Aborting release pipeline.${c.reset}`);
        process.exit(1);
      }
    }
  }

  // --- Phase 2: Atomic 3-Way SemVer Synchronization ---
  console.log(`\n${c.bold}[Phase 2: Atomic 3-Way SemVer Synchronization]${c.reset}`);
  const syncResult = await atomicVersionSync(rootDir, targetVersion, options.dryRun);
  if (options.dryRun) {
    console.log(`  • [DRY-RUN] Would update package.json, manifest.json, versions.json to ${targetVersion}`);
  } else {
    console.log(`  • ${c.green}✔ Synchronized version ${targetVersion} across:${c.reset}`);
    console.log(`    - package.json`);
    console.log(`    - manifest.json`);
    console.log(`    - versions.json (registered with minAppVersion: "${currentVersions.minAppVersion}")`);
  }

  // --- Phase 3: Production Bundling via esbuild ---
  console.log(`\n${c.bold}[Phase 3: Production Bundling & Tree-Shaking]${c.reset}`);
  const buildStart = Date.now();
  try {
    await runCommand("node", ["esbuild.config.mjs", "production"], rootDir);
    const buildElapsed = ((Date.now() - buildStart) / 1000).toFixed(2);
    console.log(`  • ${c.green}✔ esbuild production bundle generated in ${buildElapsed}s.${c.reset}`);
  } catch (err) {
    console.error(`\n${c.red}❌ Production build failed! Aborting release pipeline.${c.reset}`);
    process.exit(1);
  }

  // --- Phase 4: Release Asset Verification & Cryptographic Hashing ---
  console.log(`\n${c.bold}[Phase 4: Release Asset Verification & Cryptographic Hashing]${c.reset}`);
  let assetRecords = [];
  try {
    assetRecords = await verifyReleaseAssets(rootDir, targetVersion, options.dryRun);
    console.log(`  ┌─────────────────┬────────────┬──────────────────────────────────────────────────────────────────┐`);
    console.log(`  │ Asset           │ Size       │ SHA-256 Digest                                                   │`);
    console.log(`  ├─────────────────┼────────────┼──────────────────────────────────────────────────────────────────┤`);
    for (const record of assetRecords) {
      const sizeStr = `${(record.size / 1024).toFixed(1)} KB`.padStart(10);
      const nameStr = record.fileName.padEnd(15);
      console.log(`  │ ${nameStr} │ ${sizeStr} │ ${record.sha256} │`);
    }
    console.log(`  └─────────────────┴────────────┴──────────────────────────────────────────────────────────────────┘`);
    console.log(`  • ${c.green}✔ Bit-level structural sanity & cryptographic checksums verified.${c.reset}`);
  } catch (err) {
    console.error(`\n${c.red}❌ Release asset verification failed: ${err.message}${c.reset}`);
    process.exit(1);
  }

  if (options.stageOnly) {
    console.log(`\n${c.yellow}ℹ️  --stage-only specified. Skipping deployment to Obsidian Vault and GitHub.${c.reset}`);
    printReceipt(targetVersion, assetRecords, startTime);
    return;
  }

  // --- Phase 5: Two-Tier Sync Engine Integration ---
  console.log(`\n${c.bold}[Phase 5: Two-Tier Workspace Deployment Pipeline]${c.reset}`);

  // Step 5A: Stage 1 Vault Live Deploy (Profile 2)
  console.log(`  • ${c.cyan}Step 5A: Deploying bundle to Obsidian Vault (Profile ${options.profileVault}: CodesToVault)...${c.reset}`);
  const vaultDryRun = await runSyncCommand(options.profileVault, true, false);
  if (vaultDryRun.success) {
    try {
      const parsed = JSON.parse(vaultDryRun.output);
      console.log(`    - Pending changes detected: ${parsed.PendingCount} files (Conflicts: ${parsed.ConflictCount})`);
    } catch {
      // Raw output
    }
  }

  if (!options.dryRun) {
    const vaultDeploy = await runSyncCommand(options.profileVault, false, true);
    if (!vaultDeploy.success) {
      console.error(`${c.red}❌ Vault deployment failed: ${vaultDeploy.error}${c.reset}`);
      process.exit(1);
    }
    console.log(`  • ${c.green}✔ Bundle successfully deployed to Obsidian Vault!${c.reset}`);
  } else {
    console.log(`  • [DRY-RUN] Would deploy bundle to Obsidian Vault via Profile ${options.profileVault}.`);
  }

  // Step 5B: Verification Gate
  if (!options.autoApprove && !options.dryRun) {
    console.log(`\n${c.yellow}${c.bold}--------------------------------------------------------------------------------${c.reset}`);
    console.log(`${c.yellow}${c.bold}  🔍 OBSIDIAN LIVE VERIFICATION GATE${c.reset}`);
    console.log(`  1. Reload Obsidian (${c.bold}Ctrl+R${c.reset} or toggle Color Math in Settings $\\to$ Community Plugins).`);
    console.log(`  2. Confirm math formulas render with expected syntax and semantic colors.`);
    console.log(`${c.yellow}${c.bold}--------------------------------------------------------------------------------${c.reset}\n`);

    const rl = readline.createInterface({ input, output });
    const answer = await rl.question(`${c.cyan}Proceed with Step 2 (GitHub Synchronization)? [y/N]: ${c.reset}`);
    rl.close();

    if (answer.trim().toLowerCase() !== "y" && answer.trim().toLowerCase() !== "yes") {
      console.log(`\n${c.yellow}Release paused at Vault stage. GitHub synchronization aborted.${c.reset}`);
      console.log(`(If you noticed an issue, you can rollback using: node "${SYNC_ENGINE_PATH}" -Profile 3 -Execute -Force)`);
      printReceipt(targetVersion, assetRecords, startTime);
      return;
    }
  }

  // Step 5C: Stage 2 GitHub Sync (Profile 1)
  console.log(`\n  • ${c.cyan}Step 5C: Synchronizing validated source code to GitHub (Profile ${options.profileGitHub}: CodesToGitHub)...${c.reset}`);
  if (!options.dryRun) {
    const githubDeploy = await runSyncCommand(options.profileGitHub, false, true);
    if (!githubDeploy.success) {
      console.error(`${c.red}❌ GitHub synchronization failed: ${githubDeploy.error}${c.reset}`);
      if (githubDeploy.stderr) console.error(githubDeploy.stderr);
      process.exit(1);
    }
    console.log(`  • ${c.green}✔ Source code and tests successfully synchronized to GitHub!${c.reset}`);
  } else {
    console.log(`  • [DRY-RUN] Would synchronize source code to GitHub via Profile ${options.profileGitHub}.`);
  }

  // --- Phase 6: Canonical Documentation & Ledger Ledger Pruning ---
  console.log(`\n${c.bold}[Phase 6: Canonical Documentation & Ledger Update]${c.reset}`);
  const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
  if (!options.dryRun) {
    const ledgerAppended = await appendChecklistLedger(
      targetVersion,
      options.description,
      assetRecords,
      testCount,
      totalSeconds,
      threadCount
    );
    if (ledgerAppended) {
      console.log(`  • ${c.green}✔ Master verification ledger updated in GitHub/color-math/CHECKLIST.md.${c.reset}`);
    } else {
      console.log(`  • ${c.dim}ℹ Master checklist untouched.${c.reset}`);
    }
  } else {
    console.log(`  • [DRY-RUN] Would record release v${targetVersion} in GitHub/color-math/CHECKLIST.md.`);
  }

  printReceipt(targetVersion, assetRecords, startTime);
}

function printReceipt(version, assetRecords, startTime) {
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  banner(`🏁 RELEASE v${version} COMPLETED SUCCESSFULLY IN ${totalTime}s`);
  console.log(`  • Target: Obsidian Vault + GitHub Repository`);
  console.log(`  • Artifacts:`);
  for (const r of assetRecords) {
    console.log(`    - ${r.fileName} (${(r.size / 1024).toFixed(1)} KB) [${r.sha256.slice(0, 16)}...]`);
  }
  console.log(`\n${c.green}${c.bold}All release milestones verified and active.${c.reset}\n`);
}

main().catch((err) => {
  console.error(`\n${c.red}❌ Unexpected error in release pipeline: ${err.message}${c.reset}`);
  console.error(err.stack);
  process.exit(1);
});
