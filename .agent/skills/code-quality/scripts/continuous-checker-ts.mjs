import { execFile, spawn } from 'node:child_process';
import { writeFile, unlink, access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

let sendNotification = async () => {};
try {
  ({ sendNotification } = await import('../../notifications/scripts/notify.mjs'));
} catch {
  // Notifications are optional; verification must still run when that skill is absent.
}

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
/**
 * TypeScript projects to check, discovered rather than assumed.
 *
 * This was a hardcoded `[{cwd: <root>/server}, {cwd: <root>}]`, which describes
 * one particular repo layout. In a repo without a `server/` directory or a root
 * `tsconfig.json` — total-recall keeps its only TS project in `frontend/` — the
 * first check spawned tsc with a `cwd` that does not exist. `child_process.spawn`
 * reports that as an `error` EVENT, not a throw, and nothing handled it, so the
 * daemon died on every single pass. `start-here-ts.mjs` spawns this with
 * `stdio: 'ignore'`, so the crash was invisible: it simply reported "SLEPT" and
 * respawned, forever, while serving a report that had not been regenerated in
 * three weeks. Every "✅ No TypeScript errors found" in that window was reading
 * a stale file.
 *
 * Discovering the projects keeps the skill portable across repos and makes a
 * layout change degrade to "nothing to check" instead of a silent crash loop.
 */
const CANDIDATE_CHECKS = [
  { label: 'root', cwd: ROOT, project: 'tsconfig.json' },
  { label: 'server', cwd: SERVER_ROOT, project: 'tsconfig.json' },
  { label: 'frontend', cwd: path.join(ROOT, 'frontend'), project: 'tsconfig.json' },
  { label: 'apps/web', cwd: path.join(ROOT, 'apps', 'web'), project: 'tsconfig.json' },
];

/** Tolerant tsconfig read — tsconfig is JSONC, so strip comments and trailing commas. */
async function readTsconfig(file) {
  try {
    const raw = await readFile(file, 'utf8');
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1')
      .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

/**
 * A "solution" tsconfig lists only `references` — no `files`, no `include`.
 * `tsc --noEmit -p` on one of those compiles NOTHING and exits 0 instantly,
 * which reports a confident zero-error result while checking zero files.
 * total-recall's `frontend/tsconfig.json` is exactly this shape, so the fix for
 * the crash loop would otherwise have swapped a visible failure for an invisible
 * one. Expand such a config into the projects it actually points at.
 */
async function expandProject(check) {
  const file = path.join(check.cwd, check.project);
  const cfg = await readTsconfig(file);
  if (!cfg) return [check];

  const hasOwnInputs = (Array.isArray(cfg.files) && cfg.files.length > 0) || cfg.include !== undefined;
  const refs = Array.isArray(cfg.references) ? cfg.references : [];
  if (hasOwnInputs || refs.length === 0) return [check];

  const expanded = [];
  for (const ref of refs) {
    if (!ref?.path) continue;
    const refPath = path.resolve(check.cwd, ref.path);
    // A reference may point at a directory (implying tsconfig.json) or a file.
    const isFile = path.extname(refPath) === '.json';
    const refCwd = isFile ? path.dirname(refPath) : refPath;
    const refProject = isFile ? path.basename(refPath) : 'tsconfig.json';
    try {
      await access(path.join(refCwd, refProject));
      expanded.push({ label: `${check.label}:${path.basename(refProject, '.json')}`, cwd: refCwd, project: refProject });
    } catch { /* dangling reference */ }
  }
  return expanded.length > 0 ? expanded : [check];
}

async function discoverChecks() {
  const found = [];
  for (const check of CANDIDATE_CHECKS) {
    try {
      await access(path.join(check.cwd, check.project));
    } catch {
      continue; // project absent in this repo — not an error
    }
    found.push(...(await expandProject(check)));
  }
  return found;
}

let CHECKS = [];

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

  const runCheck = (check) => new Promise(async (resolve) => {
    let tscBin = path.join(check.cwd, 'node_modules', 'typescript', 'bin', 'tsc');
    try {
      await access(tscBin);
    } catch {
      tscBin = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
    }
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

    // A ChildProcess reports spawn failures (missing cwd, missing binary) as an
    // 'error' EVENT. An unhandled 'error' on an EventEmitter throws, which is
    // what killed this daemon on every pass — silently, because it is spawned
    // with stdio:'ignore'. Resolve it as a failed check so the pass completes
    // and the failure lands in the report where someone can see it.
    let settled = false;
    tsc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolve({ ...check, code: 1, output: `Failed to spawn tsc for ${check.label} (cwd: ${check.cwd}): ${err.message}` });
    });

    tsc.on('close', (code) => {
      if (settled) return;
      settled = true;
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
  const exitCode = runs.some((run) => run.code !== 0) ? 2 : 0;
  const errors = (combinedOutput.match(/error TS\d+/g) || []).length;

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
  const isSandbox = ROOT.includes('.system_generated/worktrees') || ROOT.includes('/.gemini/');
  if (isSandbox) {
    console.log('Sandbox/Worktree detected. Exiting TypeScript checker to prevent background resource use.');
    process.exit(0);
  }
  await cleanupStaleTscProcesses();

  CHECKS = await discoverChecks();
  if (CHECKS.length === 0) {
    // Loud and terminal. Silently idling here would recreate the original bug in
    // a new shape: a daemon that looks alive while checking nothing.
    await log('❌ No tsconfig.json found in root/, server/, frontend/, or apps/web/. Nothing to type-check — exiting.');
    await cleanup();
    process.exit(1);
  }
  await log(`🔎 Type-checking ${CHECKS.length} project(s): ${CHECKS.map(c => c.label).join(', ')}`);

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
