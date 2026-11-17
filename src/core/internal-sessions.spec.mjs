import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { INTERNAL_JOB_MARKER, isInternalTranscript, setLessonsPaused, isLessonsPaused } from './internal-sessions.mjs';
import { tickLessons, enqueueSessionReviews } from './lessons.mjs';
import { addTask, getTask, listTasks, resolveQueueDir } from './task-envelope.mjs';
import { dispatchTask } from './task-executors.mjs';
import { createScheduler } from './scheduler.mjs';
import { runPostMortem } from './post-mortem.mjs';

const LEGACY = 'You are a Session Post-Mortem Analyst for an AI memory system called Total Recall.';
const COMPLIANCE = 'You are a Rule Compliance Auditor for an AI memory system.';
const user = content => ({ role: 'user', content });
const said = content => ({ role: 'assistant', content });
let agent, brain;
beforeEach(() => {
  agent = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-internal-'));
  brain = path.join(agent, 'skills', 'total-recall');
  fs.mkdirSync(brain, { recursive: true });
});
afterEach(() => fs.rmSync(agent, { recursive: true, force: true }));
const transcript = (name, entries) => {
  const file = path.join(agent, `${name}.jsonl`);
  fs.writeFileSync(file, entries.map(entry => JSON.stringify(entry)).join('\n') + '\n');
  return file;
};
const sessions = () => fs.existsSync(path.join(brain, 'sessions')) ? fs.readdirSync(path.join(brain, 'sessions')) : [];

describe('internal transcript detection', () => {
  it('recognizes the marker and exact legacy roles only as the root prompt', () => {
    expect(isInternalTranscript([user(`${INTERNAL_JOB_MARKER}\nSummarize.`), said('ok')])).toBe(true);
    expect(isInternalTranscript([user(`${LEGACY}\n\nYour job…`)])).toBe(true);
    expect(isInternalTranscript([user(`${COMPLIANCE}\nAudit.`)])).toBe(true);
    expect(isInternalTranscript([user(`ready:true capsule…\nRequested task:\n${LEGACY}\n---`)])).toBe(true);
    expect(isInternalTranscript([user('<environment_context>cwd</environment_context>'), user(`${INTERNAL_JOB_MARKER} x`)])).toBe(true);
  });
  it('never excludes ordinary sessions that quote the prompts later or in tool output', () => {
    expect(isInternalTranscript([user('Why are reviews looping?'), said('Looking.'), user(`It says "${LEGACY}"`)])).toBe(false);
    expect(isInternalTranscript([user('Fix the daemon.'), { role: 'tool', content: `${INTERNAL_JOB_MARKER} ${LEGACY}` }])).toBe(false);
    expect(isInternalTranscript([user(`Please explain: ${LEGACY}`)])).toBe(false);
    expect(isInternalTranscript([])).toBe(false);
  });
});

describe('lesson hook and ingest exclusion', () => {
  it('refuses an inherited Metaharness environment before copying the transcript', () => {
    const file = transcript('child', [user('Do work.'), said('Done.')]);
    const result = tickLessons({ brainDir: brain, sessionId: 'child', transcriptPath: file, event: 'SessionEnd', env: { TR_META_HARNESS_RUN: '1' } });
    expect(result).toEqual({ tasks: [], skipped: 'internal-job' });
    expect(sessions()).toEqual([]);
    expect(listTasks(resolveQueueDir(brain))).toHaveLength(0);
  });
  it('refuses persisted internal transcripts and still reviews ordinary ones', () => {
    const internal = transcript('internal', [user(`${LEGACY}\n---\nTranscript`), said('{}')]);
    expect(tickLessons({ brainDir: brain, sessionId: 'i', transcriptPath: internal, event: 'SessionEnd', env: {} }).skipped).toBe('internal-job');
    expect(sessions()).toEqual([]);
    const ordinary = transcript('ordinary', [user('Use tabs.'), said('Done.'), user(`Quoting: ${LEGACY}`), said('ok')]);
    expect(tickLessons({ brainDir: brain, sessionId: 'o', transcriptPath: ordinary, event: 'SessionEnd', env: {} }).tasks).toHaveLength(1);
  });
  it('daemon scans ignore the caller environment but honor pause', () => {
    fs.mkdirSync(path.join(brain, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(brain, 'sessions', 'abc.jsonl'), [user('Use tabs.'), said('ok')].map(e => JSON.stringify(e)).join('\n') + '\n');
    const saved = process.env.TR_META_HARNESS_RUN;
    process.env.TR_META_HARNESS_RUN = '1';
    try {
      setLessonsPaused(brain, true);
      expect(enqueueSessionReviews({ brainDir: brain, quietMs: 0 })).toEqual([]);
      setLessonsPaused(brain, false);
      expect(enqueueSessionReviews({ brainDir: brain, quietMs: 0, now: Date.now() + 1000 })[0].tasks).toHaveLength(1);
    } finally {
      if (saved === undefined) delete process.env.TR_META_HARNESS_RUN; else process.env.TR_META_HARNESS_RUN = saved;
    }
  });
});

describe('pause guards queued execution', () => {
  it('keeps a queued lesson review pending, unselected and unrun while paused', async () => {
    const queueDir = resolveQueueDir(brain);
    addTask({ slug: 'lesson-review-k-1-10', intent: 'Review', kind: 'memory', executor: 'lesson-review', category: 'lesson-review',
      payload: { sessionPath: transcript('snap', [user('x')]) } }, queueDir);
    setLessonsPaused(brain, true);
    expect(isLessonsPaused(brain)).toBe(true);
    expect(tickLessons({ brainDir: brain, sessionId: 's', transcriptPath: transcript('s', [user('a'), said('b')]), event: 'SessionEnd', env: {} }).skipped).toBe('paused');
    const result = await dispatchTask(getTask(queueDir, 'lesson-review-k-1-10'), { brainDir: brain, vaultDir: path.join(brain, 'vault'), runtimeConfig: {} });
    expect(result).toMatchObject({ success: false, skippedLLM: true });
    expect(createScheduler({ queueDir, vaultDir: path.join(brain, 'vault'), sessionsDir: path.join(brain, 'sessions'), localOnly: true })
      .queue.all().some(task => task.slug.startsWith('lesson-review-'))).toBe(false);
    expect(getTask(queueDir, 'lesson-review-k-1-10').status).toBe('pending');
  });
  it('runPostMortem rejects internal snapshots itself, even behind a long bootstrap', async () => {
    const snap = transcript('long', [user(`${'capsule '.repeat(2000)}\nRequested task:\n${LEGACY}`), said('{}')]);
    expect(await runPostMortem(snap, { vaultDir: path.join(brain, 'vault'), inboxDir: path.join(brain, 'inbox'), runtimeConfig: { agents: [] } }))
      .toMatchObject({ skipped: 'internal-job', patterns: [] });
  });
  it('completes a review of an internal snapshot without calling a model', async () => {
    const snap = transcript('snap', [user(`${INTERNAL_JOB_MARKER}\nReview`), said('{}')]);
    const result = await dispatchTask({ slug: 'lesson-review-x-1-1', executor: 'lesson-review', payload: { sessionPath: snap } },
      { brainDir: brain, vaultDir: path.join(brain, 'vault'), runtimeConfig: { agents: [] } });
    expect(result).toMatchObject({ success: true, output: expect.stringContaining('internal') });
  });
});

describe('lessons pause --cancel-pending', () => {
  const cli = args => spawnSync(process.execPath, ['bin/total-recall.mjs', 'lessons', ...args, '--global'], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, AGENT_DIR: agent, HOME: agent, TR_META_HARNESS_RUN: '' }, timeout: 30000 });
  it('cancels only generated review work and preserves sessions and unrelated tasks', () => {
    const queueDir = resolveQueueDir(brain);
    fs.mkdirSync(path.join(brain, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(brain, 'sessions', 'orig.jsonl'), JSON.stringify(user('keep')) + '\n');
    addTask({ slug: 'lesson-review-a-1-10', intent: 'Review', kind: 'memory', executor: 'lesson-review', category: 'lesson-review' }, queueDir);
    addTask({ slug: 'skill-gap-0123456789abcdef', intent: 'gap', kind: 'maintenance', executor: 'skill-manager', category: 'skill-engineering',
      created_by: 'post-mortem-engine', origin: { agent: 'post-mortem-engine', session_id: 's' } }, queueDir);
    addTask({ slug: 'skill-gap-human', intent: 'gap', kind: 'maintenance', executor: 'skill-manager', category: 'skill-engineering' }, queueDir);
    addTask({ slug: 'dream-unrelated', intent: 'Dream', kind: 'memory', executor: 'dream' }, queueDir);
    const paused = cli(['pause', '--cancel-pending']);
    expect(paused.status, paused.stderr).toBe(0);
    expect(JSON.parse(paused.stdout)).toMatchObject({ paused: true, queue: { pending: 2, cancelled: 2, failed: [] } });
    expect(getTask(queueDir, 'lesson-review-a-1-10').status).toBe('cancelled');
    expect(getTask(queueDir, 'skill-gap-0123456789abcdef').status).toBe('cancelled');
    expect(getTask(queueDir, 'skill-gap-human').status).toBe('pending');
    expect(getTask(queueDir, 'dream-unrelated').status).toBe('pending');
    expect(fs.readFileSync(path.join(brain, 'sessions', 'orig.jsonl'), 'utf8')).toContain('keep');
    expect(JSON.parse(cli(['status']).stdout)).toMatchObject({ paused: true, queue: { pending: 0 } });
    expect(JSON.parse(cli(['resume']).stdout).paused).toBe(false);
    expect(cli(['pause', '--bogus']).status).toBe(1);
  });
});
