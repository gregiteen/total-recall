import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { rememberLessonRule } from './lesson-memory.mjs';
let agent, brain;
beforeEach(() => { agent = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-remember-')); brain = path.join(agent, 'skills/total-recall'); });
afterEach(() => fs.rmSync(agent, { recursive: true, force: true }));
it('calls remember with literal content, a pinned brain, provenance and guarded draft status', async () => {
  const execute = vi.fn((binary, args, opts, done) => done(null, 'saved', ''));
  const result = await rememberLessonRule('Use tabs.', { brainDir: brain, sourceRef: 's/turns/1-10', hold: true, execute });
  expect(result.slug).toMatch(/^lesson-rule-/);
  const [, args, opts] = execute.mock.calls[0];
  expect(args.slice(1, 4)).toEqual(['remember', 'invariant', 'Use tabs.']);
  expect(args).not.toContain('--allow-long'); expect(args).not.toContain('--force');
  expect(args).toContain('draft'); expect(opts.env.AGENT_DIR).toBe(agent);
  expect(opts.env.TR_SESSION_ID).toBe('s/turns/1-10');
});
it('keeps the real remember hard limit and propagates its refusal without a canonical write', async () => {
  await expect(rememberLessonRule('X'.repeat(801), { brainDir: brain, sourceRef: 'fixture' })).rejects.toThrow('limit 800');
  expect(fs.existsSync(path.join(brain, 'memory-vault'))).toBe(false);
});
