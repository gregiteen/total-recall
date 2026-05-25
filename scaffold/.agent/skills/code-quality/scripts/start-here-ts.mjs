/**
 * start-here-ts.mjs
 *
 * Displays the TypeScript error report and auto-starts the continuous checker
 * in the background if it is not already running.
 *
 * Usage:
 *   node start-here-ts.mjs              # worst files (default)
 *   node start-here-ts.mjs type         # group by TS error code
 *   node start-here-ts.mjs file <pat>   # filter to files matching <pat>
 *   node start-here-ts.mjs count        # summary counts only
 *
 * All modes cap output at 30 errors to protect context window.
 */
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');
const REPORT_TS = path.join(ROOT, 'typescript-fullrepo-errors.txt');
const PID_FILE = path.join(ROOT, 'typescript-checker.pid');
const CHECKER = path.join(__dirname, 'continuous-checker-ts.mjs');
const MAX_SHOWN = 150;

const args = process.argv.slice(2);
const mode = args[0] || 'worst';        // worst | type | file | count
const filePattern = mode === 'file' ? (args[1] || '') : '';
let skipCount = 0;
if (mode === 'worst') skipCount = parseInt(args[1], 10) || 0;

// ─── Checker management ──────────────────────────────────────────────────────

async function isCheckerRunning() {
  try {
    const pid = parseInt(await readFile(PID_FILE, 'utf8'), 10);
    if (!pid || isNaN(pid)) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function spawnChecker() {
  const child = spawn(process.execPath, [CHECKER], { detached: true, stdio: 'ignore', cwd: ROOT });
  child.unref();
}

// ─── Report parsing ──────────────────────────────────────────────────────────

const ERROR_REGEX = /^([^(]+)\(\d+,\d+\): error (TS\d+): (.*)$/;

function parseErrors(data) {
  const errors = [];
  for (const line of data.split('\n')) {
    const m = line.match(ERROR_REGEX);
    if (m) errors.push({ file: m[1].trim(), code: m[2], message: m[3], raw: line.trim() });
  }
  return errors;
}

// ─── Display modes ────────────────────────────────────────────────────────────

function showWorstFiles(errors) {
  const files = {};
  for (const e of errors) {
    if (!files[e.file]) files[e.file] = [];
    files[e.file].push(e.raw);
  }
  const fileCount = Object.keys(files).length;
  const sorted = Object.entries(files).sort((a, b) => b[1].length - a[1].length).slice(skipCount, skipCount + 4);

  console.log(`🛡️ --- TYPESCRIPT ERRORS (Showing Files ${skipCount + 1}-${skipCount + Math.max(1, sorted.length)} of ${fileCount} Files) --- 🛡️`);
  if (!sorted.length) { console.log('✅ No TypeScript errors found.'); return; }

  let shown = 0;
  for (const [file, errs] of sorted) {
    if (shown >= MAX_SHOWN) break;
    console.log(`\n📂 ${file} (${errs.length} errors)`);
    const toShow = errs.slice(0, MAX_SHOWN - shown);
    toShow.forEach(e => console.log(`  ${e}`));
    shown += toShow.length;
    if (errs.length > toShow.length) console.log(`  ... and ${errs.length - toShow.length} more`);
  }
  if (shown >= MAX_SHOWN) console.log(`\n⚠️ Capped at ${MAX_SHOWN} errors.`);

  if (fileCount > skipCount + 4) {
    console.log(`\n⚠️ ${fileCount - (skipCount + 4)} MORE FILES HAVE ERRORS NOT SHOWN HERE.`);
    console.log(`🚨 CRITICAL: If you just fixed the files above, DO NOT run this command again immediately without skipping!`);
    console.log(`The daemon takes ~90 seconds to update. Polling immediately will show the exact same stale errors.`);
    console.log(`👉 To view the next batch of files NOW, run: node .agent/skills/code-quality/scripts/start-here-ts.mjs worst ${skipCount + 4}`);
    console.log(`Otherwise, move on to other tasks and check back later.`);
  }
}

function showByType(errors) {
  const groups = {};
  for (const e of errors) {
    if (!groups[e.code]) groups[e.code] = [];
    groups[e.code].push(e.raw);
  }
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);

  console.log('🛡️ --- TYPESCRIPT ERRORS BY TYPE --- 🛡️');
  if (!sorted.length) { console.log('✅ No TypeScript errors found.'); return; }

  let shown = 0;
  for (const [code, errs] of sorted) {
    if (shown >= MAX_SHOWN) break;
    console.log(`\n🏷️  ${code} (${errs.length} instances)`);
    const toShow = errs.slice(0, MAX_SHOWN - shown);
    toShow.forEach(e => console.log(`  ${e}`));
    shown += toShow.length;
    if (errs.length > toShow.length) console.log(`  ... and ${errs.length - toShow.length} more`);
  }
  if (shown >= MAX_SHOWN) console.log(`\n⚠️ Capped at ${MAX_SHOWN} errors.`);
}

function showByFile(errors, pattern) {
  const matched = errors.filter(e => e.file.includes(pattern));
  console.log(`🛡️ --- TYPESCRIPT ERRORS matching "${pattern}" (${matched.length} total) --- 🛡️`);
  if (!matched.length) { console.log('✅ No errors matching that pattern.'); return; }

  let shown = 0;
  for (const e of matched) {
    if (shown >= MAX_SHOWN) break;
    console.log(`  ${e.raw}`);
    shown++;
  }
  if (matched.length > MAX_SHOWN) console.log(`\n⚠️ Capped at ${MAX_SHOWN} errors.`);
}

function showCount(errors) {
  const codes = {};
  for (const e of errors) codes[e.code] = (codes[e.code] || 0) + 1;
  const sorted = Object.entries(codes).sort((a, b) => b[1] - a[1]);
  console.log(`🛡️ --- TYPESCRIPT ERROR COUNTS (${errors.length} total) --- 🛡️`);
  sorted.forEach(([code, n]) => console.log(`  ${code}: ${n}`));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const running = await isCheckerRunning();
  if (!running) {
    spawnChecker();
  }

  try {
    const data = await readFile(REPORT_TS, 'utf8');
    const lines = data.split('\n');
    const updated = lines.find(l => l.startsWith('REPORT_UPDATED:'))?.split(': ')[1] || 'Unknown';
    let liveStatus = '';
    try { liveStatus = (await readFile(path.join(ROOT, '.typescript-checker.status'), 'utf8')).trim(); } catch {}
    const status = running ? `RUNNING (${liveStatus || 'starting'})` : (lines.find(l => l.startsWith('STATUS:'))?.split(': ')[1] || 'SLEPT');
    const total = lines.find(l => l.startsWith('TOTAL_ERRORS:'))?.split(': ')[1] || '0';
    
    const errors = parseErrors(data);

    console.log(`\n📡 DAEMON: ${running ? '🟢 LIVE' : '💤 SLEPT'} | STATUS: ${status} | TOTAL ERRORS: ${total}`);
    console.log(`🕒 VERIFIED: ${new Date(updated).toLocaleString()}`);
    console.log(`\n🚨 LAW 5 MANDATE: NEVER WAIT FOR THIS CHECKER!`);
    console.log(`The checker runs in the background and takes ~90 seconds. If you just fixed a file and still see the error, the result is STALE.`);
    console.log(`DO NOT FREAK OUT. NEVER run raw tsc manually. NEVER edit the checker scripts. Trust your fix and move on to parallel tasks.\n`);

    switch (mode) {
      case 'type':  showByType(errors); break;
      case 'file':  showByFile(errors, filePattern); break;
      case 'count': showCount(errors); break;
      default:      showWorstFiles(errors);
    }
  } catch {
    console.error('❌ Could not read TypeScript report. Checker is starting...');
  }
}

main();
