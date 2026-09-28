/**
 * notify-core: send an alert to the operator over one or more channels.
 *
 * Generic: no recipients, senders or key names are hardcoded. Everything comes
 * from flags, a notify.json config, or the Total Recall secret store.
 * See README.md.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const run = promisify(execFile);
const HOME_DIR = process.env.TR_NOTIFY_HOME || path.join(os.homedir(), '.total-recall', 'notifications');
const LEDGER = path.join(HOME_DIR, 'sent.jsonl');
const LOG = path.join(HOME_DIR, 'notification-log.md');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

export function loadConfig(cwd = process.cwd(), explicit = null) {
  const layers = [
    readJson(path.join(HOME_DIR, 'config.json')),
    readJson(path.join(cwd, '.agent', 'notify.json')),
    explicit ? readJson(explicit) : {},
  ];
  const out = {};
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer)) out[k] = { ...(out[k] || {}), ...v };
  }
  return out;
}

async function secret(name, cwd) {
  if (!name) return null;
  if (process.env[name]) return process.env[name];
  try {
    const { stdout } = await run('total-recall', ['secret', 'get', name], { cwd, maxBuffer: 1 << 20 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** A recipient is a literal (contains @ or starts with +) or `secret:NAME`. */
async function recipient(spec, cwd) {
  if (!spec) return null;
  if (spec.startsWith('secret:')) return secret(spec.slice(7), cwd);
  return spec;
}

async function need(cfg, field, cwd, channel) {
  const v = field.endsWith('_secret') ? await secret(cfg[field], cwd) : await recipient(cfg[field], cwd);
  if (!v) throw new Error(`${channel}: missing ${field} (set it in notify.json or via flags)`);
  return v;
}

async function post(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

const ADAPTERS = {
  async os({ title, message }, cfg, ctx) {
    if (ctx.dry) return { dry: true };
    try {
      await run('terminal-notifier', ['-title', title, '-message', message, '-open', `file://${LOG}`, '-group', `notify-${ctx.source || 'alert'}`]);
    } catch {
      if (process.platform === 'darwin') {
        const q = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        await run('osascript', ['-e', `display notification "${q(message)}" with title "${q(title)}"`]);
      } else {
        await run('notify-send', [title, message]);
      }
    }
    return { accepted: true };
  },

  // SMTP2GO
  async email({ title, message }, cfg, ctx) {
    const to = await need(cfg, 'to', ctx.cwd, 'email');
    const sender = cfg.from;
    if (!sender) throw new Error('email: missing from (a verified SMTP2GO sender)');
    if (ctx.dry) return { dry: true, to, sender };
    const key = await need(cfg, 'key_secret', ctx.cwd, 'email');
    const r = await post('https://api.smtp2go.com/v3/email/send', {
      to: [to], sender, subject: title, text_body: message,
    }, { 'X-Smtp2go-Api-Key': key });
    if (r?.data?.succeeded < 1) throw new Error(`email: not accepted ${JSON.stringify(r.data)}`);
    return { accepted: true, provider_id: r?.data?.email_id };
  },

  // Telnyx Messaging
  async sms({ title, message }, cfg, ctx) {
    const to = await need(cfg, 'to', ctx.cwd, 'sms');
    const from = cfg.from;
    if (!from) throw new Error('sms: missing from (a Telnyx number or messaging profile sender)');
    if (ctx.dry) return { dry: true, to, from };
    const key = await need(cfg, 'key_secret', ctx.cwd, 'sms');
    const r = await post('https://api.telnyx.com/v2/messages', { from, to, text: `${title}\n${message}` }, { Authorization: `Bearer ${key}` });
    return { accepted: true, provider_id: r?.data?.id };
  },

  // Stubs: not wired yet. They report `stub` instead of pretending to send.
  async slack() { return { stub: true, note: 'slack adapter not implemented' }; },
  async discord() { return { stub: true, note: 'discord adapter not implemented' }; },
  async telegram() { return { stub: true, note: 'telegram adapter not implemented' }; },
  async expo() { return { stub: true, note: 'expo adapter not implemented' }; },

  async webhook({ title, message, eventId, severity, source }, cfg, ctx) {
    if (ctx.dry) return { dry: true };
    const url = await need(cfg, 'url_secret', ctx.cwd, 'webhook');
    await post(url, { title, message, event_id: eventId, severity, source });
    return { accepted: true };
  },

  async github({ title, message }, cfg, ctx) {
    const repo = cfg.repo;
    if (!repo) throw new Error('github: missing repo (owner/name)');
    if (ctx.dry) return { dry: true, repo };
    const token = await need(cfg, 'key_secret', ctx.cwd, 'github');
    const r = await post(`https://api.github.com/repos/${repo}/issues`, { title, body: message, labels: cfg.labels || [] }, {
      Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    });
    return { accepted: true, provider_id: r?.number };
  },
};

function inQuietHours(spec, now = new Date()) {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(spec || '');
  if (!m) return false;
  const [s, e, h] = [Number(m[1]), Number(m[2]), now.getHours()];
  return s <= e ? h >= s && h < e : h >= s || h < e;
}

function sentBefore(eventId, channel) {
  if (!eventId || !fs.existsSync(LEDGER)) return false;
  return fs.readFileSync(LEDGER, 'utf8').split('\n').some((l) => {
    try { const r = JSON.parse(l); return r.event_id === eventId && r.channel === channel && r.status === 'accepted'; } catch { return false; }
  });
}

function record(entry) {
  fs.mkdirSync(HOME_DIR, { recursive: true });
  fs.appendFileSync(LEDGER, JSON.stringify(entry) + '\n');
}

function logMarkdown(title, message, results, severity, source) {
  try {
    fs.mkdirSync(HOME_DIR, { recursive: true });
    const summary = results.map((r) => `${r.channel}:${r.status}`).join(', ');
    const entry = `### [${new Date().toISOString()}] ${title}\n> ${message}\n\n*${[severity, source].filter(Boolean).join(' · ')} | ${summary}*\n\n---\n\n`;
    const old = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '';
    fs.writeFileSync(LOG, entry + old);
  } catch { /* the log never blocks an alert */ }
}

export async function sendNotification(opts) {
  const {
    title, message, channels = ['os'], eventId = null, severity = 'info', source = '',
    dry = false, quietHours = null, cwd = process.cwd(), config = null,
  } = opts;
  const cfg = config || loadConfig(cwd);
  const critical = severity === 'critical' || severity === 'high';
  const quiet = !critical && inQuietHours(quietHours);
  const results = [];
  for (const channel of channels) {
    const base = { channel, event_id: eventId, at: new Date().toISOString() };
    if (!ADAPTERS[channel]) { results.push({ ...base, status: 'failed', error: 'unknown channel' }); continue; }
    if (quiet && channel !== 'os') { results.push({ ...base, status: 'suppressed', reason: 'quiet-hours' }); continue; }
    if (!dry && sentBefore(eventId, channel)) { results.push({ ...base, status: 'duplicate' }); continue; }
    try {
      const r = await ADAPTERS[channel]({ title, message, eventId, severity, source }, cfg[channel] || {}, { dry, cwd, source });
      const row = { ...base, status: r.stub ? 'stub' : dry ? 'dry-run' : 'accepted', ...r };
      results.push(row);
      if (!dry && !r.stub) record({ ...row, channel, event_id: eventId });
    } catch (e) {
      const row = { ...base, status: 'failed', error: String(e.message || e) };
      results.push(row);
      if (!dry) record(row);
    }
  }
  if (!dry) logMarkdown(title, message, results, severity, source);
  return results;
}
