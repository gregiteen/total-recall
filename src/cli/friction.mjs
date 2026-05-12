import { detectFriction } from '../core/friction.mjs';
import path from 'path';
import os from 'os';

/**
 * CLI command to run Friction Detection on logs
 */
export default async function runFriction(args) {
  console.log(`[Friction] 🔍 Analyzing logs for workflow bottlenecks...`);
  
  // Default path for watchdog logs
  const logPath = args[0] || path.join(os.homedir(), '.agent', 'logs', 'watchdog.jsonl');
  
  const result = await detectFriction(logPath);
  if (!result) {
    console.log(`[Friction] No logs found at ${logPath}. Skipping analysis.`);
    return;
  }
  
  console.log(`\n${result.report}`);
}
