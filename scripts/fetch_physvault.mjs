import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const TS_CORPUS = 'C:/Users/aditya/Documents/CODES/TypeScript/obsidian-color-math/tests/corpus';
const TMP_DIR = 'C:/Users/aditya/Documents/CODES/TypeScript/obsidian-color-math/.tmp_physvault';

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

const destDir = path.join(TS_CORPUS, 'phys-vault-qft');
if (!fs.existsSync(destDir)) {
  console.log('Fetching PhysVault (General Relativity, QFT, String Theory)...');
  try {
    execSync(`git clone --depth 1 https://github.com/lcnbr/PhysVault.git "${TMP_DIR}"`, {
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

    copyMd(TMP_DIR, destDir);
    console.log('✓ Successfully indexed PhysVault!');
  } catch (err) {
    console.error('✗ Skipped PhysVault:', err.message);
  } finally {
    if (fs.existsSync(TMP_DIR)) {
      try {
        fs.rmSync(TMP_DIR, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}
