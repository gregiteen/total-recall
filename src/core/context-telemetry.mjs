/**
 * context-telemetry — measurement for the one number that governs every session.
 *
 * `compileContext` already computed everything needed to judge the context
 * policy (total tokens, required tokens, overflow, which rules were included,
 * which were dropped) and then threw it away. Without a record, the budget
 * question could only ever be argued from a point-in-time anecdote — TR-003
 * recorded "12 of 13 capsules overflow" once and nobody could later say whether
 * a change helped, or whether the gate still failed at all.
 *
 * This records one line per capsule so the policy is decided from a trend
 * rather than a memory.
 *
 * Bounded by construction. An append-only event log in this project once
 * reached 306 MB, GitHub silently rejected every backup for five weeks, and the
 * cause was invisible until someone looked. So this file carries its own size
 * cap and retention, enforced on write, and it records counts and identifiers
 * ONLY: never rule text, never capsule content, never a credential. Identifiers
 * are slugs that already appear in the vault.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Append-only ledger for capsule measurements, inside the brain's derived space. */
export const LEDGER_NAME = 'context-ledger.jsonl';

/**
 * Fraction of the cap retained when trimming (TR_CONTEXT_LEDGER_RETAIN, default
 * 0.5). Trimming to the cap on every crossing would re-trim constantly; leaving
 * headroom makes the trim rare and keeps a real window of history.
 */
const RETAIN_FRACTION = (() => {
  const n = Number(process.env.TR_CONTEXT_LEDGER_RETAIN ?? 0.5);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.5;
})();

/**
 * Max bytes the ledger may reach (TR_CONTEXT_LEDGER_MAX_BYTES, default 8 MiB,
 * 0 disables). Small on purpose: this is telemetry, not memory, and it must
 * never be able to threaten a backup or a disk the way default.jsonl did.
 */
const maxBytes = () => {
  const n = Number(process.env.TR_CONTEXT_LEDGER_MAX_BYTES ?? 8 * 1024 * 1024);
  return Number.isFinite(n) && n >= 0 ? n : 8 * 1024 * 1024;
};

/** Whether telemetry is recorded at all (TR_CONTEXT_TELEMETRY=off disables). */
export const telemetryEnabled = () => String(process.env.TR_CONTEXT_TELEMETRY || '').toLowerCase() !== 'off';

/** Ledger path for a brain's derived directory. */
export function ledgerPath(derivedDir) {
  return derivedDir ? path.join(derivedDir, LEDGER_NAME) : null;
}

/**
 * Keep the ledger bounded while preserving a usable trend.
 *
 * Two failure modes, both observed rather than imagined:
 *   1. An append-only log in this project reached 306 MB and silently broke
 *      every backup for five weeks. So growth must be bounded by construction.
 *   2. The first attempt here renamed the live file over the previous
 *      generation, so 40 writes under a small cap left 4 records — the trend
 *      the ledger exists for was destroyed by its own housekeeping.
 *
 * The ledger therefore trims to a retained fraction of the cap rather than
 * collapsing: the newest half survives, the rest is dropped. Trimming runs only
 * once the cap is crossed (not on every write), so the common path stays a
 * single append.
 */
function enforceBound(file, cap, fsImpl = fs) {
  if (cap <= 0) return;
  let size;
  try { size = fsImpl.statSync(file).size; } catch { return; }
  if (size <= cap) return;
  try {
    const lines = fsImpl.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const keep = [];
    let bytes = 0;
    const retainBytes = Math.floor(cap * RETAIN_FRACTION);
    // Walk backwards so the most recent measurements are the ones retained.
    for (let i = lines.length - 1; i >= 0; i--) {
      const next = Buffer.byteLength(lines[i]) + 1;
      if (bytes + next > retainBytes && keep.length) break;
      bytes += next;
      keep.unshift(lines[i]);
    }
    fsImpl.writeFileSync(file, keep.length ? `${keep.join('\n')}\n` : '');
  } catch { /* a concurrent writer or an unreadable file: leave it alone */ }
}

/**
 * Record one capsule measurement.
 *
 * Returns the record written, or null when telemetry is off or the write
 * failed. Never throws: measurement must never be able to break a session.
 */
export function recordCapsule(stats, { derivedDir, action = [], query, consumer = 'cli', now = Date.now(), fsImpl = fs } = {}) {
  if (!telemetryEnabled() || !stats || !derivedDir) return null;
  try {
    const file = ledgerPath(derivedDir);
    fsImpl.mkdirSync(path.dirname(file), { recursive: true });
    enforceBound(file, maxBytes(), fsImpl);
    const contributions = Array.isArray(stats.contributions) ? stats.contributions : [];
    const record = {
      at: new Date(now).toISOString(),
      consumer,
      // Actions and the query are what make a measurement interpretable; the
      // query is truncated because it is free text, not an identifier.
      actions: Array.isArray(action) ? action : [action].filter(Boolean),
      query_chars: typeof query === 'string' ? query.length : 0,
      total_tokens: stats.total_tokens ?? null,
      // `budget` is added by the caller's capsuleResponse wrapper; absent here.
      required_tokens: stats.required_tokens ?? null,
      overflow_tokens: stats.overflow_tokens ?? null,
      ready: typeof stats.overflow_tokens === 'number' ? stats.overflow_tokens === 0 : null,
      required_count: Array.isArray(stats.required_ids) ? stats.required_ids.length : contributions.filter(c => c.required).length,
      excluded_count: Array.isArray(stats.excluded_ids) ? stats.excluded_ids.length : 0,
      // Identifier lists only, and only the ones that decided the budget.
      required_ids: Array.isArray(stats.required_ids) ? stats.required_ids : [],
      excluded_ids: Array.isArray(stats.excluded_ids) ? stats.excluded_ids.slice(0, 40) : [],
      version: stats.version || null,
    };
    // A torn final line — an interrupted write, a full disk — would otherwise
    // have the next record appended onto it, corrupting both. Repair the tail
    // before appending so one bad write costs one measurement, not two.
    repairTornTail(file, fsImpl);
    fsImpl.appendFileSync(file, JSON.stringify(record) + '\n');
    return record;
  } catch { return null; }
}

/**
 * Give a torn final line its own terminator.
 *
 * An append-only ledger assumes the file ends at a record boundary. When it
 * does not — the process died mid-write — the next append lands on that line
 * and both records become unparseable. Dropping the damaged tail keeps the loss
 * at exactly the one measurement that failed.
 */
function repairTornTail(file, fsImpl = fs) {
  let text;
  try { text = fsImpl.readFileSync(file, 'utf8'); } catch { return; }
  if (!text || text.endsWith('\n')) return;
  const lastBreak = text.lastIndexOf('\n');
  const tail = lastBreak === -1 ? text : text.slice(lastBreak + 1);
  try { JSON.parse(tail); return; } catch { /* the tail is torn */ }
  try { fsImpl.writeFileSync(file, lastBreak === -1 ? '' : text.slice(0, lastBreak + 1)); } catch { /* leave it alone */ }
}

/**
 * Read ledger records, oldest first.
 *
 * Skips a malformed line individually. A torn write must cost one measurement,
 * never the whole ledger — an earlier version discarded every valid record that
 * followed the torn one.
 */
export function readLedger(derivedDir, { limit = 0, fsImpl = fs } = {}) {
  const file = ledgerPath(derivedDir);
  if (!file) return [];
  const records = [];
  for (const candidate of [file]) {
    let text;
    try { text = fsImpl.readFileSync(candidate, 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try { records.push(JSON.parse(line)); } catch { /* skip this line only */ }
    }
  }
  return limit > 0 ? records.slice(-limit) : records;
}

/**
 * Summarise a ledger into the numbers a design decision needs.
 *
 * Reports per action, because "the capsule is too big" is not actionable while
 * "read overflows and edit does not" is. `top_required` answers which rules
 * carry the cost, which is the input to action-scoping a rule.
 */
export function summariseLedger(records = []) {
  const byAction = new Map();
  const ruleTokens = new Map();
  const ruleAppearances = new Map();
  for (const r of records) {
    const actions = r.actions?.length ? r.actions : ['(none)'];
    for (const action of actions) {
      const entry = byAction.get(action) || { action, samples: 0, overflow: 0, required_max: 0, required_sum: 0, total_max: 0, excluded_total: 0 };
      entry.samples++;
      if (r.overflow_tokens > 0) entry.overflow++;
      entry.required_sum += r.required_tokens || 0;
      entry.required_max = Math.max(entry.required_max, r.required_tokens || 0);
      entry.total_max = Math.max(entry.total_max, r.total_tokens || 0);
      entry.excluded_total += r.excluded_count || 0;
      byAction.set(action, entry);
    }
    for (const id of r.required_ids || []) {
      ruleAppearances.set(id, (ruleAppearances.get(id) || 0) + 1);
    }
  }
  const actions = [...byAction.values()]
    .map(e => ({ ...e, required_avg: e.samples ? Math.round(e.required_sum / e.samples) : 0, overflow_rate: e.samples ? +(e.overflow / e.samples).toFixed(3) : 0 }))
    .sort((a, b) => b.overflow_rate - a.overflow_rate || b.required_max - a.required_max);
  const mostRequired = [...ruleAppearances.entries()]
    .map(([id, appearances]) => ({ id, appearances }))
    .sort((a, b) => b.appearances - a.appearances)
    .slice(0, 25);
  return {
    samples: records.length,
    first_at: records.length ? records[0].at : null,
    last_at: records.length ? records[records.length - 1].at : null,
    actions,
    most_required: mostRequired,
    rule_tokens: [...ruleTokens.entries()].map(([id, tokens]) => ({ id, tokens })),
  };
}
