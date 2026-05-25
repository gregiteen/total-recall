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

export const logEvents = new EventEmitter();
logEvents.setMaxListeners(50);

export const logger = {
  log: (subsystemOrEntry, level, message, meta = {}) => {
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
