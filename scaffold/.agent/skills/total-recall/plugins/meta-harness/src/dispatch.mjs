/** One path for every agent run: contain it if needed, dispatch it, classify the outcome, write its receipt. */
import { executeOnNode } from './executor.mjs';
import { classifyFailure, INCLUDED_BILLING, READ_ONLY_ADAPTERS, cancellationResult } from './worker.mjs';
import { recordRunReceipt } from './learner.mjs';
import { isGitRepo, createWorktree, removeWorktree, commitAll, deleteBranch } from './worktree.mjs';
import { randomUUID } from 'node:crypto';
import { includedAdmission, openRouterAdmission, readIncludedPolicy } from './included-usage.mjs';
import { queueIncludedJob } from './usage-queue.mjs';

export async function dispatchWithReceipt(request, { dispatchFn, node = request.node || 'local', role, complexityScore, escalatedFrom,
  record = recordRunReceipt, replay, retryId, manageWrites = false, usagePolicy = readIncludedPolicy, admit = includedAdmission, admitOpenRouter = openRouterAdmission } = {}) {
  const started = Date.now();
  if (cancellationResult()) return cancellationResult();
  // A harness that cannot be told not to write does read-only work in a checkout that is thrown away.
  const contain = node === 'local' && request.permissions?.write !== true && !READ_ONLY_ADAPTERS.includes(request.agent) && request.isolated !== true && isGitRepo(request.cwd);
  const ownWrites = manageWrites && node === 'local' && request.permissions?.write === true && isGitRepo(request.cwd);
  let scratch = null, branch = null, result, billingMode = null, launchPrevented = false;
  try {
    let effective = request;
    const policy = await usagePolicy();
    if (policy.enabled && node === 'local') {
      const openRouter = Object.hasOwn(policy.openRouter ?? {}, request.agent);
      billingMode = openRouter ? 'openrouter' : 'included';
      const admission = openRouter ? await admitOpenRouter(request.agent, policy) : await admit(request.agent, request.cwd, policy);
      if (!admission.ok) {
        result = { ...admission, agent: request.agent, exitCode: null };
        launchPrevented = true;
      } else effective = { ...request, [INCLUDED_BILLING]: { key: admission.key, claudePlan: admission.claudePlan, openRouter: admission.openRouter } };
    }
    result = cancellationResult() || result;
    if (!result) {
      if (contain || ownWrites) {
        branch = ownWrites ? `meta-harness/dispatch-${randomUUID()}` : null;
        scratch = createWorktree(request.cwd, { ...(branch ? { branch } : {}), prefix: ownWrites ? 'meta-harness-dispatch-' : 'meta-harness-readonly-' });
        effective = { ...effective, ...(branch ? { branch } : {}), cwd: scratch, contextCwd: request.contextCwd || request.cwd, isolated: true };
      }
      result = dispatchFn ? await dispatchFn(effective) : await executeOnNode(node, { ...effective, operation: 'dispatch' });
      if (cancellationResult()) result = { ...result, ...cancellationResult() };
      if (contain) result = { ...result, readOnly: 'disposable-checkout' };
    }
  } catch (error) {
    const message = String(error?.message || error);
    result = { ok: false, error: message, agent: request.agent, ...(error?.code === 'NOT_READY' ? { failureKind: 'not-ready' } : classifyFailure(message)) };
  } finally {
    if (scratch) {
      try {
        if (branch) {
          const commit = commitAll(scratch, result?.cancelled ? 'meta-harness: unfinished cancelled dispatch' : 'meta-harness: dispatch changes');
          if (commit) result = { ...result, branch, ...(result?.ok ? { commit } : { wip: commit }) };
          else if (result?.sessionId) result = { ...result, branch };
          else deleteBranch(request.cwd, branch);
        }
      } finally { removeWorktree(request.cwd, scratch); }
      if (branch && !result?.branch) deleteBranch(request.cwd, branch);
    }
  }
  const durationMs = Date.now() - started;
  if (result.execution?.receiptOwner === 'destination' && result.receiptId) return { ...result, durationMs };
  if (result.execution?.remote && (result.queued || result.launchPrevented)) return { ...result, durationMs };
  if (billingMode === 'included' && result.failureKind === 'quota') {
    if (retryId) result = { ...result, needsReview: !launchPrevented && request.permissions?.write === true };
    else {
      try {
        const job = await queueIncludedJob(request, result, { role, replay, launchPrevented });
        result = { ...result, queued: true, queueId: job.id, needsReview: job.needsReview };
      } catch (error) {
        result = { ...result, queueError: error.message };
      }
    }
  }
  if (launchPrevented) {
    // A launch refused for quota is a quota wall too (A-124): record it, so routing sees the harness as
    // exhausted until its reset and picks another included harness instead of choosing it again.
    if (result.failureKind === 'quota') {
      try { await record({ harness: request.agent, role, task: String(request.contextTask || request.prompt || '').slice(0, 200), success: false,
        failureKind: 'quota', error: result.error, resetsAt: result.resetsAt || null }); } catch { /* bookkeeping must not hide the refusal */ }
    }
    return { ...result, launchPrevented, durationMs };
  }
  // A finished run keeps its result: the worktree and any cost are real even when bookkeeping fails.
  let receipt, receiptError;
  try {
    receipt = await record({
    harness: request.agent, role, node, task: request.contextTask || request.prompt, complexityScore,
      billingMode,
    model: result.model ?? null, exitCode: result.exitCode ?? null, finishedReason: result.finishedReason ?? null,
      tools: result.toolResults,
    success: result.ok === true, durationMs, failureKind: result.ok ? null : result.failureKind || 'agent',
    error: result.ok ? null : result.error, resetsAt: result.resetsAt, escalatedFrom,
    });
  } catch (error) { receiptError = String(error?.message || error); }
  return { ...result, durationMs, ...(billingMode ? { billingMode } : {}), ...(receipt?.id ? { receiptId: receipt.id } : {}), ...(receiptError ? { receiptError } : {}) };
}
