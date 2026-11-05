// scripts/inspect_catalog.ts
import fs from "fs";
import path from "path";
import { lookupCatalog, ROLE_NAMES, CatalogEntry, getMandatoryArgs, getOptionalArgs, getExpectedChildTag } from "../src/parsers/catalog";

/**
 * Permanent MPHF Completeness & Field Audit Tool
 * Scans all 9,342 entries in src/parsers/catalog.ts and reports field parity across roles.
 */
export function runCatalogAudit() {
  const catalogText = fs.readFileSync(path.resolve(__dirname, "../src/parsers/catalog.ts"), "utf8");
  const matches = catalogText.match(/\{"key":.*?\}(?=,|\n|\])/g) || [];

  console.log(`Total entries extracted: ${matches.length}`);

  let totalWithExpectedText = 0;
  let totalWithHexCode = 0;
  let totalWithArityNibble = 0;
  let totalWithLayoutSlotCode = 0;
  let totalWithLimits = 0;
  let totalWithImplicitEnclosure = 0;

  const roleStats: Record<number, {
    name: string;
    total: number;
    withExpectedText: number;
    withHexCode: number;
    withArityNibble: number;
    withLayoutSlotCode: number;
  }> = {};

  for (let r = 0; r <= 15; r++) {
    roleStats[r] = {
      name: ROLE_NAMES[r] || `ROLE_${r}`,
      total: 0,
      withExpectedText: 0,
      withHexCode: 0,
      withArityNibble: 0,
      withLayoutSlotCode: 0,
    };
  }

  for (const m of matches) {
    try {
      const entry: CatalogEntry = JSON.parse(m);
      const r = entry.roleId ?? 9;
      const stats = roleStats[r];
      if (!stats) continue;

      stats.total++;
      if (entry.expectedText !== undefined) {
        stats.withExpectedText++;
        totalWithExpectedText++;
      }
      if (entry.hexCode !== undefined) {
        stats.withHexCode++;
        totalWithHexCode++;
      }
      if (entry.arityNibble !== undefined) {
        stats.withArityNibble++;
        totalWithArityNibble++;
      }
      if (entry.layoutSlotCode !== undefined && entry.layoutSlotCode !== 0) {
        stats.withLayoutSlotCode++;
        totalWithLayoutSlotCode++;
      }
      if (entry.hasLimits) {
        totalWithLimits++;
      }
      if (entry.implicitEnclosure) {
        totalWithImplicitEnclosure++;
      }
    } catch {}
  }

  console.log("\n=========================================================================================");
  console.log("             MPHF CATALOG FIELD COMPLETENESS AUDIT BY ROLE (9,342 ENTRIES)");
  console.log("=========================================================================================");
  console.log("RoleId | Role Name    | Total | ExpectedText (%) | 1-Glyph HexCode | ArityNibble | LayoutSlotCode");
  console.log("-------+--------------+-------+------------------+-----------------+-------------+---------------");

  for (let r = 0; r <= 15; r++) {
    const s = roleStats[r];
    const pct = s.total > 0 ? ((s.withExpectedText / s.total) * 100).toFixed(1) + "%" : "N/A";
    const rIdStr = String(r).padStart(6);
    const nameStr = s.name.padEnd(12);
    const totStr = String(s.total).padStart(5);
    const uPctStr = pct.padStart(16);
    const hexStr = String(s.withHexCode).padStart(15);
    const arityStr = String(s.withArityNibble).padStart(11);
    const layoutStr = String(s.withLayoutSlotCode).padStart(14);

    console.log(`${rIdStr} | ${nameStr} | ${totStr} | ${uPctStr} | ${hexStr} | ${arityStr} | ${layoutStr}`);
  }

  console.log("=========================================================================================");
  console.log(`Global Summary:`);
  console.log(`- ExpectedText Coverage:       ${totalWithExpectedText} / 9342 (${((totalWithExpectedText / 9342) * 100).toFixed(2)}%)`);
  console.log(`- 1-Glyph Hex Codes:          ${totalWithHexCode} / 9342`);
  console.log(`- Arity Nibble Assigned:       ${totalWithArityNibble} / 9342 (${((totalWithArityNibble / 9342) * 100).toFixed(2)}%)`);
  console.log(`- 2D/3D Molecule Slot Codes:   ${totalWithLayoutSlotCode}`);
  console.log(`- Limits-Capable Operators:    ${totalWithLimits}`);
  console.log(`- Implicit Enclosure Envelopes:${totalWithImplicitEnclosure}`);
  console.log("=========================================================================================\n");

  // Inspect targeted test cases
  const targets = [
    "_", "^", "\\_", "\\ ", "\\quad", "\\hspace",
    "\\alpha", "\\cdots", "+", "\\pm", "\\le",
    "\\sin", "\\cos", "\\log", "\\ln", "\\lim",
    "\\frac", "\\dfrac", "\\binom", "\\sqrt",
    "\\vec", "\\hat", "\\overline", "\\overrightarrow", "\\underline",
    "\\underbrace", "\\overbrace", "\\underbracket", "\\overbracket",
    "\\xrightarrow", "\\xleftarrow", "\\xrightleftharpoons",
    "\\pmatrix", "mat"
  ];

  console.log("SAMPLE SPECIFIC MACROS IN CATALOG:");
  for (const t of targets) {
    const entry = lookupCatalog(t) || lookupCatalog(t.replace(/^\\/, ""));
    if (entry) {
      const mand = getMandatoryArgs(entry);
      const opt = getOptionalArgs(entry);
      const slot0Tag = getExpectedChildTag(entry, 0);
      const slot1Tag = getExpectedChildTag(entry, 1);
      console.log(`  ${t.padEnd(20)} -> mand=${mand}, opt=${opt}, slot0=0x${slot0Tag.toString(16)}, slot1=0x${slot1Tag.toString(16)} | ${JSON.stringify(entry)}`);
    } else {
      console.log(`  ${t.padEnd(20)} -> NOT FOUND`);
    }
  }
}

// Run when executed directly
runCatalogAudit();
