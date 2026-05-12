/**
 * total-recall daemon
 *
 * Manage the background dream cycle daemon.
 * On Linux with systemd, delegates to systemctl.
 * On macOS/other, manages a background Node.js process directly.
 *
 * Usage:
 *   npx total-recall daemon start   Start the background daemon
 *   npx total-recall daemon stop    Stop the background daemon
 *   npx total-recall daemon status  Show daemon status
 *   npx total-recall daemon --help  Show this help
 */

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const AGENT_DIR = path.join(os.homedir(), '.agent');
const PID_FILE = path.join(AGENT_DIR, 'logs', 'daemon.pid');
const LOG_FILE = path.join(AGENT_DIR, 'logs', 'daemon.log');

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function hasSystemd() {
  return os.platform() === 'linux' && commandExists('systemctl');
}

function printHelp() {
  console.log(`
  total-recall daemon — Manage the background dream cycle daemon

  Usage: total-recall daemon <command>

  Commands:
    start     Start the background daemon
    stop      Stop the background daemon
    status    Show daemon status

  On Linux with systemd, delegates to systemctl.
  On macOS, manages a detached Node.js process with a PID file.

  Options:
    --help, -h    Show this help
`);
}

function readPid() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (isNaN(pid)) return null;
    // Check if process is alive
    try { process.kill(pid, 0); return pid; } catch { return null; }
  } catch { return null; }
}

function writePid(pid) {
  const logsDir = path.dirname(PID_FILE);
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(PID_FILE, String(pid), 'utf8');
}

function clearPid() {
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
}

// ─── systemd-backed commands ────────────────────────────────────────────────────

function systemdStart() {
  console.error('  Starting total-recall-daemon.service...');
  execSync('sudo systemctl start total-recall-daemon', { stdio: 'inherit' });
  console.error('  ✅ Daemon started');
}

function systemdStop() {
  console.error('  Stopping total-recall-daemon.service...');
  execSync('sudo systemctl stop total-recall-daemon', { stdio: 'inherit' });
  console.error('  ✅ Daemon stopped');
}

function systemdStatus() {
  try {
    execSync('systemctl status total-recall-daemon', { stdio: 'inherit' });
  } catch { /* systemctl exits non-zero for inactive services */ }
}

// ─── Direct process management ──────────────────────────────────────────────────

function directStart() {
  const existingPid = readPid();
  if (existingPid) {
    console.error(`  ⚠️  Daemon already running (PID ${existingPid})`);
    return;
  }

  const dreamScript = path.join(ROOT, 'src', 'core', 'dream.mjs');
  if (!fs.existsSync(dreamScript)) {
    console.error(`  ❌ Dream script not found: ${dreamScript}`);
    process.exit(1);
  }

  const logsDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  const logFd = fs.openSync(LOG_FILE, 'a');
  const child = spawn('node', [dreamScript], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production' },
  });

  child.unref();
  writePid(child.pid);
  fs.closeSync(logFd);

  console.error(`  ✅ Daemon started (PID ${child.pid})`);
  console.error(`     Logs: ${LOG_FILE}`);
}

function directStop() {
  const pid = readPid();
  if (!pid) {
    console.error('  ⚠️  Daemon is not running');
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.error(`  ✅ Daemon stopped (PID ${pid})`);
  } catch (err) {
    console.error(`  ⚠️  Failed to stop daemon (PID ${pid}): ${err.message}`);
  }
  clearPid();
}

function directStatus() {
  const pid = readPid();
  if (pid) {
    console.error(`  🟢 Daemon is running (PID ${pid})`);
    console.error(`     Logs: ${LOG_FILE}`);

    // Show last 5 lines of log
    try {
      const log = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = log.trim().split('\n').slice(-5);
      console.error('\n  Recent log entries:');
      for (const line of lines) {
        console.error(`    ${line}`);
      }
    } catch { /* no log file */ }
  } else {
    console.error('  🔴 Daemon is not running');
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────────

export default async function daemon(args) {
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    printHelp();
    return;
  }

  const useSystemd = hasSystemd();

  switch (subcommand) {
    case 'start':
      useSystemd ? systemdStart() : directStart();
      break;
    case 'stop':
      useSystemd ? systemdStop() : directStop();
      break;
    case 'status':
      useSystemd ? systemdStatus() : directStatus();
      break;
    default:
      console.error(`  Unknown daemon command: ${subcommand}`);
      console.error(`  Valid commands: start, stop, status`);
      process.exit(1);
  }
}
