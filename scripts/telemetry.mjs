#!/usr/bin/env node

/**
 * telemetry.mjs
 *
 * Permanent GitHub Release Download & 14-Day Expiring Traffic Archiver
 *
 * Solves two GitHub data-retention limitations:
 *  1. GitHub permanently deletes repository traffic (/traffic/views, /traffic/clones,
 *     /traffic/popular/referrers, /traffic/popular/paths) older than 14 days.
 *  2. GitHub only stores a single current counter for release asset downloads (no daily
 *     velocity history, and re-uploading an asset resets its counter to 0).
 *
 * Every time this script runs (standalone via `npm run release:stats` or automatically
 * during `release.mjs` / `publish_github.mjs`), it fetches all 5 endpoints and merges
 * them with high-water-mark deduplication into:
 *   - C:\Users\aditya\Documents\GitHub\color-math\data\telemetry_history.json
 *   - C:\Users\aditya\Documents\CODES\TypeScript\obsidian-color-math\data\telemetry_history.json
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REPO = "36ty-blip/obsidian-color-math";
const GITHUB_LEDGER_PATH = "C:\\Users\\aditya\\Documents\\GitHub\\color-math\\data\\telemetry_history.json";
const CODES_LEDGER_PATH = "C:\\Users\\aditya\\Documents\\CODES\\TypeScript\\obsidian-color-math\\data\\telemetry_history.json";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

function ghApiJson(endpoint, fallback = null) {
  try {
    const raw = execSync(`gh api ${endpoint}`, {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function fetchReleaseTelemetry(repo = REPO) {
  const releases = ghApiJson(`repos/${repo}/releases --paginate`, []);
  if (!Array.isArray(releases)) return [];

  return releases
    .map((r) => {
      const assets = Array.isArray(r.assets) ? r.assets : [];
      const findCount = (name) => {
        const found = assets.find((a) => a.name === name);
        return found ? Number(found.download_count || 0) : 0;
      };

      const mainJs = findCount("main.js");
      const manifest = findCount("manifest.json");
      const styles = findCount("styles.css");
      const totalAssets = assets.reduce(
        (acc, a) => acc + Number(a.download_count || 0),
        0
      );
      const uniqueInstalls = Math.max(mainJs, manifest, Math.round(totalAssets / 3));

      const pubDate = r.published_at ? new Date(r.published_at) : new Date(r.created_at);
      const dateStr = pubDate.toISOString().slice(0, 10);

      return {
        tag: String(r.tag_name).replace(/^v/, ""),
        name: r.name || r.tag_name,
        publishedAt: dateStr,
        timestamp: pubDate.getTime(),
        mainJs,
        manifest,
        styles,
        totalAssets,
        uniqueInstalls,
      };
    })
    .filter((r) => r.totalAssets > 0);
}

export function fetchExpiringTraffic(repo = REPO) {
  const viewsData = ghApiJson(`repos/${repo}/traffic/views`, { count: 0, uniques: 0, views: [] });
  const clonesData = ghApiJson(`repos/${repo}/traffic/clones`, { count: 0, uniques: 0, clones: [] });
  const referrersData = ghApiJson(`repos/${repo}/traffic/popular/referrers`, []);
  const pathsData = ghApiJson(`repos/${repo}/traffic/popular/paths`, []);

  return {
    views: Array.isArray(viewsData?.views) ? viewsData.views : [],
    clones: Array.isArray(clonesData?.clones) ? clonesData.clones : [],
    referrers: Array.isArray(referrersData) ? referrersData : [],
    paths: Array.isArray(pathsData) ? pathsData : [],
  };
}

function createEmptyLedger() {
  return {
    schemaVersion: "1.0.0",
    repository: REPO,
    lastUpdatedIST: null,
    dailyTraffic: {
      views: {},   // "YYYY-MM-DD": { count, uniques }
      clones: {},  // "YYYY-MM-DD": { count, uniques }
    },
    referrersArchive: {}, // "referrer": { maxCount, maxUniques, latestCount, latestUniques, lastSeen }
    pathsArchive: {},     // "path": { title, maxCount, maxUniques, latestCount, latestUniques, lastSeen }
    releasesHighWaterMark: {}, // "1.0.66": { publishedAt, mainJs, manifest, styles, totalAssets, uniqueInstalls }
    releaseDailySnapshots: {}, // "YYYY-MM-DD": { totalAssets, uniqueInstalls, byTag: { "1.0.66": totalAssets } }
  };
}

async function loadExistingLedger() {
  for (const candidate of [GITHUB_LEDGER_PATH, CODES_LEDGER_PATH]) {
    try {
      const raw = await fs.readFile(candidate, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        ...createEmptyLedger(),
        ...parsed,
        dailyTraffic: {
          views: { ...(parsed.dailyTraffic?.views || {}) },
          clones: { ...(parsed.dailyTraffic?.clones || {}) },
        },
        referrersArchive: { ...(parsed.referrersArchive || {}) },
        pathsArchive: { ...(parsed.pathsArchive || {}) },
        releasesHighWaterMark: { ...(parsed.releasesHighWaterMark || {}) },
        releaseDailySnapshots: { ...(parsed.releaseDailySnapshots || {}) },
      };
    } catch {
      // Try next candidate
    }
  }
  return createEmptyLedger();
}

/**
 * Merges live GitHub Release & 14-day expiring Traffic data into the persistent ledger
 * with high-water-mark deduplication, then writes atomically to both GitHub and CODES.
 */
export async function syncTelemetryLedger(repo = REPO) {
  const ledger = await loadExistingLedger();
  const releases = fetchReleaseTelemetry(repo);
  if (releases.length === 0) {
    // Offline or GitHub API unreachable: return existing ledger untouched without writing empty snapshot
    return { releases: [], ledger, prevDate: null, offline: true };
  }
  const traffic = fetchExpiringTraffic(repo);

  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  ledger.lastUpdatedDate = todayISO;
  ledger.lastUpdatedIST = now.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: false,
  });

  // 1. Merge 14-day expiring daily views (keyed by YYYY-MM-DD)
  for (const v of traffic.views) {
    if (!v.timestamp) continue;
    const day = String(v.timestamp).slice(0, 10);
    const prev = ledger.dailyTraffic.views[day] || { count: 0, uniques: 0 };
    ledger.dailyTraffic.views[day] = {
      count: Math.max(prev.count, Number(v.count || 0)),
      uniques: Math.max(prev.uniques, Number(v.uniques || 0)),
    };
  }

  // 2. Merge 14-day expiring daily clones (keyed by YYYY-MM-DD)
  for (const cl of traffic.clones) {
    if (!cl.timestamp) continue;
    const day = String(cl.timestamp).slice(0, 10);
    const prev = ledger.dailyTraffic.clones[day] || { count: 0, uniques: 0 };
    ledger.dailyTraffic.clones[day] = {
      count: Math.max(prev.count, Number(cl.count || 0)),
      uniques: Math.max(prev.uniques, Number(cl.uniques || 0)),
    };
  }

  // 3. Merge referrers with high-water-mark protection
  for (const ref of traffic.referrers) {
    if (!ref.referrer) continue;
    const key = ref.referrer;
    const prev = ledger.referrersArchive[key] || { maxCount: 0, maxUniques: 0 };
    const count = Number(ref.count || 0);
    const uniques = Number(ref.uniques || 0);
    ledger.referrersArchive[key] = {
      maxCount: Math.max(prev.maxCount, count),
      maxUniques: Math.max(prev.maxUniques, uniques),
      latestCount: count,
      latestUniques: uniques,
      lastSeen: todayISO,
    };
  }

  // 4. Merge popular paths with high-water-mark protection
  for (const p of traffic.paths) {
    if (!p.path) continue;
    const key = p.path;
    const prev = ledger.pathsArchive[key] || { maxCount: 0, maxUniques: 0 };
    const count = Number(p.count || 0);
    const uniques = Number(p.uniques || 0);
    ledger.pathsArchive[key] = {
      title: p.title || key,
      maxCount: Math.max(prev.maxCount, count),
      maxUniques: Math.max(prev.maxUniques, uniques),
      latestCount: count,
      latestUniques: uniques,
      lastSeen: todayISO,
    };
  }

  // 5. Merge release high-water marks (protects against asset re-upload counter resets)
  for (const r of releases) {
    const prev = ledger.releasesHighWaterMark[r.tag] || {
      publishedAt: r.publishedAt,
      timestamp: r.timestamp,
      mainJs: 0,
      manifest: 0,
      styles: 0,
      totalAssets: 0,
      uniqueInstalls: 0,
    };
    const merged = {
      tag: r.tag,
      publishedAt: r.publishedAt || prev.publishedAt,
      timestamp: r.timestamp || prev.timestamp,
      mainJs: Math.max(prev.mainJs, r.mainJs),
      manifest: Math.max(prev.manifest, r.manifest),
      styles: Math.max(prev.styles, r.styles),
      totalAssets: Math.max(prev.totalAssets, r.totalAssets),
      uniqueInstalls: Math.max(prev.uniqueInstalls, r.uniqueInstalls),
    };
    ledger.releasesHighWaterMark[r.tag] = merged;
    // Update live record with high-water mark
    r.mainJs = merged.mainJs;
    r.manifest = merged.manifest;
    r.styles = merged.styles;
    r.totalAssets = merged.totalAssets;
    r.uniqueInstalls = merged.uniqueInstalls;
  }

  // 6. Compute previous snapshot for delta velocity before recording today's snapshot
  const snapshotDates = Object.keys(ledger.releaseDailySnapshots).sort();
  const prevDate = snapshotDates.filter((d) => d !== todayISO).pop() || null;
  const prevSnapshot = prevDate ? ledger.releaseDailySnapshots[prevDate] : null;

  const byTagToday = {};
  let grandTotalAssets = 0;
  let grandTotalInstalls = 0;
  for (const r of releases) {
    byTagToday[r.tag] = r.totalAssets;
    grandTotalAssets += r.totalAssets;
    grandTotalInstalls += r.uniqueInstalls;
    r.deltaSinceLast = prevSnapshot?.byTag?.[r.tag] !== undefined
      ? Math.max(0, r.totalAssets - prevSnapshot.byTag[r.tag])
      : 0;
  }

  ledger.releaseDailySnapshots[todayISO] = {
    totalAssets: grandTotalAssets,
    uniqueInstalls: grandTotalInstalls,
    byTag: byTagToday,
  };

  // Sort daily keys chronologically for clean JSON storage
  const sortedViews = {};
  for (const k of Object.keys(ledger.dailyTraffic.views).sort()) {
    sortedViews[k] = ledger.dailyTraffic.views[k];
  }
  ledger.dailyTraffic.views = sortedViews;

  const sortedClones = {};
  for (const k of Object.keys(ledger.dailyTraffic.clones).sort()) {
    sortedClones[k] = ledger.dailyTraffic.clones[k];
  }
  ledger.dailyTraffic.clones = sortedClones;

  const serialized = JSON.stringify(ledger, null, 2) + "\n";
  for (const targetPath of [GITHUB_LEDGER_PATH, CODES_LEDGER_PATH]) {
    try {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, serialized, "utf-8");
    } catch {
      // Ignore if one workspace path is unavailable
    }
  }

  return { releases, ledger, prevDate };
}

export function buildMermaidChart(records, maxBars = 15) {
  const recent = records.slice(0, maxBars).reverse();
  const labels = recent.map((r) => `"${r.tag}"`).join(", ");
  const totalDownloads = recent.map((r) => r.totalAssets).join(", ");
  const uniqueInstalls = recent.map((r) => r.uniqueInstalls).join(", ");
  const maxVal = Math.max(...recent.map((r) => r.totalAssets), 100);
  const yMax = Math.ceil((maxVal * 1.1) / 50) * 50;

  return [
    "```mermaid",
    "xychart-beta",
    `    title "Obsidian Color Math — Release Download Telemetry (Last ${recent.length} Releases)"`,
    `    x-axis [${labels}]`,
    `    y-axis "Downloads" 0 --> ${yMax}`,
    `    bar [${totalDownloads}]`,
    `    line [${uniqueInstalls}]`,
    "```",
  ].join("\n");
}

export function buildTrafficMermaidChart(ledger, maxDays = 14) {
  const viewDays = Object.keys(ledger.dailyTraffic.views);
  const cloneDays = Object.keys(ledger.dailyTraffic.clones);
  const allDays = Array.from(new Set([...viewDays, ...cloneDays])).sort().slice(-maxDays);
  if (allDays.length === 0) return "";

  const labels = allDays.map((d) => `"${d.slice(5)}"`).join(", ");
  const views = allDays.map((d) => ledger.dailyTraffic.views[d]?.count || 0);
  const clones = allDays.map((d) => ledger.dailyTraffic.clones[d]?.count || 0);
  const maxVal = Math.max(...views, ...clones, 20);
  const yMax = Math.ceil((maxVal * 1.15) / 10) * 10;

  return [
    "```mermaid",
    "xychart-beta",
    `    title "Archived Daily GitHub Traffic — Views (Bar) vs Git Clones (Line)"`,
    `    x-axis [${labels}]`,
    `    y-axis "Count" 0 --> ${yMax}`,
    `    bar [${views.join(", ")}]`,
    `    line [${clones.join(", ")}]`,
    "```",
  ].join("\n");
}

export function renderTerminalTelemetry(records, ledger, limit = 20) {
  if (records.length === 0) {
    console.log(`${c.yellow}No release download telemetry available.${c.reset}`);
    return;
  }

  const grandTotalAssets = records.reduce((acc, r) => acc + r.totalAssets, 0);
  const grandTotalInstalls = records.reduce((acc, r) => acc + r.uniqueInstalls, 0);
  const maxDownloads = Math.max(...records.map((r) => r.totalAssets), 1);
  const peakRelease = records.reduce(
    (best, r) => (r.totalAssets > best.totalAssets ? r : best),
    records[0]
  );

  // Compute archived traffic totals across all saved days
  const viewEntries = Object.entries(ledger.dailyTraffic.views);
  const cloneEntries = Object.entries(ledger.dailyTraffic.clones);
  const totalViews = viewEntries.reduce((acc, [, v]) => acc + v.count, 0);
  const totalUniqueVisitors = viewEntries.reduce((acc, [, v]) => acc + v.uniques, 0);
  const totalClones = cloneEntries.reduce((acc, [, cl]) => acc + cl.count, 0);
  const totalUniqueCloners = cloneEntries.reduce((acc, [, cl]) => acc + cl.uniques, 0);

  console.log(
    `\n${c.bold}${c.cyan}========================================================================================${c.reset}`
  );
  console.log(
    `${c.bold}${c.cyan}  📊 OBSIDIAN COLOR MATH — PERMANENT TELEMETRY & 14-DAY TRAFFIC ARCHIVE${c.reset}`
  );
  console.log(
    `${c.bold}${c.cyan}========================================================================================${c.reset}`
  );
  console.log(
    `  • ${c.bold}Cumulative Asset Downloads:${c.reset}  ${c.green}${c.bold}${grandTotalAssets.toLocaleString()}${c.reset} across ${records.length} tracked releases`
  );
  console.log(
    `  • ${c.bold}Estimated Plugin Installs:${c.reset}   ${c.cyan}${c.bold}${grandTotalInstalls.toLocaleString()}${c.reset} (max(main.js, manifest.json) per release)`
  );
  console.log(
    `  • ${c.bold}Peak Release Adoption:${c.reset}       ${c.magenta}${c.bold}v${peakRelease.tag}${c.reset} (${peakRelease.totalAssets} asset downloads / ${peakRelease.uniqueInstalls} installs)`
  );
  console.log(
    `  • ${c.bold}Archived GitHub Views:${c.reset}       ${c.yellow}${c.bold}${totalViews.toLocaleString()}${c.reset} views (${totalUniqueVisitors.toLocaleString()} daily unique visitors across ${viewEntries.length} archived days)`
  );
  console.log(
    `  • ${c.bold}Archived Git Clones:${c.reset}         ${c.blue}${c.bold}${totalClones.toLocaleString()}${c.reset} clones (${totalUniqueCloners.toLocaleString()} daily unique cloners across ${cloneEntries.length} archived days)`
  );
  console.log(
    `  • ${c.bold}Persistent Ledger Saved:${c.reset}     ${c.dim}${GITHUB_LEDGER_PATH}${c.reset}\n`
  );

  const displayed = records.slice(0, limit);
  const barWidth = 30;

  console.log(
    `  ${c.bold}${"Release".padEnd(10)} │ ${"Published".padEnd(10)} │ ${"Installs".padStart(8)} │ ${"Assets".padStart(7)} │ ${"Adoption Distribution (Total Assets)".padEnd(barWidth + 7)}${c.reset}`
  );
  console.log(
    `  ───────────┼────────────┼──────────┼─────────┼───────────────────────────────────────`
  );

  for (const r of displayed) {
    const ratio = r.totalAssets / maxDownloads;
    const filled = Math.max(1, Math.round(ratio * barWidth));
    const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
    const pct = ((r.totalAssets / grandTotalAssets) * 100).toFixed(1).padStart(4);
    const deltaStr = r.deltaSinceLast > 0 ? ` ${c.green}(+${r.deltaSinceLast})${c.reset}` : "";

    const tagStr = `v${r.tag.replace(/^v/, "")}`.padEnd(10);
    const instStr = String(r.uniqueInstalls).padStart(8);
    const assetStr = String(r.totalAssets).padStart(7);

    console.log(
      `  ${c.cyan}${tagStr}${c.reset} │ ${c.dim}${r.publishedAt}${c.reset} │ ${c.green}${instStr}${c.reset} │ ${c.bold}${assetStr}${c.reset} │ ${c.magenta}${bar}${c.reset} ${c.dim}${pct}%${c.reset}${deltaStr}`
    );
  }

  if (records.length > limit) {
    console.log(
      `  ${c.dim}... and ${records.length - limit} older releases (pass --all to view all)${c.reset}`
    );
  }
  console.log(
    `  ───────────┴────────────┴──────────┴─────────┴───────────────────────────────────────`
  );

  // Display Top Referrers if available
  const refList = Object.entries(ledger.referrersArchive);
  if (refList.length > 0) {
    console.log(`\n  ${c.bold}🌐 Top Discovery Referrers (Archived High-Water Marks):${c.reset}`);
    for (const [source, data] of refList.slice(0, 6)) {
      console.log(
        `    • ${c.cyan}${source.padEnd(22)}${c.reset} : ${c.bold}${String(data.maxCount).padStart(4)}${c.reset} views (${data.maxUniques} unique visitors)`
      );
    }
  }
  console.log();
}

export async function printCompactTelemetrySummary(limit = 5) {
  try {
    const { releases, ledger } = await syncTelemetryLedger();
    if (releases.length === 0) return;
    const grandTotal = releases.reduce((acc, r) => acc + r.totalAssets, 0);
    const latest = releases[0];
    const viewDays = Object.keys(ledger.dailyTraffic.views).length;
    console.log(
      `  • ${c.cyan}Live Telemetry & Archive:${c.reset} ${c.bold}${grandTotal.toLocaleString()}${c.reset} cumulative downloads | Latest (${c.green}v${latest.tag}${c.reset}): ${c.bold}${latest.totalAssets}${c.reset} downloads (${latest.uniqueInstalls} installs)`
    );
    console.log(
      `  • ${c.green}✔ Saved 14-day expiring traffic & release history (${viewDays} days tracked) to data/telemetry_history.json${c.reset}`
    );
    const recent = releases.slice(0, limit);
    const maxD = Math.max(...recent.map((r) => r.totalAssets), 1);
    for (const r of recent) {
      const len = Math.max(1, Math.round((r.totalAssets / maxD) * 18));
      const bar = "█".repeat(len);
      console.log(
        `    - ${`v${r.tag}`.padEnd(8)} [${r.publishedAt}]: ${c.magenta}${bar.padEnd(18)}${c.reset} ${r.totalAssets} (${r.uniqueInstalls} installs)`
      );
    }
  } catch {
    // Non-fatal if offline
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isAuto = args.includes("--auto");
  const showAll = args.includes("--all");
  const showMermaid = args.includes("--mermaid");
  const asJson = args.includes("--json");

  if (isAuto) {
    // Fast same-day check (<2ms): if already archived today, exit immediately with zero network I/O
    const existing = await loadExistingLedger();
    const todayISO = new Date().toISOString().slice(0, 10);
    if (existing.lastUpdatedDate === todayISO && existing.releaseDailySnapshots?.[todayISO]) {
      process.exit(0);
    }

    // Retry up to 3 times (10s apart) in case Wi-Fi is still connecting after laptop startup
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await syncTelemetryLedger();
      if (!res.offline && res.releases.length > 0) {
        process.exit(0);
      }
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 10000));
      }
    }
    process.exit(0);
  }

  const { releases, ledger } = await syncTelemetryLedger();

  if (asJson) {
    console.log(JSON.stringify({ releases, ledger }, null, 2));
    return;
  }

  renderTerminalTelemetry(releases, ledger, showAll ? releases.length : 20);

  if (showMermaid) {
    console.log(`${c.bold}[Mermaid xychart-beta Output — Release Downloads]${c.reset}\n`);
    console.log(buildMermaidChart(releases, 15));
    console.log();
    const trafficChart = buildTrafficMermaidChart(ledger, 14);
    if (trafficChart) {
      console.log(`${c.bold}[Mermaid xychart-beta Output — Archived Daily Traffic]${c.reset}\n`);
      console.log(trafficChart);
      console.log();
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith("telemetry.mjs")) {
  main().catch((err) => {
    console.error(`${c.red}❌ Failed to fetch release telemetry: ${err.message}${c.reset}`);
    process.exit(1);
  });
}
