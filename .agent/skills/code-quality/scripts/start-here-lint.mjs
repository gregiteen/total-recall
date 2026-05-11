import { readFile, stat, unlink, utimes } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');
const REPORT_LINT = path.join(ROOT, 'lint-status.txt');
const PID_FILE = path.join(ROOT, 'lint-checker.pid');
const CHECKER = path.join(__dirname, 'continuous-checker-lint.mjs');

const args = process.argv.slice(2);
const skipCount = parseInt(args[0], 10) || 0;
/**
 * Returns true if the checker process is already running and not deadlocked.
 */
async function isCheckerRunning() {
  try {
    const pid = parseInt(await readFile(PID_FILE, 'utf8'), 10);
    if (!pid || isNaN(pid)) return false;
    process.kill(pid, 0); // throws if process not alive
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawns the continuous checker detached in the background.
 */
function spawnChecker() {
  const child = spawn(process.execPath, [CHECKER], {
    detached: true,
    stdio: 'ignore',
    cwd: ROOT,
  });
  child.unref();
}

/**
 * Kills any orphaned eslint processes from previous checker runs.
 */
async function killStaleEslintChildren() {
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
      .filter(p => p && p.parentPid === 1 && /eslint/.test(p.command));

    for (const proc of stalePids) {
      try { process.kill(proc.pid, 'SIGKILL'); } catch {}
    }
  } catch {}
}

async function report() {
  const running = await isCheckerRunning();
  if (!running) {
    await killStaleEslintChildren();
    const now = new Date();
    await utimes(REPORT_LINT, now, now).catch(() => {});
    spawnChecker();
  }

  try {
    const data = await readFile(REPORT_LINT, 'utf8');
    const lines = data.split('\n');
    const updated = lines.find(l => l.startsWith('REPORT_UPDATED:'))?.split(': ')[1] || 'Unknown';
    const status = lines.find(l => l.startsWith('STATUS:'))?.split(': ')[1] || (running ? 'STARTING...' : 'INITIALIZING...');
    const total = lines.find(l => l.startsWith('TOTAL_ERRORS:'))?.split(': ')[1] || '0';
    
    console.log(`\n📡 DAEMON: ${running ? '🟢 LIVE' : '💤 SLEPT'} | STATUS: ${status} | TOTAL ISSUES: ${total}`);
    console.log(`🕒 VERIFIED: ${new Date(updated).toLocaleString()}`);
    console.log(`\n🚨 LAW 5 MANDATE: NEVER WAIT FOR THIS CHECKER!`);
    console.log(`The checker runs in the background and takes ~90 seconds. If you just fixed a file and still see the error, the result is STALE.`);
    console.log(`DO NOT FREAK OUT. NEVER run raw eslint manually. NEVER edit the checker scripts. Trust your fix and move on to parallel tasks.\n`);

    const files = {};

    // Pattern:   123:60  warning  Unexpected any... @typescript-eslint/no-explicit-any
    const lintRegex = /^\s*(\d+:\d+)\s+(warning|error)\s+(.*?)\s+([@\/\w-]+)$/;
    let currentFile = '';

    lines.forEach(line => {
      if (line.trim().startsWith('/') || line.trim().startsWith('.')) {
        currentFile = line.trim();
        return;
      }
      const match = line.match(lintRegex);
      if (match && currentFile) {
        if (!files[currentFile]) files[currentFile] = [];
        files[currentFile].push(`  ${match[1]} [${match[2]}] ${match[3]} (${match[4]})`);
      }
    });

    const fileCount = Object.keys(files).length;
    const sortedFiles = Object.entries(files)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(skipCount, skipCount + 4);

    console.log(`🛡️ --- LINT ERROR BITES (Showing Files ${skipCount + 1}-${skipCount + Math.max(1, sortedFiles.length)} of ${fileCount} Files) --- 🛡️`);

    if (sortedFiles.length === 0) {
      console.log('✅ No Lint problems found in report.');
      return;
    }

    let totalShown = 0;
    const MAX_SHOWN = 150;

    for (const [file, errors] of sortedFiles) {
      if (totalShown >= MAX_SHOWN) break;

      console.log(`\n📂 ${file} (${errors.length} warnings)`);

      const toShow = errors.slice(0, Math.max(0, MAX_SHOWN - totalShown));
      toShow.forEach(e => console.log(e));
      totalShown += toShow.length;

      if (errors.length > toShow.length) {
        console.log(`  ... and ${errors.length - toShow.length} more`);
      }
    }

    if (totalShown >= MAX_SHOWN) {
      console.log(`\n⚠️ Report capped at ${MAX_SHOWN} total errors to protect context window.`);
    }

    if (fileCount > skipCount + 4) {
      console.log(`\n⚠️ ${fileCount - (skipCount + 4)} MORE FILES HAVE ERRORS NOT SHOWN HERE.`);
      console.log(`🚨 CRITICAL: If you just fixed the files above, DO NOT run this command again immediately without skipping!`);
      console.log(`The daemon takes ~90 seconds to update. Polling immediately will show the exact same stale errors.`);
      console.log(`👉 To view the next batch of files NOW, run: node .agent/skills/code-quality/scripts/start-here-lint.mjs ${skipCount + 4}`);
      console.log(`Otherwise, move on to other tasks and check back later.`);
    }

  } catch (err) {
    console.error('❌ Could not read Lint report. Checker is starting...');
  }
}

report();
