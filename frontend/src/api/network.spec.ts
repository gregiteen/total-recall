import { describe, it, expect, vi, beforeEach } from 'vitest';
import { networkApi } from './network';

describe('networkApi', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  it('getStats fetches from /api/network/stats', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ stats: { total: 10 }, audit_count: 5 })
    } as unknown as Response);

    const result = await networkApi.getStats();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/network/stats', expect.any(Object));
    expect(result.stats.total).toBe(10);
  });

  it('getPolicy fetches from /api/network/policy', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'network-policy', blocked_domains: [] })
    } as unknown as Response);

    const result = await networkApi.getPolicy();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/network/policy', expect.any(Object));
    expect(result.id).toBe('network-policy');
  });

  it('blockDomain POSTs to /api/network/block', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    } as unknown as Response);

    await networkApi.blockDomain('evil.com');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/network/block', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ domain: 'evil.com' })
    }));
  });

  it('unblockDomain DELETEs to /api/network/block/:domain', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    } as unknown as Response);

    await networkApi.unblockDomain('evil.com');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/network/block/evil.com', expect.objectContaining({
      method: 'DELETE'
    }));
  });
});
