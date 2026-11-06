// scripts/generate_rust_catalog.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DISPLACEMENTS, CATALOG_TABLE } from "../src/parsers/catalog";

async function main() {
  console.log(`Generating Rust catalog data from ${CATALOG_TABLE.length} entries...`);

  const outPath = path.resolve("wasm/src/catalog_data.rs");
  
  let rs = `// wasm/src/catalog_data.rs\n// AUTO-GENERATED Lemire MPHF Catalog Data (9,342 entries). DO NOT EDIT MANUALLY.\n\n`;
  rs += `pub const N: usize = ${CATALOG_TABLE.length};\n`;
  rs += `pub const MASK: usize = 4095;\n\n`;

  // Displacements
  rs += `pub static DISPLACEMENTS: [u16; 4096] = [\n  `;
  for (let i = 0; i < DISPLACEMENTS.length; i++) {
    rs += DISPLACEMENTS[i] + (i < DISPLACEMENTS.length - 1 ? "," : "");
    if ((i + 1) % 32 === 0) rs += "\n  ";
  }
  rs += `\n];\n\n`;

  // Keys
  rs += `pub static CATALOG_KEYS: [&str; ${CATALOG_TABLE.length}] = [\n`;
  for (let i = 0; i < CATALOG_TABLE.length; i++) {
    const key = CATALOG_TABLE[i]?.key ?? "";
    rs += `  ${JSON.stringify(key)},\n`;
  }
  rs += `];\n\n`;

  // Domains
  rs += `pub static CATALOG_DOMAINS: [u32; ${CATALOG_TABLE.length}] = [\n  `;
  for (let i = 0; i < CATALOG_TABLE.length; i++) {
    const dom = CATALOG_TABLE[i]?.domains ?? 1;
    rs += dom + (i < CATALOG_TABLE.length - 1 ? "," : "");
    if ((i + 1) % 32 === 0) rs += "\n  ";
  }
  rs += `\n];\n\n`;

  // Dialects
  rs += `pub static CATALOG_DIALECTS: [u32; ${CATALOG_TABLE.length}] = [\n  `;
  for (let i = 0; i < CATALOG_TABLE.length; i++) {
    const dial = CATALOG_TABLE[i]?.dialects ?? 1023;
    rs += dial + (i < CATALOG_TABLE.length - 1 ? "," : "");
    if ((i + 1) % 32 === 0) rs += "\n  ";
  }
  rs += `\n];\n\n`;

  // Roles
  rs += `pub static CATALOG_ROLE_IDS: [u8; ${CATALOG_TABLE.length}] = [\n  `;
  for (let i = 0; i < CATALOG_TABLE.length; i++) {
    const r = CATALOG_TABLE[i]?.roleId ?? 9;
    rs += r + (i < CATALOG_TABLE.length - 1 ? "," : "");
    if ((i + 1) % 32 === 0) rs += "\n  ";
  }
  rs += `\n];\n\n`;

  // Priorities
  rs += `pub static CATALOG_PRIORITIES: [u8; ${CATALOG_TABLE.length}] = [\n  `;
  for (let i = 0; i < CATALOG_TABLE.length; i++) {
    const p = CATALOG_TABLE[i]?.priority ?? 20;
    rs += p + (i < CATALOG_TABLE.length - 1 ? "," : "");
    if ((i + 1) % 32 === 0) rs += "\n  ";
  }
  rs += `\n];\n\n`;

  // Tiers
  rs += `pub static CATALOG_TIERS: [u8; ${CATALOG_TABLE.length}] = [\n  `;
  for (let i = 0; i < CATALOG_TABLE.length; i++) {
    const t = CATALOG_TABLE[i]?.tier ?? 0;
    rs += t + (i < CATALOG_TABLE.length - 1 ? "," : "");
    if ((i + 1) % 32 === 0) rs += "\n  ";
  }
  rs += `\n];\n\n`;

  // Arities
  rs += `pub static CATALOG_ARITIES: [u32; ${CATALOG_TABLE.length}] = [\n  `;
  for (let i = 0; i < CATALOG_TABLE.length; i++) {
    const a = CATALOG_TABLE[i]?.arity ?? 0;
    rs += a + (i < CATALOG_TABLE.length - 1 ? "," : "");
    if ((i + 1) % 32 === 0) rs += "\n  ";
  }
  rs += `\n];\n`;

  fs.writeFileSync(outPath, rs, "utf-8");
  console.log(`Successfully wrote ${rs.length} bytes to ${outPath}`);
}

main().catch(console.error);
