import fs from 'node:fs';
import path from 'node:path';
import { getGlobalBrainDir, resolveBrainDir } from './agent-dir.mjs';
import { startupHealth } from '../core/startup-health.mjs';

export async function inspectStartup(options = {}) {
  const globalBrain = getGlobalBrainDir();
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(resolveBrainDir(), 'config', 'brain.json'), 'utf8')); } catch {}
  if (!cfg.url) try { cfg = JSON.parse(fs.readFileSync(path.join(globalBrain, 'config', 'brain.json'), 'utf8')); } catch {}
  const url = process.env.TR_BRAIN || cfg.url || null;
  let sameOrigin = !process.env.TR_BRAIN;
  try { sameOrigin ||= new URL(url).origin === new URL(cfg.url).origin; } catch {}
  const token = process.env.TR_PAT || process.env.TOTAL_RECALL_TOKEN || (sameOrigin ? cfg.token : null);
  return startupHealth({ brainDir: globalBrain, brainUrl: url, token, brainId: cfg.layer === 'project' && cfg.name ? `project:${cfg.name}` : null, ...options });
}

export default async function startup(args = []) {
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: total-recall startup check|ensure [--json] [--app-check <registered-repo-command>] [--app-start <registered-repo-command>]\ncheck is read-only. ensure starts only missing configured local managed services and an explicitly declared current-repo app command; never restarts running/unknown or remote services. SSSS is checked as tooling, not a fabricated daemon. App health JSON must contain ok:true and status:ready|healthy|running. No declaration means app readiness is unknown.');
    return;
  }
  if (!['check', 'ensure'].includes(args[0])) throw new Error('Unknown startup action');
  const options = { ensure: args[0] === 'ensure' };
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--json') continue;
    if (args[i] === '--app-check' || args[i] === '--app-start') {
      const flag = args[i]; const value = args[++i];
      if (!value || value.startsWith('-')) throw new Error('Missing registered command name');
      options[flag === '--app-check' ? 'appCheck' : 'appStart'] = value;
    } else throw new Error('Unknown startup option');
  }
  if (options.appStart && !options.appCheck) throw new Error('App start requires an explicit readiness command');
  const report = await inspectStartup(options);
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Startup: server ${report.server.status}; brain ${report.brain.status}; daemon ${report.daemon.status}; SSSS tooling ${report.ssss.status}; app ${report.app.status}`);
    for (const action of report.actions) console.log(`Action: ${action.component} ${action.action} (${action.accepted === true ? 'accepted; see observed readiness' : action.reason || 'failed'})`);
  }
  if (!report.ready) process.exitCode = 1;
}
