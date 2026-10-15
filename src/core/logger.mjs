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
 * Max bytes a single daily log may reach before it is rotated
 * (TR_LOG_MAX_BYTES, default 64 MiB, 0 disables). Age-only retention is not
 * enough: one runaway day reached 1.5 GB and filled the disk, so a size cap is
 * enforced on every write.
 */
const maxLogBytes = () => {
  const n = Number(process.env.TR_LOG_MAX_BYTES ?? 64 * 1024 * 1024);
  return Number.isFinite(n) && n >= 0 ? n : 64 * 1024 * 1024;
};

/** Total bytes allowed across all daily logs (TR_LOG_TOTAL_MAX_BYTES, default 512 MiB, 0 disables). */
const maxTotalLogBytes = () => {
  const n = Number(process.env.TR_LOG_TOTAL_MAX_BYTES ?? 512 * 1024 * 1024);
  return Number.isFinite(n) && n >= 0 ? n : 512 * 1024 * 1024;
};

/**
 * Rotates the active log when it passes the size cap, and trims the oldest
 * daily logs until the total budget is met. Runs at most once per minute per
 * process; never throws.
 */
let lastSizeCheck = 0;
export function enforceLogSize(now = Date.now()) {
  if (now - lastSizeCheck < 60000) return 0;
  lastSizeCheck = now;
  const perFile = maxLogBytes();
  const total = maxTotalLogBytes();
  if (perFile === 0 && total === 0) return 0;
  let acted = 0;
  try {
    const active = getLogFile();
    if (perFile > 0) {
      try {
        const size = fs.statSync(active).size;
        if (size > perFile) {
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          fs.renameSync(active, `${active}.${stamp}.rotated`);
          acted++;
        }
      } catch { /* not created yet */ }
    }
    if (total > 0) {
      const entries = [];
      let sum = 0;
      for (const name of fs.readdirSync(LOG_DIR)) {
        if (!/^system-\d{4}-\d{2}-\d{2}\.jsonl(\.|$)/.test(name)) continue;
        const full = path.join(LOG_DIR, name);
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        entries.push({ full, size: st.size, mtime: st.mtimeMs });
        sum += st.size;
      }
      entries.sort((a, b) => a.mtime - b.mtime);
      for (const e of entries) {
        if (sum <= total) break;
        if (e.full === active) continue;
        try { fs.unlinkSync(e.full); sum -= e.size; acted++; } catch { /* in use */ }
      }
    }
  } catch { /* directory unreadable */ }
  return acted;
}

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
      enforceLogSize();
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
