import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import {
  throttledFetch,
  getAuditLog,
  resetGateStats,
  resetGateStateForTests,
  getGateStats,
  loadFirewallPolicy,
} from './throttled-fetch.mjs';
import { brainDir } from './config.mjs';

let watchCallback = null;
let parentWatchCallback = null;

// Prevent fire-and-forget audit events from hitting the real global brain vault
// (processViaPackageKernel) — that path is slow and causes suite-wide hangs.
vi.mock('./ssss-kernel-bridge.mjs', () => ({
  processViaPackageKernel: vi.fn(async () => ({ ok: true })),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: (p) => {
      if (typeof p === 'string' && p.endsWith('network-policy.md')) {
        return globalThis.__mockPolicyExists !== false;
      }
      if (typeof p === 'string' && p.endsWith('/system')) {
        return true;
      }
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
        watchCallback = typeof options === 'function' ? options : callback;
        return { close: () => {} };
      }
      if (typeof p === 'string' && p.endsWith('/system')) {
        parentWatchCallback = typeof options === 'function' ? options : callback;
        return { close: () => {} };
      }
      return actual.watch(p, options, callback);
    },
  };
});

/** Instant-resolving fetch — never uses setTimeout (safe under any timer mode). */
function installInstantFetch() {
  global.fetch = vi.fn(async () => ({
    status: 200,
    ok: true,
    json: async () => ({}),
  }));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Wait until `predicate()` is true, or fail after `timeoutMs`.
 *
 * A fixed `sleep(5)` before asserting queue depth is a race: under full-suite
 * load the scheduler may not have enqueued yet at +5ms, so the assertion saw 0
 * and failed intermittently while passing in isolation. Polling keeps the
 * assertion exactly as strict (the depth must still become > 0) but stops it
 * depending on how loaded the machine is.
 */
async function waitFor(predicate, timeoutMs = 2000, stepMs = 2) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(stepMs);
  }
  return predicate();
}

describe('throttledFetch', () => {
  beforeEach(() => {
    if (typeof vi.isFakeTimers === 'function' && vi.isFakeTimers()) {
      vi.clearAllTimers();
    }
    vi.useRealTimers();
    resetGateStats();
    resetGateStateForTests();
    watchCallback = null;
    parentWatchCallback = null;
    globalThis.__mockNetworkPolicy = `---\ntype: network_policy\nstatus: active\nblocked_domains: []\n---`;
    globalThis.__mockPolicyExists = true;
    installInstantFetch();
  });

  afterEach(() => {
    if (typeof vi.isFakeTimers === 'function' && vi.isFakeTimers()) {
      vi.clearAllTimers();
    }
    vi.useRealTimers();
    resetGateStateForTests();
  });

  it('blocks domains in the firewall', async () => {
    globalThis.__mockNetworkPolicy = `---\ntype: network_policy\nstatus: active\nblocked_domains:\n  - blocked.com\n---`;

    await loadFirewallPolicy(brainDir);

    await expect(throttledFetch('https://blocked.com')).rejects.toThrow(
      'Fetch blocked: Domain blocked by firewall policy (blocked.com)',
    );

    globalThis.__mockNetworkPolicy = `---\ntype: network_policy\nstatus: active\nblocked_domains: []\n---`;
    await loadFirewallPolicy(brainDir);

    const res = await throttledFetch('https://blocked.com');
    expect(res.status).toBe(200);
  });

  it('records audit logs', async () => {
    await throttledFetch('https://example-audit.com');
    const logs = getAuditLog();
    const entry = logs.find((l) => l.domain === 'example-audit.com');
    expect(entry).toBeDefined();
    expect(entry.status).toBe(200);
    expect(entry).toHaveProperty('rate_wait_ms');
  });

  it('returns correct gate stats', async () => {
    await throttledFetch('https://example-stats.com');
    const stats = getGateStats();
    expect(stats.total_dispatched).toBe(1);
    expect(stats.total_completed).toBe(1);
  });

  it('increments total_blocked counter on firewall reject and appears in stats', async () => {
    globalThis.__mockNetworkPolicy = `---\ntype: network_policy\nstatus: active\nblocked_domains:\n  - counter-blocked.com\n---`;
    await loadFirewallPolicy(brainDir);

    await expect(throttledFetch('https://counter-blocked.com')).rejects.toThrow(/Fetch blocked/);
    const stats = getGateStats();
    expect(stats.total_blocked).toBe(1);

    const logs = getAuditLog((l) => l.domain === 'counter-blocked.com');
    expect(logs[0].status).toBe('blocked');
  });

  it('honors minIntervalMs on the direct dispatch path (real timers)', async () => {
    globalThis.__mockNetworkPolicy = `---\ntype: network_policy\nstatus: active\nblocked_domains: []\ndomain_limits:\n  ratelimited.com:\n    minIntervalMs: 80\n---`;
    await loadFirewallPolicy(brainDir);

    await throttledFetch('https://ratelimited.com/a');

    // Second request must queue — minInterval still active.
    const p2 = throttledFetch('https://ratelimited.com/b');
    await waitFor(() => getGateStats().current_queue_depth > 0);
    expect(getGateStats().current_queue_depth).toBeGreaterThan(0);

    const res2 = await p2;
    expect(res2.status).toBe(200);

    const logs = getAuditLog((l) => l.domain === 'ratelimited.com' && l.status === 200);
    expect(logs.length).toBeGreaterThanOrEqual(2);
    // Queued request should record a positive rate_wait_ms.
    expect(logs[logs.length - 1].rate_wait_ms).toBeGreaterThan(0);
  });

  it('honors minIntervalMs under queue contention (multiple queued for same domain)', async () => {
    globalThis.__mockNetworkPolicy = `---\ntype: network_policy\nstatus: active\nblocked_domains: []\ndomain_limits:\n  contend.com:\n    maxConcurrency: 1\n    minIntervalMs: 40\n---`;
    await loadFirewallPolicy(brainDir);

    await throttledFetch('https://contend.com/1');

    const p2 = throttledFetch('https://contend.com/2');
    const p3 = throttledFetch('https://contend.com/3');
    await sleep(5);
    expect(getGateStats().current_queue_depth).toBeGreaterThan(0);

    const [r2, r3] = await Promise.all([p2, p3]);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
    expect(getGateStats().total_completed).toBe(3);
  });

  it('default-off (unset minIntervalMs) leaves behavior unchanged — no artificial delay', async () => {
    globalThis.__mockNetworkPolicy = `---\ntype: network_policy\nstatus: active\nblocked_domains: []\n---`;
    await loadFirewallPolicy(brainDir);

    const start = Date.now();
    await throttledFetch('https://no-interval.com/1');
    await throttledFetch('https://no-interval.com/2');
    const elapsed = Date.now() - start;
    // Instant fetch mock — two sequential calls must finish almost immediately.
    expect(elapsed).toBeLessThan(200);
  });

  it('hot-reloads changed minIntervalMs via loadFirewallPolicy', async () => {
    globalThis.__mockNetworkPolicy = `---\ntype: network_policy\nstatus: active\nblocked_domains: []\ndomain_limits:\n  hotreload.com:\n    minIntervalMs: 50\n---`;
    await loadFirewallPolicy(brainDir);

    await throttledFetch('https://hotreload.com/a');
    const pQueued = throttledFetch('https://hotreload.com/b');
    await sleep(5);
    expect(getGateStats().current_queue_depth).toBeGreaterThan(0);
    await pQueued;

    // Reload with interval disabled — sequential calls must no longer queue.
    globalThis.__mockNetworkPolicy = `---\ntype: network_policy\nstatus: active\nblocked_domains: []\ndomain_limits: {}\n---`;
    await loadFirewallPolicy(brainDir);

    await throttledFetch('https://hotreload.com/c');
    const p2 = throttledFetch('https://hotreload.com/d');
    await sleep(5);
    // No minInterval → second call dispatches immediately (queue empty).
    expect(getGateStats().current_queue_depth).toBe(0);
    await p2;
    expect(getGateStats().total_completed).toBe(4);
  });

  it('applies global knobs from the policy doc', async () => {
    globalThis.__mockNetworkPolicy = `---\ntype: network_policy\nstatus: active\nblocked_domains: []\nmax_global_concurrency: 2\nmax_per_domain_concurrency: 1\ndefault_timeout_ms: 5000\nwhitelist_mode: false\n---`;
    await loadFirewallPolicy(brainDir);

    const stats = getGateStats();
    expect(stats.max_global_concurrency).toBe(2);
    expect(stats.max_per_domain).toBe(1);
    expect(stats.default_timeout_ms).toBe(5000);
    expect(stats.whitelist_mode).toBe(false);
  });

  it('whitelist mode rejects non-whitelisted domains', async () => {
    globalThis.__mockNetworkPolicy = `---\ntype: network_policy\nstatus: active\nblocked_domains: []\nallowed_domains:\n  - good.com\nwhitelist_mode: true\n---`;
    await loadFirewallPolicy(brainDir);

    await expect(throttledFetch('https://notallowed.com')).rejects.toThrow(
      /not in firewall allowed list/,
    );
    const res = await throttledFetch('https://good.com');
    expect(res.status).toBe(200);
  });

  it('per-domain maxConcurrency override is respected', async () => {
    globalThis.__mockNetworkPolicy = `---\ntype: network_policy\nstatus: active\nblocked_domains: []\ndomain_limits:\n  limited.com:\n    maxConcurrency: 1\n---`;
    await loadFirewallPolicy(brainDir);

    let domainInFlight = 0;
    let domainPeak = 0;
    global.fetch = vi.fn(async () => {
      domainInFlight++;
      domainPeak = Math.max(domainPeak, domainInFlight);
      // Microtask yield only — avoids setTimeout so timer pollution cannot strand us.
      await Promise.resolve();
      domainInFlight--;
      return { status: 200, ok: true, json: async () => ({}) };
    });

    await Promise.all([
      throttledFetch('https://limited.com/1'),
      throttledFetch('https://limited.com/2'),
      throttledFetch('https://limited.com/3'),
    ]);
    expect(domainPeak).toBe(1);
    expect(getGateStats().total_completed).toBe(3);
  });

  it('getGateStats() counts total_dispatched/completed correctly across multiple calls', async () => {
    await throttledFetch('https://a-stats.com');
    await throttledFetch('https://b-stats.com');
    const stats = getGateStats();
    expect(stats.total_dispatched).toBe(2);
    expect(stats.total_completed).toBe(2);
  });

  it('watcher attaches via parent dir when policy is created after boot', async () => {
    globalThis.__mockPolicyExists = true;
    globalThis.__mockNetworkPolicy = `---\ntype: network_policy\nstatus: active\nblocked_domains:\n  - late-create.com\n---`;

    await loadFirewallPolicy(brainDir);

    // Simulate parent-dir create + file change events (hot-reload path).
    if (typeof parentWatchCallback === 'function') {
      parentWatchCallback('rename', 'network-policy.md');
    }
    if (typeof watchCallback === 'function') {
      watchCallback('change');
    }

    await expect(throttledFetch('https://late-create.com')).rejects.toThrow(/Fetch blocked/);
  });

  it('global concurrency cap is enforced', async () => {
    globalThis.__mockNetworkPolicy = `---\ntype: network_policy\nstatus: active\nblocked_domains: []\nmax_global_concurrency: 1\nmax_per_domain_concurrency: 10\n---`;
    await loadFirewallPolicy(brainDir);
    expect(getGateStats().max_global_concurrency).toBe(1);

    let inFlight = 0;
    let peak = 0;
    global.fetch = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight--;
      return { status: 200, ok: true, json: async () => ({}) };
    });

    await Promise.all([
      throttledFetch('https://g1.example/a'),
      throttledFetch('https://g2.example/b'),
      throttledFetch('https://g3.example/c'),
    ]);
    expect(peak).toBe(1);
    expect(getGateStats().total_completed).toBe(3);
  });



  it('timeout fires AbortController and increments total_timeouts', async () => {
    // Hang forever unless aborted — honor the signal like real fetch.
    global.fetch = vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          const signal = options?.signal;
          if (!signal) {
            reject(new Error('expected AbortSignal on fetch options'));
            return;
          }
          if (signal.aborted) {
            reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
            return;
          }
          signal.addEventListener(
            'abort',
            () => {
              reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
            },
            { once: true },
          );
        }),
    );

    // Pass timeout explicitly (3rd arg). Real timers — 40ms abort is plenty.
    await expect(throttledFetch('https://slow-timeout.com', {}, 40)).rejects.toThrow(/aborted/i);
    expect(getGateStats().total_timeouts).toBeGreaterThanOrEqual(1);
  });
});



