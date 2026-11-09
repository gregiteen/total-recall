/** Forward a complete owning-plugin job through the existing verified mesh executor. */
import path from 'node:path';
import { executeOnNode } from './executor.mjs';
import { isLocalExecutionNode } from './pool.mjs';

const BOOLEAN_FLAGS = {
  execute: '--execute', gate: '--gate', jev: '--jev', preferLocal: '--prefer-local', preferFrontier: '--prefer-frontier',
  autoReview: '--auto-review', allowSameFamily: '--allow-same-family', allowUnknownAuth: '--allow-unknown-auth', staged: '--staged',
};
const VALUE_FLAGS = {
  mode: '--mode', orchestrator: '--orchestrator', explorer: '--explorer', architect: '--architect', implementer: '--implementer',
  goal: '--goal', maxTurns: '--max-turns', maxBudgetUsd: '--max-budget-usd', maxTokens: '--max-tokens', approvalPolicy: '--approvals', questionTimeoutMs: '--question-timeout-ms', resultSchema: '--result-schema',
  verifier: '--verifier', reviewer: '--reviewer', author: '--author', threadId: '--thread', branch: '--branch',
};
const OPERATION_KEYS = {
  route: ['execute', 'gate', 'jev', 'preferLocal', 'preferFrontier', 'allowUnknownAuth'],
  coordinate: ['execute', 'gate', 'autoReview', 'allowSameFamily', 'allowUnknownAuth', 'mode', 'orchestrator', 'explorer', 'architect', 'implementer', 'verifier', 'reviewer', 'branch'],
  review: ['staged', 'allowUnknownAuth', 'reviewer', 'author', 'threadId'],
};

export async function forwardRemoteOperation(operation, task, options = {}) {
  if (!options.node || isLocalExecutionNode(options.node)) return null;
  if (!Object.hasOwn(OPERATION_KEYS, operation)) throw new Error('Unsupported remote operation');
  if (typeof options.node !== 'string' || /[\0\r\n]/.test(options.node)) throw new Error('Explicit recorded mesh node required');
  if (typeof options.cwd !== 'string' || !path.isAbsolute(options.cwd) || options.cwd.includes('\0')) throw new Error('Remote execution requires an explicit absolute workspace (--cwd) on the selected node');
  // A job runs several agents, so its budget is the maximum, not one agent's.
  const timeoutMs = options.timeoutMs ?? 3600000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3600000) throw new Error('Remote operation timeout must be between 1 ms and one hour');

  const argv = ['total-recall', 'meta-harness', operation];
  if (operation === 'review') {
    if (options.target) argv.push(String(options.target));
  } else {
    if (typeof task !== 'string' || !task.trim()) throw new Error('Remote operation requires a task description');
    argv.push(task);
  }
  const controls = ['route', 'coordinate'].includes(operation) ? ['goal', 'maxTurns', 'maxBudgetUsd', 'maxTokens', 'approvalPolicy', 'questionTimeoutMs', 'resultSchema'] : [];
  for (const key of [...OPERATION_KEYS[operation], ...controls]) {
    if (BOOLEAN_FLAGS[key]) { if (options[key] === true) argv.push(BOOLEAN_FLAGS[key]); }
    else if (options[key] !== undefined && options[key] !== null) {
      if (['maxTurns', 'maxBudgetUsd', 'maxTokens', 'questionTimeoutMs'].includes(key)) { argv.push(VALUE_FLAGS[key], String(options[key])); continue; }
      if (key === 'resultSchema' && typeof options[key] !== 'string') { argv.push('--result-schema-json', JSON.stringify(options[key])); continue; }
      if (typeof options[key] !== 'string' || !options[key] || /\0/.test(options[key])) throw new Error(`Invalid remote ${key}`);
      argv.push(VALUE_FLAGS[key], options[key]);
    }
  }
  if (operation === 'coordinate' && options.subagents === false) argv.push('--no-subagents');
  if (['route', 'coordinate'].includes(operation) && options.gateOptions?.tier) argv.push('--tier', options.gateOptions.tier);
  // Force destination-local execution so a forwarded job cannot recursively forward itself.
  argv.push('--cwd', options.cwd, '--node', 'local', '--json');
  const execution = { node: options.node, workspace: options.cwd, remote: true, operation };
  let transport;
  try {
    transport = await (options.executeOnNodeFn || executeOnNode)(options.node, { operation: 'direct', cwd: options.cwd, argv, timeoutMs });
  } catch (error) {
    return { ok: false, execution, failureKind: 'transport', error: `Remote ${operation} transport failed: ${error.message}. The job may still be running on ${options.node}; check its branches and threads before starting it again.` };
  }
  let payload;
  try {
    payload = JSON.parse(transport.output || '');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.ok !== 'boolean') throw new Error('Missing operation outcome');
  } catch {
    return { ok: false, execution, failureKind: 'transport', transportExitCode: transport.exitCode ?? null,
      error: transport.error || 'Remote operation returned no valid structured result' };
  }
  const result = { ...payload, ok: transport.ok === true && payload.ok === true, execution, transportExitCode: transport.exitCode ?? null,
    ...(!transport.ok && !payload.failureKind ? { failureKind: 'transport' } : {}) };
  if (!result.ok && !result.error) result.error = transport.error || `Remote ${operation} failed`;
  if (result.ok && payload.branch) result.deliverable = { node: options.node, workspace: options.cwd, branch: payload.branch, commit: payload.commit ?? null };
  const threadId = payload.threadId || options.threadId;
  if (threadId) result.threadRef = { node: options.node, workspace: options.cwd, id: threadId };
  if (payload.review) result.review = { ...payload.review, node: options.node, workspace: options.cwd, ...(threadId ? { threadId } : {}) };
  return result;
}
