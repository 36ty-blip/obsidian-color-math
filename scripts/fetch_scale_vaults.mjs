import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const VAULTS = [
  {
    name: 'math-definitions-moc',
    repo: 'https://github.com/breezy-codes/obsidian-mathematics-definitions.git',
    discipline: 'Pure Math Definitions, Theorems & MOCs'
  },
  {
    name: 'rajeev-math-matter',
    repo: 'https://github.com/rajeevphysics/Obsidian-MathMatter.git',
    discipline: 'University Physics, Multivariable Calculus & Linear Algebra'
  },
  {
    name: 'discrete-cs-vault',
    repo: 'https://github.com/RobertTalbert/discretecs-vault.git',
    discipline: 'Discrete Mathematics & Graph Theory'
  },
  {
    name: 'learn-ml-obsidian',
    repo: 'https://github.com/Denisoidd/learn_ml_obsidian.git',
    discipline: 'Machine Learning & Computer Vision'
  },
  {
    name: 'unimi-security-ai',
    repo: 'https://github.com/Allerito/SecAI-UniMi.git',
    discipline: 'Machine Learning Security & Information Theory'
  },
  {
    name: 'mesquita-ai-learning',
    repo: 'https://github.com/franciscomesquitaAI/Learning_Notes.git',
    discipline: 'AI, Data Science & Machine Learning'
  },
  {
    name: 'cambridge-tripos',
    repo: 'https://github.com/ashwinahuja/cambridge-computer-science-notes.git',
    discipline: 'Cambridge Tripos Formal Methods & Algorithms'
  },
  {
    name: 'oxford-maths-vault',
    repo: 'https://github.com/QSDQSB/OxMaths.obsidian.git',
    discipline: 'Oxford Undergraduate Pure & Applied Mathematics'
  },
  {
    name: 'academic-reference-vault',
    repo: 'https://github.com/r1cm3d/Obsidian-Vault.git',
    discipline: 'Thermodynamics, Vectors & Set Theory'
  },
  {
    name: 'spinspire-ai-notes',
    repo: 'https://github.com/spinspire/ai-learning.git',
    discipline: 'Artificial Intelligence Foundations'
  }
];

const TS_CORPUS = 'C:/Users/aditya/Documents/CODES/TypeScript/obsidian-color-math/tests/corpus';
const TMP_DIR = 'C:/Users/aditya/Documents/CODES/TypeScript/obsidian-color-math/.tmp_scale_downloads';

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
        if (item.name === '.git' || item.name === 'node_modules' || item.name === '.trash') continue;
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
console.log('       Color Math Multi-Field 10,000+ Document Vault Ingestion            ');
console.log('══════════════════════════════════════════════════════════════════════════\n');

for (const vault of VAULTS) {
  const destDir = path.join(TS_CORPUS, vault.name);
  if (fs.existsSync(destDir)) {
    const stats = countMathFiles(destDir);
    console.log(`[EXISTING] ${vault.name} (${vault.discipline}): ${stats.total} notes (${stats.math} math-bearing)`);
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
    const stats = countMathFiles(destDir);
    console.log(`  ✓ Successfully indexed ${vault.name}: ${stats.total} total notes (${stats.math} with mathematical equations)`);
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

console.log('\nRunning updated mathematical density scan on total corpus...');
