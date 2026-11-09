/**
 * Memory access ledger (DECAY-01).
 *
 * Records when a memory is actually used: returned by recall or included in a context
 * capsule. Decay reads it to tell a memory nobody uses from one read every day. It lives in
 * the brain's derived state, so a read never rewrites a vault file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite } from './vault.mjs';

const LEDGER = 'access-ledger.json';

function ledgerFile(derivedDir) {
  return path.join(derivedDir, LEDGER);
}

/** The ledger as `{ slug: { last_accessed, count } }`. A missing or damaged file is an empty ledger. */
export function readAccess(derivedDir) {
  if (!derivedDir) return {};
  try {
    const value = JSON.parse(fs.readFileSync(ledgerFile(derivedDir), 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/** Reserved ledger key: the days on which this brain was used at all (YYYY-MM-DD, sorted). */
export const ACTIVE_DAYS = '_active_days';

/** The days this brain was used, oldest first. */
export function activeDays(ledger = {}) {
  return Array.isArray(ledger[ACTIVE_DAYS]) ? ledger[ACTIVE_DAYS] : [];
}

/**
 * How many of the brain's active days came after `sinceMs`. Decay counts these, never calendar
 * days, so a brain nobody works in never decays (Greg, 2026-11-09).
 */
export function activeDaysSince(ledger, sinceMs) {
  const since = new Date(sinceMs).toISOString().slice(0, 10);
  return activeDays(ledger).filter(day => day > since).length;
}

/** Record one use of each slug, and today as an active day. Never throws: a failed write must not break recall or preflight. */
export function recordAccess(derivedDir, slugs, now = new Date()) {
  const unique = [...new Set((slugs || []).filter(slug => typeof slug === 'string' && slug && slug !== ACTIVE_DAYS))];
  if (!derivedDir || unique.length === 0) return false;
  try {
    const ledger = readAccess(derivedDir);
    const stamp = now.toISOString();
    const today = stamp.slice(0, 10);
    const days = activeDays(ledger);
    if (!days.includes(today)) ledger[ACTIVE_DAYS] = [...days, today].sort();
    for (const slug of unique) {
      const entry = ledger[slug] || { count: 0 };
      // Three active days are enough for the field's first and second derivatives.
      const daily = { ...entry.daily_counts, [today]: (Number(entry.daily_counts?.[today]) || 0) + 1 };
      const recentDays = activeDays(ledger).slice(-3);
      ledger[slug] = { last_accessed: stamp, count: (Number(entry.count) || 0) + 1,
        daily_counts: Object.fromEntries(Object.entries(daily).filter(([day]) => recentDays.includes(day))) };
    }
    fs.mkdirSync(derivedDir, { recursive: true });
    atomicWrite(ledgerFile(derivedDir), JSON.stringify(ledger));
    return true;
  } catch {
    return false;
  }
}

/** The latest known use of a memory: the ledger, its own `last_accessed`, or its last update. */
export function lastUsedMs(node, ledger = {}) {
  const times = [ledger[node.slug]?.last_accessed, node.last_accessed, node.updated, node.created]
    .map(value => new Date(value || 0).getTime())
    .filter(Number.isFinite);
  return times.length ? Math.max(...times) : 0;
}
