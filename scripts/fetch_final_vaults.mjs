import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const FINAL_VAULTS = [
  {
    name: 'uni-math-discrete',
    repo: 'https://github.com/dgudim/uni-math-notes.git',
    discipline: 'Discrete Math & Proofs'
  },
  {
    name: 'masters-math-topology',
    repo: 'https://github.com/Rida-Hamadani/Math-Notes.git',
    discipline: 'Topology, Measure Theory & Abstract Algebra'
  }
];

const TS_CORPUS = 'C:/Users/aditya/Documents/CODES/TypeScript/obsidian-color-math/tests/corpus';
const TMP_DIR = 'C:/Users/aditya/Documents/CODES/TypeScript/obsidian-color-math/.tmp_final_downloads';

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

for (const vault of FINAL_VAULTS) {
  const destDir = path.join(TS_CORPUS, vault.name);
  if (fs.existsSync(destDir)) {
    console.log(`[EXISTING] ${vault.name}`);
    continue;
  }

  console.log(`Fetching [${vault.discipline}] from ${vault.repo}...`);
  const tmpClone = path.join(TMP_DIR, vault.name);
  if (fs.existsSync(tmpClone)) {
    fs.rmSync(tmpClone, { recursive: true, force: true });
  }

  try {
    execSync(`git clone --depth 1 ${vault.repo} "${tmpClone}"`, {
      stdio: 'ignore',
      timeout: 60000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });

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
    console.log(`  ✓ Successfully indexed ${vault.name}`);
  } catch (err) {
    console.error(`  ✗ Skipped ${vault.name} (${err.message})`);
  } finally {
    if (fs.existsSync(tmpClone)) {
      try {
        fs.rmSync(tmpClone, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

if (fs.existsSync(TMP_DIR)) {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch (_) {}
}
