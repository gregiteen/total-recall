import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'node:events';
import { agentDir } from './config.mjs';

const AGENT_DIR = agentDir;
const LOG_DIR = path.join(AGENT_DIR, 'logs');

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
  log: (subsystem, level, message, meta = {}) => {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      subsystem,
      message,
      ...meta
    };

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
  error: (subsystem, message, meta) => logger.log(subsystem, 'error', message, meta)
};

export { LOG_DIR, getLogFile };
