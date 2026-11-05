/**
 * Meta Harness Multi-Platform Thread Manager
 * Unifies thread tracking and session supervision across integrated agent platforms:
 * agy, claude, codex, dsh, hermes, openclaw, cursor, devin, etc.
 *
 * Persists thread state, PR branch associations, turn history, and review status.
 */

import fs from 'node:fs';
import path from 'node:path';
import { threadsFile } from './paths.mjs';

/** A missing file is an empty store. A corrupt one is an error, so the next write cannot erase it. */
export function readThreads() {
  let content;
  try { content = fs.readFileSync(threadsFile(), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { throw new Error(`The thread store ${threadsFile()} is corrupt. It was left in place; repair or move it.`); }
  return Array.isArray(parsed) ? parsed : (parsed.threads || []);
}

/** Serialize read-modify-write across processes. A lock older than 30 seconds belongs to a dead process. */
function withLock(work) {
  const lock = `${threadsFile()}.lock`;
  fs.mkdirSync(path.dirname(lock), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 10000;
  for (;;) {
    try { fs.mkdirSync(lock); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 30000) { fs.rmdirSync(lock); continue; } } catch { continue; }
      if (Date.now() > deadline) throw new Error('The thread store is locked by another process');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try { return work(); } finally { fs.rmdirSync(lock); }
}

export function writeThreads(threads) {
  const file = threadsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const payload = {
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
    threads: Array.isArray(threads) ? threads : []
  };
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(payload, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export function listThreads(filter = {}) {
  const threads = readThreads();
  return threads
    .filter(t => {
      if (filter.platform && t.platform !== filter.platform) return false;
      if (filter.status && t.status !== filter.status) return false;
      if (filter.branch && t.branch !== filter.branch) return false;
      return true;
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function getThread(id) {
  const threads = readThreads();
  return threads.find(t => t.id === id) || null;
}

export function createThread(data = {}) {
  return withLock(() => {
  const threads = readThreads();
  const now = new Date().toISOString();
  const id = data.id || `thread-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const thread = {
    id,
    title: String(data.title || 'Untitled Agent Thread').slice(0, 140),
    task: String(data.task || data.title || '').trim(),
    platform: data.platform || 'universal',
    model: data.model || 'auto',
    branch: data.branch || null,
    worktreePath: data.worktreePath || null,
    prNumber: data.prNumber || null,
    prUrl: data.prUrl || null,
    status: data.status || 'active', // 'active' | 'review_pending' | 'approved' | 'completed' | 'failed'
    createdAt: now,
    updatedAt: now,
    turns: Array.isArray(data.turns) ? data.turns : [],
    review: data.review || null,
    summary: data.summary || null
  };

  threads.unshift(thread);
  writeThreads(threads);
  return thread;
  });
}

export function appendThreadTurn(id, turn = {}) {
  return withLock(() => {
  const threads = readThreads();
  const index = threads.findIndex(t => t.id === id);
  if (index === -1) throw new Error(`Thread not found: ${id}`);

  const now = new Date().toISOString();
  const entry = {
    role: turn.role || 'agent',
    agent: turn.agent || 'unknown',
    content: String(turn.content || '').slice(0, 50000),
    timestamp: now
  };

  threads[index].turns.push(entry);
  threads[index].updatedAt = now;
  writeThreads(threads);
  return threads[index];
  });
}

export function updateThread(id, updates = {}) {
  return withLock(() => {
  const threads = readThreads();
  const index = threads.findIndex(t => t.id === id);
  if (index === -1) throw new Error(`Thread not found: ${id}`);

  const now = new Date().toISOString();
  threads[index] = {
    ...threads[index],
    ...updates,
    id, // protect immutable ID
    updatedAt: now
  };

  writeThreads(threads);
  return threads[index];
  });
}

export function closeThread(id, resolution = 'completed') {
  return updateThread(id, {
    status: resolution,
    closedAt: new Date().toISOString()
  });
}

export function deleteThread(id) {
  return withLock(() => {
    const threads = readThreads();
    const filtered = threads.filter(t => t.id !== id);
    if (filtered.length === threads.length) return false;
    writeThreads(filtered);
    return true;
  });
}
