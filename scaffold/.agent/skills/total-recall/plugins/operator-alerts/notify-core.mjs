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
import crypto from 'node:crypto';
import { readAuthSecret } from './auth-client.mjs';
import { PluginStateStore } from './ssss-store.mjs';

const run = promisify(execFile);
const HOME_DIR = process.env.TR_NOTIFY_HOME || path.join(os.homedir(), '.total-recall', 'notifications');
const LEDGER = path.join(HOME_DIR, 'sent.jsonl');
const ledger = new PluginStateStore(LEDGER, 'operator-alerts');
const settings = new PluginStateStore(path.join(HOME_DIR, 'config.json'), 'operator-alerts');
const history = new PluginStateStore(path.join(HOME_DIR, 'notification-history.jsonl'), 'operator-alerts');
const LOG = history.documentPath;
export function readNotificationLedger() { const rows = ledger.read([]); if (!Array.isArray(rows)) throw new Error('Invalid notification ledger'); return rows; }
function validateSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Notification configuration must be an object');
  for (const [channel, cfg] of Object.entries(value)) {
    if ((!Object.hasOwn(ADAPTERS, channel) && channel !== 'expo') || !cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error('Invalid notification channel configuration');
    for (const [key, item] of Object.entries(cfg)) {
      if (['key', 'token', 'password', 'api_key', 'url'].includes(key)) throw new Error('Store credentials and private webhook URLs through auth and reference their secret names');
      if (key.endsWith('_secret') && (typeof item !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(item))) throw new Error('Invalid auth credential reference');
    }
  }
  return value;
}
export function setNotificationChannel(channel, config) {
  const current = settings.read({});
  const updated = validateSettings({ ...current, [channel]: config });
  settings.write(updated); return updated;
}

function readJson(p) {
  try { return validateSettings(JSON.parse(fs.readFileSync(p, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw new Error(`Notification configuration is unreadable: ${p}`, { cause: error }); }
}

export function loadConfig(cwd = process.cwd(), explicit = null) {
  const layers = [
    validateSettings(settings.read({})),
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
  return readAuthSecret(name);
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

async function post(url, body, headers, ctx) {
  const destination = new URL(url);
  if (destination.protocol !== 'https:' || destination.username || destination.password) throw new Error('An HTTPS notification endpoint is required');
  ctx.attempted = true;
  const res = await fetch(destination.href, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Notification endpoint rejected the request (HTTP ${res.status})`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

const ADAPTERS = {
  async os({ title, message }, cfg, ctx) {
    if (ctx.dry) return { dry: true };
    ctx.attempted = true;
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
    }, { 'X-Smtp2go-Api-Key': key }, ctx);
    if (!Number.isInteger(r?.data?.succeeded) || r.data.succeeded < 1 || !r.data.email_id) throw new Error('Email acceptance could not be verified');
    return { accepted: true, provider_id: r.data.email_id };
  },

  // Telnyx Messaging
  async sms({ title, message }, cfg, ctx) {
    const to = await need(cfg, 'to', ctx.cwd, 'sms');
    const from = cfg.from;
    if (!from) throw new Error('sms: missing from (a Telnyx number or messaging profile sender)');
    if (ctx.dry) return { dry: true, to, from };
    const key = await need(cfg, 'key_secret', ctx.cwd, 'sms');
    const r = await post('https://api.telnyx.com/v2/messages', { from, to, text: `${title}\n${message}` }, { Authorization: `Bearer ${key}` }, ctx);
    if (!r?.data?.id) throw new Error('SMS acceptance could not be verified');
    return { accepted: true, provider_id: r.data.id };
  },

  // Slack incoming webhook
  async slack({ title, message, eventId, severity, source }, cfg, ctx) {
    if (!cfg.url_secret) throw new Error('Slack requires an Auth URL reference');
    if (ctx.dry) return { dry: true };
    const url = await need(cfg, 'url_secret', ctx.cwd, 'slack');
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: title } },
      { type: 'section', text: { type: 'mrkdwn', text: message } },
    ];
    if (severity || source) {
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `*${severity || 'info'}* · ${source || 'alert'}` }] });
    }
    const result = await post(url, { text: `${title}\n${message}`, blocks, attachments: [{ color: severity === 'critical' ? 'danger' : severity === 'high' ? 'warning' : 'good' }] }, {}, ctx);
    if (result?.raw?.trim() !== 'ok') throw new Error('Slack acceptance could not be verified');
    return { accepted: true };
  },

  // Discord webhook
  async discord({ title, message, eventId, severity, source }, cfg, ctx) {
    if (!cfg.url_secret) throw new Error('Discord requires an Auth URL reference');
    if (ctx.dry) return { dry: true };
    const url = await need(cfg, 'url_secret', ctx.cwd, 'discord');
    const color = severity === 'critical' ? 0xe74c3c : severity === 'high' ? 0xe67e22 : 0x3498db;
    const embed = { title, description: message, color, timestamp: new Date().toISOString(), footer: { text: `${severity || 'info'} · ${source || 'alert'}` } };
    const target = new URL(url);
    target.searchParams.set('wait', 'true');
    const receipt = await post(target.href, { content: `**${title}**`, embeds: [embed], allowed_mentions: { parse: [] } }, {}, ctx);
    if (!receipt?.id) throw new Error('Discord acceptance could not be verified');
    return { accepted: true };
  },

  // Telegram Bot API. Recipients and credentials come from config exactly like the other
  // adapters (key_secret TELEGRAM_BOT_TOKEN, to secret:TELEGRAM_ALLOWED_USERS); nothing is hardcoded.
  async telegram({ title, message, severity, source }, cfg, ctx) {
    const chat = await need(cfg, 'to', ctx.cwd, 'telegram');
    if (ctx.dry) return { dry: true, to: chat };
    const token = await need(cfg, 'key_secret', ctx.cwd, 'telegram');
    const text = `${title}\n\n${message}${severity || source ? `\n\n(${severity || 'info'} · ${source || 'alert'})` : ''}`;
    const body = { chat_id: chat, text, disable_notification: cfg.silent === true };
    // HTML is used by the callers that send links; plain text parses fine either way, so it is only
    // set when the config asks for it.
    if (cfg.parse_mode) body.parse_mode = cfg.parse_mode;
    const r = await post(`https://api.telegram.org/bot${token}/sendMessage`, body, {}, ctx);
    if (!r?.ok || !r?.result?.message_id) throw new Error('Telegram acceptance could not be verified');
    return { accepted: true, provider_id: r.result.message_id };
  },

  async webhook({ title, message, eventId, severity, source }, cfg, ctx) {
    if (!cfg.url_secret) throw new Error('Webhook requires an Auth URL reference');
    if (ctx.dry) return { dry: true };
    const url = await need(cfg, 'url_secret', ctx.cwd, 'webhook');
    await post(url, { title, message, event_id: eventId, severity, source }, {}, ctx);
    return { accepted: true };
  },

  async github({ title, message }, cfg, ctx) {
    const repo = cfg.repo;
    if (typeof repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('github: expected repo (owner/name)');
    if (ctx.dry) return { dry: true, repo };
    const token = await need(cfg, 'key_secret', ctx.cwd, 'github');
    const r = await post(`https://api.github.com/repos/${repo}/issues`, { title, body: message, labels: cfg.labels || [] }, {
      Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    }, ctx);
    if (!Number.isSafeInteger(r?.number) || r.number < 1) throw new Error('Issue creation could not be verified');
    return { accepted: true, provider_id: r.number };
  },
};

function inQuietHours(spec, now = new Date()) {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(spec || '');
  if (!m) return false;
  const [s, e, h] = [Number(m[1]), Number(m[2]), now.getHours()];
  return s <= e ? h >= s && h < e : h >= s || h < e;
}

function reserve(eventId, channel) {
  const hash = crypto.createHash('sha256').update(JSON.stringify([eventId, channel])).digest('hex');
  const record = new PluginStateStore(path.join(HOME_DIR, 'reservations', `${hash}.json`), 'operator-alerts');
  const existing = record.read(null);
  if (existing?.status === 'accepted') return { status: 'duplicate' };
  if (existing && existing.status !== 'retryable') return { status: 'pending', error: 'Prior submission requires reconciliation' };
  try {
    record.write({ eventId, channel, status: 'reserved' });
  } catch (error) {
    if (String(error.message).includes('version conflict')) return { status: 'pending', error: 'Another submission reserved this event' };
    throw error;
  }
  return { record };
}

function logMarkdown(title, message, results, severity, source) {
  history.append({ timestamp: new Date().toISOString(), title, message, results, severity, source });
}

export async function sendNotification(opts) {
  const {
    title, message, channels = null, eventId = null, severity = 'info', source = '',
    dry = false, quietHours = null, cwd = process.cwd(), config = null,
  } = opts;
  const cfg = config || loadConfig(cwd);
  const configured = Object.keys(cfg);
  const resolvedChannels = channels === null ? (configured.length ? configured : ['os']) : channels;
  if (!Array.isArray(resolvedChannels) || !resolvedChannels.length) throw new Error('Select at least one notification channel');
  const priorRows = dry ? [] : readNotificationLedger();
  if (!dry) history.read([]); // Resolve persistence before any external submission.
  const critical = severity === 'critical' || severity === 'high';
  const quiet = !critical && inQuietHours(quietHours);
  const results = [];
  for (const channel of new Set(resolvedChannels)) {
    const base = { channel, event_id: eventId, at: new Date().toISOString() };
    if (!Object.hasOwn(ADAPTERS, channel)) { results.push({ ...base, status: 'failed', error: 'Notification channel is unavailable' }); continue; }
    if (quiet && channel !== 'os') { results.push({ ...base, status: 'suppressed', reason: 'quiet-hours' }); continue; }
    if (eventId && priorRows.some(row => row.event_id === eventId && row.channel === channel && row.status === 'accepted')) {
      results.push({ ...base, status: 'duplicate' });
      continue;
    }
    const reservation = !dry && eventId ? reserve(eventId, channel) : {};
    if (reservation.status) { results.push({ ...base, ...reservation }); continue; }
    const ctx = { dry, cwd, source, attempted: false };
    let row;
    try {
      const r = await ADAPTERS[channel]({ title, message, eventId, severity, source }, cfg[channel] || {}, ctx);
      row = { ...base, status: dry ? 'dry-run' : 'accepted', ...r };
    } catch (e) {
      row = { ...base, status: 'failed', error: String(e.message || e) };
      if (ctx.attempted) row.outcome = 'unknown';
    }
    results.push(row);
    if (!dry) {
      try {
        reservation.record?.write({
          eventId, channel,
          status: row.accepted ? 'accepted' : ctx.attempted ? 'unknown' : 'retryable',
          ...(row.provider_id ? { providerId: row.provider_id } : {}),
        });
        ledger.append(row);
      } catch {
        row.persistence = 'unverified';
      }
    }
  }
  if (!dry && results.some(row => row.status === 'accepted')) {
    try { logMarkdown(title, message, results, severity, source); }
    catch { for (const row of results.filter(item => item.accepted)) row.persistence = 'unverified'; }
  }
  return results;
}

const receiptStates = new Set(['accepted', 'failed', 'pending', 'duplicate', 'suppressed']);

/** Browser-safe evidence from the same configuration, ledger and dry-run path as the CLI. */
export async function notificationStatus(config, { check = false } = {}) {
  const configuredChannels = Object.keys(config).sort();
  const recentReceipts = readNotificationLedger().slice(-12).reverse().flatMap(row => {
    if (!row || typeof row.channel !== 'string' || !Object.hasOwn(ADAPTERS, row.channel) ||
        !receiptStates.has(row.status) || typeof row.at !== 'string') return [];
    const timestamp = Date.parse(row.at);
    if (!Number.isFinite(timestamp)) return [];
    return [{
      channel: row.channel,
      status: row.status,
      at: new Date(timestamp).toISOString(),
      ...(row.outcome === 'unknown' ? { outcome: 'unknown' } : {}),
    }];
  });
  const result = { ok: true, authOwner: 'auth', configuredChannels, recentReceipts };
  if (check) {
    const checks = configuredChannels.length ? await sendNotification({
      title: 'Route readiness', message: 'Local dry run', channels: configuredChannels, config, dry: true,
    }) : [];
    result.channelChecks = checks.map(({ channel, status }) => ({ channel, status }));
  }
  return result;
}
