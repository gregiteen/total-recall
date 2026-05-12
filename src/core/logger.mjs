import fs from 'fs';
import path from 'path';
import os from 'os';

const AGENT_DIR = process.env.AGENT_DIR || path.join(os.homedir(), '.agent');
const LOG_DIR = path.join(AGENT_DIR, 'logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const getLogFile = () => {
  const d = new Date();
  return path.join(LOG_DIR, `system-${d.toISOString().split('T')[0]}.jsonl`);
};

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
  },
  info: (subsystem, message, meta) => logger.log(subsystem, 'info', message, meta),
  warn: (subsystem, message, meta) => logger.log(subsystem, 'warn', message, meta),
  error: (subsystem, message, meta) => logger.log(subsystem, 'error', message, meta)
};
