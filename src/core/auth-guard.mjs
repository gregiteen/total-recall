/** Existing authentication quarantine, shared without feature monitoring. */
import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.mjs';
import { brainDir } from './config.mjs';

const QUARANTINE_FILE = path.join(brainDir, 'config', 'quarantine.json');

let state = {
  authFailures: {},
  blockedIps: new Set(),
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

export const authGuard = {
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

};
