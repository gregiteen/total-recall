/** Operator alerts go through the alerts plugin. A failed send is reported as failed. */
import { execFileSync } from 'node:child_process';
import { readReceipts, activeQuotaWalls } from './learner.mjs';
import { readSessionUsageAnalytics } from './telemetry.mjs';

const SEVERITY = { info: 'info', warning: 'high', high: 'high', critical: 'critical' };

export const DEFAULT_BREAKER_LIMITS = Object.freeze({
  maxInternalRunsPer15m: 15,
  maxDispatchesPer15m: 40,
  maxHourlyTokenBurn: 15_000_000,
});

export async function notifyAlert({ title = 'Metaharness', message = '', severity = 'info', eventId, dryRun = false } = {}) {
  const args = ['alerts', 'send', '--title', title, '--message', message, '--severity', SEVERITY[severity] || 'info', '--source', 'meta-harness'];
  if (eventId) args.push('--event-id', eventId);
  if (dryRun) args.push('--dry-run');
  try {
    execFileSync(process.env.TOTAL_RECALL_BIN || 'total-recall', args, { stdio: 'pipe', timeout: 15000 });
    return { ok: true, title };
  } catch (error) {
    return { ok: false, title, error: String(error.stderr || error.message).slice(0, 300) };
  }
}

// The breakers read only the 15-minute and 1-hour windows, so older sessions are never parsed.
export function evaluateRunawayBreakers({ analytics = readSessionUsageAnalytics({ windowMs: 3600_000 }), limits = DEFAULT_BREAKER_LIMITS } = {}) {
  const internal15m = (analytics?.codex?.m15?.internalSessions || 0) + (analytics?.claude?.m15?.internalSessions || 0);
  const total15m = (analytics?.codex?.m15?.sessions || 0) + (analytics?.claude?.m15?.sessions || 0);
  const tokens1h = (analytics?.codex?.h1?.totalTokens || 0) + (analytics?.claude?.h1?.totalTokens || 0);
  const reasons = [];
  if (internal15m > limits.maxInternalRunsPer15m) {
    reasons.push(`internal runs in 15m (${internal15m}) exceeded limit (${limits.maxInternalRunsPer15m})`);
  }
  if (total15m > limits.maxDispatchesPer15m) {
    reasons.push(`total sessions in 15m (${total15m}) exceeded limit (${limits.maxDispatchesPer15m})`);
  }
  if (tokens1h > limits.maxHourlyTokenBurn) {
    reasons.push(`1h token burn (${tokens1h.toLocaleString()}) exceeded limit (${limits.maxHourlyTokenBurn.toLocaleString()})`);
  }
  return {
    tripped: reasons.length > 0,
    reasons,
    metrics: { internal15m, total15m, tokens1h },
    limits,
  };
}

/**
 * Enforce runaway velocity circuit breaker before starting a dispatch or background reasoning run.
 * Sends an immediate critical operator-alert (deduped per 15-minute window) and throws when tripped.
 */
export async function enforceVelocityCircuitBreaker({ kind = 'dispatch', analytics, limits, notify = notifyAlert } = {}) {
  if (process.env.TR_DISABLE_CIRCUIT_BREAKER === '1') return { ok: true, skipped: true };
  const check = evaluateRunawayBreakers({ analytics, limits });
  if (!check.tripped) return { ok: true, ...check };
  const bucket = Math.floor(Date.now() / (15 * 60_000));
  await notify({
    title: `Metaharness Circuit Breaker Tripped (${kind})`,
    message: `Blocked ${kind}: ${check.reasons.join('; ')}.`,
    severity: 'critical',
    eventId: `meta-harness-breaker-${kind}-${bucket}`,
  });
  throw Object.assign(new Error(`Metaharness circuit breaker tripped: ${check.reasons.join('; ')}`), {
    code: 'CIRCUIT_BREAKER_TRIPPED',
    failureKind: 'circuit-breaker',
    breaker: check,
  });
}

/** Alert on quota walls, measured usage over threshold, and runaway velocity/token burn. */
export async function checkAlerts({ quotas = {}, threshold = 85, dryRun = false, analytics } = {}) {
  const walls = activeQuotaWalls(await readReceipts());
  const candidates = Object.entries(walls).map(([harness, wall]) => ({
    title: `Metaharness: ${harness} is out of quota`,
    message: `${wall.message || 'Quota wall observed.'} Routing avoids ${harness} until ${wall.until}.`,
    severity: 'warning', eventId: `meta-harness-wall-${harness}-${wall.until}`,
  }));
  for (const [id, quota] of Object.entries(quotas)) {
    if (typeof quota?.usagePercent === 'number' && quota.usagePercent > threshold && quota.billingModel !== 'local') candidates.push({
      title: `Metaharness: ${id} is at ${quota.usagePercent}%`, message: `Measured usage on ${id} is above ${threshold}%.`,
      severity: 'warning', eventId: `meta-harness-usage-${id}-${new Date().toISOString().slice(0, 10)}`,
    });
  }
  const breaker = evaluateRunawayBreakers({ analytics });
  if (breaker.tripped) {
    const bucket = Math.floor(Date.now() / (15 * 60_000));
    candidates.push({
      title: 'Metaharness: Runaway usage spike detected',
      message: breaker.reasons.join('; '),
      severity: 'critical',
      eventId: `meta-harness-runaway-${bucket}`,
    });
  }
  const sent = [];
  for (const alert of candidates) sent.push(await notifyAlert({ ...alert, dryRun }));
  return { ok: sent.every(row => row.ok), threshold, walls, breaker, alerts: sent };
}
