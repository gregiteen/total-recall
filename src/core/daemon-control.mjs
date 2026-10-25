import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.mjs';
import { agentDir, brainDir } from './config.mjs';
import { observeDaemon } from './startup-health.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

// The daemon's own lockfile (daemon-loop acquirePidLock). start/stop/status read the
// same file: a separate logs/daemon.pid let `daemon stop` miss the live daemon and
// leave it running old code alongside a newly started one.
export const DAEMON_PID_FILE = path.join(brainDir, 'daemon.pid');
const PID_FILE = DAEMON_PID_FILE;
const LOG_FILE = path.join(brainDir, 'logs', 'daemon.log');

/**
 * Reads the daemon PID file and checks if the process is actually running.
 * @returns {number|null} The active PID, or null if not running/invalid.
 */
export function readPid() {
  const observation = getDaemonObservation();
  return observation.status === 'running' ? observation.pid : null;
}

export function getDaemonObservation() { return observeDaemon(brainDir); }

/**
 * Returns the status of the daemon process.
 * @returns {'running'|'dead'|'not_started'|'conflict'|'unknown'}
 */
export function getDaemonStatus() {
  const { status } = getDaemonObservation();
  return status === 'not-started' ? 'not_started' : status === 'stopped' ? 'dead' : status;
}

/**
 * Detaches the daemon script in the background and writes its PID to file.
 * @returns {number} The PID of the newly spawned daemon.
 */
export function startDaemon() {
  const observation = getDaemonObservation();
  if (['conflict', 'unknown'].includes(observation.status)) {
    throw new Error(`Daemon start refused: ${observation.reason || observation.status}; expected ${observation.expected_entry}${observation.entry ? `, observed ${observation.entry}` : ''}`);
  }
  const existingPid = observation.status === 'running' ? observation.pid : null;
  if (existingPid) {
    logger.warn('daemon-control', `Daemon already running under PID ${existingPid}.`);
    return existingPid;
  }

  const dreamScript = path.join(ROOT, 'src', 'core', 'daemon-loop.mjs');
  if (!fs.existsSync(dreamScript)) {
    throw new Error(`Daemon script not found at ${dreamScript}`);
  }

  const logsDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const logFd = fs.openSync(LOG_FILE, 'a');
  
  // Use spawn to launch in a detached background state
  // Cap the V8 heap so a leak or reload storm is restarted by the watchdog
  // instead of growing into swap. TR_DAEMON_MAX_HEAP_MB overrides; 0 disables.
  const heapMb = Number(process.env.TR_DAEMON_MAX_HEAP_MB ?? 768);
  const heapFlags = Number.isFinite(heapMb) && heapMb > 0 ? [`--max-old-space-size=${Math.floor(heapMb)}`] : [];
  const child = spawn(process.execPath, [...heapFlags, dreamScript], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AGENT_DIR: agentDir,
    },
  });

  if (!child || !child.pid) {
    fs.closeSync(logFd);
    throw new Error('Failed to spawn daemon process (no pid returned)');
  }

  child.unref();
  
  // The daemon writes DAEMON_PID_FILE itself when it acquires its lock;
  // pre-writing the child's pid here made the child see a live lock and exit.
  fs.closeSync(logFd);

  logger.info('daemon-control', `Active Intelligence Daemon started detached (PID ${child.pid}).`);
  return child.pid;
}

/**
 * Stops the running background daemon and waits for the process to exit.
 * The daemon owns its lockfile and removes it on exit, so a start issued right
 * after stop can never run alongside a daemon that is still finishing work.
 * @param {{ graceMs?: number, pollMs?: number }} [opts]
 * @returns {Promise<boolean>} True if a daemon was running and has exited.
 */
export async function stopDaemon({ graceMs = 35_000, pollMs = 250 } = {}) {
  const pid = readPid();
  if (!pid) {
    // Startup owns stale-lock recovery. A live process with unreadable identity
    // is not ours to signal or unlink.
    return false;
  }

  const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
  try {
    process.kill(pid, 'SIGTERM');
    logger.info('daemon-control', `Sent SIGTERM to daemon PID ${pid}.`);
  } catch (err) {
    logger.error('daemon-control', `Failed to terminate daemon PID ${pid}: ${err.message}`);
    return false;
  }

  const deadline = Date.now() + graceMs;
  while (alive() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  if (alive()) {
    logger.warn('daemon-control', `Daemon PID ${pid} still running after ${graceMs}ms — sending SIGKILL.`);
    try { process.kill(pid, 'SIGKILL'); } catch {}
  }

  // A SIGKILLed daemon cannot run its exit handler; drop its lock if still ours.
  try {
    if (fs.existsSync(PID_FILE) && parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10) === pid) {
      fs.unlinkSync(PID_FILE);
    }
  } catch {}
  return true;
}

/**
 * Ensures that the daemon is in a running state. Auto-starts if not.
 * @returns {number|null} The PID of the daemon.
 */
export async function ensureDaemonRunning() {
  const status = getDaemonStatus();
  if (status === 'running') {
    return readPid();
  }
  
  logger.info('daemon-control', `Daemon status is '${status}'. Initiating auto-start...`);
  try {
    const pid = startDaemon();
    logger.info('daemon-control', `Auto-start successful. Daemon is now running on PID ${pid}.`);
    return pid;
  } catch (err) {
    logger.error('daemon-control', `Failed to auto-start background daemon: ${err.message}`);
    throw err;
  }
}
