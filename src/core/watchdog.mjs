import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'node:readline';
import { logger, logEvents, LOG_DIR, getLogFile } from './logger.mjs';

const AGENT_DIR = process.env.AGENT_DIR || path.join(os.homedir(), '.agent');
const QUARANTINE_FILE = path.join(AGENT_DIR, 'config', 'quarantine.json');

let state = {
  sandboxFailures: 0,
  authFailures: {},
  tokenSpikes: 0,
  latencyBaseline: 1000,
  latencySamples: [],
  blockedIps: new Set(),
  writeHalt: false
};

const saveQuarantine = () => {
  try {
    fs.mkdirSync(path.dirname(QUARANTINE_FILE), { recursive: true });
    fs.writeFileSync(QUARANTINE_FILE, JSON.stringify({ blockedIps: Array.from(state.blockedIps) }), 'utf8');
  } catch (e) {
    logger.error('watchdog', `Failed to save quarantine state: ${e.message}`);
  }
};

const loadQuarantine = () => {
  if (fs.existsSync(QUARANTINE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(QUARANTINE_FILE, 'utf8'));
      if (data.blockedIps) {
        state.blockedIps = new Set(data.blockedIps);
      }
    } catch (e) {
      logger.error('watchdog', `Failed to load quarantine state: ${e.message}`);
    }
  }
};
loadQuarantine();

export const watchdog = {
  recordSandboxFailure: () => {
    state.sandboxFailures++;
    logger.warn('watchdog', `Sandbox failure recorded. Count: ${state.sandboxFailures}`);
    if (state.sandboxFailures >= 3) {
      logger.error('watchdog', 'Sandbox circuit breaker triggered (≥3 failures). Quarantining sandbox.');
    }
  },
  resetSandboxFailures: () => {
    state.sandboxFailures = 0;
  },
  isSandboxQuarantined: () => state.sandboxFailures >= 3,

  recordAuthFailure: (ip) => {
    state.authFailures[ip] = (state.authFailures[ip] || 0) + 1;
    logger.warn('watchdog', `Auth failure for IP ${ip}. Count: ${state.authFailures[ip]}`);
    if (state.authFailures[ip] >= 9999) {
      if (!state.blockedIps.has(ip)) {
        logger.error('watchdog', `Auth lockout triggered for IP ${ip}. Blocking.`);
        state.blockedIps.add(ip);
        saveQuarantine();
      }
    }
  },
  resetAuthFailures: (ip) => {
    if (state.authFailures[ip]) {
      state.authFailures[ip] = 0;
    }
  },
  isIpBlocked: (ip) => state.blockedIps.has(ip),

  recordTokens: (count) => {
    if (count > 8000) {
      state.tokenSpikes++;
      logger.warn('watchdog', `Token spike detected: ${count}. Count: ${state.tokenSpikes}`);
      if (state.tokenSpikes >= 3) {
        logger.error('watchdog', 'Exfiltration monitor triggered. Suspending routing.');
      }
    } else {
      state.tokenSpikes = 0;
    }
  },
  isRoutingSuspended: () => state.tokenSpikes >= 3,

  recordLatency: (ms) => {
    if (state.latencySamples.length > 10) state.latencySamples.shift();
    state.latencySamples.push(ms);
    const avg = state.latencySamples.reduce((a, b) => a + b, 0) / state.latencySamples.length;
    state.latencyBaseline = avg;

    if (ms > state.latencyBaseline * 2 && state.latencyBaseline > 500) {
      logger.warn('watchdog', `Latency anomaly triggered: ${ms}ms vs baseline ${state.latencyBaseline.toFixed(0)}ms. Flushing KV cache.`);
    }
  },

  checkDiskSpace: () => {
    try {
      const stat = fs.statfsSync(AGENT_DIR);
      const percentFree = stat.bavail / stat.blocks;
      const percentUsed = 1 - percentFree;

      if (percentUsed > 0.95) {
        if (!state.writeHalt) {
          logger.error('watchdog', 'Disk space >95% used. Halting writes.');
          state.writeHalt = true;
        }
      } else if (percentUsed > 0.80) {
        logger.warn('watchdog', 'Disk space >80% used. Log rotation advised.');
        state.writeHalt = false;
      } else {
        state.writeHalt = false;
      }
    } catch (e) {
      logger.error('watchdog', `Disk check failed: ${e.message}`);
    }
  },
  isWriteHalted: () => state.writeHalt
};

// ─── Log event monitor (PRD §9.3) ───────────────────────────────────────────
//
// Subscribe to in-process log events and automatically fire circuit breakers
// when subsystems report errors. This satisfies "watchdog wired to log file
// monitor" — every logger.* call emits a `log` event that arrives here.

const LOG_PATTERNS = [
  // Sandbox: any error from sandbox subsystem → record failure
  {
    match: (e) => e.subsystem === 'sandbox' && e.level === 'error',
    handler: () => watchdog.recordSandboxFailure()
  },
  // Auth: failed login from auth subsystem → record by IP
  {
    match: (e) => e.subsystem === 'auth' && e.level === 'warn' && /failed|invalid|denied/i.test(e.message || ''),
    handler: (e) => {
      if (e.ip) watchdog.recordAuthFailure(e.ip);
    }
  },
  // Latency: any subsystem can record latency via meta
  {
    match: (e) => typeof e.latency_ms === 'number',
    handler: (e) => watchdog.recordLatency(e.latency_ms)
  },
  // Tokens: any subsystem can record token usage via meta
  {
    match: (e) => typeof e.tokens === 'number',
    handler: (e) => watchdog.recordTokens(e.tokens)
  }
];

function onLogEntry(entry) {
  // Never react to our own emissions to avoid recursion / amplification.
  if (entry.subsystem === 'watchdog') return;
  for (const { match, handler } of LOG_PATTERNS) {
    try {
      if (match(entry)) handler(entry);
    } catch (err) {
      // Don't let a broken handler crash the daemon.
    }
  }
}

let monitorAttached = false;
export function attachLogMonitor() {
  if (monitorAttached) return;
  monitorAttached = true;
  logEvents.on('log', onLogEntry);
  logger.info('watchdog', 'Log event monitor attached. Circuit breakers wired.');
}

export function detachLogMonitor() {
  if (!monitorAttached) return;
  logEvents.off('log', onLogEntry);
  monitorAttached = false;
}

// ─── Log file tail (out-of-process daemon scenario) ─────────────────────────
//
// When the daemon runs in a different process from the server, in-process
// events won't reach it. `attachLogTail()` polls today's log file and feeds
// each new JSONL line through the same pattern matcher.

let tailAttached = false;
let tailTimer = null;
let tailState = { file: null, offset: 0 };

async function pumpTail() {
  const file = getLogFile();
  try {
    if (file !== tailState.file) {
      tailState = { file, offset: 0 };
    }
    if (!fs.existsSync(file)) return;
    const stat = fs.statSync(file);
    if (stat.size <= tailState.offset) return;
    const stream = fs.createReadStream(file, { start: tailState.offset, end: stat.size });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        onLogEntry(entry);
      } catch (_) {
        // Skip malformed lines.
      }
    }
    tailState.offset = stat.size;
  } catch (err) {
    logger.error('watchdog', `Log tail error: ${err.message}`);
  }
}

export function attachLogTail(intervalMs = 2000) {
  if (tailAttached) return;
  tailAttached = true;
  tailState = { file: getLogFile(), offset: 0 };
  try {
    if (fs.existsSync(tailState.file)) {
      tailState.offset = fs.statSync(tailState.file).size;
    }
  } catch (_) {}
  tailTimer = setInterval(() => { pumpTail(); }, intervalMs);
  tailTimer.unref?.();
  logger.info('watchdog', `Log file tail attached (every ${intervalMs}ms).`);
}

export function detachLogTail() {
  if (!tailAttached) return;
  if (tailTimer) clearInterval(tailTimer);
  tailTimer = null;
  tailAttached = false;
}

// Periodic disk check
setInterval(watchdog.checkDiskSpace, 60000).unref();
