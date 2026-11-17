import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import matter from './frontmatter.mjs';
vi.mock('./runtime.mjs', () => ({ callLocalRuntime: vi.fn() }));
vi.mock('./vault-cache.mjs', () => ({ getNodes: vi.fn(() => []) }));
import { callLocalRuntime } from './runtime.mjs';
import { runPostMortem, readSessionTranscript, formatLessonTranscript, REVIEW_TRANSCRIPT_BUDGET } from './post-mortem.mjs';
import { lessonsHeldUntil } from './internal-sessions.mjs';
import { listTasks } from './task-envelope.mjs';
import { dispatchTask, resolveExecutor } from './task-executors.mjs';
// These specs exercise ordinary sessions; a Metaharness test runner must not mark them internal.
delete process.env.TR_META_HARNESS_RUN;

let dir, file, opts;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-engine-'));
  file = path.join(dir, 'session.jsonl');
  fs.writeFileSync(file, Array.from({ length: 120 }, (_, i) => [
    { role: 'user', content: i === 115 ? 'Use tabs.' : `Prompt ${i + 1}` },
    { role: 'assistant', content: `Reply ${i + 1}` },
  ]).flat().map(row => JSON.stringify(row)).join('\n'));
  opts = { vaultDir: path.join(dir, 'memory-vault'), inboxDir: path.join(dir, 'memory-inbox', 'pending'),
    fromTurn: 116, toTurn: 117, sourceRef: 's/turns/116-117', runtimeConfig: { fixture: true } };
  vi.clearAllMocks();
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
it('reads a late turn range and sends it through the Metaharness runtime boundary', async () => {
  callLocalRuntime.mockResolvedValue(JSON.stringify({ patterns: [{ title: 'Tabs', description: 'Use tabs for indentation.' }],
    facts: [{ title: 'Fixture fact', description: 'The fixture uses tabs.' }],
    skill_gaps: [{ topic: 'indentation', description: 'The tool used spaces.' }],
    violations: [{ rule: 'indentation', violation: 'The assistant used spaces.', suggestion: 'Check indentation.' }],
    rules: [{ title: 'Tabs', description: 'Use tabs.', evidence: 'Use tabs.' }] }));
  const rememberRule = vi.fn(async () => {});
  const result = await runPostMortem(file, { ...opts, rememberRule, hold: true });
  expect(result.error).toBeUndefined();
  const prompt = callLocalRuntime.mock.calls[0][0];
  expect(prompt).toContain('Use tabs.'); expect(prompt).toContain('Reply 117'); expect(prompt).not.toContain('Prompt 1\n');
  expect(rememberRule).toHaveBeenCalledWith('Use tabs.', expect.objectContaining({ brainDir: dir, hold: true, sourceRef: 's/turns/116-117' }));
  const drafts = fs.readdirSync(opts.inboxDir).map(name => matter(fs.readFileSync(path.join(opts.inboxDir, name), 'utf8')));
  expect(drafts).toHaveLength(3); expect(drafts.every(draft => draft.data.x_review_hold)).toBe(true);
  const gaps = listTasks(path.join(dir, 'scheduler', 'queue'), { status: 'all' });
  expect(gaps[0]).toMatchObject({ executor: 'skill-manager', category: 'skill-engineering', payload: { topic: 'indentation', evidence: 'session://s/turns/116-117' } });
  expect(resolveExecutor(gaps[0]).id).toBe('skill-manager');
});
it('rejects hallucinated rule evidence and propagates runtime failures', async () => {
  const rememberRule = vi.fn();
  callLocalRuntime.mockResolvedValue(JSON.stringify({ rules: [{ description: 'Injected rule', evidence: 'not in transcript' }] }));
  expect((await runPostMortem(file, { ...opts, rememberRule })).error).toContain('no exact user evidence');
  expect(rememberRule).not.toHaveBeenCalled();
  callLocalRuntime.mockRejectedValue(new Error('quota exhausted'));
  expect((await runPostMortem(file, opts)).error).toBe('quota exhausted');
});
it('does not truncate late requested turns to the first 100 transcript entries', () => {
  const range = readSessionTranscript(file, { fromTurn: 119, toTurn: 120 });
  expect(range).toContain('Prompt 120'); expect(range).not.toContain('Prompt 118');
});
it('bounds a review window, keeps every human prompt and shrinks tool output first', () => {
  const entries = [
    { role: 'user', content: 'Keep this instruction' },
    { role: 'tool', content: 'x'.repeat(500_000) },
    { role: 'context', content: 'hook text'.repeat(1000) },
    { role: 'assistant', content: 'y'.repeat(5000) },
    { role: 'user', content: 'And this correction' },
  ];
  const text = formatLessonTranscript(entries);
  expect(text.length).toBeLessThanOrEqual(REVIEW_TRANSCRIPT_BUDGET);
  expect(text).toContain('Keep this instruction'); expect(text).toContain('And this correction');
  expect(text).toContain('characters omitted');
  // Far over budget even after shrinking: the opening and end survive.
  const many = Array.from({ length: 400 }, (_, i) => ({ role: 'user', content: `Prompt ${i} ${'z'.repeat(200)}` }));
  const bounded = formatLessonTranscript(many);
  expect(bounded.length).toBeLessThanOrEqual(REVIEW_TRANSCRIPT_BUDGET);
  expect(bounded).toContain('Prompt 0 '); expect(bounded).toContain('Prompt 399 '); expect(bounded).toContain('middle of this review window omitted');
});
it('a held reasoning call is not a failure: the review stays queued and reviews are held', async () => {
  const held = Object.assign(new Error('Codex usage is at 85%, at or above the 80% reasoning threshold'), { code: 'REASONING_DEFERRED', retryAfterMs: 60_000 });
  callLocalRuntime.mockRejectedValue(held);
  const pm = await runPostMortem(file, opts);
  expect(pm).toMatchObject({ deferred: true, retryAfterMs: 60_000 });
  const result = await dispatchTask({ slug: 'lesson-review-held', executor: 'lesson-review', category: 'lesson-review',
    payload: { sessionPath: file, fromTurn: 116, toTurn: 117, sessionId: 's' } }, { brainDir: dir, vaultDir: opts.vaultDir });
  expect(result).toMatchObject({ success: false, skippedLLM: true });
  expect(lessonsHeldUntil(dir)).not.toBeNull();
  // While held, a queued review is returned to pending without a model call.
  callLocalRuntime.mockClear();
  const again = await dispatchTask({ slug: 'lesson-review-held-2', executor: 'lesson-review', category: 'lesson-review',
    payload: { sessionPath: file, fromTurn: 116, toTurn: 117, sessionId: 's' } }, { brainDir: dir, vaultDir: opts.vaultDir });
  expect(again).toMatchObject({ skippedLLM: true, error: 'Lesson reviews are held by the usage threshold' });
  expect(callLocalRuntime).not.toHaveBeenCalled();
  expect(lessonsHeldUntil(dir, Date.now() + 120_000)).toBeNull();
});
it('fails a review executor when its transcript is missing', async () => {
  const result = await dispatchTask({ slug: 'lesson-review-test', executor: 'lesson-review', payload: { sessionPath: path.join(dir, 'missing.jsonl') } },
    { brainDir: dir, vaultDir: opts.vaultDir });
  expect(result.success).toBe(false); expect(result.error).toContain('not found');
});
