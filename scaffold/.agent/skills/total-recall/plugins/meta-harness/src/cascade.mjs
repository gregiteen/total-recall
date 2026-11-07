/**
 * Verification-gated escalation: run the routed harness on its own branch, run the gate,
 * and hand any failure to a stronger harness with the diagnostic.
 */
import { evaluateGateCascade } from '../capability/index.mjs';
import { dispatchWithReceipt } from './dispatch.mjs';
import { notifyAlert } from './alerts.mjs';
import { recordRunReceipt } from './learner.mjs';
import { resolvePool, localExecutionNode } from './pool.mjs';
import { routeTask } from './router.mjs';
import { runQualityGate } from './gate.mjs';
import { isGitRepo, createWorktree, removeWorktree, commitAll, linkDependencies, deleteBranch } from './worktree.mjs';
import { forwardRemoteOperation } from './remote-operation.mjs';
import { queueIncludedJob } from './usage-queue.mjs';

export async function executeRoutedTask(task, options = {}) {
  const remote = await forwardRemoteOperation('route', task, { ...options, execute: true });
  if (remote) return remote;
  if (options.node) localExecutionNode(options);
  const cwd = options.cwd || process.cwd();
  if (!isGitRepo(cwd)) throw new Error('Routed execution writes on its own branch, so it must run inside a git repository');
  const route = options.route || await routeTask(task, options);
  const replay = { kind: 'route', gate: options.gate === true, gateOptions: options.gateOptions };
  if (!route.selected && route.deferred) {
    const blocked = { ok: false, failureKind: 'quota', error: 'The included usage allowance is exhausted.', resetsAt: route.deferred.resetsAt };
    const job = await queueIncludedJob({ agent: route.deferred.harness, cwd, prompt: task }, blocked,
      { role: 'Routed', replay, launchPrevented: true });
    return { ...blocked, route, attempts: [], queued: true, queueId: job.id };
  }
  if (!route.selected) return { ok: false, route, attempts: [], error: 'No harness can take this task right now.' };
  const node = localExecutionNode(options, route.placement);
  const pool = options.pool || (await resolvePool(options)).ready.map(h => h.id);
  const maxAttempts = options.maxAttempts || 3;
  const id = `route-${Date.now().toString(36)}`;
  const attempts = [];
  const alerts = [];
  const tried = new Set();
  let harness = route.selected, diagnostic = null, previous = null;

  for (let index = 1; index <= maxAttempts && harness; index += 1) {
    tried.add(harness);
    const branch = `meta-harness/${id}-${index}-${harness}`;
    const directory = createWorktree(cwd, { branch });
    const attempt = { harness, branch: null, commit: null, gate: null, escalatedFrom: previous };
    attempts.push(attempt);
    let stopped;
    try {
      const prompt = `Work only in this checkout. Do not commit; the harness commits your changes.\nTask:\n${task}${diagnostic ? `\n\nA previous attempt by ${previous} failed. Diagnostic:\n${diagnostic}` : ''}`;
      const result = await dispatchWithReceipt({ agent: harness, node, cwd: directory, contextCwd: cwd, contextTask: task, prompt, permissions: { read: true, write: true }, allowUnknownAuth: options.allowUnknownAuth === true }, { dispatchFn: options.dispatchFn, role: 'Routed', complexityScore: route.complexity?.score, escalatedFrom: previous, replay, retryId: options.retryId });
      attempt.ok = result.ok === true;
      attempt.durationMs = result.durationMs;
      attempt.output = result.response || null;
      if (result.ok) {
        attempt.commit = commitAll(directory, `meta-harness: ${task.slice(0, 60)}\n\nAgent: ${harness}`);
        if (attempt.commit) attempt.branch = branch;
        else {
          attempt.ok = false; attempt.error = 'The agent reported success but changed no files.';
          await recordRunReceipt({ harness, role: 'Implementer', task, success: false, failureKind: 'no-change', error: attempt.error });
        }
      } else {
        attempt.error = result.error;
        attempt.failureKind = result.failureKind;
        if (result.queued || result.queueError || (result.failureKind === 'quota' && options.retryId) || result.failureKind === 'billing-policy') stopped = result;
      }
      if (attempt.ok && options.gate) {
        linkDependencies(cwd, directory);
        attempt.gate = await (options.gateFn || runQualityGate)(directory, options.gateOptions);
        // A gate that could not run says nothing about this agent's work, so it does not escalate.
        if (['unavailable', 'unconfigured'].includes(attempt.gate.status)) {
          attempt.ok = false;
          attempt.error = `The quality gate is ${attempt.gate.status}: ${attempt.gate.summary}`;
          return { ok: false, route, attempts, error: attempt.error };
        }
        await recordRunReceipt({ harness, role: 'Gate', task, success: attempt.gate.passed, failureKind: attempt.gate.passed ? null : 'gate', error: attempt.gate.passed ? null : attempt.gate.summary, gate: attempt.gate.status });
        attempt.ok = attempt.gate.passed;
      }
    } catch (error) {
      attempt.ok = false;
      attempt.error = String(error.message);
    } finally {
      removeWorktree(cwd, directory);
      // Only the branch this run hands back survives; the attempt record keeps what happened.
      if (!attempt.ok) { deleteBranch(cwd, branch); attempt.branch = null; }
    }

    if (attempt.ok) return { ok: true, route, gateApplied: Boolean(options.gate), branch: attempt.branch, commit: attempt.commit, harness, attempts, alerts };
    if (stopped) return { ...stopped, route, attempts, alerts };

    const remaining = pool.filter(item => !tried.has(item));
    const next = remaining.length ? evaluateGateCascade(harness, { testsPassed: false }, remaining) : null;
    diagnostic = attempt.gate?.summary || attempt.error || 'The previous attempt failed.';
    previous = harness;
    harness = next?.recommendedHarness && !tried.has(next.recommendedHarness) ? next.recommendedHarness : null;
    if (harness) alerts.push(await notifyAlert({ title: 'Meta Harness: escalating', message: `${previous} failed on "${task.slice(0, 60)}"; escalating to ${harness}.`, severity: 'warning' }));
  }
  return { ok: false, route, gateApplied: Boolean(options.gate), attempts, alerts, error: 'No attempt passed.' };
}
