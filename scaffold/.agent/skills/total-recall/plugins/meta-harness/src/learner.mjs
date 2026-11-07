/**
 * Execution receipts and the learning loop.
 * Receipts are an append-only SSSS ledger. Scorecards, quota walls and proposals fold from it.
 */
import { spawnSync } from 'node:child_process';
import { computeEmpiricalScorecard } from '../capability/index.mjs';
import { receiptsFile } from './paths.mjs';
import { classifyFailure } from './worker.mjs';

async function store() {
  const { PluginStateStore } = await import('./ssss-store.mjs');
  return new PluginStateStore(receiptsFile(), 'meta-harness');
}
/** Classify old failures with today's knowledge, so an early misreading cannot keep penalizing a harness. */
export const readReceipts = async () => liveReceipts((await store()).read([])).map(run => (run.failureKind === 'agent' && run.error ? { ...run, ...withoutAgent(classifyFailure(run.error, new Date(run.timestamp)), run) } : run));
const withoutAgent = (found, run) => (found.failureKind === 'agent' ? {} : { failureKind: found.failureKind, resetsAt: run.resetsAt || found.resetsAt || null });

/** The ledger is append-only, so a wrong row is voided by a later entry, never rewritten. Both stay on record. */
function liveReceipts(rows) {
  const voided = new Set(rows.flatMap(row => row.voids || []));
  return rows.filter(row => !row.voids && !voided.has(row.id));
}

export async function voidReceipts({ ids = [], reason = '' } = {}) {
  if (!ids.length) throw new Error('--void needs at least one receipt id');
  if (!String(reason).trim()) throw new Error('--void needs a --reason: a voided receipt stays on record with why');
  const ledger = await store();
  const live = new Set(liveReceipts(ledger.read([])).map(row => row.id));
  const unknown = ids.filter(id => !live.has(id));
  if (unknown.length) throw new Error(`No live receipt with id: ${unknown.join(', ')}`);
  const entry = { id: `void-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, timestamp: new Date().toISOString(), voids: ids, reason: String(reason) };
  ledger.append(entry);
  return { ok: true, voided: ids.length, id: entry.id, reason: entry.reason };
}

export async function recordRunReceipt(receipt = {}) {
  if (!receipt.harness) throw new Error('A run receipt must name its harness');
  const entry = {
    id: receipt.id || `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    harness: receipt.harness,
    model: receipt.model ?? null,
    exitCode: receipt.exitCode ?? null,
    finishedReason: receipt.finishedReason ?? null,
    role: receipt.role || null,
    node: receipt.node || 'local',
    task: String(receipt.task || '').slice(0, 300),
    complexityScore: receipt.complexityScore ?? null,
    success: receipt.success === true,
    durationMs: receipt.durationMs || 0,
    failureKind: receipt.failureKind || null,
    ...(receipt.billingMode ? { billingMode: receipt.billingMode } : {}),
    ...(Array.isArray(receipt.tools) && receipt.tools.length ? { tools: receipt.tools.map(({ tool, status, exitCode }) =>
      ({ tool, status, ...(Number.isInteger(exitCode) ? { exitCode } : {}) })) } : {}),
    error: receipt.error ? String(receipt.error).slice(0, 500) : null,
    resetsAt: receipt.resetsAt || null,
    gate: receipt.gate || null,
    escalatedFrom: receipt.escalatedFrom || null,
  };
  (await store()).append(entry);
  return entry;
}

/** A harness is walled from its last quota failure until the reported reset, or until a later success proves it clear. */
export function activeQuotaWalls(entries = [], now = Date.now(), unknownResetMs = 60 * 60 * 1000) {
  const latest = new Map();
  for (const run of entries) {
    if (run.success || run.failureKind === 'quota') latest.set(run.harness, run);
  }
  const walls = {};
  for (const [harness, run] of latest) {
    if (run.success) continue;
    const observed = Date.parse(run.timestamp);
    const until = run.resetsAt ? Date.parse(run.resetsAt) : observed + unknownResetMs;
    if (until > now) walls[harness] = { until: new Date(until).toISOString(), resetReported: Boolean(run.resetsAt), observedAt: run.timestamp, message: run.error };
  }
  return walls;
}

export function proposalsFrom(scorecard, entries = []) {
  const proposals = [];
  for (const [harness, stats] of Object.entries(scorecard)) {
    if (stats.total >= 3 && stats.passRate < 75) proposals.push({
      id: `meta-harness-low-pass-${harness}`, targetHarness: harness,
      reason: `${harness} passed ${stats.passRate}% of ${stats.total} attributable runs.`,
      recommendation: `Route complex work away from ${harness}, or require a gate before accepting its output.`,
    });
  }
  const gateFailures = new Map();
  for (const run of entries) if (run.failureKind === 'gate') gateFailures.set(run.harness, (gateFailures.get(run.harness) || 0) + 1);
  for (const [harness, count] of gateFailures) if (count >= 3) proposals.push({
    id: `meta-harness-gate-failures-${harness}`, targetHarness: harness,
    reason: `${harness} output failed quality gates ${count} times.`,
    recommendation: `Review recent ${harness} branches for a recurring defect and record the rule that prevents it.`,
  });
  return proposals;
}

/** A harness whose last run failed for a missing login or key stays out of the pool for an hour, then gets another chance. */
export function activeCredentialBlocks(entries = [], now = Date.now(), holdMs = 60 * 60 * 1000) {
  const latest = new Map();
  for (const run of entries) if (run.success || run.failureKind === 'auth') latest.set(run.harness, run);
  const blocks = {};
  for (const [harness, run] of latest) if (!run.success && Date.parse(run.timestamp) + holdMs > now) blocks[harness] = { observedAt: run.timestamp, message: run.error };
  return blocks;
}

/** With `emit`, proposals are written through the memory owner. A failed write is reported, never hidden. */
export async function learnFromHistory({ emit = false, runner = spawnSync } = {}) {
  const entries = await readReceipts();
  const scorecard = computeEmpiricalScorecard(entries);
  const proposals = proposalsFrom(scorecard, entries);
  const emitted = [];
  if (emit) for (const proposal of proposals) {
    const result = runner(process.env.TOTAL_RECALL_BIN || 'total-recall', ['remember', 'fact', `${proposal.reason} ${proposal.recommendation}`, '--project', '--slug', proposal.id, '--tags', `meta-harness,${proposal.id}`], { encoding: 'utf8', timeout: 30000 });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    // The slug is the proposal's identity, so an open proposal is reported once, however often learn runs.
    const existing = result.status !== 0 && /already exists/i.test(output);
    emitted.push({ id: proposal.id, ok: result.status === 0 || existing, ...(existing ? { existing: true } : {}), error: result.status === 0 || existing ? undefined : String(result.stderr || result.error || 'remember failed').slice(0, 300) });
  }
  return { ok: emitted.every(row => row.ok), totalHistoryRuns: entries.length, scorecard, walls: activeQuotaWalls(entries), credentialBlocks: activeCredentialBlocks(entries), proposals, ...(emit ? { emitted } : {}) };
}
