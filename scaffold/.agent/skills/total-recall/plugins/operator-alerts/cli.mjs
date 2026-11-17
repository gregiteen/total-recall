import { sendNotification, loadConfig, readNotificationLedger, setNotificationChannel, notificationStatus } from './notify-core.mjs';

const USAGE = `usage:
  total-recall alerts send --title T --message M [--channels os,email,sms,webhook,github] [--event-id ID]
                                  [--severity info|high|critical] [--source S] [--quiet-hours 22-7] [--config file] [--dry-run] [--json]
  total-recall alerts test [--channels ...]     dry-run every configured channel
  total-recall alerts config                    show the merged config (secret names only)
  total-recall alerts config set <channel> <JSON>    persist channel settings through SSSS
  total-recall alerts log [--limit N] [--json]  recent submissions from the ledger
  total-recall alerts status [--check] [--json]  redacted route and ledger summary; optional local dry run`;

function flags(args) {
  const a = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t === '--dry-run') a.dry = true;
    else if (t === '--json') a.json = true;
    else if (t === '--check') a.check = true;
    else if (t.startsWith('--')) a[t.slice(2)] = args[++i];
    else a._.push(t);
  }
  return a;
}

async function execute(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  const sub = args[0] || 'help';
  const a = flags(args.slice(1));
  if (['help', '--help', '-h'].includes(sub) || args.includes('--help')) {
    console.log(USAGE);
    return;
  }
  if (sub === 'status') {
    if (args.slice(1).some(arg => arg !== '--check' && arg !== '--json')) throw new Error('Unexpected status arguments');
    console.log(JSON.stringify(await notificationStatus(loadConfig(), { check: a.check })));
    return;
  }
  if (sub === 'config' && a._[0] === 'set') { console.log(JSON.stringify(setNotificationChannel(a._[1], JSON.parse(a._[2])))); return; }
  const config = loadConfig(process.cwd(), a.config || null);

  if (sub === 'config') {
    console.log(JSON.stringify(config, null, 2));
    return;
  }
  if (sub === 'log') {
    const limit = Number(a.limit ?? 20);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('Log limit must be an integer from 1 to 1000');
    const rows = readNotificationLedger().slice(-limit);
    console.log(a.json ? JSON.stringify(rows) : rows.map(row => JSON.stringify(row)).join('\n'));
    return;
  }
  if (sub === 'send' || sub === 'test') {
    const test = sub === 'test';
    if (!test && (!a.title?.trim() || !a.message?.trim())) throw new Error('Alert title and message are required');
    const configured = Object.keys(config);
    const channels = (a.channels || (configured.length ? configured.join(',') : 'os')).split(',').map(s => s.trim()).filter(Boolean);
    const results = await sendNotification({
      title: a.title || 'Notification test', message: a.message || 'Dry run of every configured channel.',
      channels, eventId: a['event-id'], severity: a.severity, source: a.source,
      dry: test || a.dry, quietHours: a['quiet-hours'], config,
    });
    console.log(JSON.stringify(results, null, 2));
    if (results.some(r => ['failed', 'pending'].includes(r.status) || r.persistence === 'unverified')) process.exitCode = 1;
    return;
  }
  throw new Error('Unknown alerts command');
}

export async function run(argv = []) {
  try { await execute(argv); }
  catch (error) {
    const message = argv[3] === 'status' ? 'Could not read alert status.' : error.message;
    if (argv.includes('--json')) console.log(JSON.stringify({ ok: false, error: message }));
    else console.error(message);
    process.exitCode = 1;
  }
}

export default run;
