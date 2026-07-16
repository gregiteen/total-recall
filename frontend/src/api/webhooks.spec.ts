import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchWebhookConfigs, fetchWebhookEvents, addWebhookConfig, deleteWebhookConfig, triggerTestWebhook } from './webhooks';
import * as base from './_base';

vi.mock('./_base', () => ({
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
}));

describe('webhooks api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchWebhookConfigs calls GET /api/webhooks/configs', async () => {
    vi.mocked(base.get).mockResolvedValue([]);
    await fetchWebhookConfigs();
    expect(base.get).toHaveBeenCalledWith('/api/webhooks/configs');
  });

  it('fetchWebhookEvents calls GET /api/webhooks/events', async () => {
    vi.mocked(base.get).mockResolvedValue([]);
    await fetchWebhookEvents();
    expect(base.get).toHaveBeenCalledWith('/api/webhooks/events');
    await fetchWebhookEvents('github');
    expect(base.get).toHaveBeenCalledWith('/api/webhooks/events?provider=github');
  });

  it('addWebhookConfig calls POST /api/webhooks/configs', async () => {
    const conf = { provider: 'github', status: 'active' as const };
    vi.mocked(base.post).mockResolvedValue(conf);
    await addWebhookConfig(conf);
    expect(base.post).toHaveBeenCalledWith('/api/webhooks/configs', conf);
  });

  it('deleteWebhookConfig calls DEL', async () => {
    vi.mocked(base.del).mockResolvedValue(undefined);
    await deleteWebhookConfig('github');
    expect(base.del).toHaveBeenCalledWith('/api/webhooks/configs/github');
  });

  it('triggerTestWebhook calls POST', async () => {
    vi.mocked(base.post).mockResolvedValue(undefined);
    await triggerTestWebhook('github');
    expect(base.post).toHaveBeenCalledWith('/api/webhooks/test/github', {});
  });
});
