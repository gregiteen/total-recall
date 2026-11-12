/** Thread state is canonical SSSS, mutated through the native kernel with optimistic concurrency. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { threadsFile } from './paths.mjs';
import { PluginStateStore } from './ssss-store.mjs';

const STATUSES = new Set(['active', 'review_pending', 'approved', 'completed', 'failed']);
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const storeForThreads = () => new PluginStateStore(threadsFile(), 'meta-harness');

function validateThreads(value) {
  if (!Array.isArray(value)) throw new Error('The thread store is corrupt: threads must be an array');
  const ids = new Set();
  for (const thread of value) {
    if (!thread || typeof thread !== 'object' || !identifier.test(thread.id || '') || ids.has(thread.id)
      || typeof thread.title !== 'string' || !STATUSES.has(thread.status) || !Array.isArray(thread.turns)
      || thread.turns.some(turn => !turn || typeof turn !== 'object' || typeof turn.content !== 'string')) {
      throw new Error('The thread store is corrupt: invalid thread identity, status or turns');
    }
    ids.add(thread.id);
  }
  return value;
}

/** Existing JSON is read only for migration. The first mutation imports it through SSSS; it is never overwritten. */
function readState(store) {
  let value;
  try { value = store.read(null); }
  catch (error) { throw new Error(`The canonical thread store is corrupt or unsafe: ${error.message}`); }
  if (value === null) {
    let content;
    try { content = fs.readFileSync(threadsFile(), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return { threads: [] }; throw error; }
    try { value = JSON.parse(content); }
    catch { throw new Error(`The thread store ${threadsFile()} is corrupt. It was left in place.`); }
  }
  const state = Array.isArray(value) ? { threads: value } : value;
  if (!state || typeof state !== 'object') throw new Error('The thread store is corrupt: missing thread state');
  validateThreads(state.threads);
  return state;
}

export const threadDocumentPath = () => storeForThreads().documentPath;
export function readThreads() { return readState(storeForThreads()).threads; }

/** Native SSSS owns the mutation guard and leases. CAS retries reload state; no age-based lock stealing. */
function mutate(work) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const store = storeForThreads();
    const state = readState(store);
    const result = work(state.threads, state);
    validateThreads(state.threads);
    try {
      store.write({ ...state, version: '2.0.0', updatedAt: new Date().toISOString(), threads: state.threads });
      return structuredClone(result);
    } catch (error) {
      if (!String(error.message).includes('version conflict') || attempt === 7) throw error;
    }
  }
}

export function writeThreads(threads) {
  validateThreads(threads);
  return mutate(current => { current.splice(0, current.length, ...structuredClone(threads)); return current; });
}

export function listThreads(filter = {}) {
  return readThreads().filter(thread => (!filter.platform || thread.platform === filter.platform)
    && (!filter.status || thread.status === filter.status) && (!filter.branch || thread.branch === filter.branch))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
export function getThread(id) { return readThreads().find(thread => thread.id === id) || null; }

export function createThread(data = {}) {
  const id = data.id || `thread-${crypto.randomUUID()}`;
  return mutate(threads => {
    if (threads.some(thread => thread.id === id)) throw new Error(`Thread already exists: ${id}`);
    const now = new Date().toISOString();
    const thread = {
      ...data, id, title: String(data.title || 'Untitled Agent Thread').slice(0, 140),
      task: String(data.task || data.title || '').trim(), platform: data.platform || 'universal', model: data.model || 'auto',
      branch: data.branch || null, worktreePath: data.worktreePath || null, prNumber: data.prNumber || null, prUrl: data.prUrl || null,
      status: data.status || 'active', createdAt: now, updatedAt: now,
      turns: Array.isArray(data.turns) ? data.turns : [], review: data.review || null, summary: data.summary || null,
    };
    threads.unshift(thread);
    return thread;
  });
}

export function appendThreadTurn(id, turn = {}) {
  return mutate(threads => {
    const thread = threads.find(item => item.id === id);
    if (!thread) throw new Error(`Thread not found: ${id}`);
    const now = new Date().toISOString();
    thread.turns.push({ role: turn.role || 'agent', agent: turn.agent || 'unknown', content: String(turn.content || '').slice(0, 50000), timestamp: now });
    thread.updatedAt = now;
    return thread;
  });
}

export function updateThread(id, updates = {}) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) throw new Error('Thread updates must be an object');
  return mutate(threads => {
    const index = threads.findIndex(thread => thread.id === id);
    if (index < 0) throw new Error(`Thread not found: ${id}`);
    threads[index] = { ...threads[index], ...updates, id, createdAt: threads[index].createdAt, updatedAt: new Date().toISOString() };
    return threads[index];
  });
}
export function closeThread(id, resolution = 'completed') { return updateThread(id, { status: resolution, closedAt: new Date().toISOString() }); }
export function deleteThread(id) {
  return mutate(threads => {
    const index = threads.findIndex(thread => thread.id === id);
    if (index < 0) return false;
    threads.splice(index, 1);
    return true;
  });
}

// Exact titles from test/threads.test.mjs and test/coordinator.test.mjs.
// Real multiply-job threads do not match, including failed end-to-end attempts.
const FIXTURE_TITLES = new Set([
  'Implement Multi-Platform Threads', 'Canonical state', 'concurrent',
  'Implement token bucket', 'task one', 'task two', 'task three', 'task four', 'failed verification',
]);
const CLEANUP_ID = 'a118-fixture-threads-v1';

/** Delete the known fixture titles once. The same SSSS operation records every removal. */
export function cleanupFixtureThreads({ dryRun = false } = {}) {
  const plan = (threads, state) => {
    const previous = state.cleanups?.find(row => row.id === CLEANUP_ID);
    if (previous) return { ok: true, alreadyApplied: true, record: previous };
    const removed = threads.filter(thread => FIXTURE_TITLES.has(thread.title))
      .map(({ id, title, status }) => ({ id, title, status }));
    const kept = threads.filter(thread => !FIXTURE_TITLES.has(thread.title)).map(thread => thread.id);
    return { ok: true, record: { id: CLEANUP_ID, timestamp: new Date().toISOString(), sources: ['test/threads.test.mjs', 'test/coordinator.test.mjs'], removed, kept } };
  };
  const state = readState(storeForThreads());
  const preview = plan(state.threads, state);
  if (dryRun || preview.alreadyApplied) return { ...preview, dryRun };
  return mutate((threads, current) => {
    const result = plan(threads, current);
    if (result.alreadyApplied) return result;
    const ids = new Set(result.record.removed.map(row => row.id));
    threads.splice(0, threads.length, ...threads.filter(thread => !ids.has(thread.id)));
    current.cleanups = [...(current.cleanups || []), result.record];
    return result;
  });
}
