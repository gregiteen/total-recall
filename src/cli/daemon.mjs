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

import { execSync, spawnSync, spawn } from 'node:child_process';
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

function launchAgentPlist(name) {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${name}.plist`);
}

function hasLaunchd() {
  return os.platform() === 'darwin' && fs.existsSync(launchAgentPlist('com.totalrecall.daemon'));
}

function printHelp() {
  console.log(`
  total-recall daemon — Manage the Active Intelligence Daemon

  Usage: total-recall daemon <command>

  Commands:
    start     Start the background Active Intelligence Daemon
    stop      Stop the background daemon
    status    Show daemon status + recent log entries

  The daemon runs a continuous scheduler loop that:
    • Ingests IDE conversation logs (Claude Code, Codex, Gemini, etc.)
    • Dispatches tasks to cognitive layer engines (Conscious/System2/Research)
    • Runs a full dream cycle every 20 tasks (surface recompile + conflict resolution)
    • Keeps the local Gemma 4 LLM busy at all times (queue is never empty)

  On Linux with systemd, delegates to systemctl.
  On macOS with launchd (after deploy), delegates to launchctl.
  Otherwise, manages a detached Node.js process with a PID file.

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

// ─── launchd-backed commands (macOS) ────────────────────────────────────────────

function runLaunchctl(...args) {
  return spawnSync('launchctl', args, { stdio: 'inherit' });
}

function launchctlStart() {
  const plist = launchAgentPlist('com.totalrecall.daemon');
  console.error('  Starting com.totalrecall.daemon via launchctl...');
  const loadResult = spawnSync('launchctl', ['load', '-w', plist], { stdio: 'pipe' });
  if (loadResult.status === 0) {
    console.error('  ✅ Daemon started');
    return;
  }
  // Already loaded — kick it
  const startResult = runLaunchctl('start', 'com.totalrecall.daemon');
  if (startResult.status === 0) {
    console.error('  ✅ Daemon started');
  } else {
    console.error('  ⚠️  launchctl start failed');
  }
}

function launchctlStop() {
  console.error('  Stopping com.totalrecall.daemon via launchctl...');
  const result = runLaunchctl('stop', 'com.totalrecall.daemon');
  if (result.status === 0) {
    console.error('  ✅ Daemon stopped');
  } else {
    console.error('  ⚠️  launchctl stop failed');
  }
}

function launchctlStatus() {
  const result = spawnSync('launchctl', ['list', 'com.totalrecall.daemon'], { encoding: 'utf8' });
  const running = result.status === 0 && !String(result.stdout || '').includes('Could not find service');
  if (running) {
    console.error(`  🟢 Daemon is managed by launchd`);
    const lines = String(result.stdout || '').trim().split('\n');
    for (const line of lines) console.error(`    ${line}`);
  } else {
    console.error('  🔴 Daemon is not loaded in launchd');
  }

  const logFile = path.join(os.homedir(), '.agent', 'logs', 'daemon.log');
  try {
    const log = fs.readFileSync(logFile, 'utf8');
    const lines = log.trim().split('\n').slice(-5);
    if (lines.length) {
      console.error('\n  Recent log entries:');
      for (const line of lines) console.error(`    ${line}`);
    }
  } catch { /* no log file yet */ }
}

// ─── Direct process management ──────────────────────────────────────────────────

function directStart() {
  const existingPid = readPid();
  if (existingPid) {
    console.error(`  ⚠️  Daemon already running (PID ${existingPid})`);
    return;
  }

  const dreamScript = path.join(ROOT, 'src', 'core', 'daemon-loop.mjs');
  if (!fs.existsSync(dreamScript)) {
    // Fallback to dream.mjs for backward compatibility
    const fallback = path.join(ROOT, 'src', 'core', 'dream.mjs');
    if (fs.existsSync(fallback)) {
      console.error('  ⚠️  daemon-loop.mjs not found, falling back to dream.mjs');
    } else {
      console.error(`  ❌ Daemon script not found: ${dreamScript}`);
      process.exit(1);
    }
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
  const useLaunchd = !useSystemd && hasLaunchd();

  switch (subcommand) {
    case 'start':
      if (useSystemd) systemdStart();
      else if (useLaunchd) launchctlStart();
      else directStart();
      break;
    case 'stop':
      if (useSystemd) systemdStop();
      else if (useLaunchd) launchctlStop();
      else directStop();
      break;
    case 'status':
      if (useSystemd) systemdStatus();
      else if (useLaunchd) launchctlStatus();
      else directStatus();
      break;
    default:
      console.error(`  Unknown daemon command: ${subcommand}`);
      console.error(`  Valid commands: start, stop, status`);
      process.exit(1);
  }
}
