/** Usage figures the harnesses themselves recorded on this machine. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function recentSessionFiles(dir, depth = 3, limit = 5) {
  let names;
  try { names = fs.readdirSync(dir).sort().reverse(); } catch { return []; }
  const files = [];
  for (const name of names) {
    const full = path.join(dir, name);
    if (depth > 0) files.push(...recentSessionFiles(full, depth - 1, limit));
    else if (name.endsWith('.jsonl')) files.push(full);
    if (files.length >= limit) break;
  }
  return files;
}

/** Codex logs its real rate-limit windows. A window whose reset has passed no longer applies. */
export function readCodexRateLimits({ sessionsDir = path.join(process.env.CODEX_HOME || path.join(process.env.HOME || os.homedir(), '.codex'), 'sessions'), now = Date.now() } = {}) {
  const live = window => (window && typeof window.used_percent === 'number' && window.resets_at * 1000 > now ? window : null);
  for (const file of recentSessionFiles(sessionsDir)) {
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').reverse();
    for (const line of lines) {
      if (!line.includes('"used_percent"')) continue;
      try {
        const event = JSON.parse(line);
        const limits = event.payload?.rate_limits;
        if (!limits?.primary && !limits?.secondary) continue;
        return { observedAt: event.timestamp || null, primary: live(limits.primary), secondary: live(limits.secondary) };
      } catch { /* a partial line */ }
    }
  }
  return null;
}

/**
 * Name Codex windows by their real length. A plan with no five-hour limit reports one weekly
 * window as `primary`, so slot order alone mislabels it. Without a length, the order is the only guide.
 */
export function codexWindowsByLength(limits) {
  const windows = [limits?.primary, limits?.secondary].filter(Boolean);
  const measured = windows.filter(window => Number.isFinite(window.window_minutes));
  if (!measured.length) return { fiveHour: limits?.primary || null, weekly: limits?.secondary || null };
  return {
    fiveHour: measured.find(window => window.window_minutes <= 300) || null,
    weekly: measured.find(window => window.window_minutes >= 7 * 24 * 60) || null,
  };
}

/** Quota walls from measured usage: a live window at 100% blocks the harness until it resets. */
export function measuredWalls(limits = readCodexRateLimits()) {
  const full = [limits?.primary, limits?.secondary].filter(window => window && window.used_percent >= 100);
  if (!full.length) return {};
  const until = Math.max(...full.map(window => window.resets_at)) * 1000;
  return { codex: { until: new Date(until).toISOString(), resetReported: true, observedAt: limits.observedAt, message: 'Codex session log shows a rate-limit window at 100%.' } };
}


function walkJsonlFiles(dir, cutoffMs, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJsonlFiles(p, cutoffMs, out);
    else if (ent.isFile() && p.endsWith('.jsonl')) {
      try { if (fs.statSync(p).mtimeMs >= cutoffMs) out.push(p); } catch { /* ignore */ }
    }
  }
  return out;
}

const INTERNAL_MARKERS = [
  '[total-recall:internal-job]',
  'You are a Session Post-Mortem Analyst for an AI memory system called Total Recall.',
  'You are a Rule Compliance Auditor for an AI memory system.',
];

function emptyBucket() {
  return { sessions: 0, interactiveSessions: 0, internalSessions: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, totalTokens: 0, codexCredits: 0 };
}

function addToBucket(b, { internal, input = 0, cached = 0, output = 0, credits = 0 }) {
  b.sessions += 1;
  if (internal) b.internalSessions += 1; else b.interactiveSessions += 1;
  b.inputTokens += input;
  b.cachedTokens += cached;
  b.outputTokens += output;
  b.totalTokens += input + output;
  b.codexCredits += credits;
}

/**
 * Scan recent Claude and Codex session logs across 15m, 1h, 24h, and 7d windows.
 * Separates interactive sessions from internal/background sessions.
 */
export function readSessionUsageAnalytics({
  now = Date.now(),
  home = process.env.HOME || os.homedir(),
  codexHome = process.env.CODEX_HOME,
  claudeHome = process.env.CLAUDE_HOME,
  // Sessions that started earlier than this are skipped before their logs are parsed.
  windowMs = 7 * 86400_000,
} = {}) {
  const win = { m15: 15 * 60_000, h1: 3600_000, h24: 86400_000, d7: 7 * 86400_000 };
  const cutoff = now - Math.min(windowMs, win.d7);
  const tooOld = (firstTs) => firstTs > 0 && now - firstTs > windowMs;
  const makeHarness = () => ({ m15: emptyBucket(), h1: emptyBucket(), h24: emptyBucket(), d7: emptyBucket() });
  const codex = makeHarness();
  const claude = makeHarness();

  const codexBase = codexHome || path.join(home, '.codex');
  for (const file of [...walkJsonlFiles(path.join(codexBase, 'sessions'), cutoff), ...walkJsonlFiles(path.join(codexBase, 'archived_sessions'), cutoff)]) {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
    let internal = false, lastTotal = null, firstTs = 0, model = '';
    for (const line of raw.split('\n')) {
      if (!line) continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      if (!firstTs && o.timestamp) { const t = Date.parse(o.timestamp); if (Number.isFinite(t)) firstTs = t; }
      if (tooOld(firstTs)) break;
      if ((o.type === 'turn_context' || o.type === 'session_meta') && o.payload?.model) model = String(o.payload.model);
      if (o.type === 'event_msg' && (o.payload?.type === 'thread_goal_updated' || o.payload?.type === 'user_message')) {
        const txt = o.payload?.goal?.objective || o.payload?.message || '';
        if (INTERNAL_MARKERS.some((m) => txt.includes(m))) internal = true;
      }
      if (o.type === 'response_item' && o.payload?.type === 'message' && o.payload?.role === 'user') {
        const txt = JSON.stringify(o.payload.content || '');
        if (INTERNAL_MARKERS.some((m) => txt.includes(m))) internal = true;
      }
      if (o.type === 'event_msg' && o.payload?.type === 'token_count' && o.payload?.info?.total_token_usage) {
        lastTotal = o.payload.info.total_token_usage;
      }
    }
    if (!firstTs) { try { firstTs = fs.statSync(file).mtimeMs; } catch { continue; } }
    const age = now - firstTs;
    if (age > win.d7 || tooOld(firstTs)) continue;
    const input = lastTotal?.input_tokens || 0;
    const cached = lastTotal?.cached_input_tokens || 0;
    const output = lastTotal?.output_tokens || 0;
    const uncached = Math.max(0, input - cached);
    const isLuna = model.includes('luna');
    const credits = isLuna
      ? (uncached * 2.5 + cached * 0.25 + output * 12.5) / 1e6
      : (uncached * 50 + cached * 2.5 + output * 250) / 1e6;
    const row = { internal, input, cached, output, credits };
    if (age <= win.m15) addToBucket(codex.m15, row);
    if (age <= win.h1) addToBucket(codex.h1, row);
    if (age <= win.h24) addToBucket(codex.h24, row);
    addToBucket(codex.d7, row);
  }

  const claudeBase = claudeHome || path.join(home, '.claude', 'projects');
  for (const file of walkJsonlFiles(claudeBase, cutoff)) {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
    let internal = false, firstTs = 0, input = 0, cached = 0, output = 0;
    const seen = new Set();
    for (const line of raw.split('\n')) {
      if (!line) continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      if (!firstTs && o.timestamp) { const t = Date.parse(o.timestamp); if (Number.isFinite(t)) firstTs = t; }
      if (tooOld(firstTs)) break;
      if (o.type === 'user' && o.message?.content) {
        const txt = typeof o.message.content === 'string' ? o.message.content : JSON.stringify(o.message.content);
        if (INTERNAL_MARKERS.some((m) => txt.includes(m))) internal = true;
      }
      if (o.type === 'assistant' && o.message?.usage) {
        const msgId = o.message.id || o.uuid;
        if (msgId && seen.has(msgId)) continue;
        if (msgId) seen.add(msgId);
        const u = o.message.usage;
        input += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        cached += u.cache_read_input_tokens || 0;
        output += u.output_tokens || 0;
      }
    }
    if (!firstTs) { try { firstTs = fs.statSync(file).mtimeMs; } catch { continue; } }
    const age = now - firstTs;
    if (age > win.d7 || tooOld(firstTs)) continue;
    const row = { internal, input: input + cached, cached, output, credits: 0 };
    if (age <= win.m15) addToBucket(claude.m15, row);
    if (age <= win.h1) addToBucket(claude.h1, row);
    if (age <= win.h24) addToBucket(claude.h24, row);
    addToBucket(claude.d7, row);
  }

  return { observedAt: new Date(now).toISOString(), codex, claude };
}
