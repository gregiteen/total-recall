import { execFile, spawn } from 'node:child_process';
import { writeFile, unlink, access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { sendNotification } from '../../notifications/scripts/notify.mjs';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');
const REPORT_LINT = path.join(ROOT, 'lint-status.txt');
const PID_FILE = path.join(ROOT, 'lint-checker.pid');
const LAST_SUCCESS_FILE = path.join(ROOT, '.last-successful-lint.txt');

const LOG_FILE = path.join(__dirname, 'lint-checker.log');
const CONFIG = {
  memoryLimit: '6144',    // 6GB heap limit
  autoStopPasses: 3       // Stop after 3 identical results
};

async function log(msg) {
  const t = new Date().toISOString();
  await writeFile(LOG_FILE, `[${t}] ${msg}\n`, { flag: 'a' });
  console.log(msg);
}

let lastHash = '';
let consecutiveIdentical = 0;
let activeChild = null;

function killActiveChild() {
  if (activeChild && !activeChild.killed) {
    try { activeChild.kill('SIGKILL'); } catch {}
    activeChild = null;
  }
}

async function cleanup() {
  killActiveChild();
  try { await unlink(PID_FILE); } catch {}
}

process.on('exit', () => { killActiveChild(); });
process.on('SIGINT', () => { cleanup().then(() => process.exit(0)); });
process.on('SIGTERM', () => { cleanup().then(() => process.exit(0)); });

async function cleanupStaleEslintProcesses() {
  if (process.platform === 'win32') return;
  try {
    const { stdout } = await execFileAsync('ps', ['-Ao', 'pid=,ppid=,command=']);
    const stalePids = stdout
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => {
        const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
        if (!match) return null;
        return { pid: Number(match[1]), parentPid: Number(match[2]), command: match[3] };
      })
      .filter(p => p && p.pid !== process.pid && /eslint/.test(p.command) && p.command.includes(ROOT));

    for (const proc of stalePids) {
      try {
        process.kill(proc.pid, 'SIGKILL');
        await log(`🧹 Reaped stale ESLint child PID ${proc.pid}`);
      } catch {}
    }
  } catch (error) {
    await log(`⚠️ Failed to scan for stale ESLint children: ${error.message}`);
  }
}

async function runLint() {
  await log(`🚀 Running pass (Heap: ${CONFIG.memoryLimit}MB) [Identical Passes: ${consecutiveIdentical}/${CONFIG.autoStopPasses}]...`);

  // Keeping eslint cache to optimize performance
  // try { await unlink(path.join(ROOT, '.eslintcache')); } catch {}

  killActiveChild();

  const lint = spawn('npx', ['eslint', '.', '--max-warnings', '0', '--cache', '--cache-strategy', 'content'], {
    cwd: path.join(ROOT, 'frontend'),
    env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${CONFIG.memoryLimit}` }
  });
  activeChild = lint;

  let output = '';
  lint.stdout.on('data', (data) => { output += data.toString(); });
  lint.stderr.on('data', (data) => { output += data.toString(); });

  lint.on('close', async (code) => {
    activeChild = null;
    const timestamp = new Date().toISOString();
    // Simplified lint error counting: count lines starting with line numbers or 'error'/'warning'
    const errors = (output.match(/^\s*\d+:\d+/gm) || []).length;

    if (output === lastHash) {
      consecutiveIdentical++;
      await log(`✅ Pass ${consecutiveIdentical}/${CONFIG.autoStopPasses} (Identical)`);
    } else {
      lastHash = output;
      consecutiveIdentical = 1;
      await log(`📝 State changed. Total Lint Issues: ${errors}`);
    }

    const statusBadge = consecutiveIdentical >= CONFIG.autoStopPasses ? 'STABLE' : `PASS ${consecutiveIdentical}/${CONFIG.autoStopPasses}`;
    const result = `REPORT_UPDATED: ${timestamp}\nSTATUS: ${statusBadge}\nTOTAL_ERRORS: ${errors}\nEXIT_CODE: ${code}\n\n${output}`;

    await writeFile(REPORT_LINT, result);

    if (errors === 0) {
      await writeFile(LAST_SUCCESS_FILE, timestamp);
    }

    let lastSuccessStr = 'Never';
    try {
      const lastSuccessRaw = await readFile(LAST_SUCCESS_FILE, 'utf8');
      lastSuccessStr = new Date(lastSuccessRaw).toLocaleString();
    } catch {}

    try {
      await sendNotification("Code Quality (Lint)", `Lint pass finished. ${errors} issues. Last zero-error run: ${lastSuccessStr}`, { source: 'lint-checker' });
    } catch {}

    if (consecutiveIdentical >= CONFIG.autoStopPasses) {
      await log(`💤 Stability detected (3 identical passes). ${errors} issues remaining. RECLAIMING RAM...`);
      await sendNotification("Lint Checker Auto-Stopped", `Stable state reached (${consecutiveIdentical} identical passes with ${errors} issues remaining). Reclaiming RAM.`, { source: 'lint-checker' });
      await cleanup();
      process.exit(0);
    }

    runLint();
  });
}

async function ensureFiles() {
  try { await access(REPORT_LINT); } catch { await writeFile(REPORT_LINT, 'INITIALIZING LINT REPORT...'); }
}

async function start() {
  console.log('🔧 Continuous ESLint Checker (RAM RECLAMATION MODE) Starting...');
  await cleanupStaleEslintProcesses();
  try { await log('🧹 Preserving ESLint cache for blazing fast incremental checks.'); } catch {}
  await writeFile(PID_FILE, String(process.pid));
  await ensureFiles();
  runLint();
}

start().catch(err => {
  console.error('❌ [LINT-CHECKER] Fatal Crash:', err);
  cleanup().then(() => process.exit(1));
});
