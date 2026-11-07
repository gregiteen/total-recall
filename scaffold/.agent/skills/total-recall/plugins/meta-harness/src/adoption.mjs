import fs from 'node:fs';
import os from 'node:os';
import { executeOnNode, listTargets } from './executor.mjs';
import { readReceipts } from './learner.mjs';
import { agentEnvironment, findBinary, inspectAgents, runProcess } from './worker.mjs';

const { version } = JSON.parse(fs.readFileSync(new URL('../plugin.json', import.meta.url), 'utf8'));

async function readPreflight(args) {
  const binary = findBinary('total-recall');
  if (!binary) throw new Error('Total Recall CLI is unavailable');
  const result = await runProcess(binary, ['preflight', ...args, '--json'], {
    cwd: os.homedir(), env: agentEnvironment(), timeoutMs: 25000,
  });
  if (result.reason || result.exitCode !== 0) throw new Error(`Preflight query failed: ${result.reason || `exit ${result.exitCode}`}`);
  return JSON.parse(result.stdout);
}

const describeRun = run => run ? {
  id: run.id, at: run.timestamp, success: run.success === true, exitCode: run.exitCode ?? null,
  failureKind: run.failureKind ?? null,
  ...(run.billingMode ? { billingMode: run.billingMode } : {}),
  ...(run.tools?.length ? { tools: run.tools } : {}),
} : null;

function latestRuns(receipts) {
  const runs = new Map();
  for (const row of receipts) {
    const time = Date.parse(row.timestamp);
    if (row.node !== 'local' || !Number.isFinite(time)) continue;
    const state = runs.get(row.harness) || {};
    if (!state.attempt || time >= Date.parse(state.attempt.timestamp)) state.attempt = row;
    if (row.success === true && row.exitCode === 0 && (!state.completed || time >= Date.parse(state.completed.timestamp))) state.completed = row;
    runs.set(row.harness, state);
  }
  return runs;
}

/** This query never launches an agent or treats a synthetic hook test as live activity. */
export async function inspectLocalAdoption({ inspect = inspectAgents, receipts = readReceipts, preflight = readPreflight } = {}) {
  const [inventory, history, gates, mode] = await Promise.allSettled([
    inspect(), receipts(), preflight(['report']), preflight(['mode', '--router']),
  ]);
  const issues = [];
  const inventoryRows = Array.isArray(inventory.value?.agents) ? inventory.value.agents : null;
  const receiptRows = Array.isArray(history.value) ? history.value : null;
  const adapterRows = Array.isArray(gates.value?.adapters) ? gates.value.adapters : null;
  const decisions = gates.value?.compliance?.byHarness;
  const routerMode = mode.value?.router?.mode;
  if (!inventoryRows) issues.push('Agent inventory unavailable');
  if (!receiptRows) issues.push('Managed run receipts unavailable');
  if (!adapterRows || !decisions) issues.push('Native preflight evidence unavailable');
  if (!['off', 'warn', 'enforce'].includes(routerMode)) issues.push('Native router policy unavailable');
  const runs = latestRuns(receiptRows || []);
  const adapters = new Map((adapterRows || []).map(row => [row.id, row.verification]));
  const agents = (inventoryRows || []).map(({ id, name, installed, authenticated, version, blockedBy }) => {
    const gate = adapters.get(id);
    const decisionCount = decisions ? (Object.hasOwn(decisions, id) ? decisions[id]?.total ?? 0 : 0) : null;
    const hookStatus = !adapterRows ? 'unknown' : !gate || gate.level === 'not wired' ? 'unsupported' : gate.installed ? 'configured' : 'missing';
    const { attempt, completed } = runs.get(id) || {};
    return {
      id, name, installed, authenticated, version: version ?? null, ...(blockedBy ? { blockedBy } : {}),
      nativeGate: { status: hookStatus, recentDecisions: decisionCount },
      managedRun: { lastAttempt: describeRun(attempt), lastCompleted: describeRun(completed) },
    };
  });
  const installed = agents.filter(agent => agent.installed);
  const managedCompletions = installed.filter(agent => agent.managedRun.lastCompleted).length;
  return {
    ok: issues.length === 0, pluginVersion: version, routerMode: routerMode ?? null,
    issues, agents,
    summary: { installed: installed.length, managedCompletions, liveHookActivity: installed.filter(agent => agent.nativeGate.recentDecisions > 0).length },
  };
}

export async function inspectFleetAdoption({ node, inventory = listTargets, readLocal = inspectLocalAdoption, execute = executeOnNode } = {}) {
  const targets = await inventory();
  const nodes = node ? targets.nodes.filter(row => row.id === node || row.name === node) : targets.nodes;
  if (!nodes.length) throw new Error('Select a recorded node from meta-harness nodes');
  const results = await Promise.all(nodes.map(async target => {
    const row = { node: target.id, name: target.name };
    if (!target.self && target.online === false) return { ...row, status: 'offline' };
    if (!target.self && !target.accessConfigured) return { ...row, status: 'no-cli-access' };
    try {
      let report;
      if (target.self) report = await readLocal();
      else {
        const result = await execute(target.id, {
          operation: 'direct', useHome: true, timeoutMs: 40000,
          argv: ['total-recall', 'meta-harness', 'adoption', '--json'],
        });
        try { report = JSON.parse(result.output); } catch { /* The installed CLI did not supply an adoption report. */ }
        if (report?.error === 'Unknown operation: adoption') return { ...row, status: 'update-required', error: 'The installed Meta Harness does not support adoption reports.' };
        if (!report || !Array.isArray(report.agents) || typeof report.pluginVersion !== 'string' || typeof report.ok !== 'boolean' || (report.ok && !result.ok)) {
          return { ...row, status: 'adoption-unavailable', error: 'The installed Meta Harness did not return an adoption report. Verify its version and CLI availability.' };
        }
      }
      return { ...row, status: report.ok ? 'inspected' : 'partial', report };
    } catch (error) {
      return { ...row, status: 'probe-failed', error: String(error?.message || error).slice(0, 400) };
    }
  }));
  return { ok: !targets.meshError && results.every(row => row.status === 'inspected'), ...(targets.meshError ? { meshError: targets.meshError } : {}), nodes: results };
}
