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

import { execSync, execFileSync, spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBrainDir } from './agent-dir.mjs';
import { startDaemon, stopDaemon, readPid, getDaemonObservation } from '../core/daemon-control.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
// System daemon always targets the global brain — never the cwd project vault.
const BRAIN_DIR = resolveBrainDir('global');
const LOG_FILE = path.join(BRAIN_DIR, 'logs', 'daemon.log');

function commandExists(cmd) {
  if (!cmd || !/^[a-zA-Z0-9_-]+$/.test(cmd)) {
    return false;
  }
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function hasSystemd() {
  return os.platform() === 'linux' && commandExists('systemctl') && fs.existsSync('/run/systemd/system');
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
    ensure    Enable the managed daemon; --restart reloads current source
    stop      Stop the background daemon
    status    Show daemon status + recent log entries
    logs      Read daemon logs (--lines N, default 50)

  The daemon runs a durable task loop that:
    • Ingests IDE conversation logs (Claude Code, Codex, Gemini, etc.)
    • Dispatches open task envelopes via the executor registry (fail-loud)
    • Runs system dream periodically when the queue is empty (memory consolidation)
    • Does NOT invent idle research/LLM work unless TR_IDLE_TASKS=1
    • Agents enqueue work: npx total-recall task add "<intent>"

  On Linux with systemd, delegates to systemctl.
  On macOS with launchd (after deploy), delegates to launchctl.
  Otherwise, manages a detached Node.js process with a PID file.

  Options:
    --help, -h    Show this help
`);
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

  const logFile = path.join(BRAIN_DIR, 'logs', 'daemon.log');
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
  try {
    const pid = startDaemon();
    console.error(`  ✅ Daemon started (PID ${pid})`);
    console.error(`     Logs: ${LOG_FILE}`);
  } catch (err) {
    console.error(`  ❌ Failed to start daemon: ${err.message}`);
    process.exit(1);
  }
}

async function directStop() {
  const stopped = await stopDaemon();
  if (stopped) {
    console.error('  ✅ Daemon stopped');
  } else {
    console.error('  ⚠️  Daemon is not running');
  }
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

  // Managers must honor the same brain lock as direct lifecycle operations.
  if (['start', 'ensure', 'stop'].includes(subcommand)) {
    const observation = getDaemonObservation();
    if (['conflict', 'unknown'].includes(observation.status)) {
      throw new Error(`Daemon ${subcommand} refused: ${observation.reason || observation.status}; expected ${observation.expected_entry}${observation.entry ? `, observed ${observation.entry}` : ''}`);
    }
  }

  switch (subcommand) {
    case 'ensure': {
      if(!useSystemd)throw new Error('Managed daemon ensure currently requires systemd on the daemon host');
      // A detached worker can hold the same brain lock while systemd reports a
      // successful short-lived start. Stop that verified owner before takeover.
      const managed=spawnSync('systemctl',['show','total-recall-daemon','--property=MainPID','--value'],{encoding:'utf8'});
      if(managed.status!==0)throw new Error('Cannot inspect managed daemon');
      const owner=readPid(),managedPid=Number(managed.stdout.trim());
      if(owner && (owner!==managedPid || args.includes('--restart'))){
        if(owner===managedPid)execFileSync('systemctl',['stop','total-recall-daemon'],{stdio:'inherit'});
        else if(!await stopDaemon())throw new Error('Cannot stop verified detached daemon');
      }
      execFileSync('systemctl',['enable','--now','total-recall-daemon'],{stdio:'inherit'});
      await new Promise(resolve=>setTimeout(resolve,3000));
      const active=spawnSync('systemctl',['is-active','--quiet','total-recall-daemon']);
      const current=spawnSync('systemctl',['show','total-recall-daemon','--property=MainPID','--value'],{encoding:'utf8'});
      const pid=readPid();
      if(active.status!==0 || !pid || pid!==Number(current.stdout?.trim()))throw new Error('Managed daemon did not retain ownership of the brain lock');
      console.log(JSON.stringify({ok:true,manager:'systemd',pid,enabled:true}));
      break;
    }
    case 'logs': {
      const index = args.indexOf('--lines');
      const lines = index < 0 ? 50 : Number(args[index + 1]);
      if (!Number.isInteger(lines) || lines < 1 || lines > 10000) throw new Error('--lines must be an integer from 1 to 10000');
      if (useSystemd) {
        const result = spawnSync('journalctl', ['-u', 'total-recall-daemon.service', '-n', String(lines), '--no-pager'], { stdio: 'inherit' });
        if (result.error || result.status !== 0) throw new Error('Could not read the daemon journal');
      } else {
        if (!fs.existsSync(LOG_FILE)) throw new Error('No daemon log exists');
        console.log(fs.readFileSync(LOG_FILE, 'utf8').trimEnd().split('\n').slice(-lines).join('\n'));
      }
      break;
    }
    case 'start':
      if (useSystemd) systemdStart();
      else if (useLaunchd) launchctlStart();
      else directStart();
      break;
    case 'stop':
      if (useSystemd) systemdStop();
      else if (useLaunchd) launchctlStop();
      else await directStop();
      break;
    case 'status':
      console.log(JSON.stringify({ daemon: getDaemonObservation() }));
      if (useSystemd) systemdStatus();
      else if (useLaunchd) launchctlStatus();
      else directStatus();
      break;
    default:
      console.error(`  Unknown daemon command: ${subcommand}`);
      console.error(`  Valid commands: start, ensure, stop, status, logs`);
      process.exit(1);
  }
}
