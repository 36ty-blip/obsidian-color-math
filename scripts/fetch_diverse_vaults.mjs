import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BATCH_2_VAULTS = [
  {
    name: 'cambridge-cs-notes',
    repo: 'https://github.com/johnyob/University-Notes.git',
    discipline: 'Cambridge University Computer Science & Discrete Math'
  },
  {
    name: 'scientific-physics-notes',
    repo: 'https://github.com/Booodaness/Scientific-Notes.git',
    discipline: 'Advanced Mathematical Physics'
  },
  {
    name: 'eindhoven-engineering',
    repo: 'https://github.com/danieltyukov/tue-notes.git',
    discipline: 'TU/e Electrical & Signal Engineering'
  },
  {
    name: 'discrete-cs-vault',
    repo: 'https://github.com/RobertTalbert/discretecs-vault.git',
    discipline: 'Discrete Mathematics & Graph Theory'
  },
  {
    name: 'cambridge-tripos',
    repo: 'https://github.com/ashwinahuja/cambridge-computer-science-notes.git',
    discipline: 'Cambridge Tripos Formal Methods & Algorithms'
  },
  {
    name: 'unimi-security-ai',
    repo: 'https://github.com/Allerito/SecAI-UniMi.git',
    discipline: 'Machine Learning Security & Information Theory'
  }
];

const CORPUS_DIR = path.resolve(process.cwd(), 'tests/corpus');
const TMP_DIR = path.resolve(process.cwd(), '.tmp_vault_downloads');

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function countMathFiles(dir) {
  let count = 0;
  let mathCount = 0;

  function walk(current) {
    if (!fs.existsSync(current)) return;
    const items = fs.readdirSync(current, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(current, item.name);
      if (item.isDirectory()) {
        if (item.name === '.git' || item.name === 'node_modules') continue;
        walk(full);
      } else if (item.isFile() && item.name.endsWith('.md')) {
        count++;
        try {
          const content = fs.readFileSync(full, 'utf8');
          if (content.includes('$') || content.includes('\\(') || content.includes('\\[') || content.includes('\\begin{')) {
            mathCount++;
          }
        } catch (_) {}
      }
    }
  }

  walk(dir);
  return { total: count, math: mathCount };
}

console.log('══════════════════════════════════════════════════════════════════════════');
console.log('   Color Math Acquisition Pipeline — Batch 2 (Target: 10,000 Documents)    ');
console.log('══════════════════════════════════════════════════════════════════════════\n');

for (const vault of BATCH_2_VAULTS) {
  const destDir = path.join(CORPUS_DIR, vault.name);
  if (fs.existsSync(destDir)) {
    const stats = countMathFiles(destDir);
    console.log(`[EXISTING] ${vault.name} (${vault.discipline}): ${stats.total} notes (${stats.math} math-bearing)`);
    continue;
  }

  console.log(`Fetching [${vault.discipline}] from ${vault.repo}...`);
  try {
    const tmpClone = path.join(TMP_DIR, vault.name);
    if (fs.existsSync(tmpClone)) {
      fs.rmSync(tmpClone, { recursive: true, force: true });
    }

    // Shallow clone with depth 1
    execSync(`git clone --depth 1 ${vault.repo} "${tmpClone}"`, { stdio: 'ignore' });

    fs.mkdirSync(destDir, { recursive: true });

    function copyMd(currentSrc, currentDest) {
      const items = fs.readdirSync(currentSrc, { withFileTypes: true });
      for (const item of items) {
        const srcPath = path.join(currentSrc, item.name);
        const destPath = path.join(currentDest, item.name);
        if (item.isDirectory()) {
          if (item.name === '.git' || item.name === '.trash') continue;
          fs.mkdirSync(destPath, { recursive: true });
          copyMd(srcPath, destPath);
        } else if (item.isFile() && item.name.endsWith('.md')) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }

    copyMd(tmpClone, destDir);
    const stats = countMathFiles(destDir);
    console.log(`  ✓ Successfully indexed ${vault.name}: ${stats.total} total notes (${stats.math} with mathematical equations)`);

    fs.rmSync(tmpClone, { recursive: true, force: true });
  } catch (err) {
    console.error(`  ✗ Failed to clone ${vault.name}:`, err.message);
  }
}

if (fs.existsSync(TMP_DIR)) {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

console.log('\nScanning entire expanded corpus...');
const finalStats = countMathFiles(CORPUS_DIR);
console.log(`══════════════════════════════════════════════════════════════════════════`);
console.log(`Total Markdown Documents in Corpus: ${finalStats.total}`);
console.log(`Total Mathematical Documents:       ${finalStats.math}`);
console.log(`══════════════════════════════════════════════════════════════════════════`);
