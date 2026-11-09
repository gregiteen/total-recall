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
import { isGitRepo, isDirty, pushBranch, createWorktree, removeWorktree, commitAll, linkDependencies, deleteBranch, provideDependencies } from './worktree.mjs';
import { forwardRemoteOperation } from './remote-operation.mjs';
import { queueIncludedJob } from './usage-queue.mjs';
import { configDir } from './paths.mjs';
import path from 'node:path';
import { cancellationResult } from './worker.mjs';
import { executeCodeReview, reviewBlocksPush } from './review.mjs';
import { sessionOptions } from './session/run.mjs';
import fs from 'node:fs';
import { jobPaths } from './control.mjs';

// A routed attempt gets time in proportion to the work the route measured (A-101); --timeout-ms overrides.
export const ROUTED_TIMEOUT_MS = { local: 15 * 60_000, budget: 30 * 60_000, frontier: 90 * 60_000 };

/**
 * What Metaharness itself recorded about this job, for the reviewer (A-122): questions the agent
 * asked, the operator's replies, the goal check and the gate. The reviewer sees only the diff
 * otherwise and cannot verify claims about how the job ran.
 */
export function reviewEvidence(jobId, attempt = {}) {
  const evidence = { goalCheck: attempt.goalCheck ?? null, gate: attempt.gate ? { status: attempt.gate.status, passed: attempt.gate.passed } : null, questions: [], replies: [] };
  if (!jobId) return evidence;
  let paths;
  try { paths = jobPaths(jobId); } catch { return evidence; }
  const lines = file => { try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };
  for (const e of lines(paths.events)) if (e.kind === 'question') evidence.questions.push({ requestId: e.requestId, questions: e.questions || e.text, source: e.source, t: e.t });
  for (const c of lines(paths.inbox)) if (c.type === 'reply' || c.command === 'reply') evidence.replies.push({ requestId: c.requestId || null, text: c.text, t: c.t });
  return evidence;
}

export async function executeRoutedTask(task, options = {}) {
  if (cancellationResult()) return cancellationResult();
  const remote = await forwardRemoteOperation('route', task, { ...options, execute: true });
  if (remote) return remote;
  if (options.node) localExecutionNode(options);
  const cwd = options.cwd || process.cwd();
  const controls = sessionOptions({ ...options, cwd });
  if (!isGitRepo(cwd)) throw new Error('Routed execution writes on its own branch, so it must run inside a git repository');
  const route = options.route || await routeTask(task, options);
  const replay = { kind: 'route', gate: options.gate === true, gateOptions: options.gateOptions, controls };
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
  let harness = route.selected, diagnostic = null, previous = null, carried = null;
  const timeoutMs = options.timeoutMs || ROUTED_TIMEOUT_MS[route.tier] || ROUTED_TIMEOUT_MS.budget;

  for (let index = 1; index <= maxAttempts && harness; index += 1) {
    if (cancellationResult()) return { route, attempts, alerts, ...cancellationResult() };
    tried.add(harness);
    const branch = `meta-harness/${id}-${index}-${harness}`;
    // An escalation continues from the previous attempt's unfinished work instead of starting over (A-102).
    const directory = createWorktree(cwd, { branch, ...(carried ? { ref: carried } : {}) });
    // A-107: each attempt streams its agent's events here live; the path is announced first.
    const progressFile = options.progressDir === false ? undefined
      : path.join(options.progressDir || path.join(configDir(), 'jobs'), `${id}-${index}-${harness}.events.jsonl`);
    const attempt = { harness, branch: null, commit: null, gate: null, escalatedFrom: previous, ...(progressFile ? { progressFile } : {}) };
    attempts.push(attempt);
    if (progressFile) console.error(JSON.stringify({ progress: progressFile, attempt: index, harness }));
    // A-109: the agent gets the repository's dependencies in its own checkout, so its tests run.
    let stopped;
    try {
      attempt.dependencies = (options.provideDependencies || provideDependencies)(cwd, directory);
      const prompt = `Work only in this checkout. Do not commit; the harness commits your changes.\nTask:\n${task}${diagnostic ? `\n\nA previous attempt by ${previous} failed. Diagnostic:\n${diagnostic}` : ''}`;
      const result = await dispatchWithReceipt({ agent: harness, node, branch, cwd: directory, contextCwd: cwd, contextTask: task, prompt, permissions: { read: true, write: true }, timeoutMs,
        ...controls, goal: controls.goal || task,
        ...(progressFile ? { progressFile } : {}), allowUnknownAuth: options.allowUnknownAuth === true }, { dispatchFn: options.dispatchFn, role: 'Routed', complexityScore: route.complexity?.score, escalatedFrom: previous, replay, retryId: options.retryId });
      attempt.ok = result.ok === true;
      if (result.cancelled) stopped = result;
      attempt.durationMs = result.durationMs;
      attempt.timeoutMs = timeoutMs;
      attempt.output = result.response || result.partialOutput || null;
      if (result.sessionId) { attempt.sessionId = result.sessionId; attempt.branch = branch; }
      attempt.goalCheck = result.goalCheck;
      attempt.structured = result.structured;
      attempt.usage = result.usage;
      if (!attempt.ok && result.stderr) attempt.stderr = result.stderr;
      if (result.ok) {
        attempt.commit = commitAll(directory, `meta-harness: ${task.slice(0, 60)}\n\nAgent: ${harness}`);
        if (attempt.commit) attempt.branch = branch;
        // Keep the session branch even when the goal required no repository edit.
        else if (result.sessionId) attempt.branch = branch;
      } else {
        attempt.error = result.error;
        attempt.failureKind = result.failureKind;
        if (result.queued || result.queueError || (result.failureKind === 'quota' && options.retryId) || ['billing-policy', 'limit', 'interrupted'].includes(result.failureKind)) stopped = result;
      }
      if (attempt.ok && options.gate && !cancellationResult()) {
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
      if (attempt.ok && attempt.commit && !cancellationResult()) {
        attempt.review = await (options.reviewFn || executeCodeReview)({ cwd, author: harness, task,
          evidence: reviewEvidence(options.jobId || process.env.TR_METAHARNESS_JOB, attempt),
          target: `HEAD...${attempt.commit}`, dispatchFn: options.dispatchFn, reviewer: options.reviewer,
          allowUnknownAuth: options.allowUnknownAuth === true, availableHarnesses: options.availableHarnesses });
        if (reviewBlocksPush(attempt.review)) {
          attempt.ok = false; attempt.failureKind = 'review';
          attempt.error = attempt.review.error || JSON.stringify(attempt.review.review?.findings || []) || 'Review blocked the push.';
        }
      }
    } catch (error) {
      attempt.ok = false;
      attempt.error = String(error.message);
    } finally {
      if (cancellationResult()) {
        Object.assign(attempt, cancellationResult());
        stopped = cancellationResult();
      }
      // A failed attempt's edits are kept as an unfinished commit on its branch for review and for the
      // next attempt to continue from; only an attempt that changed nothing loses its branch (A-102).
      if (!attempt.ok && !attempt.commit) {
        let wip = null;
        try { wip = commitAll(directory, `meta-harness: unfinished attempt by ${harness}\n\n${String(attempt.error || '').slice(0, 300)}`); }
        catch (error) { attempt.wipError = String(error.message); }
        if (wip) { attempt.wip = wip; attempt.branch = branch; carried = wip; }
      } else if (!attempt.ok && attempt.commit) carried = attempt.commit;
      // Edits that could not be committed are never deleted (A-114): the checkout and branch stay for recovery.
      if (attempt.wipError && isDirty(directory)) { attempt.keptWorktree = directory; attempt.branch = branch; }
      else {
        removeWorktree(cwd, directory);
        if (!attempt.ok && !attempt.wip && !attempt.commit && !attempt.sessionId) { deleteBranch(cwd, branch); attempt.branch = null; }
      }
    }

    if (stopped?.cancelled) return { ...stopped, route, attempts, alerts, branch: attempt.branch, commit: attempt.commit, wip: attempt.wip, harness };
    if (attempt.ok) {
      const push = options.push === false ? { pushed: false, reason: 'push disabled for this run' } : pushBranch(cwd, attempt.branch);
      return { ok: true, route, goalCheck: attempt.goalCheck, structured: attempt.structured, review: attempt.review,
        gateApplied: Boolean(options.gate), branch: attempt.branch, commit: attempt.commit, push, harness, attempts, alerts };
    }
    if (stopped) return { ...stopped, route, attempts, alerts };

    const remaining = pool.filter(item => !tried.has(item));
    const next = remaining.length ? evaluateGateCascade(harness, { testsPassed: false }, remaining) : null;
    diagnostic = attempt.gate?.summary || attempt.error || 'The previous attempt failed.';
    previous = harness;
    harness = next?.recommendedHarness && !tried.has(next.recommendedHarness) ? next.recommendedHarness : null;
    if (harness) alerts.push(await notifyAlert({ title: 'Metaharness: escalating', message: `${previous} failed on "${task.slice(0, 60)}"; escalating to ${harness}.`, severity: 'warning' }));
  }
  return { ok: false, route, gateApplied: Boolean(options.gate), attempts, alerts, error: 'No attempt passed.' };
}
