import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { throttledFetch, blockDomain, unblockDomain, getAuditLog, resetGateStats, getGateStats, loadFirewallPolicy } from './throttled-fetch.mjs';
import { brainDir } from './config.mjs';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: (p) => {
      if (typeof p === 'string' && p.endsWith('network-policy.md')) return true;
      return actual.existsSync(p);
    },
    readFileSync: (p, options) => {
      if (typeof p === 'string' && p.endsWith('network-policy.md')) {
        return globalThis.__mockNetworkPolicy || `---\ntype: network_policy\nstatus: active\nblocked_domains: []\n---`;
      }
      return actual.readFileSync(p, options);
    },
    watch: (p, options, callback) => {
      if (typeof p === 'string' && p.endsWith('network-policy.md')) {
        return { close: () => {} };
      }
      return actual.watch(p, options, callback);
    }
  };
});

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
    globalThis.__mockNetworkPolicy = `---\ntype: network_policy\nstatus: active\nblocked_domains:\n  - blocked.com\n---`;

    await loadFirewallPolicy(brainDir);

    await expect(throttledFetch('https://blocked.com')).rejects.toThrow('Fetch blocked: Domain blocked by firewall policy (blocked.com)');

    // Now simulate unblocking
    globalThis.__mockNetworkPolicy = `---\ntype: network_policy\nstatus: active\nblocked_domains: []\n---`;
    await loadFirewallPolicy(brainDir);

    const res = await throttledFetch('https://blocked.com');
    expect(res.status).toBe(200);
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
