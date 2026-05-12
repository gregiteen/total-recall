import { execFile, spawn } from 'node:child_process';
import { writeFile, unlink, access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { sendNotification } from '../../notifications/scripts/notify.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');
const REPORT_TS = path.join(ROOT, 'typescript-fullrepo-errors.txt');
const PID_FILE = path.join(ROOT, 'typescript-checker.pid');
const LAST_SUCCESS_FILE = path.join(ROOT, '.last-successful-ts.txt');
const SERVER_ROOT = path.join(ROOT, 'server');

const LOG_FILE = path.join(__dirname, 'ts-checker.log');
const execFileAsync = promisify(execFile);
const CONFIG = {
  memoryLimit: '6144',    // 6GB heap limit
  autoStopPasses: 3,      // Stop after 3 identical results
  checkTimeoutMs: 15 * 60_000,
  terminateGraceMs: 5_000
};
const CHECKS = [
  { label: 'frontend', cwd: path.join(ROOT, 'frontend'), project: 'tsconfig.json' }
];

async function log(msg) {
  const t = new Date().toISOString();
  await writeFile(LOG_FILE, `[${t}] ${msg}\n`, { flag: 'a' });
  console.log(msg);
}

let lastHash = '';
let consecutiveIdentical = 0;

async function cleanup() {
  try { await unlink(PID_FILE); } catch {}
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup().then(() => process.exit(0)); });
process.on('SIGTERM', () => { cleanup().then(() => process.exit(0)); });

async function cleanupStaleTscProcesses() {
  if (process.platform === 'win32') {
    return;
  }

  const tscBinPatterns = [
    path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(SERVER_ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
  ];

  try {
    const { stdout } = await execFileAsync('ps', ['-Ao', 'pid=,ppid=,command=']);
    const myPid = process.pid;
    const stalePids = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
        if (!match) return null;
        return { pid: Number(match[1]), parentPid: Number(match[2]), command: match[3] };
      })
      .filter((proc) =>
        proc &&
        proc.pid !== myPid &&
        tscBinPatterns.some(p => proc.command.includes(p))
      );

    for (const proc of stalePids) {
      try {
        process.kill(proc.pid, 'SIGKILL');
        await log(`🧹 Reaped stale TypeScript child PID ${proc.pid}`);
      } catch {}
    }
  } catch (error) {
    await log(`⚠️ Failed to scan for stale TypeScript children: ${error.message}`);
  }
}

async function runTsc() {
  await log(`🚀 Running pass (Heap: ${CONFIG.memoryLimit}MB) [Identical Passes: ${consecutiveIdentical}/${CONFIG.autoStopPasses}]...`);

  // Keeping tsbuildinfo cache to optimize performance
  // try { await unlink(path.join(ROOT, 'tsconfig.tsbuildinfo')); } catch {}
  // try { await unlink(path.join(SERVER_ROOT, 'tsconfig.tsbuildinfo')); } catch {}

  const writeRunningReport = async (stageLabel) => {
    await writeFile(path.join(ROOT, '.typescript-checker.status'), stageLabel);
  };

  const runCheck = (check) => new Promise((resolve) => {
    const tscBin = path.join(check.cwd, 'node_modules', 'typescript', 'bin', 'tsc');
    const tsc = spawn(process.execPath, [tscBin, '--noEmit', '-p', check.project], {
      cwd: check.cwd,
      detached: process.platform !== 'win32',
      env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${CONFIG.memoryLimit}` }
    });

    let output = '';
    let timedOut = false;
    let forceKillTimer;
    const killCheck = (signal) => {
      if (process.platform !== 'win32') {
        try { process.kill(-tsc.pid, signal); } catch {}
      }
      try { tsc.kill(signal); } catch {}
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killCheck('SIGTERM');
      forceKillTimer = setTimeout(() => {
        killCheck('SIGKILL');
      }, CONFIG.terminateGraceMs);
      forceKillTimer.unref();
    }, CONFIG.checkTimeoutMs);
    timer.unref();

    tsc.stdout.on('data', (data) => { output += data.toString(); });
    tsc.stderr.on('data', (data) => { output += data.toString(); });
    tsc.on('close', (code) => {
      clearTimeout(timer);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      const timeoutNote = timedOut
        ? `TypeScript check timed out after ${CONFIG.checkTimeoutMs}ms for ${check.label}.`
        : '';
      const mergedOutput = [output.trim(), timeoutNote].filter(Boolean).join('\n');
      resolve({ ...check, code: timedOut ? 124 : code, output: mergedOutput });
    });
  });

  // Run checks sequentially to avoid memory spikes from two full TypeScript
  // programs competing at once.
  const runs = [];
  for (let index = 0; index < CHECKS.length; index++) {
    const check = CHECKS[index];
    await writeRunningReport(`${check.label} ${index + 1}/${CHECKS.length}`);
    runs.push(await runCheck(check));
  }
  const combinedOutput = runs
    .filter((run) => run.output.trim())
    .map((run) => `# ${run.label}\n${run.output.trim()}`)
    .join('\n\n');

  const timestamp = new Date().toISOString();
  const errors = (combinedOutput.match(/error TS\d+/g) || []).length;
  const exitCode = runs.some((run) => run.code !== 0) ? 2 : 0;

  if (combinedOutput === lastHash) {
    consecutiveIdentical++;
    await log(`✅ Pass ${consecutiveIdentical}/${CONFIG.autoStopPasses} (Identical)`);
  } else {
    lastHash = combinedOutput;
    consecutiveIdentical = 1;
    await log(`📝 State changed. Total Errors: ${errors}`);
  }

  const statusBadge = consecutiveIdentical >= CONFIG.autoStopPasses ? 'STABLE' : `PASS ${consecutiveIdentical}/${CONFIG.autoStopPasses}`;
  const result = `REPORT_UPDATED: ${timestamp}\nSTATUS: ${statusBadge}\nTOTAL_ERRORS: ${errors}\nEXIT_CODE: ${exitCode}\n\n${combinedOutput}`;

  await writeFile(REPORT_TS, result);
  await writeFile(path.join(ROOT, '.typescript-checker.status'), statusBadge);

  if (errors === 0) {
    await writeFile(LAST_SUCCESS_FILE, timestamp);
  }

  let lastSuccessStr = 'Never';
  try {
    const lastSuccessRaw = await readFile(LAST_SUCCESS_FILE, 'utf8');
    lastSuccessStr = new Date(lastSuccessRaw).toLocaleString();
  } catch {}

  try {
    await sendNotification("Code Quality (TS)", `TS pass finished. ${errors} errors. Last zero-error run: ${lastSuccessStr}`, { source: 'ts-checker' });
  } catch {}

  if (consecutiveIdentical >= CONFIG.autoStopPasses) {
    await log(`💤 Stability detected (3 identical passes). ${errors} errors remaining. RECLAIMING RAM...`);
    await sendNotification("TS Checker Auto-Stopped", `Stable state reached (${consecutiveIdentical} identical passes with ${errors} errors remaining). Reclaiming RAM.`, { source: 'ts-checker' });
    await cleanup();
    process.exit(0);
  }

  return runTsc();
}

async function ensureFiles() {
  try { await access(REPORT_TS); } catch { await writeFile(REPORT_TS, 'INITIALIZING TS REPORT...'); }
}

async function start() {
  console.log('🔧 Continuous TypeScript Checker (RAM RECLAMATION MODE) Starting...');
  await cleanupStaleTscProcesses();
  try { 
    await log('🧹 Preserving TS cache for blazing fast incremental checks.'); 
  } catch {}
  await writeFile(PID_FILE, String(process.pid));
  await ensureFiles();
  runTsc();
}

start().catch(err => {
  console.error('❌ [TS-CHECKER] Fatal Crash:', err);
  cleanup().then(() => process.exit(1));
});
