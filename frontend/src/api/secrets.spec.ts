// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listSecrets, addSecret, triggerSync, getSyncStatus } from './secrets';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Secrets API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listSecrets fetches secrets list metadata', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [{ key: 'KEY_1', provider: 'openai' }] })
    });

    const res = await listSecrets();
    expect(res).toEqual([{ key: 'KEY_1', provider: 'openai' }]);
    expect(mockFetch).toHaveBeenCalledWith('/api/secrets/list', expect.any(Object));
  });

  it('addSecret sends POST to /api/secrets', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ key: 'NEW_KEY', provider: 'stripe' })
    });

    const res = await addSecret('NEW_KEY', 'val_123', { provider: 'stripe' });
    expect(res).toEqual({ key: 'NEW_KEY', provider: 'stripe' });
    expect(mockFetch).toHaveBeenCalledWith('/api/secrets', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ key: 'NEW_KEY', value: 'val_123', provider: 'stripe' })
    }));
  });

  it('triggerSync sends POST to /api/secrets/sync/trigger', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, results: [] })
    });

    const res = await triggerSync();
    expect(res).toEqual({ success: true, results: [] });
    expect(mockFetch).toHaveBeenCalledWith('/api/secrets/sync/trigger', expect.objectContaining({
      method: 'POST',
      body: '{}'
    }));
  });

  it('getSyncStatus sends GET to /api/secrets/sync/status', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ localChecksum: 'h1', nodes: [] })
    });

    const res = await getSyncStatus();
    expect(res).toEqual({ localChecksum: 'h1', nodes: [] });
    expect(mockFetch).toHaveBeenCalledWith('/api/secrets/sync/status', expect.any(Object));
  });
});
