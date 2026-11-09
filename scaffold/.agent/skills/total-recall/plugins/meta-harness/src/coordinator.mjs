/**
 * Multi-agent coordination.
 * Pipeline: Explorer -> Architect -> Implementer -> Verifier. Writing happens only on a dedicated
 * branch in its own worktree, and the Verifier inspects that exact commit from a different model
 * family. Nothing merges into the operator's branch; the branch is the deliverable.
 */
import { recordRunReceipt } from './learner.mjs';
import { classifyTaskComplexity, synthesizeOneWayValve } from '../capability/index.mjs';
import { notifyAlert } from './alerts.mjs';
import { dispatchWithReceipt } from './dispatch.mjs';
import { queueIncludedJob } from './usage-queue.mjs';
import { resolvePool, localExecutionNode } from './pool.mjs';
import { createThread, appendThreadTurn, updateThread } from './threads.mjs';
import { executeCodeReview } from './review.mjs';
import { isGitRepo, isDirty, headCommit, createWorktree, removeWorktree, commitAll, diffBetween, linkDependencies, deleteBranch } from './worktree.mjs';
import { lastJsonWith } from './json-reply.mjs';
import { runQualityGate } from './gate.mjs';
import { forwardRemoteOperation } from './remote-operation.mjs';
import { cancellationResult } from './worker.mjs';
import { sessionOptions } from './session/run.mjs';

const OPEN_THREADS = new Set();
const MAX_BLUEPRINT = 20000;
/** A stopped pipeline must not leave its thread reading as active. */
export function failOpenThreads(summary = 'The run was stopped before it finished.') {
  for (const id of OPEN_THREADS) { try { updateThread(id, { status: 'failed', summary }); } catch { /* the thread store reports its own failure */ } }
  OPEN_THREADS.clear();
}

export function assignPipelineRoles(pool = [], options = {}) {
  const sorted = [...pool].sort((a, b) => b.qualityScore - a.qualityScore);
  const findById = id => {
    const harness = sorted.find(h => h.id === id);
    if (!harness) throw new Error(`Selected harness ${id} is not ready for this task`);
    return harness;
  };
  // The session's own harness leads only when it can take work; TR_ACTIVE_HARNESS is advisory.
  const active = process.env.TR_ACTIVE_HARNESS;
  const orchestrator = options.orchestrator ? findById(options.orchestrator) : sorted.find(h => h.id === active) || sorted[0] || null;
  if (!orchestrator) return { orchestrator: null, explorer: null, architect: null, implementer: null, verifier: null, heterogeneousFamilies: false };

  const byCost = [...pool].sort((a, b) => a.costScore - b.costScore);
  const explorer = options.explorer ? findById(options.explorer) : byCost.find(h => h.id !== orchestrator.id) || orchestrator;
  const architect = options.architect ? findById(options.architect) : orchestrator;
  const implementer = options.implementer ? findById(options.implementer) : sorted.find(h => h.id !== explorer.id && h.id !== architect.id) || sorted.find(h => h.id !== architect.id) || architect;
  const verifier = options.verifier ? findById(options.verifier) : sorted.find(h => h.family !== implementer.family) || null;
  return { orchestrator, explorer, architect, implementer, verifier, heterogeneousFamilies: Boolean(verifier) && verifier.family !== implementer.family };
}

/** The agent must state a verdict. Silence or an unreadable answer is not a pass. */
export function parseVerification(response) {
  const parsed = lastJsonWith(response, 'verdict');
  const verdict = String(parsed?.verdict).toUpperCase();
  if (['PASS', 'FAIL'].includes(verdict)) return { parsed: true, verdict, findings: Array.isArray(parsed.findings) ? parsed.findings : [] };
  return { parsed: false, verdict: 'UNREADABLE', findings: [] };
}
export function parseVote(response) {
  const parsed = lastJsonWith(response, 'vote');
  const vote = String(parsed?.vote).toUpperCase();
  return ['APPROVE', 'REJECT'].includes(vote) ? { vote, reason: parsed.reason || null } : { vote: 'ABSTAIN', reason: null };
}

const stageOf = (role, harness, permissions, action, extra = {}) => ({ role, harness: harness?.id || null, harnessName: harness?.name || null, modelFamily: harness?.family || null, permissions, action, status: 'planned', output: null, ...extra });
const READ = { read: true, write: false };
const WRITE = { read: true, write: true };

function buildStages(roles, withSubagents) {
  const stages = [];
  if (withSubagents) stages.push(stageOf('Explorer', roles.explorer, READ, 'Find the relevant files, symbols and interfaces.', { contextDigest: null }));
  stages.push(stageOf('Architect', roles.architect, READ, 'Produce the blueprint, file list and verification steps.'));
  stages.push(stageOf('Implementer', roles.implementer, WRITE, 'Write the code and tests on a dedicated branch in its own worktree.'));
  stages.push(stageOf('Verifier', roles.verifier, READ, 'Audit the implementation commit from a different model family.', { worktreeIsolated: true, passed: null }));
  return stages;
}

async function runPipeline(task, poolInfo, options) {
  const started = Date.now();
  const pool = poolInfo.ready;
  const roles = assignPipelineRoles(pool, options);
  const cwd = options.cwd || process.cwd();
  const execute = options.execute === true;
  const withSubagents = options.subagents !== false;
  const stages = roles.orchestrator ? buildStages(roles, withSubagents) : [];
  const base = { mode: 'pipeline', task, orchestrator: roles.orchestrator?.id || null, executedLive: execute, excluded: poolInfo.excluded, heterogeneousFamiliesVerified: roles.heterogeneousFamilies, stages };

  if (!execute) {
    const blockers = [];
    if (!roles.orchestrator) blockers.push('No harness can take work right now.');
    else if (!roles.heterogeneousFamilies) blockers.push('Only one model family is available, so no independent Verifier exists.');
    return { ...base, ok: blockers.length === 0, threadId: null, blockers };
  }
  if (!roles.orchestrator) throw new Error(`No harness can take work right now: ${poolInfo.excluded.map(e => `${e.harness} (${e.reason})`).join(', ') || 'none installed'}`);
  if (!roles.heterogeneousFamilies && options.allowSameFamily !== true) throw new Error('Refusing to run: only one model family is available, so no independent Verifier exists. Pass --allow-same-family to accept self-review.');
  if (!isGitRepo(cwd)) throw new Error('A pipeline writes on its own branch, so it must run inside a git repository');

  const verifier = roles.verifier || roles.implementer;
  const complexity = classifyTaskComplexity(task);
  // Validate the repository before creating lifecycle state: an unborn repository has no usable base.
  const baseCommit = headCommit(cwd);
  const warnings = isDirty(cwd) ? ['The working tree has uncommitted changes; the branch starts from the last commit and does not include them.'] : [];
  const thread = createThread({ title: task.slice(0, 80), task, platform: roles.orchestrator.id, model: roles.orchestrator.name, status: 'active' });
  OPEN_THREADS.add(thread.id);
  const branch = options.branch || `meta-harness/${thread.id}`;
  const run = async (stage, harness, prompt, { workdir = cwd, permissions, role = stage.role } = {}) => {
    stage.status = 'running';
    const result = await dispatchWithReceipt({ agent: harness.id, node: 'local', cwd: workdir, contextCwd: cwd, contextTask: task, prompt,
      ...sessionOptions({ ...options, cwd }), goal: stage.role === 'Implementer' ? options.goal || task : prompt.slice(0, 4000),
      permissions: permissions || stage.permissions, allowUnknownAuth: options.allowUnknownAuth === true }, { dispatchFn: options.dispatchFn, role, complexityScore: complexity.score });
    stage.status = result.cancelled ? 'cancelled' : result.ok ? 'completed' : result.queued ? 'queued' : 'failed';
    stage.output = result.response || result.error || null;
    for (const key of ['goalCheck', 'structured', 'sessionId', 'progressFile', 'usage']) if (result[key] !== undefined) stage[key] = result[key];
    stage.failureKind = result.ok ? undefined : result.failureKind;
    if (result.queueId) stage.queueId = result.queueId;
    appendThreadTurn(thread.id, { role: role.toLowerCase(), agent: harness.id, content: stage.output || '' });
    return result;
  };

  let ok = true, commit = null, implementerDir = null, gate = null;
  const stage = role => stages.find(item => item.role === role);
  try {
    let digest = '';
    if (withSubagents) {
      const explorer = await run(stage('Explorer'), roles.explorer, `[ROLE: EXPLORER]\nDo not change any file. Find the files, symbols and interfaces relevant to this task:\n${task}`);
      if (!explorer.ok) { ok = false; return finish(); }
      digest = synthesizeOneWayValve(explorer.response, { maxChars: 2000 });
      stage('Explorer').contextDigest = digest;
    }
    const architect = await run(stage('Architect'), roles.architect, `[ROLE: ARCHITECT]\nDo not change any file. Task:\n${task}\n\nExplorer digest:\n${digest || 'None.'}\n\nProduce a concise blueprint, the files to change, and how to verify the result.`);
    if (!architect.ok) { ok = false; return finish(); }
    const blueprint = architect.response.length > MAX_BLUEPRINT ? `${architect.response.slice(0, MAX_BLUEPRINT)}\n[Blueprint shortened to ${MAX_BLUEPRINT} characters.]` : architect.response;

    implementerDir = createWorktree(cwd, { branch });
    const implementer = await run(stage('Implementer'), roles.implementer, `[ROLE: IMPLEMENTER]\nWork only in this checkout. Implement the task and its tests. Do not commit; the harness commits your changes.\nTask:\n${task}\n\nBlueprint:\n${blueprint}`, { workdir: implementerDir });
    if (!implementer.ok) { ok = false; return finish(); }
    commit = commitAll(implementerDir, `meta-harness: ${task.slice(0, 60)}\n\nImplementer: ${roles.implementer.id}`);
    if (!commit) commit = baseCommit;
    stage('Implementer').commit = commit;
    updateThread(thread.id, { branch, worktreePath: null });

    if (options.gate) {
      linkDependencies(cwd, implementerDir);
      gate = await (options.gateFn || runQualityGate)(implementerDir, options.gateOptions);
      if (cancellationResult()) { ok = false; return finish(); }
      if (!gate.passed) { ok = false; stage('Verifier').status = 'skipped'; stage('Verifier').output = `Quality gate did not pass: ${gate.summary}`; return finish(); }
    }

    const diff = diffBetween(cwd, baseCommit, commit);
    const verifyDir = createWorktree(cwd, { ref: commit, prefix: 'meta-harness-verify-' });
    try {
      const verification = await run(stage('Verifier'), verifier, `[ROLE: INDEPENDENT VERIFIER]\nYou did not write this code. Do not change any file. Run the checks you can and audit commit ${commit} for this task:\n${task}\n\nBlueprint:\n${blueprint}\n\nDiff${diff.length > 30000 ? ' (first 30000 characters; read the rest from this checkout)' : ''}:\n${diff.slice(0, 30000)}\n\nEnd your reply with exactly one JSON object: {"verdict":"PASS"|"FAIL","findings":["..."]}`, { workdir: verifyDir });
      const parsed = verification.ok ? parseVerification(verification.response) : { parsed: false, verdict: 'NOT_RUN', findings: [] };
      Object.assign(stage('Verifier'), { commit, verdict: parsed.verdict, findings: parsed.findings, passed: parsed.verdict === 'PASS' });
      if (parsed.verdict !== 'PASS') { ok = false; return finish(); }
    } finally { removeWorktree(cwd, verifyDir); }

    if (options.autoReview) {
      const review = await executeCodeReview({ cwd, author: roles.implementer.id, threadId: thread.id, task, target: `${baseCommit}...${commit}`, dispatchFn: options.dispatchFn, reviewer: options.reviewer, allowUnknownAuth: options.allowUnknownAuth === true, availableHarnesses: options.availableHarnesses });
      stages.push({ role: 'Reviewer', harness: review.review?.reviewer || null, status: review.ok ? 'completed' : 'failed', verdict: review.review?.verdict || null, riskScore: review.review?.riskScore ?? null, output: review.review?.summary || review.error || null });
      if (!review.ok || review.review?.verdict !== 'APPROVE') ok = false;
    }
    return finish();
  } catch (error) {
    // An infrastructure failure (git, a refused commit) must still close the thread and report.
    ok = false;
    const current = stages.find(item => ['running', 'planned'].includes(item.status));
    if (current) Object.assign(current, { status: 'failed', failureKind: 'process', output: String(error.message) });
    return finish();
  } finally {
    removeWorktree(cwd, implementerDir);
    if (implementerDir && (!commit || (!ok && !cancellationResult()))) deleteBranch(cwd, branch);
  }

  function finish() {
    const cancelled = cancellationResult();
    if (cancelled) {
      ok = false;
      if (implementerDir) commit = commitAll(implementerDir, 'meta-harness: unfinished pipeline from a cancelled job') || commit;
    }
    return (async () => {
      for (const item of stages) if (item.status === 'planned') item.status = 'skipped';
      OPEN_THREADS.delete(thread.id);
      updateThread(thread.id, { status: ok ? 'completed' : 'failed', branch: (ok || cancelled) && commit ? branch : null, commit, baseCommit });
      const alert = cancelled ? null : await notifyAlert({ title: ok ? 'Metaharness: pipeline passed' : 'Metaharness: pipeline failed', message: `${task.slice(0, 80)}${commit ? ` (branch ${branch})` : ''}`, severity: ok ? 'info' : 'warning' });
      const limited = stages.find(item => item.failureKind === 'limit');
      return { ...base, ok, ...cancelled, ...(limited ? { failureKind: 'limit', error: limited.output } : {}), goalCheck: stage('Implementer')?.goalCheck, structured: stage('Implementer')?.structured,
        sessionId: stage('Implementer')?.sessionId, progressFile: stage('Implementer')?.progressFile,
        threadId: thread.id, branch: (ok || cancelled) && commit ? branch : null, commit, baseCommit, gate, warnings, durationMs: Date.now() - started, alert };
    })();
  }
}

async function runCouncil(task, poolInfo, options) {
  // One seat per model family, strongest first, so the seats can actually disagree.
  const families = new Set();
  const seats = options.harnesses || [...poolInfo.ready].sort((a, b) => b.qualityScore - a.qualityScore).filter(h => !families.has(h.family) && families.add(h.family)).slice(0, 3).map(h => h.id);
  if (options.execute !== true) return { ok: seats.length > 0, mode: 'council', task, executedLive: false, consensus: 'planned', excluded: poolInfo.excluded, votes: seats.map(harness => ({ harness, status: 'planned' })) };
  if (!seats.length) throw new Error('No harness can take work right now');
  const cwd = options.cwd || process.cwd();
  const votes = await Promise.all(seats.map(async harness => {
    const result = await dispatchWithReceipt({ agent: harness, node: 'local', cwd, contextTask: task, ...sessionOptions({ ...options, cwd }), prompt: `[ROLE: COUNCIL MEMBER]\nDo not change any file. Assess this proposal, with its trade-offs and risks:\n${task}\n\nEnd your reply with exactly one JSON object: {"vote":"APPROVE"|"REJECT","reason":"..."}`, permissions: READ, allowUnknownAuth: options.allowUnknownAuth === true }, { dispatchFn: options.dispatchFn, role: 'Council' });
    return { harness, ok: result.ok === true, failureKind: result.failureKind, ...(result.ok ? parseVote(result.response) : { vote: 'ABSTAIN', reason: null, error: result.error }),
      ...(result.queueId ? { queueId: result.queueId } : {}), feedback: result.response || null };
  }));
  const count = vote => votes.filter(item => item.vote === vote).length;
  const majority = votes.length / 2;
  const consensus = count('APPROVE') > majority ? 'approved' : count('REJECT') > majority ? 'rejected' : 'no-consensus';
  const limited = votes.some(item => item.failureKind === 'limit');
  return { ok: !limited && votes.some(item => item.ok), ...(limited ? { failureKind: 'limit' } : {}), ...cancellationResult(), mode: 'council', task, executedLive: true, consensus, excluded: poolInfo.excluded, votes };
}

async function runRace(task, poolInfo, options) {
  const seats = options.candidates || [...poolInfo.ready].sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 2).map(h => h.id);
  if (options.execute !== true) return { ok: seats.length > 1, mode: 'race', task, executedLive: false, excluded: poolInfo.excluded, candidates: seats.map(harness => ({ harness, status: 'planned' })) };
  if (seats.length < 2) throw new Error('A race needs at least two harnesses that can take work');
  if (!options.gate) return { ok: false, mode: 'race', task, executedLive: false, verification: 'unverified', gateApplied: false, error: 'A race requires a deterministic quality gate before any candidate can win.' };
  const cwd = options.cwd || process.cwd();
  if (!isGitRepo(cwd)) throw new Error('A race writes on separate branches, so it must run inside a git repository');
  const id = `race-${Date.now().toString(36)}`;
  const entries = await Promise.all(seats.map(async harness => {
    const branch = `meta-harness/${id}-${harness}`;
    let directory;
    let keep = false;
    try {
      const started = Date.now();
      directory = createWorktree(cwd, { branch });
      const result = await dispatchWithReceipt({ agent: harness, node: 'local', cwd: directory, contextCwd: cwd, contextTask: task, ...sessionOptions({ ...options, cwd }), goal: options.goal || task, prompt: `[ROLE: IMPLEMENTER]\nWork only in this checkout. Implement the task and its tests. Do not commit.\nTask:\n${task}`, permissions: WRITE, allowUnknownAuth: options.allowUnknownAuth === true }, { dispatchFn: options.dispatchFn, role: 'Race' });
      const commit = result.ok || result.cancelled ? commitAll(directory, `meta-harness race: ${task.slice(0, 60)}\n\nAgent: ${harness}`) : null;
      if (result.cancelled) {
        keep = Boolean(commit);
        return { ...result, harness, branch: keep ? branch : null, wip: commit };
      }
      if (result.ok && options.gate) linkDependencies(cwd, directory);
      const gate = result.ok ? await (options.gateFn || runQualityGate)(directory, options.gateOptions) : null;
      if (cancellationResult()) {
        keep = Boolean(commit);
        return { ...cancellationResult(), harness, branch: keep ? branch : null, commit };
      }
      keep = result.ok === true && gate?.passed === true;
      return { harness, branch: keep ? branch : null, commit: keep ? commit : null, ok: keep, gate, goalCheck: result.goalCheck, structured: result.structured, failureKind: result.failureKind, completedAt: Date.now(), durationMs: Date.now() - started, error: result.ok ? keep ? undefined : 'The quality gate failed' : result.error,
        ...(result.queueId ? { queueId: result.queueId } : {}) };
    } catch (error) {
      return { harness, branch: null, commit: null, ok: false, gate: null, durationMs: null, error: String(error.message) };
    } finally {
      removeWorktree(cwd, directory);
      if (!keep) deleteBranch(cwd, branch);
    }
  }));
  const finishers = entries.filter(entry => entry.ok).sort((a, b) => a.completedAt - b.completedAt);
  const limited = entries.some(item => item.failureKind === 'limit');
  return { ok: !limited && finishers.length > 0, ...(limited ? { failureKind: 'limit' } : {}), ...cancellationResult(), mode: 'race', task, executedLive: true, gateApplied: true, verification: !limited && finishers.length ? 'passed' : 'failed', winner: limited ? null : finishers[0]?.harness || null, excluded: poolInfo.excluded, candidates: entries };
}

export async function coordinateTask(taskDescription, options = {}) {
  if (cancellationResult()) return cancellationResult();
  const task = String(taskDescription || '').trim();
  if (!task) throw new Error('Task description is required for coordination');
  const remote = await forwardRemoteOperation('coordinate', task, options);
  if (remote) return remote;
  const mode = options.mode || 'pipeline';
  if (!['pipeline', 'orchestrate', 'council', 'race'].includes(mode)) throw new Error(`Unsupported coordination mode: ${mode}`);
  localExecutionNode(options);
  const poolInfo = await resolvePool(options);
  const wall = poolInfo.excluded.find(item => item.failureKind === 'quota');
  const minimum = mode === 'race' || ((mode === 'pipeline' || mode === 'orchestrate') && options.allowSameFamily !== true) ? 2 : 1;
  if (options.execute === true && wall && poolInfo.ready.length < minimum) {
    const blocked = { ok: false, failureKind: 'quota', error: 'Coordination is waiting for included usage.', resetsAt: wall.resetsAt };
    const job = await queueIncludedJob({ agent: wall.harness, cwd: options.cwd || process.cwd(), prompt: task }, blocked,
      { role: 'Coordinate', launchPrevented: true });
    return { ...blocked, mode, executedLive: false, queued: true, queueId: job.id, needsReview: job.needsReview };
  }
  if (mode === 'council') return runCouncil(task, poolInfo, options);
  if (mode === 'race') return runRace(task, poolInfo, options);
  return runPipeline(task, poolInfo, options);
}
