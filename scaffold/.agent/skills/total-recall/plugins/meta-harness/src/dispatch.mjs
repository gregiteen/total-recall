/** One path for every agent run: contain it if needed, dispatch it, classify the outcome, write its receipt. */
import { executeOnNode } from './executor.mjs';
import { classifyFailure, READ_ONLY_ADAPTERS } from './worker.mjs';
import { recordRunReceipt } from './learner.mjs';
import { isGitRepo, createWorktree, removeWorktree } from './worktree.mjs';

export async function dispatchWithReceipt(request, { dispatchFn, node = request.node || 'local', role, complexityScore, escalatedFrom, record = recordRunReceipt } = {}) {
  const started = Date.now();
  // A harness that cannot be told not to write does read-only work in a checkout that is thrown away.
  const contain = node === 'local' && request.permissions?.write !== true && !READ_ONLY_ADAPTERS.includes(request.agent) && request.isolated !== true && isGitRepo(request.cwd);
  let scratch = null, result;
  try {
    let effective = request;
    if (contain) {
      scratch = createWorktree(request.cwd, { prefix: 'meta-harness-readonly-' });
      effective = { ...request, cwd: scratch, contextCwd: request.contextCwd || request.cwd, isolated: true };
    }
    result = dispatchFn ? await dispatchFn(effective) : await executeOnNode(node, { ...effective, operation: 'dispatch' });
    if (contain) result = { ...result, readOnly: 'disposable-checkout' };
  } catch (error) {
    const message = String(error?.message || error);
    result = { ok: false, error: message, agent: request.agent, ...(error?.code === 'NOT_READY' ? { failureKind: 'not-ready' } : classifyFailure(message)) };
  } finally {
    if (scratch) removeWorktree(request.cwd, scratch);
  }
  const durationMs = Date.now() - started;
  // A finished run keeps its result: the worktree and any cost are real even when bookkeeping fails.
  let receiptError;
  try {
    await record({
    harness: request.agent, role, node, task: request.contextTask || request.prompt, complexityScore,
    model: result.model ?? null, exitCode: result.exitCode ?? null, finishedReason: result.finishedReason ?? null,
    success: result.ok === true, durationMs, failureKind: result.ok ? null : result.failureKind || 'agent',
    error: result.ok ? null : result.error, resetsAt: result.resetsAt, escalatedFrom,
    });
  } catch (error) { receiptError = String(error?.message || error); }
  return { ...result, durationMs, ...(receiptError ? { receiptError } : {}) };
}
