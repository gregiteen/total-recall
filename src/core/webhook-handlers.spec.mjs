import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWebhook } from './webhook-handlers.mjs';
import * as scheduler from './scheduler.mjs';

vi.mock('./scheduler.mjs', () => ({
  persistTaskToDisk: vi.fn(),
}));

vi.mock('./logger.mjs', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('./config.mjs', () => ({
  brainDir: '/mock/brain'
}));

describe('webhook-handlers module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles github push by queuing a deploy task', async () => {
    await handleWebhook('github', 'push', {});
    expect(scheduler.persistTaskToDisk).toHaveBeenCalled();
    const args = vi.mocked(scheduler.persistTaskToDisk).mock.calls[0][0];
    expect(args.category).toBe('deployment');
    expect(args.payload.command).toContain('deploy.sh');
  });

  it('handles github release by queuing a sync task', async () => {
    await handleWebhook('github', 'release', {});
    expect(scheduler.persistTaskToDisk).toHaveBeenCalled();
    const args = vi.mocked(scheduler.persistTaskToDisk).mock.calls[0][0];
    expect(args.category).toBe('sync');
    expect(args.payload.command).toContain('total-recall skill sync');
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
