import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'node:events';
import { brainDir } from './config.mjs';

const BRAIN_DIR = brainDir;
const LOG_DIR = path.join(BRAIN_DIR, 'logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const getLogFile = () => {
  const d = new Date();
  return path.join(LOG_DIR, `system-${d.toISOString().split('T')[0]}.jsonl`);
};

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

/** Minimum level written. Debug is off unless TR_LOG_LEVEL=debug. */
const minLevel = () => LEVELS[String(process.env.TR_LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

/** Days of daily system logs kept (TR_LOG_RETENTION_DAYS, default 7, 0 keeps all). */
const retentionDays = () => {
  const n = Number(process.env.TR_LOG_RETENTION_DAYS ?? 7);
  return Number.isFinite(n) && n >= 0 ? n : 7;
};

/**
 * Deletes system-YYYY-MM-DD.jsonl files older than the retention window.
 * Runs at most once per calendar day per process; never throws.
 */
let lastPruneDay = '';
export function pruneOldLogs(now = new Date()) {
  const today = now.toISOString().split('T')[0];
  if (lastPruneDay === today) return 0;
  lastPruneDay = today;
  const days = retentionDays();
  if (days === 0) return 0;
  const cutoff = now.getTime() - days * 86400000;
  let removed = 0;
  try {
    for (const name of fs.readdirSync(LOG_DIR)) {
      const m = /^system-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name);
      if (!m) continue;
      if (Date.parse(m[1] + 'T00:00:00Z') < cutoff) {
        try { fs.unlinkSync(path.join(LOG_DIR, name)); removed++; } catch { /* in use or gone */ }
      }
    }
  } catch { /* directory unreadable */ }
  return removed;
}

export const logEvents = new EventEmitter();
logEvents.setMaxListeners(50);

export const logger = {
  log: (subsystemOrEntry, level, message, meta = {}) => {
    const effective = level || (typeof subsystemOrEntry === 'object' && subsystemOrEntry?.level) || 'info';
    if ((LEVELS[effective] ?? LEVELS.info) < minLevel()) return;
    let entry;
    if (typeof subsystemOrEntry === 'object' && subsystemOrEntry !== null) {
      entry = {
        timestamp: new Date().toISOString(),
        level: level || subsystemOrEntry.level || 'info',
        subsystem: subsystemOrEntry.subsystem || 'unknown',
        message: subsystemOrEntry.message || '',
        ...subsystemOrEntry
      };
    } else if (typeof subsystemOrEntry === 'string' && message === undefined) {
      entry = {
        timestamp: new Date().toISOString(),
        level: level || 'info',
        subsystem: 'system',
        message: subsystemOrEntry,
        ...meta
      };
    } else {
      entry = {
        timestamp: new Date().toISOString(),
        level: level || 'info',
        subsystem: subsystemOrEntry || 'unknown',
        message: message || '',
        ...meta
      };
    }

    const line = JSON.stringify(entry) + '\n';

    // Server rule: stderr only
    console.error(line.trim());

    try {
      pruneOldLogs();
      fs.appendFileSync(getLogFile(), line);
    } catch (e) {
      // If we fail to write to log file, we still printed to stderr
    }

    // Emit so watchdog and other in-process monitors can react without tailing the file.
    try {
      logEvents.emit('log', entry);
    } catch (_) {
      // Listeners must not break the logger.
    }
  },
  info: (subsystem, message, meta) => logger.log(subsystem, 'info', message, meta),
  warn: (subsystem, message, meta) => logger.log(subsystem, 'warn', message, meta),
  error: (subsystem, message, meta) => logger.log(subsystem, 'error', message, meta),
  debug: (subsystem, message, meta) => logger.log(subsystem, 'debug', message, meta)
};

export { LOG_DIR, getLogFile };
