/** SSSS-backed queue for work deferred by included usage limits. */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { configDir } from './paths.mjs';
import { destinationDispatchRequest } from './dispatch-request.mjs';
import { readIncludedPolicy } from './included-usage.mjs';

async function queueStore() {
  const { PluginStateStore } = await import('./ssss-store.mjs');
  return new PluginStateStore(path.join(configDir(), 'usage-queue.json'), 'meta-harness');
}

function readRows(store) {
  const jobs = store.read([]);
  if (!Array.isArray(jobs) || jobs.some(job => !job?.id || typeof job.task !== 'string' || !path.isAbsolute(job.workspace || '') ||
      !['waiting', 'running', 'completed', 'cancelled', 'failed'].includes(job.status))) {
    throw new Error('Invalid included usage queue.');
  }
  return jobs;
}

async function mutateQueue(change) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const store = await queueStore();
    const jobs = readRows(store);
    const result = change(jobs);
    try { store.write(jobs); return result; }
    catch (error) { if (!error.message.includes('version conflict') || attempt === 7) throw error; }
  }
}

function publicJob({ replay, task, ...job }) {
  return { ...job, task: task.slice(0, 160), canRetry: Boolean(replay) && !job.needsReview };
}

export async function queueIncludedJob(request, result, { role, replay, launchPrevented = false } = {}) {
  const workspace = request.contextCwd || request.cwd;
  const direct = !replay && role === 'Dispatch' && workspace === request.cwd;
  if (direct) replay = { kind: 'dispatch', request: destinationDispatchRequest(request) };
  const job = {
    id: randomUUID(), status: 'waiting', agent: request.agent, workspace, role: role || 'Dispatch',
    task: String(request.contextTask || request.prompt).slice(0, direct ? 160 : 65536),
    reason: 'included-usage-exhausted',
    resetsAt: Number.isFinite(Date.parse(result.resetsAt)) ? result.resetsAt : null,
    queuedAt: new Date().toISOString(), attempts: 0,
    needsReview: !replay || (!launchPrevented && request.permissions?.write === true),
    replay: replay || null,
  };
  return mutateQueue(jobs => {
    if (jobs.filter(item => ['waiting', 'running'].includes(item.status)).length >= 200) throw new Error('Included usage queue is full.');
    const history = jobs.filter(item => !['waiting', 'running'].includes(item.status)).slice(0, -50);
    for (const item of history) jobs.splice(jobs.indexOf(item), 1);
    jobs.push(job);
    if (Buffer.byteLength(JSON.stringify(jobs)) > 4 * 1024 * 1024) throw new Error('Included usage queue exceeds its storage bound.');
    return publicJob(job);
  });
}

export async function listIncludedJobs() {
  const jobs = readRows(await queueStore());
  return jobs.map(publicJob);
}

function updateJob(jobs, id, change) {
  const index = jobs.findIndex(job => job.id === id);
  if (index < 0) throw new Error('Included usage job was not found.');
  return jobs[index] = change(jobs[index]);
}

export async function cancelIncludedJob(id) {
  return mutateQueue(jobs => publicJob(updateJob(jobs, id, job => {
    if (job.status !== 'waiting') throw new Error('Only a waiting job can be cancelled.');
    return { ...job, status: 'cancelled', replay: null };
  })));
}

/** Claim atomically before retry, so two callers cannot start the same job. */
export async function retryIncludedJob(id, { dispatch, route, now = Date.now() } = {}) {
  if (!(await readIncludedPolicy()).enabled) throw new Error('Included usage policy must be enabled to retry.');
  const claimed = await mutateQueue(jobs => updateJob(jobs, id, job => {
    if (job.status !== 'waiting') throw new Error('Only a waiting job can be retried.');
    if (job.needsReview || !job.replay) throw new Error('Review the prior attempt and resubmit this task from its original workspace.');
    if (Date.parse(job.resetsAt) > now) throw new Error('The provider-reported reset time has not arrived.');
    return { ...job, status: 'running', attempts: job.attempts + 1, startedAt: new Date(now).toISOString() };
  }));
  let result;
  try {
    if (claimed.replay.kind === 'dispatch') {
      dispatch ??= (await import('./dispatch.mjs')).dispatchWithReceipt;
      result = await dispatch(claimed.replay.request, { role: 'Dispatch', retryId: id });
    } else if (claimed.replay.kind === 'route') {
      route ??= (await import('./cascade.mjs')).executeRoutedTask;
      result = await route(claimed.task, { ...claimed.replay.controls, cwd: claimed.workspace, gate: claimed.replay.gate, gateOptions: claimed.replay.gateOptions,
        route: { selected: claimed.agent }, pool: [claimed.agent], retryId: id });
    } else throw new Error('Unknown included usage job operation.');
  } catch (error) {
    result = { ok: false, failureKind: 'execution', error: error.message };
  }
  const held = ['quota', 'billing-policy', 'auth'].includes(result.failureKind);
  const updated = await mutateQueue(jobs => updateJob(jobs, id, job => {
    if (job.status !== 'running') throw new Error('Included usage job lost its claim.');
    return { ...job, status: result.ok ? 'completed' : held ? 'waiting' : 'failed',
      resetsAt: held && Number.isFinite(Date.parse(result.resetsAt)) ? result.resetsAt : null,
      needsReview: job.needsReview || result.needsReview === true ||
        (held && !result.launchPrevented && (job.replay.kind === 'route' || job.replay.request?.permissions?.write === true)),
      lastError: result.ok ? null : result.error,
      replay: held ? job.replay : null, finishedAt: new Date().toISOString() };
  }));
  return { ...result, job: publicJob(updated) };
}
