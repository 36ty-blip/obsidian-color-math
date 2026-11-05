import fs from 'fs';
import path from 'path';

const TS_CORPUS = 'C:/Users/aditya/Documents/CODES/TypeScript/obsidian-color-math/tests/corpus';
const PY_CORPUS = 'C:/Users/aditya/Documents/CODES/Python/Math/tests/corpus';

// First, copy any downloaded folders from PY_CORPUS to TS_CORPUS if not already present
if (fs.existsSync(PY_CORPUS)) {
  const pyEntries = fs.readdirSync(PY_CORPUS, { withFileTypes: true });
  for (const ent of pyEntries) {
    if (ent.isDirectory()) {
      const srcDir = path.join(PY_CORPUS, ent.name);
      const dstDir = path.join(TS_CORPUS, ent.name);
      if (!fs.existsSync(dstDir)) {
        console.log(`Migrating downloaded vault ${ent.name} to TS corpus...`);
        fs.cpSync(srcDir, dstDir, { recursive: true });
      }
    }
  }
}

// Clean up temporary download directory if present
const tmpDir = 'C:/Users/aditya/Documents/CODES/Python/Math/.tmp_vault_downloads';
if (fs.existsSync(tmpDir)) {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
}

// Inspect and classify all markdown files
function isRichMathNote(content) {
  // Check for display math blocks $$ ... $$
  const displayBlocks = content.match(/\$\$[\s\S]*?\$\$/g) || [];
  // Check for multiline environments
  const multilineEnvs = content.match(/\\begin\{(align\*?|gather\*?|matrix|pmatrix|bmatrix|vmatrix|cases|split|aligned|equation\*?)\}[\s\S]*?\\end\{\1\}/g) || [];
  // Check for inline math $ ... $
  const inlineMath = content.match(/\$[^$\n]+\$/g) || [];
  const latexParen = content.match(/\\\([\s\S]*?\\\)/g) || [];
  const latexBracket = content.match(/\\\[[\s\S]*?\\\]/g) || [];

  const totalMathBlocks = displayBlocks.length + multilineEnvs.length + latexBracket.length;
  const totalInlines = inlineMath.length + latexParen.length;
  const totalMathExpressions = totalMathBlocks + totalInlines;

  // Criteria:
  // 1. Has at least 1 multiline environment, OR
  // 2. Has at least 2 display math blocks, OR
  // 3. Has at least 1 display block + at least 2 inline math, OR
  // 4. Has >= 3 inline math with total LaTeX characters >= 30 (not just bare $x$, $y$)
  if (multilineEnvs.length >= 1) return true;
  if (totalMathBlocks >= 2) return true;
  if (totalMathBlocks >= 1 && totalInlines >= 2) return true;
  
  if (totalInlines >= 3) {
    const totalLatexLen = inlineMath.reduce((acc, m) => acc + m.length, 0) + latexParen.reduce((acc, m) => acc + m.length, 0);
    if (totalLatexLen >= 30) return true;
  }

  return false;
}

let totalFiles = 0;
let richMathFiles = 0;
let trivialMathFiles = 0;
let zeroMathFiles = 0;

const subfolderStats = {};

function walk(dir, folderKey) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === '.git' || ent.name === 'node_modules') continue;
      walk(full, folderKey || ent.name);
    } else if (ent.isFile() && ent.name.endsWith('.md')) {
      totalFiles++;
      const key = folderKey || 'root';
      if (!subfolderStats[key]) subfolderStats[key] = { total: 0, rich: 0, trivial: 0, zero: 0 };
      subfolderStats[key].total++;
      try {
        const content = fs.readFileSync(full, 'utf8');
        if (content.includes('$') || content.includes('\\(') || content.includes('\\[') || content.includes('\\begin{')) {
          if (isRichMathNote(content)) {
            richMathFiles++;
            subfolderStats[key].rich++;
          } else {
            trivialMathFiles++;
            subfolderStats[key].trivial++;
          }
        } else {
          zeroMathFiles++;
          subfolderStats[key].zero++;
        }
      } catch (_) {}
    }
  }
}

walk(TS_CORPUS, '');

console.log('══════════════════════════════════════════════════════════════════════════');
console.log('              CURRENT CORPUS MATHEMATICAL DENSITY PROFILE                 ');
console.log('══════════════════════════════════════════════════════════════════════════');
console.log(`Total Markdown Documents:       ${totalFiles.toLocaleString()}`);
console.log(`Dense / Rich Math Documents:    ${richMathFiles.toLocaleString()} (${((richMathFiles / totalFiles) * 100).toFixed(1)}%)`);
console.log(`Trivial / Sparse Math Notes:    ${trivialMathFiles.toLocaleString()} (${((trivialMathFiles / totalFiles) * 100).toFixed(1)}%)`);
console.log(`Zero-Math Notes (Filtered out): ${zeroMathFiles.toLocaleString()} (${((zeroMathFiles / totalFiles) * 100).toFixed(1)}%)`);
console.log('──────────────────────────────────────────────────────────────────────────');
console.log('Breakdown by Subject / Vault:');
for (const [k, v] of Object.entries(subfolderStats).sort((a, b) => b[1].rich - a[1].rich)) {
  console.log(`  • ${k.padEnd(28)}: ${String(v.rich).padStart(5)} rich math  / ${String(v.total).padStart(5)} total notes`);
}
console.log('══════════════════════════════════════════════════════════════════════════');
