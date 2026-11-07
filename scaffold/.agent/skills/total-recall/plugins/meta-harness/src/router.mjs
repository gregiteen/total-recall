/**
 * Meta Harness Smart Router
 * Manages honest quota/readiness tracking, benchmark matrices, RouteLLM complexity routing,
 * and cost-vs-frontier harness selection.
 *
 * Design Invariant:
 * - Zero hardcoded hostnames, IP addresses, or personal node topologies.
 * - Zero fabricated or simulated quota percentages: a figure is reported only when a real
 *   provider API or local telemetry file supplies it; otherwise `unknown` is reported honestly.
 * - Candidates are the harnesses that can take work now; `resolvePool` reports why the others cannot.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { classifyTaskComplexity, selectOptimalHarness, computeEmpiricalScorecard } from '../capability/index.mjs';
import { inspectAgents } from './worker.mjs';
import { inspectNode } from './executor.mjs';
import { getModelCatalog, joinHarnessModels } from './model-catalog.mjs';
import { readReceipts, activeQuotaWalls, activeCredentialBlocks } from './learner.mjs';
import { resolvePool, exclusionReason, isLocalExecutionNode } from './pool.mjs';
import { readCodexRateLimits, measuredWalls } from './telemetry.mjs';
import { claudeProofCurrent, INCLUDED_AGENTS, readIncludedPolicy } from './included-usage.mjs';
import { derivedDir } from './paths.mjs';

/**
 * Helper to safely query host Total Recall CLI without assumptions
 */
function runHostCli(args = [], { captureFailure = false } = {}) {
  try {
    const totalRecallBin = process.env.TOTAL_RECALL_BIN || 'total-recall';
    const output = execFileSync(totalRecallBin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 20000,
      encoding: 'utf8'
    });
    return output.trim();
  } catch (error) {
    // A failing owner often explains itself as JSON on stdout. Callers that need the reason read it here.
    return captureFailure ? String(error.stdout || '').trim() || null : null;
  }
}

const gigabytes = bytes => (typeof bytes === 'number' ? +(bytes / 1024 ** 3).toFixed(2) : null);
function normalizeFleetRow(row) {
  return { hostname: row.hostname, ip: row.ip, online: row.online !== false, self: Boolean(row.self), telemetry: row.state || null, cpuCores: row.cores ?? null, loadAvg1m: row.loadAvg?.[0] ?? null, freeMemGB: gigabytes(row.memory?.free), totalMemGB: gigabytes(row.memory?.total), memoryUtilizationPercent: row.memory?.usedPercent ?? null };
}
function fleetTelemetry(run = runHostCli) {
  try {
    const parsed = JSON.parse(run(['system-monitor', 'fleet', '--json']) || 'null');
    if (!parsed?.rows) return { ok: false, error: 'Fleet telemetry is unavailable', nodes: [] };
    return { ok: true, machines: parsed.machines, answered: parsed.answered, nodes: parsed.rows.map(normalizeFleetRow) };
  } catch (error) {
    return { ok: false, error: String(error.message), nodes: [] };
  }
}

const METERED_HARNESSES = new Set(['dsh', 'hermes', 'openclaw', 'pi', 'aider', 'goose', 'openhands', 'cline']);
const METERED_TTL_MS = 5 * 60 * 1000;
const meteredCacheFile = () => path.join(derivedDir(), 'metered-quota.json');

const FLEET_TTL_MS = 60 * 1000;
const fleetCacheFile = () => path.join(derivedDir(), 'fleet-telemetry.json');

/** Asking every machine takes seconds, so placement reuses an answer under a minute old. A failed read is not kept. */
function cachedFleet() {
  try {
    const cached = JSON.parse(fs.readFileSync(fleetCacheFile(), 'utf8'));
    if (Date.now() - cached.at < FLEET_TTL_MS) return cached.fleet;
  } catch { /* no usable cache: read it */ }
  const fleet = fleetTelemetry();
  if (fleet.ok) {
    try {
      fs.mkdirSync(path.dirname(fleetCacheFile()), { recursive: true, mode: 0o700 });
      fs.writeFileSync(fleetCacheFile(), JSON.stringify({ at: Date.now(), fleet }), { mode: 0o600 });
    } catch { /* a cache that cannot be written only costs the next read */ }
  }
  return fleet;
}

/** The balance changes slowly and costs two secret reads and two requests. The file holds figures, never a key. */
async function cachedMeteredQuota(options) {
  if (!options.meteredTtlMs) return readMeteredQuota(options);
  try {
    const cached = JSON.parse(fs.readFileSync(meteredCacheFile(), 'utf8'));
    if (Date.now() - cached.at < options.meteredTtlMs) return cached.quota;
  } catch { /* no usable cache: read it */ }
  const quota = await readMeteredQuota(options);
  try {
    fs.mkdirSync(path.dirname(meteredCacheFile()), { recursive: true, mode: 0o700 });
    fs.writeFileSync(meteredCacheFile(), JSON.stringify({ at: Date.now(), quota }), { mode: 0o600 });
  } catch { /* a cache that cannot be written only costs the next read */ }
  return quota;
}

/** Metered balance, from the provider. */
async function readMeteredQuota(options) {
  let meteredQuota = { billingModel: 'metered', creditRemainingUSD: null, usageUSD: null, usageDailyUSD: null, usageWeeklyUSD: null, usagePercent: null, quotaNote: 'No OpenRouter key in the auth store', status: 'unconfigured' };
  try {
    const key = options.openRouterKey !== undefined ? options.openRouterKey : runHostCli(['auth', 'secret', 'get', 'OPENROUTER_API_KEY']);
    if (key) {
      const response = await (options.fetchImpl || fetch)('https://openrouter.ai/api/v1/auth/key', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()).data || {};
      const usage = typeof data.usage === 'number' ? +data.usage.toFixed(4) : null;
      meteredQuota = {
        billingModel: 'metered', creditRemainingUSD: typeof data.limit_remaining === 'number' ? +data.limit_remaining.toFixed(4) : null,
        usageUSD: usage, usageDailyUSD: data.usage_daily ?? null, usageWeeklyUSD: data.usage_weekly ?? null,
        usagePercent: data.limit && usage !== null ? Math.min(100, Math.round((usage / data.limit) * 100)) : null,
        quotaNote: data.limit ? `Limit $${data.limit}` : 'No spending limit on this key', quotaSource: 'openrouter', status: 'ready',
      };
    }
  } catch (error) {
    meteredQuota.quotaNote = `OpenRouter could not be reached: ${error.message}`;
    meteredQuota.status = 'unavailable';
  }
  // Per-key usage says nothing about whether the account can pay. Only the account balance does.
  try {
    const management = options.openRouterManagementKey !== undefined ? options.openRouterManagementKey : runHostCli(['auth', 'secret', 'get', 'OPENROUTER_MANAGEMENT_KEY']);
    if (management) {
      const response = await (options.fetchImpl || fetch)('https://openrouter.ai/api/v1/credits', { headers: { Authorization: `Bearer ${management}` }, signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { total_credits: credits, total_usage: used } = (await response.json()).data || {};
      if (typeof credits === 'number' && typeof used === 'number') {
        meteredQuota.creditRemainingUSD = +(credits - used).toFixed(2);
        meteredQuota.quotaNote = `Account balance $${meteredQuota.creditRemainingUSD} of $${credits}`;
        if (credits - used <= 0) meteredQuota.status = 'exhausted';
      }
    }
  } catch (error) {
    meteredQuota.balanceError = `The OpenRouter balance could not be read: ${error.message}`;
  }
  return meteredQuota;
}

/**
 * Inspect Quota and Readiness status across harnesses and host compute.
 * Dynamically queries whatever host hardware, installed binaries, and auth stores the user has.
 * Never fabricates or hardcodes synthetic subscription percentages.
 */
export async function inspectQuotas(options = {}) {
  const policy = options.policy || await readIncludedPolicy();
  const quotas = {};
  const remote = options.node && options.node !== 'local';
  const fleet = (options.fleet || fleetTelemetry)();
  const rowFor = node => fleet.nodes.find(row => [row.hostname, row.ip].includes(node) || String(row.hostname || '').split('.')[0] === node);

  if (remote) {
    const row = rowFor(options.node);
    if (!row || row.freeMemGB === null) throw new Error(`No telemetry from mesh node ${options.node}${fleet.ok ? '' : `: ${fleet.error}`}`);
    quotas.system = { ...row, node: options.node };
  } else {
    // os.freemem() on macOS excludes reclaimable memory, so the monitor's figure wins when it answered.
    const totalMemBytes = os.totalmem(), freeMemBytes = os.freemem();
    const self = fleet.nodes.find(row => row.self);
    quotas.system = {
      hostname: os.hostname(), platform: os.platform(), arch: os.arch(), cpuCores: os.cpus()?.length || 1,
      loadAvg1m: parseFloat((os.loadavg()?.[0] || 0).toFixed(2)),
      totalMemGB: parseFloat((totalMemBytes / 1024 ** 3).toFixed(2)), freeMemGB: parseFloat((freeMemBytes / 1024 ** 3).toFixed(2)),
      memoryUtilizationPercent: Math.round(((totalMemBytes - freeMemBytes) / totalMemBytes) * 100), node: 'local',
      ...(typeof self?.freeMemGB === 'number' ? { freeMemGB: self.freeMemGB, totalMemGB: self.totalMemGB, memoryUtilizationPercent: self.memoryUtilizationPercent } : {}),
    };
  }

  // Harness state comes from the selected machine. Quota walls are this machine's receipts.
  const claudePlan = policy.enabled ? policy.claudePlan?.organization : undefined;
  const inspected = remote ? await (options.inspectNodeFn || inspectNode)(options.node) :
    await (options.inspect || inspectAgents)({ env: process.env, cwd: options.cwd, claudePlan });
  const codexLimits = remote ? null : readCodexRateLimits();
  const receipts = remote ? [] : (await readReceipts()).filter(run => !policy.enabled || run.billingMode === 'included');
  const walls = remote ? {} : { ...activeQuotaWalls(receipts), ...(!policy.enabled ? measuredWalls(codexLimits) : {}) };
  const metered = METERED_HARNESSES;

  const blocks = activeCredentialBlocks(receipts);
  for (const installed of inspected.agents || []) {
    const agent = policy.enabled && !remote && installed.id === 'claude' && !claudePlan ?
      { ...installed, authenticated: claudeProofCurrent(policy) } : installed;
    const wall = walls[agent.id];
    const block = blocks[agent.id];
    const policyBlocked = policy.enabled && !INCLUDED_AGENTS.includes(agent.id);
    const explicitOpenRouter = !remote && Boolean(policy.openRouter?.[agent.id]);
    const reason = policyBlocked ? (explicitOpenRouter ? 'available through explicit OpenRouter dispatch' : 'outside the included usage route') : exclusionReason(agent, wall, block);
    let status = 'ready';
    if (!agent.installed) status = 'not_installed';
    else if (policyBlocked) status = 'blocked';
    else if (agent.authenticated === false || block) status = 'needs_auth';
    else if (agent.blockedBy) status = 'blocked';
    else if (wall) status = 'exhausted';
    else if (agent.authenticated === 'unknown') status = 'unverified';
    const quota = {
      installed: Boolean(agent.installed), version: agent.version || null,
      billingModel: policy.enabled && !remote && !claudePlan && agent.id === 'claude' ? 'included-api-credits' :
        agent.id === 'ollama' ? 'local' : metered.has(agent.id) ? 'metered' : 'subscription',
      rolling5hUsedPercent: null, weeklyUsedPercent: null, usagePercent: null,
      quotaSource: 'none', quotaNote: reason || 'No usage figure is available from this harness', status,
      ...(explicitOpenRouter ? { explicitOpenRouter: true } : {}),
      ...(wall ? { resetsAt: wall.until, wallMessage: wall.message } : {}),
    };
    if (agent.id === 'codex' && codexLimits) {
      quota.rolling5hUsedPercent = codexLimits.primary?.used_percent ?? null;
      quota.weeklyUsedPercent = codexLimits.secondary?.used_percent ?? null;
      if (codexLimits.primary || codexLimits.secondary) quota.usagePercent = Math.max(quota.rolling5hUsedPercent ?? 0, quota.weeklyUsedPercent ?? 0);
      quota.quotaSource = 'codex-session-log';
      quota.observedAt = codexLimits.observedAt;
      if (!reason) quota.quotaNote = `Measured in the Codex session log at ${codexLimits.observedAt}`;
    }
    quotas[agent.id] = quota;
  }

  const meteredQuota = options.skipMetered || policy.enabled
    ? { billingModel: 'metered', status: 'not-read', quotaNote: 'Not read: no metered harness is in this route pool' }
    : await cachedMeteredQuota(options);
  quotas.metered = meteredQuota;
  if (meteredQuota.status === 'exhausted') for (const id of ['dsh', 'hermes', 'pi']) {
    if (quotas[id]?.installed && !['needs_auth', 'blocked'].includes(quotas[id].status)) Object.assign(quotas[id], { status: 'exhausted', quotaNote: `Bills OpenRouter. ${meteredQuota.quotaNote}` });
  }

  return { ok: true, timestamp: new Date().toISOString(), node: options.node || 'local', fleet: { ok: fleet.ok, error: fleet.error, machines: fleet.machines, answered: fleet.answered, nodes: fleet.nodes }, quotas };
}

/** Models with sourced figures, the leaderboards they came from, and pass rates measured on this machine. */
export async function getBenchmarks(options = {}) {
  const catalog = getModelCatalog();
  const receipts = options.ledger || await readReceipts();
  return {
    ok: true, updatedAt: catalog.updatedAt, synced: Boolean(catalog.updatedAt),
    note: catalog.updatedAt ? undefined : 'Run `total-recall meta-harness maintenance --models` to fetch real figures.',
    sources: catalog.sources, models: joinHarnessModels(catalog), leaderboards: catalog.leaderboards,
    local: computeEmpiricalScorecard(receipts),
  };
}

/** Ask the decision plugin to classify. Its failure is reported; the caller sees which classifier answered. */
export function classifyWithDecision(task, run = args => runHostCli(args, { captureFailure: true })) {
  const questions = { complexity: { type: 'choice', instructions: 'How demanding is this software engineering task for a coding agent?', criteria: { local: 'A small mechanical change a local model can make.', budget: 'Routine engineering with a clear path.', frontier: 'Architecture, security, or work across many files.' } } };
  const output = run(['decision', 'run', '--state', JSON.stringify({ task: task.slice(0, 2000) }), '--questions', JSON.stringify(questions), '--json']);
  if (!output) throw new Error('The decision plugin did not answer');
  const parsed = JSON.parse(output);
  if (parsed.ok === false) throw new Error(parsed.error || 'The decision plugin reported a failure');
  const answer = parsed.answers?.complexity ?? parsed.decision?.answers?.complexity ?? parsed.result?.complexity;
  const tier = typeof answer === 'string' ? answer : answer?.choice;
  if (!['local', 'budget', 'frontier'].includes(tier)) throw new Error('The decision plugin returned no usable tier');
  return { tier, confidence: answer?.confidence ?? null };
}

/** Local-tier work goes to the online machine with the most free memory that reported telemetry. */
export function placeLocalWork(fleet = {}) {
  const nodes = (fleet.nodes || []).filter(node => node.online !== false && typeof node.freeMemGB === 'number');
  if (!nodes.length) return null;
  const best = nodes.reduce((a, b) => (b.freeMemGB > a.freeMemGB ? b : a));
  return { node: best.hostname, freeMemGB: best.freeMemGB };
}

export async function routeTask(taskDescription, options = {}) {
  const policy = await readIncludedPolicy();
  let complexity = classifyTaskComplexity(taskDescription, options);
  let classifier = { source: 'heuristic' };
  if (options.jev && !policy.enabled) {
    try {
      const decided = classifyWithDecision(taskDescription, options.decisionRun);
      complexity = { ...complexity, tier: decided.tier, isFrontierRecommended: decided.tier === 'frontier', isLocalRecommended: decided.tier === 'local' };
      classifier = { source: 'decision', confidence: decided.confidence };
    } catch (error) {
      classifier = { source: 'heuristic', decisionError: String(error.message).slice(0, 300) };
    }
  }
  // Plan-only routing on a selected node chooses from that node's harnesses, not this machine's.
  const remote = options.node && !isLocalExecutionNode(options.node);
  const inspected = remote ? (options.inspectNodeFn || inspectNode)(options.node) : null;
  const scoped = remote ? { ...options, inspectNodeFn: () => inspected, inspect: () => inspected } : options;
  // One inspection serves the pool and the quota report. Read only what this decision uses:
  // fleet telemetry places local work, and the balance matters only to a metered harness.
  const shared = scoped.inspect ? null : inspectAgents({ env: process.env });
  const lean = shared ? { ...scoped, inspect: () => shared } : scoped;
  const [pool, receipts] = await Promise.all([resolvePool({ ...lean, policy }), readReceipts()]);
  const quotaReport = await inspectQuotas({
    ...lean,
    policy,
    meteredTtlMs: METERED_TTL_MS,
    skipMetered: policy.enabled || (lean.openRouterKey === undefined && !pool.ready.some(h => METERED_HARNESSES.has(h.id))),
    ...(remote || lean.fleet ? {} : { fleet: complexity.tier === 'local' ? cachedFleet : () => ({ ok: false, error: 'Not read: this route places no local work', nodes: [] }) }),
  });
  const quotas = quotaReport.quotas;
  const routing = selectOptimalHarness(taskDescription, pool.ready.map(h => h.id), quotas, { ...options, tierOverride: complexity.tier, empiricalScorecard: computeEmpiricalScorecard(receipts) });
  const selectedQuota = quotas[routing.selected] || {};
  const warnings = [];
  if (policy.enabled && options.jev) warnings.push('Included usage policy uses the local task classifier.');
  if (typeof selectedQuota.usagePercent === 'number' && selectedQuota.usagePercent > 85) warnings.push(`${routing.selected} is at ${selectedQuota.usagePercent}% measured usage.`);
  if (selectedQuota.status === 'unverified') warnings.push(`${routing.selected} has no login probe; only a completed run proves it works.`);
  if (selectedQuota.billingModel === 'metered') warnings.push(`${routing.selected} bills per token.`);
  if (!routing.selected) warnings.push('No harness can take this task right now.');
  return {
    ok: Boolean(routing.selected), task: taskDescription, classifier, complexity,
    selected: routing.selected, tier: complexity.tier, candidates: routing.candidates, excluded: pool.excluded,
    ...(policy.enabled && !routing.selected ? { deferred: pool.excluded.find(row => row.failureKind === 'quota') || null } : {}),
    placement: complexity.tier === 'local' ? placeLocalWork(quotaReport.fleet) : null,
    scoring: 'Adapter quality and cost scores are configured priors, adjusted by pass rates measured on this machine.',
    quotaSnapshot: { selectedHarnessStatus: selectedQuota.status || null, selectedHarnessUsage: selectedQuota.usagePercent ?? null, freeMemGB: quotas.system.freeMemGB ?? null },
    warnings,
  };
}
