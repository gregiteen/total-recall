/** The harnesses that can actually take work right now, and why the others cannot. */
import { ADAPTER_CATALOG } from '../capability/index.mjs';
import { inspectAgents, getActiveAdapters } from './worker.mjs';
import { readReceipts, activeQuotaWalls, activeCredentialBlocks } from './learner.mjs';
import { measuredWalls } from './telemetry.mjs';
import { claudeProofCurrent, INCLUDED_AGENTS, readIncludedPolicy } from './included-usage.mjs';
import os from 'node:os';

const describe = (id, extra = {}) => {
  const cap = ADAPTER_CATALOG[id] || {};
  const spec = getActiveAdapters().find(a => a.id === id) || {};
  return { id, name: cap.name || spec.name || id, family: cap.family || spec.family || 'custom', tier: cap.tier || spec.tier || 'budget', qualityScore: cap.qualityScore ?? spec.qualityScore ?? 6, costScore: cap.costScore ?? spec.costScore ?? 4, ...extra };
};

export function exclusionReason(agent, wall, credentialBlock, { allowUnknownAuth = false } = {}) {
  if (!agent.installed) return 'not installed';
  if (!agent.versionVerified) return 'did not report a version';
  if (agent.authenticated === false) return 'not signed in';
  if (agent.authenticated !== true && !allowUnknownAuth) return 'authentication is unverified; explicit --allow-unknown-auth is required';
  if (agent.blockedBy === 'no-chat-model') return 'no chat model installed';
  if (wall) return `out of quota until ${wall.until}`;
  if (credentialBlock) return `missing credential: ${String(credentialBlock.message || '').slice(0, 160)}`;
  return null;
}

/** An explicit list is the caller's decision and is not filtered. */
export async function resolvePool({ availableHarnesses, inspect = inspectAgents, receipts = readReceipts, allowUnknownAuth = false, policy } = {}) {
  policy ??= await readIncludedPolicy();
  if (!policy.enabled && Array.isArray(availableHarnesses) && availableHarnesses.length) return { ready: availableHarnesses.map(id => describe(id)), excluded: [], walls: {} };
  const claudePlan = policy.enabled ? policy.claudePlan?.organization : undefined;
  const [{ agents = [] }, entries] = await Promise.all([inspect({ env: process.env, claudePlan }), receipts()]);
  const billingEntries = policy.enabled ? entries.filter(run => run.billingMode === 'included') : entries;
  const walls = { ...activeQuotaWalls(billingEntries), ...(!policy.enabled ? measuredWalls() : {}) };
  const blocks = activeCredentialBlocks(billingEntries);
  const ready = [], excluded = [];
  for (const installed of agents) {
    const agent = policy.enabled && installed.id === 'claude' && !claudePlan ? { ...installed, authenticated: claudeProofCurrent(policy) } : installed;
    const policyBlocked = policy.enabled && (!INCLUDED_AGENTS.includes(agent.id) || (Array.isArray(availableHarnesses) && !availableHarnesses.includes(agent.id)));
    const reason = policyBlocked ? 'outside the included usage route' : exclusionReason(agent, walls[agent.id], blocks[agent.id], { allowUnknownAuth: !policy.enabled && allowUnknownAuth });
    if (!reason) ready.push(describe(agent.id, { authVerified: agent.authenticated === true }));
    else if (agent.installed) excluded.push({ harness: agent.id, reason,
      ...(policy.enabled && !policyBlocked && agent.authenticated === true && agent.versionVerified && !agent.blockedBy && walls[agent.id]
        ? { failureKind: 'quota', resetsAt: walls[agent.id].resetReported ? walls[agent.id].until : null } : {}) });
  }
  return { ready, excluded, walls };
}

export function isLocalExecutionNode(node = 'local') {
  const hostname = os.hostname();
  return ['local', hostname, hostname.split('.')[0]].includes(node);
}

/** Automatic placement needs a workspace mapping before it can become a remote job. */
export function localExecutionNode(options = {}, placement) {
  const node = options.node || placement?.node || 'local';
  if (!isLocalExecutionNode(node)) {
    throw new Error(`Automatic placement on mesh node ${node} has no explicit remote workspace. Select --node and an absolute --cwd before execution; no local fallback was run.`);
  }
  return 'local';
}
