/**
 * total-recall context-stats — read the capsule measurement ledger.
 *
 * Answers the questions a context-policy decision actually needs:
 *   - Which actions overflow, and how often (a rate, not an anecdote)?
 *   - How close is the required set to the budget, per action?
 *   - Which rules are force-included on every call?
 *
 * Read-only. Measurement is recorded by `total-recall context`.
 */
import path from 'node:path';
import { getBothBrains, parseLayerFlag } from './agent-dir.mjs';
import { readLedger, summariseLedger, ledgerPath, telemetryEnabled } from '../core/context-telemetry.mjs';
import { readConfigValue } from './config.mjs';

const pct = (n) => `${Math.round(n * 100)}%`;

function renderSummary(summary, { budget, ledger }) {
  const lines = [];
  if (summary.samples === 0) {
    lines.push('No capsule measurements recorded yet.');
    lines.push('');
    lines.push('Every `total-recall context` call records one line. Run a few, then re-check.');
    return lines.join('\n');
  }
  lines.push(`Capsule measurements: ${summary.samples} sample(s)`);
  lines.push(`Range: ${summary.first_at} → ${summary.last_at}`);
  if (budget) lines.push(`Configured budget: ${budget}`);
  lines.push('');
  lines.push('By action:');
  lines.push('  action        samples  overflow    required(avg/max)  excluded');
  for (const a of summary.actions) {
    lines.push(`  ${String(a.action).padEnd(12)}  ${String(a.samples).padStart(7)}  ${pct(a.overflow_rate).padStart(8)}  ${String(a.required_avg).padStart(8)}/${String(a.required_max).padEnd(8)}  ${a.excluded_total}`);
  }
  if (budget) {
    const worst = summary.actions[0];
    if (worst) {
      lines.push('');
      const head = worst.required_max - budget;
      lines.push(head > 0
        ? `Headroom: NEGATIVE on '${worst.action}' by ${head} tokens at its largest sample.`
        : `Headroom: ${budget - worst.required_max} tokens at the largest required set ('${worst.action}').`);
    }
  }
  if (summary.most_required.length) {
    lines.push('');
    lines.push('Rules included most often (candidates for action-scoping):');
    for (const r of summary.most_required.slice(0, 15)) {
      lines.push(`  ${String(r.appearances).padStart(6)}x  ${r.id}`);
    }
  }
  lines.push('');
  lines.push(`Ledger: ${ledger}`);
  lines.push('Identifiers and counts only; never rule text or capsule content.');
  return lines.join('\n');
}

export default async function contextStats(args = []) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: total-recall context-stats [--json] [--limit N] [--project|--global]\n\nRead-only summary of capsule measurements recorded by `total-recall context`.\nReports overflow rate per action, required-token headroom, and which rules are\nincluded most often (the input to action-scoping a rule).\n\nEnvironment: TR_CONTEXT_TELEMETRY=off stops recording (this command then reports\nno samples). TR_CONTEXT_LEDGER_MAX_BYTES caps the ledger (default 8 MiB).');
    return;
  }
  // parseLayerFlag consumes --global/--project and returns what is left, so the
  // loop must read `remainingArgs`; reading `args` re-rejected the layer flag.
  const { layer, remainingArgs } = parseLayerFlag(args);
  let isJson = false, limit = 0;
  for (let i = 0; i < remainingArgs.length; i++) {
    if (remainingArgs[i] === '--json') { isJson = true; continue; }
    if (remainingArgs[i] === '--limit') { limit = Number(remainingArgs[++i]) || 0; continue; }
    // Reject an unknown flag rather than ignoring it: a silently dropped
    // --globel would report project scope while the operator believed
    // otherwise, and this command exists to be trusted about scope.
    throw new Error(`Unknown context-stats option: ${remainingArgs[i]}`);
  }

  const brains = getBothBrains();
  const own = layer !== 'global' && brains.project ? brains.project.brainDir : null;
  const global = layer !== 'project' && brains.global ? brains.global.brainDir : null;
  const brainDir = own || global;
  if (!brainDir) throw new Error('No enabled brain in selected scope');
  const derivedDir = path.join(brainDir, 'memory-derived');

  const records = readLedger(derivedDir, { limit });
  const summary = summariseLedger(records);
  const budget = (() => {
    for (const candidate of [layer === 'global' ? 'global' : 'project', 'global']) {
      try { const v = readConfigValue('context_budget', candidate); if (Number.isFinite(v) && v > 0) return v; } catch { /* next layer */ }
    }
    return null;
  })();

  if (isJson) {
    console.log(JSON.stringify({
      enabled: telemetryEnabled(), budget, ledger: ledgerPath(derivedDir),
      ...summary,
    }, null, 2));
    return;
  }
  if (!telemetryEnabled()) {
    console.log('Capsule telemetry is off (TR_CONTEXT_TELEMETRY=off). No measurements are recorded.');
    return;
  }
  console.log(renderSummary(summary, { budget, ledger: ledgerPath(derivedDir) }));
}
