// scripts/reconstruct_catalog.ts
//! Authoritative Offline Catalog Reconstruction & Normalization Engine.
//! Enriches all 9,342 entries in src/parsers/catalog.ts with:
//! 1. expectedText: Canonical visible DOM Unicode representation.
//! 2. hexCode: Strictly scalar uint32 codepoints for 1-glyph atoms (undefined for multi-glyph words).
//! 3. arityNibble: 4-bit packed arity signature (optionalArgs << 2 | mandatoryArgs).
//! 4. layoutSlotCode: 16-bit Big-Endian layout blueprint for 2D structural molecules.
//! 5. hasLimits: Dynamic limits capability for \lim, \sum, \prod, etc.
//! 6. implicitEnclosure: Structural delimiter absorption flag for \binom, \pmod.
//! 7. Role normalization: Normalizes all extensible arrows to ROLE_RELATION (roleId: 2).

import fs from "fs";
import path from "path";
import {
  ROLE_FUNCTION,
  ROLE_OPERATOR,
  ROLE_RELATION,
  ROLE_DELIMITER,
  ROLE_STRUCTURAL,
  ROLE_SPACING,
  TAG_NONE,
  TAG_NUM,
  TAG_DEN,
  TAG_BOX,
  TAG_ROOT,
  TAG_SUB,
  TAG_SUP,
  TAG_UNDER,
  TAG_OVER,
  TAG_MTR,
  TAG_MTD,
  TAG_MSPACE,
} from "../src/parsers/catalog";

// Set of commands with movable displaylimits behavior
const LIMITS_COMMANDS = new Set([
  "\\lim",
  "\\limsup",
  "\\liminf",
  "\\varlimsup",
  "\\varliminf",
  "\\sum",
  "\\prod",
  "\\coprod",
  "\\bigcap",
  "\\bigcup",
  "\\bigvee",
  "\\bigwedge",
  "\\bigotimes",
  "\\bigoplus",
  "\\biguplus",
  "\\bigodot",
  "\\max",
  "\\min",
  "\\sup",
  "\\inf",
  "\\det",
  "\\gcd",
  "\\Pr",
  "\\injlim",
  "\\projlim",
  "\\varinjlim",
  "\\varprojlim",
]);

// Set of commands with synthetic enclosing delimiters in MathJax CHTML
const IMPLICIT_ENCLOSURE_COMMANDS = new Set([
  "\\binom",
  "\\dbinom",
  "\\tbinom",
  "\\pmod",
]);

// Set of extensible arrows that must normalize to ROLE_RELATION (roleId: 2)
const EXTENSIBLE_ARROWS = new Map<string, string>([
  ["\\xrightarrow", "→"],
  ["\\xleftarrow", "←"],
  ["\\xleftrightarrow", "↔"],
  ["\\xRightarrow", "⇒"],
  ["\\xLeftarrow", "⇐"],
  ["\\xLeftrightarrow", "⇔"],
  ["\\xhookleftarrow", "↩"],
  ["\\xhookrightarrow", "↪"],
  ["\\xtwoheadrightarrow", "↠"],
  ["\\xtwoheadleftarrow", "↞"],
  ["\\xmapsto", "↦"],
  ["\\xrightleftharpoons", "⇌"],
]);

// Set of pure spacing commands
const SPACING_MACROS = new Set([
  "\\quad",
  "\\qquad",
  "\\,",
  "\\:",
  "\\;",
  "\\!",
  "\\ ",
  "\\enspace",
  "\\space",
  "\\thinspace",
  "\\medspace",
  "\\thickspace",
  "\\negthinspace",
  "\\negmedspace",
  "\\negthickspace",
  "\\hskip",
  "\\kern",
  "\\hspace",
  "\\mspace",
]);

// Structural Layout Slot Codes (32-Bit Big-Endian: Slot 0 = Bits 31..24, Slot 1 = Bits 23..16, Slot 2 = Bits 15..8, Slot 3 = Bits 7..0)
const LAYOUT_SLOT_CODES: Record<string, number> = {
  // Scripts:
  // Subscript `_`: Slot 0 = TAG_SUB (0x11), Slot 1 = TAG_UNDER (0x0C for hasLimits)
  "_": (((TAG_SUB << 24) | (TAG_UNDER << 16)) >>> 0),
  // Superscript `^`: Slot 0 = TAG_SUP (0x12), Slot 1 = TAG_OVER (0x0D for hasLimits)
  "^": (((TAG_SUP << 24) | (TAG_OVER << 16)) >>> 0),

  // Fractions & Generalized Fractions: Slot 0 = TAG_NUM (0x03), Slot 1 = TAG_DEN (0x04)
  "\\frac": (((TAG_NUM << 24) | (TAG_DEN << 16)) >>> 0),
  "\\dfrac": (((TAG_NUM << 24) | (TAG_DEN << 16)) >>> 0),
  "\\tfrac": (((TAG_NUM << 24) | (TAG_DEN << 16)) >>> 0),
  "\\cfrac": (((TAG_NUM << 24) | (TAG_DEN << 16)) >>> 0),
  "\\binom": (((TAG_NUM << 24) | (TAG_DEN << 16)) >>> 0),
  "\\dbinom": (((TAG_NUM << 24) | (TAG_DEN << 16)) >>> 0),
  "\\tbinom": (((TAG_NUM << 24) | (TAG_DEN << 16)) >>> 0),
  "\\genfrac": (((TAG_NUM << 24) | (TAG_DEN << 16)) >>> 0),
  "\\over": (((TAG_NUM << 24) | (TAG_DEN << 16)) >>> 0),
  "\\atop": (((TAG_NUM << 24) | (TAG_DEN << 16)) >>> 0),
  "\\choose": (((TAG_NUM << 24) | (TAG_DEN << 16)) >>> 0),

  // Radical: Slot 0 = TAG_BOX (0x0E), Slot 1 = TAG_ROOT (0x17)
  "\\sqrt": (((TAG_BOX << 24) | (TAG_ROOT << 16)) >>> 0),

  // Over-scripts, Accents & Over-Bars: Slot 0 = TAG_OVER (0x0D)
  "\\overset": ((TAG_OVER << 24) >>> 0),
  "\\stackrel": ((TAG_OVER << 24) >>> 0),
  "\\overbrace": ((TAG_OVER << 24) >>> 0),
  "\\overbracket": ((TAG_OVER << 24) >>> 0),
  "\\overline": ((TAG_OVER << 24) >>> 0),
  "\\widehat": ((TAG_OVER << 24) >>> 0),
  "\\widetilde": ((TAG_OVER << 24) >>> 0),
  "\\widecheck": ((TAG_OVER << 24) >>> 0),
  "\\overrightarrow": ((TAG_OVER << 24) >>> 0),
  "\\overleftarrow": ((TAG_OVER << 24) >>> 0),
  "\\overleftrightarrow": ((TAG_OVER << 24) >>> 0),
  "\\vec": ((TAG_OVER << 24) >>> 0),
  "\\hat": ((TAG_OVER << 24) >>> 0),
  "\\bar": ((TAG_OVER << 24) >>> 0),
  "\\tilde": ((TAG_OVER << 24) >>> 0),
  "\\dot": ((TAG_OVER << 24) >>> 0),
  "\\ddot": ((TAG_OVER << 24) >>> 0),
  "\\dddot": ((TAG_OVER << 24) >>> 0),
  "\\ddddot": ((TAG_OVER << 24) >>> 0),
  "\\check": ((TAG_OVER << 24) >>> 0),
  "\\acute": ((TAG_OVER << 24) >>> 0),
  "\\grave": ((TAG_OVER << 24) >>> 0),
  "\\breve": ((TAG_OVER << 24) >>> 0),
  "\\mathring": ((TAG_OVER << 24) >>> 0),

  // Under-scripts & Under-Bars: Slot 0 = TAG_UNDER (0x0C)
  "\\underset": ((TAG_UNDER << 24) >>> 0),
  "\\underbrace": ((TAG_UNDER << 24) >>> 0),
  "\\underbracket": ((TAG_UNDER << 24) >>> 0),
  "\\underline": ((TAG_UNDER << 24) >>> 0),
  "\\underleftarrow": ((TAG_UNDER << 24) >>> 0),
  "\\underrightarrow": ((TAG_UNDER << 24) >>> 0),
  "\\underleftrightarrow": ((TAG_UNDER << 24) >>> 0),

  // Extensible arrows: Slot 0 = TAG_OVER (0x0D), Slot 1 = TAG_UNDER (0x0C)
  "\\xrightarrow": (((TAG_OVER << 24) | (TAG_UNDER << 16)) >>> 0),
  "\\xleftarrow": (((TAG_OVER << 24) | (TAG_UNDER << 16)) >>> 0),
  "\\xleftrightarrow": (((TAG_OVER << 24) | (TAG_UNDER << 16)) >>> 0),
  "\\xRightarrow": (((TAG_OVER << 24) | (TAG_UNDER << 16)) >>> 0),
  "\\xLeftarrow": (((TAG_OVER << 24) | (TAG_UNDER << 16)) >>> 0),
  "\\xLeftrightarrow": (((TAG_OVER << 24) | (TAG_UNDER << 16)) >>> 0),
  "\\xhookleftarrow": (((TAG_OVER << 24) | (TAG_UNDER << 16)) >>> 0),
  "\\xhookrightarrow": (((TAG_OVER << 24) | (TAG_UNDER << 16)) >>> 0),
  "\\xtwoheadrightarrow": (((TAG_OVER << 24) | (TAG_UNDER << 16)) >>> 0),
  "\\xtwoheadleftarrow": (((TAG_OVER << 24) | (TAG_UNDER << 16)) >>> 0),
  "\\xmapsto": (((TAG_OVER << 24) | (TAG_UNDER << 16)) >>> 0),
  "\\xrightleftharpoons": (((TAG_OVER << 24) | (TAG_UNDER << 16)) >>> 0),

  // Matrix & Cases Constructors: Slot 0 = TAG_MTR (0x18), Slot 1 = TAG_MTD (0x19)
  "\\matrix": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "\\pmatrix": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "\\bmatrix": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "\\Bmatrix": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "\\vmatrix": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "\\Vmatrix": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "\\smallmatrix": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "mat": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "matrix": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "pmat": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "bmat": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "cmat": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "Bmat": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "dmat": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "vmat": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "Vmat": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "nmat": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),
  "cases": (((TAG_MTR << 24) | (TAG_MTD << 16)) >>> 0),

  // Spacing Macros: Slot 0 = TAG_MSPACE (0x1A)
  "\\quad": ((TAG_MSPACE << 24) >>> 0),
  "\\qquad": ((TAG_MSPACE << 24) >>> 0),
  "\\,": ((TAG_MSPACE << 24) >>> 0),
  "\\:": ((TAG_MSPACE << 24) >>> 0),
  "\\;": ((TAG_MSPACE << 24) >>> 0),
  "\\!": ((TAG_MSPACE << 24) >>> 0),
  "\\ ": ((TAG_MSPACE << 24) >>> 0),
  "\\enspace": ((TAG_MSPACE << 24) >>> 0),
  "\\space": ((TAG_MSPACE << 24) >>> 0),
  "\\thinspace": ((TAG_MSPACE << 24) >>> 0),
  "\\medspace": ((TAG_MSPACE << 24) >>> 0),
  "\\thickspace": ((TAG_MSPACE << 24) >>> 0),
  "\\negthinspace": ((TAG_MSPACE << 24) >>> 0),
  "\\negmedspace": ((TAG_MSPACE << 24) >>> 0),
  "\\negthickspace": ((TAG_MSPACE << 24) >>> 0),
  "\\hskip": ((TAG_MSPACE << 24) >>> 0),
  "\\kern": ((TAG_MSPACE << 24) >>> 0),
  "\\hspace": ((TAG_MSPACE << 24) >>> 0),
  "\\mspace": ((TAG_MSPACE << 24) >>> 0),
};

// Common math functions
const COMMON_FUNCTIONS = new Set([
  "\\sin", "\\cos", "\\tan", "\\sec", "\\csc", "\\cot",
  "\\arcsin", "\\arccos", "\\arctan", "\\arcsec", "\\arccsc", "\\arccot",
  "\\sinh", "\\cosh", "\\tanh", "\\sech", "\\csch", "\\coth",
  "\\arsinh", "\\arcosh", "\\artanh",
  "\\ln", "\\log", "\\lg", "\\exp",
  "\\det", "\\gcd", "\\deg", "\\dim", "\\ker", "\\hom", "\\arg",
  "\\Pr", "\\arg", "\\deg", "\\dim", "\\exp", "\\gcd", "\\hom",
  "\\inf", "\\ker", "\\lg", "\\lim", "\\liminf", "\\limsup",
  "\\ln", "\\log", "\\max", "\\min", "\\Pr", "\\sec", "\\sin",
  "\\sinh", "\\sup", "\\tan", "\\tanh"
]);

export function deriveExpectedText(key: string, existingUnicode?: string, canonical?: string, roleId?: number): string {
  // 1. Spacing macros produce zero visible text in DOM
  if (SPACING_MACROS.has(key)) {
    return "";
  }

  // 2. Extensible arrows
  if (EXTENSIBLE_ARROWS.has(key)) {
    return EXTENSIBLE_ARROWS.get(key)!;
  }

  // 3. Existing unicode is authoritative
  if (existingUnicode && existingUnicode.length > 0) {
    return existingUnicode;
  }

  // 4. Structural layout macros produce layout wrappers, not direct visible text
  if (key === "\\frac" || key === "\\dfrac" || key === "\\tfrac" || key === "\\cfrac" ||
      key === "\\binom" || key === "\\dbinom" || key === "\\tbinom" || key === "\\genfrac") {
    return "";
  }

  // 5. Escaped TeX punctuation
  if (key === "\\{" || key === "\\}") return key.slice(1);
  if (key === "\\%" || key === "\\_" || key === "\\&" || key === "\\#") return key.slice(1);
  if (key === "\\\\") return "";

  // 6. Common LaTeX functions: \sin -> "sin"
  if (key.startsWith("\\") && COMMON_FUNCTIONS.has(key)) {
    return key.slice(1);
  }

  // 7. Canonical alias translation (e.g. Eq -> "=")
  if (canonical) {
    if (canonical === "=" || canonical === "\\mathplus" || canonical === "\\pm" || canonical === "i") {
      if (canonical === "\\mathplus") return "+";
      return canonical;
    }
  }

  // 8. Bare word functions or standard macros
  if (key.startsWith("\\")) {
    const bare = key.slice(1);
    if (/^[A-Za-z]+$/.test(bare)) {
      return bare;
    }
  }

  // 9. Dialect alias fallback: bare symbol or text
  return key;
}

const N_ENTRIES = 9342;
const BUCKET_MASK = 4095;

// 32-bit FNV-1a hash
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Verifies 100% collision-free MPHF mapping across all catalog entries.
 */
export function verifyMPHF(
  entries: { key: string }[],
  displacements: Uint16Array
): { valid: boolean; collisionCount: number } {
  const n = entries.length;
  let collisions = 0;
  for (let i = 0; i < n; i++) {
    const key = entries[i].key;
    const h0 = fnv1a(key);
    const d = displacements[h0 & BUCKET_MASK];
    const h = (h0 ^ Math.imul(d, 0x9E3779B9)) >>> 0;
    const slot = Math.floor((h * n) / 4294967296);
    if (slot !== i) {
      collisions++;
      console.error(`MPHF mismatch at index ${i}: key "${key}" mapped to slot ${slot}`);
    }
  }
  return { valid: collisions === 0, collisionCount: collisions };
}

/**
 * Deterministic Compress, Hash, and Displace (CHD) solver.
 */
export function solveCHD(keys: string[]): { displacements: Uint16Array; tableOrder: number[] } {
  const n = keys.length;
  const numBuckets = 4096;
  const mask = 4095;

  const buckets: { bucketId: number; items: { key: string; origIdx: number; h0: number }[] }[] = [];
  for (let b = 0; b < numBuckets; b++) {
    buckets.push({ bucketId: b, items: [] });
  }

  for (let i = 0; i < n; i++) {
    const key = keys[i];
    const h0 = fnv1a(key);
    const b = h0 & mask;
    buckets[b].items.push({ key, origIdx: i, h0 });
  }

  // Sort buckets descending by item count (densest collision sets first)
  buckets.sort((a, b) => b.items.length - a.items.length);

  const displacements = new Uint16Array(numBuckets);
  const occupied = new Uint8Array(n);
  const tableOrder = new Array<number>(n);

  for (const bucket of buckets) {
    if (bucket.items.length === 0) continue;

    let d = 0;
    while (d < 65536) {
      let collision = false;
      const slots = new Set<number>();

      for (const item of bucket.items) {
        const h = (item.h0 ^ Math.imul(d, 0x9E3779B9)) >>> 0;
        const slot = Math.floor((h * n) / 4294967296);

        if (occupied[slot] || slots.has(slot)) {
          collision = true;
          break;
        }
        slots.add(slot);
      }

      if (!collision) {
        displacements[bucket.bucketId] = d;
        for (const item of bucket.items) {
          const h = (item.h0 ^ Math.imul(d, 0x9E3779B9)) >>> 0;
          const slot = Math.floor((h * n) / 4294967296);
          occupied[slot] = 1;
          tableOrder[slot] = item.origIdx;
        }
        break;
      }
      d++;
    }

    if (d >= 65536) {
      throw new Error(`CHD solver failed to find displacement for bucket ${bucket.bucketId} (${bucket.items.length} items)`);
    }
  }

  return { displacements, tableOrder };
}

export function reconstructCatalog(): void {
  const catalogPath = path.resolve(__dirname, "../src/parsers/catalog.ts");
  console.log(`Reading catalog from: ${catalogPath}`);
  const content = fs.readFileSync(catalogPath, "utf8");

  // Extract DISPLACEMENTS array
  const dispMatch = content.match(/const DISPLACEMENTS = new Uint16Array\(\[\s*([\s\S]*?)\s*\]\);/);
  if (!dispMatch) {
    throw new Error("Failed to locate DISPLACEMENTS array in src/parsers/catalog.ts");
  }
  const displacementValues = dispMatch[1].split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  const displacements = new Uint16Array(displacementValues);
  console.log(`Loaded ${displacements.length} entries in DISPLACEMENTS table.`);

  // Extract catalog entries
  const matches = content.match(/\{"key":.*?\}(?=,|\n|\])/g) || [];
  console.log(`Extracted ${matches.length} catalog entries for reconstruction.`);

  let enrichedCount = 0;
  let singleHexCount = 0;
  let multiGlyphCount = 0;
  let limitsCount = 0;
  let enclosureCount = 0;
  let arrowRoleMigrated = 0;

  const newEntries: any[] = [];

  for (const m of matches) {
    const e = JSON.parse(m);

    // Normalize legacy triple-backslash prefix for metadata lookups while strictly preserving e.key for MPHF injectivity
    const normKey = e.key.replace(/^\\+/, "\\");

    // 1. Compute expectedText consuming normKey (so spacing macros return "")
    const expectedText = deriveExpectedText(normKey, e.unicode, e.canonical, e.roleId);

    // 2. Compute scalar hexCode strictly for 1-glyph atoms (undefined for multi-glyph words)
    let hexCode: number | undefined = undefined;
    const glyphChars = [...expectedText];
    if (glyphChars.length === 1 && expectedText.length > 0) {
      hexCode = expectedText.codePointAt(0);
      singleHexCount++;
    } else if (glyphChars.length > 1) {
      multiGlyphCount++;
    }

    // 3. Compute arityNibble
    const optionalArgs = e.hasOptionalBracket ? 1 : 0;
    let mandatoryArgs = 0;
    if (e.arity !== undefined) {
      mandatoryArgs = e.arity >= 3 ? 3 : e.arity;
    }
    const arityNibble = (optionalArgs << 2) | (mandatoryArgs & 0x3);

    // 4. Compute layoutSlotCode using normKey fallback
    const layoutSlotCode = LAYOUT_SLOT_CODES[normKey] ?? LAYOUT_SLOT_CODES[e.key] ?? 0x0000;

    // 5. Compute hasLimits
    const hasLimits = LIMITS_COMMANDS.has(normKey) || LIMITS_COMMANDS.has(e.key);
    if (hasLimits) limitsCount++;

    // 6. Compute implicitEnclosure
    const implicitEnclosure = IMPLICIT_ENCLOSURE_COMMANDS.has(normKey) || IMPLICIT_ENCLOSURE_COMMANDS.has(e.key);
    if (implicitEnclosure) enclosureCount++;

    // 7. Extensible arrows role normalization to ROLE_RELATION (2)
    let roleId = e.roleId;
    if ((EXTENSIBLE_ARROWS.has(normKey) || EXTENSIBLE_ARROWS.has(e.key)) && roleId !== ROLE_RELATION) {
      roleId = ROLE_RELATION;
      arrowRoleMigrated++;
    }

    // Construct clean, compact entry strictly retaining original e.key for MPHF collision immunity
    const entryObj: any = {
      key: e.key,
      expectedText,
    };

    if (hexCode !== undefined) {
      entryObj.hexCode = hexCode;
    }

    entryObj.roleId = roleId;
    entryObj.priority = e.priority;
    entryObj.domains = e.domains;

    if (e.dialects !== undefined) {
      entryObj.dialects = e.dialects;
    }

    entryObj.arityNibble = arityNibble;

    if (e.argType !== undefined) {
      entryObj.argType = e.argType;
    }

    if (layoutSlotCode !== 0) {
      entryObj.layoutSlotCode = layoutSlotCode;
    }

    if (hasLimits) {
      entryObj.hasLimits = true;
    }

    if (implicitEnclosure) {
      entryObj.implicitEnclosure = true;
    }

    if (e.isSpecialCase) {
      entryObj.isSpecialCase = true;
    }

    if (e.extensible) {
      entryObj.extensible = true;
    }

    if (e.uncolored) {
      entryObj.uncolored = true;
    }

    if (e.tier !== undefined && e.tier !== 0) {
      entryObj.tier = e.tier;
    }

    if (e.canonical) {
      entryObj.canonical = e.canonical;
    }

    // Backward-compatibility properties
    entryObj.unicode = expectedText;
    if (e.arity !== undefined) {
      entryObj.arity = e.arity;
    }
    if (e.hasOptionalBracket) {
      entryObj.hasOptionalBracket = true;
    }

    newEntries.push(entryObj);
    enrichedCount++;
  }

  console.log(`\nReconstruction Summary:`);
  console.log(`- Total Entries Processed:      ${enrichedCount}`);
  console.log(`- Single-Glyph Hex Codes:       ${singleHexCount}`);
  console.log(`- Multi-Glyph Words (no hex):   ${multiGlyphCount}`);
  console.log(`- Limits-Capable Operators:     ${limitsCount}`);
  console.log(`- Implicit Enclosure Molecules: ${enclosureCount}`);
  console.log(`- Extensible Arrows Normalized: ${arrowRoleMigrated}`);

  // Verify 100% collision-free MPHF mapping
  const mphfResult = verifyMPHF(newEntries, displacements);
  if (!mphfResult.valid) {
    throw new Error(`Lemire MPHF verification failed with ${mphfResult.collisionCount} collisions!`);
  }
  console.log(`- Lemire MPHF Verification:     100% Collision-Free (${newEntries.length}/${newEntries.length} entries matched)`);

  // Format CATALOG_TABLE lines
  const tableLines = newEntries.map(e => "  " + JSON.stringify(e)).join(",\n");

  // Locate CATALOG_TABLE in catalog.ts
  const startMarker = "const CATALOG_TABLE: CatalogEntry[] = [\n";
  const endMarker = "\n];";

  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker, startIndex);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error("Failed to locate CATALOG_TABLE markers in src/parsers/catalog.ts");
  }

  const updatedCatalogContent =
    content.slice(0, startIndex + startMarker.length) +
    tableLines +
    content.slice(endIndex);

  fs.writeFileSync(catalogPath, updatedCatalogContent, "utf8");
  console.log(`\nSuccessfully reconstructed and wrote ${newEntries.length} entries into ${catalogPath}`);
}

if (require.main === module || (process.argv[1] && process.argv[1].endsWith("reconstruct_catalog.ts"))) {
  reconstructCatalog();
}
