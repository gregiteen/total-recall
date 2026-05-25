import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.mjs';
import { agentDir, brainDir } from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

const PID_FILE = path.join(brainDir, 'logs', 'daemon.pid');
const LOG_FILE = path.join(brainDir, 'logs', 'daemon.log');

/**
 * Reads the daemon PID file and checks if the process is actually running.
 * @returns {number|null} The active PID, or null if not running/invalid.
 */
export function readPid() {
  try {
    if (!fs.existsSync(PID_FILE)) return null;
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (isNaN(pid) || pid <= 0) return null;
    
    // Check if the process is alive using signal 0
    try {
      process.kill(pid, 0);
      return pid;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Returns the status of the daemon process.
 * @returns {'running'|'dead'|'not_started'}
 */
export function getDaemonStatus() {
  try {
    const pid = readPid();
    if (pid) {
      return 'running';
    }
    
    // If process is not running but PID file exists, it's considered dead
    if (fs.existsSync(PID_FILE)) {
      return 'dead';
    }
    
    return 'not_started';
  } catch {
    return 'not_started';
  }
}

/**
 * Detaches the daemon script in the background and writes its PID to file.
 * @returns {number} The PID of the newly spawned daemon.
 */
export function startDaemon() {
  const existingPid = readPid();
  if (existingPid) {
    logger.warn('daemon-control', `Daemon already running under PID ${existingPid}.`);
    return existingPid;
  }

  const dreamScript = path.join(ROOT, 'src', 'core', 'daemon-loop.mjs');
  if (!fs.existsSync(dreamScript)) {
    // Fallback to dream.mjs for backward compatibility
    const fallback = path.join(ROOT, 'src', 'core', 'dream.mjs');
    if (fs.existsSync(fallback)) {
      logger.warn('daemon-control', 'daemon-loop.mjs not found, falling back to dream.mjs');
    } else {
      throw new Error(`Daemon script not found at ${dreamScript}`);
    }
  }

  const logsDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const logFd = fs.openSync(LOG_FILE, 'a');
  
  // Use spawn to launch in a detached background state
  const child = spawn(process.execPath, [dreamScript], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AGENT_DIR: agentDir,
    },
  });

  child.unref();
  
  // Write the PID file
  fs.writeFileSync(PID_FILE, String(child.pid), 'utf8');
  fs.closeSync(logFd);

  logger.info('daemon-control', `Active Intelligence Daemon started detached (PID ${child.pid}).`);
  return child.pid;
}

/**
 * Stops the running background daemon.
 * @returns {boolean} True if successfully stopped, false otherwise.
 */
export function stopDaemon() {
  const pid = readPid();
  if (!pid) {
    // Clear PID file in case it was a stale/dead record
    try {
      if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    } catch {}
    return false;
  }

  try {
    process.kill(pid, 'SIGTERM');
    logger.info('daemon-control', `Sent SIGTERM to daemon PID ${pid}.`);
    
    // Wait briefly and verify cleanup
    try {
      if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    } catch {}
    return true;
  } catch (err) {
    logger.error('daemon-control', `Failed to terminate daemon PID ${pid}: ${err.message}`);
    return false;
  }
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
