// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeCoreOperation } from './invoke-core-operations.mjs';
import { streamParallelContext, checkFlashHealth } from '../core/parallel-context.mjs';
import { syncAllRepos } from '../core/repo-sync.mjs';
vi.mock('../core/parallel-context.mjs', () => ({ streamParallelContext: vi.fn(), checkFlashHealth: vi.fn() }));
vi.mock('../core/repo-sync.mjs', () => ({ syncAllRepos: vi.fn() }));
const context = { brain: '/fixture/server', registryBrain: '/fixture/registry' };
beforeEach(() => vi.clearAllMocks());

describe('remote owner adapters', () => {
  it('preserves streaming options and hides provider errors', async () => {
    streamParallelContext.mockResolvedValue({ context: 'selected context', stats: { errors: 1 },
      scored: [{ slug: 'example', score: 20, error: 'PRIVATE-provider-url-and-key' }] });
    const result = await executeCoreOperation('context.stream', { query: 'question', budget_tokens: 1234,
      concurrency: 2, min_score: 30 }, context);
    expect(streamParallelContext).toHaveBeenCalledWith({ query: 'question', vaultDir: '/fixture/server/memory-vault',
      budgetTokens: 1234, concurrency: 2, minScore: 30 });
    expect(result).toMatchObject({ context: 'selected context', scored: [{ error: 'provider-failed' }] });
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
  it('keeps healthy and unhealthy provider states explicit without private diagnostics', async () => {
    checkFlashHealth.mockResolvedValueOnce({ status: 'healthy', latency_ms: 3 });
    expect(await executeCoreOperation('context.flash.health', {}, context)).toEqual({ status: 'healthy', latency_ms: 3 });
    checkFlashHealth.mockResolvedValueOnce({ status: 'unhealthy', error: 'PRIVATE' });
    expect(await executeCoreOperation('context.flash.health', {}, context)).toEqual({ status: 'unhealthy', error: 'provider-unavailable' });
  });
  it('reports partial sync failures instead of returning success', async () => {
    syncAllRepos.mockResolvedValue({ repos: [{ repo: 'example', errors: 1 }], totalIngested: 0, totalSkipped: 0 });
    await expect(executeCoreOperation('brains.sync', {}, context)).rejects.toMatchObject({ code: 'sync-failed' });
    expect(syncAllRepos).toHaveBeenCalledWith({ registryBrain: '/fixture/registry' });
  });
});
