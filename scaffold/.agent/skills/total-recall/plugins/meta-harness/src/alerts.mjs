/** Operator alerts go through the alerts plugin. A failed send is reported as failed. */
import { execFileSync } from 'node:child_process';
import { readReceipts, activeQuotaWalls } from './learner.mjs';

const SEVERITY = { info: 'info', warning: 'high', high: 'high', critical: 'critical' };

export async function notifyAlert({ title = 'Meta Harness', message = '', severity = 'info', eventId, dryRun = false } = {}) {
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

/** Alert on quota walls and on measured usage over the threshold. Event ids keep a wall from alerting twice. */
export async function checkAlerts({ quotas = {}, threshold = 85, dryRun = false } = {}) {
  const walls = activeQuotaWalls(await readReceipts());
  const candidates = Object.entries(walls).map(([harness, wall]) => ({
    title: `Meta Harness: ${harness} is out of quota`,
    message: `${wall.message || 'Quota wall observed.'} Routing avoids ${harness} until ${wall.until}.`,
    severity: 'warning', eventId: `meta-harness-wall-${harness}-${wall.until}`,
  }));
  for (const [id, quota] of Object.entries(quotas)) {
    if (typeof quota?.usagePercent === 'number' && quota.usagePercent > threshold && quota.billingModel !== 'local') candidates.push({
      title: `Meta Harness: ${id} is at ${quota.usagePercent}%`, message: `Measured usage on ${id} is above ${threshold}%.`,
      severity: 'warning', eventId: `meta-harness-usage-${id}-${new Date().toISOString().slice(0, 10)}`,
    });
  }
  const sent = [];
  for (const alert of candidates) sent.push(await notifyAlert({ ...alert, dryRun }));
  return { ok: sent.every(row => row.ok), threshold, walls, alerts: sent };
}
