import { spawn } from 'node:child_process';
import { writeFile, access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');

const REPORT_TS = path.join(ROOT, 'typescript-fullrepo-errors.txt');
const REPORT_LINT = path.join(ROOT, 'lint-status.txt');

const CONFIG = {
  tscInterval: 0,
  lintInterval: 0,
  autoStopPasses: 3,
  memoryLimit: '6144', // 6GB min heap
};

let lastTsHash = '';
let lastLintHash = '';
let tsIdentical = 0;
let lintIdentical = 0;
let idleTimer = null;

async function printBites() {
  console.log('🛡️ --- INSTANT QUALITY BITES (Starting Checker) --- 🛡️');
  try {
    const tsBites = spawn('node', ['.agent/skills/code-quality/scripts/start-here-ts.mjs'], { cwd: ROOT });
    const lintBites = spawn('node', ['.agent/skills/code-quality/scripts/start-here-lint.mjs'], { cwd: ROOT });
    tsBites.stdout.pipe(process.stdout);
    lintBites.stdout.pipe(process.stdout);
  } catch (err) {
    console.log('⚠️ Failed to print initial bites. Checker will proceed.');
  }
}

async function runTsc() {
  console.log('🚀 Running TypeScript Background Check (6GB Heap)...');
  const tsc = spawn('npx', ['tsc', '--noEmit'], { 
    cwd: ROOT,
    env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${CONFIG.memoryLimit}` }
  });
  let output = '';

  tsc.stdout.on('data', (data) => { output += data.toString(); });
  tsc.stderr.on('data', (data) => { output += data.toString(); });

  tsc.on('close', async (code) => {
    const timestamp = new Date().toISOString();
    const result = `REPORT_UPDATED: ${timestamp}\nEXIT_CODE: ${code}\n\n${output}`;
    
    if (output === lastTsHash) {
      tsIdentical++;
      console.log(`✅ TS Pass ${tsIdentical}/${CONFIG.autoStopPasses} (Identical)`);
    } else {
      await writeFile(REPORT_TS, result);
      lastTsHash = output;
      tsIdentical = 1;
      console.log(`📝 TS Report updated at ${REPORT_TS}`);
      resetIdleTimer();
    }
    
    if (tsIdentical >= CONFIG.autoStopPasses && lintIdentical >= CONFIG.autoStopPasses) {
      console.log('💤 Stability detected across all checkers. RECLAIMING RAM...');
      process.exit(0);
    }
    
    runTsc();
  });
}

async function runLint() {
  console.log('🚀 Running ESLint Background Check...');
  const lint = spawn('npx', ['eslint', '.', '--max-warnings', '0'], { cwd: ROOT });
  let output = '';

  lint.stdout.on('data', (data) => { output += data.toString(); });
  lint.stderr.on('data', (data) => { output += data.toString(); });

  lint.on('close', async (code) => {
    const timestamp = new Date().toISOString();
    const result = `REPORT_UPDATED: ${timestamp}\nEXIT_CODE: ${code}\n\n${output}`;

    if (output === lastLintHash) {
      lintIdentical++;
      console.log(`✅ Lint Pass ${lintIdentical}/${CONFIG.autoStopPasses} (Identical)`);
    } else {
      await writeFile(REPORT_LINT, result);
      lastLintHash = output;
      lintIdentical = 1;
      console.log(`📝 Lint Report updated at ${REPORT_LINT}`);
      resetIdleTimer();
    }
    
    if (tsIdentical >= CONFIG.autoStopPasses && lintIdentical >= CONFIG.autoStopPasses) {
      console.log('💤 Stability detected across all checkers. RECLAIMING RAM...');
      process.exit(0);
    }

    runLint();
  });
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    console.log('💤 Auto-Sleep: No activity detected for 1 hour. Shutting down worker.');
    process.exit(0);
  }, CONFIG.idleTimeout);
}

async function ensureFiles() {
  const files = [REPORT_TS, REPORT_LINT];
  for (const file of files) {
    try { await access(file); } catch { await writeFile(file, 'INITIALIZING REPORT...'); }
  }
}

async function start() {
  console.log('🔧 Skill-Native Continuous Checker v1.0.0 Starting...');
  console.log(`📍 Root: ${ROOT}`);
  await printBites();
  await ensureFiles();
  resetIdleTimer();
  runTsc();
  runLint();
}

start().catch(err => {
  console.error('❌ Checker Crash:', err);
  process.exit(1);
});
