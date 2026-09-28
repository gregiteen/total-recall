import fs from 'node:fs';
import path from 'node:path';
import { sendNotification, loadConfig } from './notify-core.mjs';

const USAGE = `usage:
  total-recall alerts send --title T --message M [--channels os,email,sms,webhook,github] [--event-id ID]
                                  [--severity info|high|critical] [--source S] [--quiet-hours 22-7] [--config file] [--dry-run]
  total-recall alerts test [--channels ...]     dry-run every configured channel
  total-recall alerts config                    show the merged config (secret names only)
  total-recall alerts log [--limit N]           recent sends from the ledger`;

function flags(args) {
  const a = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t === '--dry-run') a.dry = true;
    else if (t.startsWith('--')) a[t.slice(2)] = args[++i];
    else a._.push(t);
  }
  return a;
}

export async function run(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  const sub = args[0] || 'help';
  const a = flags(args.slice(1));
  const config = loadConfig(process.cwd(), a.config || null);

  if (sub === 'config') {
    console.log(JSON.stringify(config, null, 2));
    return;
  }
  if (sub === 'log') {
    const home = process.env.TR_NOTIFY_HOME || path.join(process.env.HOME || '', '.total-recall', 'notifications');
    const file = path.join(home, 'sent.jsonl');
    const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
    console.log(lines.slice(-Number(a.limit || 20)).join('\n'));
    return;
  }
  if (sub === 'send' || sub === 'test') {
    const test = sub === 'test';
    if (!test && (!a.title || !a.message)) { console.error(USAGE); process.exitCode = 2; return; }
    const channels = (a.channels || (test ? Object.keys(config).join(',') : 'os')).split(',').filter(Boolean);
    const results = await sendNotification({
      title: a.title || 'Notification test', message: a.message || 'Dry run of every configured channel.',
      channels, eventId: a['event-id'], severity: a.severity, source: a.source,
      dry: test || a.dry, quietHours: a['quiet-hours'], config,
    });
    console.log(JSON.stringify(results, null, 2));
    if (results.some((r) => r.status === 'failed')) process.exitCode = 1;
    return;
  }
  console.log(USAGE);
  if (sub !== 'help') process.exitCode = 2;
}

export default run;
