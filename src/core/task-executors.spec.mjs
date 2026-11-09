import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('./dream.mjs', () => ({ runDreamCycle: vi.fn(async () => ({ status: 'failed', errors: ['compile failed'] })) }));
import { resolveExecutor, dispatchTask, listExecutorIds } from './task-executors.mjs';

describe('task-executors.mjs', () => {
  it('exports resolveExecutor', () => {
    expect(resolveExecutor).toBeDefined();
  });
  it('exports dispatchTask', () => {
    expect(dispatchTask).toBeDefined();
  });
  it('exports listExecutorIds', () => {
    expect(listExecutorIds).toBeDefined();
  });

  it.each(['session-ingest', 'surface-compile', 'prune', 'secrets-rotation-check',
    'secrets-export-env', 'secrets-rotation-assist', 'onboarding', 'unknown', 'constructor', '__proto__'])
  ('fails an unsupported explicit executor %s even on a known category', async executor => {
    expect(listExecutorIds()).not.toContain(executor);
    expect(await dispatchTask({ slug: 'dream-example', executor, kind: 'custom',
      category: 'memory-maintenance' }, {})).toMatchObject({ success: false, error: 'unsupported' });
  });

  it.each(['exploration', 'unknown-category'])
  ('does not acknowledge category %s as completed work', async category => {
    expect(await dispatchTask({ slug: 'category-task', category }, { runtimeConfig: {} }))
      .toMatchObject({ success: false, error: 'unsupported' });
  });

  // U4/U5: skill gaps go to skill-manager and self-evaluation to the lesson review; without their
  // inputs they fail with the reason, never acknowledge.
  it.each([['skill-engineering', /Skill gap requires a topic/], ['self-evaluation', /Lesson review requires a session/]])
  ('routes category %s to its owner and fails without its inputs', async (category, reason) => {
    const result = await dispatchTask({ slug: 'category-task', category }, { runtimeConfig: {} });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(reason);
  });

  it('routes skill and lesson work to their owners', () => {
    expect(resolveExecutor({ slug: 'owner-work', category: 'skill-engineering' }).id).toBe('skill-manager');
    expect(resolveExecutor({ slug: 'owner-work', category: 'self-evaluation' }).id).toBe('lesson-review');
    expect(resolveExecutor({ slug: 'orphan', category: 'exploration' })).toBeNull();
  });

  it('fails custom log-only tasks and research without a topic', async () => {
    expect(await dispatchTask({ slug: 'custom', executor: 'custom' }, {}))
      .toMatchObject({ success: false, error: 'unsupported' });
    expect(await dispatchTask({ slug: 'research-acquisition-empty', executor: 'research' }, { brainDir: '/fixture' }))
      .toMatchObject({ success: false, error: 'unsupported' });
  });
  it('propagates a failed dream phase instead of completing the task', async () => {
    expect(await dispatchTask({ slug: 'dream-fixture', executor: 'dream' }, {}))
      .toMatchObject({ success: false, error: 'compile failed', executor: 'dream' });
  });
});
