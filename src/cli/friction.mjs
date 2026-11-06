import { detectFriction } from '../core/friction.mjs';
import path from 'path';
import { resolveBrainDir } from './agent-dir.mjs';

/**
 * CLI command to run Friction Detection on logs
 */
export default async function runFriction(args = []) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  total-recall friction — Find workflow bottlenecks in the watchdog logs

    total-recall friction [log-file]

    log-file   The log to analyze. Defaults to the global brain's logs/watchdog.jsonl.
`);
    return;
  }
  console.log(`[Friction] 🔍 Analyzing logs for workflow bottlenecks...`);
  
  // Default path for watchdog logs
  const logPath = args[0] || path.join(resolveBrainDir('global'), 'logs', 'watchdog.jsonl');
  
  const result = await detectFriction(logPath);
  if (!result) {
    console.log(`[Friction] No logs found at ${logPath}. Skipping analysis.`);
    return;
  }
  
  console.log(`\n${result.report}`);
}
