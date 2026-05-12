import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger.mjs';

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
    if (state.authFailures[ip] >= 5) {
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
      state.tokenSpikes = 0; // Reset if normal
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
      // Future integration: send signal to local LLM or API to clear cache
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

// Periodic disk check
setInterval(watchdog.checkDiskSpace, 60000).unref();
