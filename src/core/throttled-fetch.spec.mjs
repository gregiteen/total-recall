import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { throttledFetch, blockDomain, unblockDomain, getAuditLog, resetGateStats, getGateStats, loadFirewallPolicy } from './throttled-fetch.mjs';
import { brainDir } from './config.mjs';

describe('throttledFetch', () => {
  beforeEach(() => {
    resetGateStats();
    // Use fake timers if needed, but fetch relies on real promises usually.
    // For now, we'll mock global fetch to just return a resolved promise after a delay.
    global.fetch = vi.fn(async (url, options) => {
      // simulate network delay
      await new Promise(r => setTimeout(r, 10));
      return { status: 200, ok: true, json: async () => ({}) };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks domains in the firewall', async () => {
    await blockDomain('blocked.com');
    await new Promise(r => setTimeout(r, 500)); // wait for write to settle
    await loadFirewallPolicy(brainDir); // Force reload
    await expect(throttledFetch('https://blocked.com')).rejects.toThrow('Fetch blocked: Domain blocked by firewall policy (blocked.com)');
    await unblockDomain('blocked.com');
    await loadFirewallPolicy(brainDir); // Force reload
  });

  it('records audit logs', async () => {
    await throttledFetch('https://example-audit.com');
    const logs = getAuditLog();
    const entry = logs.find(l => l.domain === 'example-audit.com');
    expect(entry).toBeDefined();
    expect(entry.status).toBe(200);
  });

  it('returns correct gate stats', async () => {
    await throttledFetch('https://example-stats.com');
    const stats = getGateStats();
    expect(stats.total_dispatched).toBe(1);
    expect(stats.total_completed).toBe(1);
  });
});
