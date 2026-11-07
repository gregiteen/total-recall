/** One path for every agent run: contain it if needed, dispatch it, classify the outcome, write its receipt. */
import { executeOnNode } from './executor.mjs';
import { classifyFailure, INCLUDED_BILLING, READ_ONLY_ADAPTERS } from './worker.mjs';
import { recordRunReceipt } from './learner.mjs';
import { isGitRepo, createWorktree, removeWorktree } from './worktree.mjs';
import { includedAdmission, readIncludedPolicy } from './included-usage.mjs';
import { queueIncludedJob } from './usage-queue.mjs';

export async function dispatchWithReceipt(request, { dispatchFn, node = request.node || 'local', role, complexityScore, escalatedFrom,
  record = recordRunReceipt, replay, retryId, usagePolicy = readIncludedPolicy, admit = includedAdmission } = {}) {
  const started = Date.now();
  // A harness that cannot be told not to write does read-only work in a checkout that is thrown away.
  const contain = node === 'local' && request.permissions?.write !== true && !READ_ONLY_ADAPTERS.includes(request.agent) && request.isolated !== true && isGitRepo(request.cwd);
  let scratch = null, result, policy, launchPrevented = false;
  try {
    let effective = request;
    policy = await usagePolicy();
    if (policy.enabled && node === 'local') {
      const admission = await admit(request.agent, request.cwd, policy);
      if (!admission.ok) {
        result = { ...admission, agent: request.agent, exitCode: null };
        launchPrevented = true;
      } else effective = { ...request, [INCLUDED_BILLING]: { key: admission.key } };
    }
    if (!result) {
      if (contain) {
        scratch = createWorktree(request.cwd, { prefix: 'meta-harness-readonly-' });
        effective = { ...effective, cwd: scratch, contextCwd: request.contextCwd || request.cwd, isolated: true };
      }
      result = dispatchFn ? await dispatchFn(effective) : await executeOnNode(node, { ...effective, operation: 'dispatch' });
      if (contain) result = { ...result, readOnly: 'disposable-checkout' };
    }
  } catch (error) {
    const message = String(error?.message || error);
    result = { ok: false, error: message, agent: request.agent, ...(error?.code === 'NOT_READY' ? { failureKind: 'not-ready' } : classifyFailure(message)) };
  } finally {
    if (scratch) removeWorktree(request.cwd, scratch);
  }
  const durationMs = Date.now() - started;
  if (result.execution?.receiptOwner === 'destination' && result.receiptId) return { ...result, durationMs };
  if (result.execution?.remote && (result.queued || result.launchPrevented)) return { ...result, durationMs };
  if (policy?.enabled && node === 'local' && result.failureKind === 'quota') {
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
  if (launchPrevented) return { ...result, launchPrevented, durationMs };
  // A finished run keeps its result: the worktree and any cost are real even when bookkeeping fails.
  let receipt, receiptError;
  try {
    receipt = await record({
    harness: request.agent, role, node, task: request.contextTask || request.prompt, complexityScore,
      billingMode: policy?.enabled ? 'included' : null,
    model: result.model ?? null, exitCode: result.exitCode ?? null, finishedReason: result.finishedReason ?? null,
    success: result.ok === true, durationMs, failureKind: result.ok ? null : result.failureKind || 'agent',
    error: result.ok ? null : result.error, resetsAt: result.resetsAt, escalatedFrom,
    });
  } catch (error) { receiptError = String(error?.message || error); }
  return { ...result, durationMs, ...(receipt?.id ? { receiptId: receipt.id } : {}), ...(receiptError ? { receiptError } : {}) };
}
