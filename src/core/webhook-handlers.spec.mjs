import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWebhook } from './webhook-handlers.mjs';
import * as scheduler from './scheduler.mjs';
import fs from 'node:fs';

vi.mock('./scheduler.mjs', () => ({
  persistTaskToDisk: vi.fn(),
}));

vi.mock('./config.mjs', () => ({
  brainDir: '/mock/brain',
}));

// logger.mjs ensures its log dir exists at module-load time via a real
// fs.mkdirSync — with brainDir mocked to a fake root-level path that can
// never actually be created, importing it for real crashes every test in
// this file before any test body even runs.
vi.mock('./logger.mjs', () => ({
  logger: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: vi.fn(() => false),
    },
    existsSync: vi.fn(() => false),
  };
});

describe('webhook-handlers module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('handles github push by queuing a single fixed-slug deploy notice', async () => {
    const r = await handleWebhook('github', 'push', { ref: 'refs/heads/production' });
    expect(r.queued).toBe(true);
    expect(scheduler.persistTaskToDisk).toHaveBeenCalled();
    const args = vi.mocked(scheduler.persistTaskToDisk).mock.calls[0][0];
    expect(args.category).toBe('deployment');
    expect(args.slug).toBe('deploy-auto');
    expect(args.payload.command).not.toMatch(/bin\/deploy\.sh/);
  });

  it('does not queue another deploy when one is already pending', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const r = await handleWebhook('github', 'push', { ref: 'refs/heads/main' });
    expect(r.queued).toBe(false);
    expect(r.reason).toBe('already_pending');
    expect(scheduler.persistTaskToDisk).not.toHaveBeenCalled();
  });

  it('skips non-deploy branches', async () => {
    const r = await handleWebhook('github', 'push', { ref: 'refs/heads/feat/something' });
    expect(r.queued).toBe(false);
    expect(r.reason).toBe('ref_not_deployable');
    expect(scheduler.persistTaskToDisk).not.toHaveBeenCalled();
  });

  it('handles github release by queuing a sync task', async () => {
    await handleWebhook('github', 'release', {});
    expect(scheduler.persistTaskToDisk).toHaveBeenCalled();
    const args = vi.mocked(scheduler.persistTaskToDisk).mock.calls[0][0];
    expect(args.category).toBe('sync');
    expect(args.payload.command).toContain('total-recall skill sync');
    expect(args.slug).toBe('skillsync-auto');
  });

  it('handles npm publish by queuing an update task', async () => {
    await handleWebhook('npm', 'package-publish', {});
    expect(scheduler.persistTaskToDisk).toHaveBeenCalled();
    const args = vi.mocked(scheduler.persistTaskToDisk).mock.calls[0][0];
    expect(args.category).toBe('package');
    expect(args.payload.command).toBe('npm update');
  });

  it('ignores unknown events gracefully', async () => {
    await handleWebhook('stripe', 'payment_intent.succeeded', {});
    expect(scheduler.persistTaskToDisk).not.toHaveBeenCalled();
  });
});
