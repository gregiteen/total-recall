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

/** Quota walls from measured usage: a live window at 100% blocks the harness until it resets. */
export function measuredWalls(limits = readCodexRateLimits()) {
  const full = [limits?.primary, limits?.secondary].filter(window => window && window.used_percent >= 100);
  if (!full.length) return {};
  const until = Math.max(...full.map(window => window.resets_at)) * 1000;
  return { codex: { until: new Date(until).toISOString(), resetReported: true, observedAt: limits.observedAt, message: 'Codex session log shows a rate-limit window at 100%.' } };
}
