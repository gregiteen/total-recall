import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import matter from './frontmatter.mjs';
vi.mock('./runtime.mjs', () => ({ callLocalRuntime: vi.fn() }));
vi.mock('./vault-cache.mjs', () => ({ getNodes: vi.fn(() => []) }));
vi.mock('./logger.mjs', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
import { callLocalRuntime } from './runtime.mjs';
import { runPostMortem, readSessionTranscript, formatLessonTranscript, REVIEW_TRANSCRIPT_BUDGET } from './post-mortem.mjs';
import { lessonsHeldUntil } from './internal-sessions.mjs';
import { listTasks } from './task-envelope.mjs';
import { dispatchTask, resolveExecutor } from './task-executors.mjs';
import { logger } from './logger.mjs';
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
it('counts a duplicate rule as already saved and still saves the other rules', async () => {
  callLocalRuntime.mockResolvedValue(JSON.stringify({ rules: [
    { title: 'Tabs', description: 'Use tabs.', evidence: 'Prompt 117' },
    { title: 'Spaces', description: 'Use four spaces.', evidence: 'Prompt 117' },
  ] }));
  const rememberRule = vi.fn(async description => description === 'Use tabs.' ? { slug: 'lesson-rule-tabs', duplicate: true } : { slug: 'lesson-rule-spaces' });
  const result = await runPostMortem(file, { ...opts, rememberRule });
  expect(result.error).toBeUndefined();
  expect(rememberRule).toHaveBeenCalledTimes(2);
  expect(rememberRule).toHaveBeenNthCalledWith(1, 'Use tabs.', expect.objectContaining({ sourceRef: 's/turns/116-117' }));
  expect(rememberRule).toHaveBeenNthCalledWith(2, 'Use four spaces.', expect.objectContaining({ sourceRef: 's/turns/116-117' }));
  expect(result.duplicates).toBe(1);
  expect(result.rules).toHaveLength(2);
  const logged = logger.info.mock.calls.map(([entry, message]) => typeof entry === 'string' ? message : entry?.message)
    .find(message => typeof message === 'string' && message.includes('s/turns/116-117'));
  expect(logged).toContain('1 duplicate');
});
it('a real duplicate alongside a new rule completes the review without an error', async () => {
  callLocalRuntime.mockResolvedValue(JSON.stringify({ rules: [
    { title: 'Tabs', description: 'Use tabs.', evidence: 'Prompt 117' },
    { title: 'Spaces', description: 'Use four spaces.', evidence: 'Prompt 117' },
  ] }));
  const { rememberLessonRule, DUPLICATE_RULE_EXIT_CODE } = await import('./lesson-memory.mjs');
  // A review brain lives at <agent>/skills/total-recall.
  const brain = path.join(dir, 'agent', 'skills', 'total-recall');
  const vaultDir = path.join(brain, 'memory-vault');
  const existing = '---\ntype: memory\nslug: lesson-rule-tabs\ncategory: invariants\ntitle: Tabs\nstatus: active\npriority: absolute\nmodality: must\n---\n\nUse tabs.\n';
  fs.mkdirSync(path.join(vaultDir, 'invariants'), { recursive: true });
  fs.writeFileSync(path.join(vaultDir, 'invariants', 'lesson-rule-tabs.md'), existing);
  const saved = [];
  const rememberRule = (content, options) => rememberLessonRule(content, { ...options, execute: (binary, args, opts, done) => {
    saved.push(content);
    const duplicate = content === 'Use tabs.';
    const error = duplicate ? Object.assign(new Error('exited 3'), { code: DUPLICATE_RULE_EXIT_CODE }) : null;
    done(error, '', duplicate ? 'Rule already exists' : '');
  } });
  const result = await runPostMortem(file, { ...opts, vaultDir, rememberRule, fromTurn: 1, toTurn: Infinity });
  expect(result.error).toBeUndefined();
  expect(result.duplicates).toBe(1);
  expect(saved).toEqual(['Use tabs.', 'Use four spaces.']);
  // Nothing was written for the duplicate; the vault still holds only the seeded rule.
  expect(fs.readdirSync(path.join(vaultDir, 'invariants'))).toEqual(['lesson-rule-tabs.md']);
  expect(fs.readFileSync(path.join(vaultDir, 'invariants', 'lesson-rule-tabs.md'), 'utf8')).toBe(existing);
});
