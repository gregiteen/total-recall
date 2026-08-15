/**
 * The situation this cache exists for: /health parsed every node in every
 * brain's vault and loaded a 12MB embeddings index inside the request, taking
 * 25-57s on a loaded machine. Everything that probes liveness timed out, so a
 * server that was serving its dashboard in 116ms read as dead.
 *
 * The risk in fixing it is trading a slow answer for a false one, because the
 * cached reading is a criticality signal — a brain with nodes and no vectors
 * answers from keyword matching and looks fine. So these tests pin the
 * timestamp and the not-yet-known case as hard as they pin the speed.
 */
import { describe, expect, it, vi } from 'vitest';
import { createCoverageCache } from './health-coverage.mjs';

/** A clock the test drives, so nothing here waits on real time. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

const READING = [{ layer: 'global', nodes: 2602, embedded: 2602, vector_search: 'on' }];

describe('createCoverageCache', () => {
  it('returns null before the first reading rather than blocking', () => {
    const cache = createCoverageCache({ compute: async () => READING });

    // Synchronous: the caller is never made to wait for the vault parse.
    expect(cache.snapshot()).toEqual({ coverage: null, as_of: null });
  });

  it('serves the reading once it lands, stamped with when it was taken', async () => {
    const { now } = clock();
    const cache = createCoverageCache({ compute: async () => READING, now });

    cache.snapshot();
    await cache.settled();

    expect(cache.snapshot()).toEqual({
      coverage: READING,
      as_of: new Date(now()).toISOString(),
    });
  });

  it('does not recompute while the reading is fresh', async () => {
    const compute = vi.fn(async () => READING);
    const c = clock();
    const cache = createCoverageCache({ compute, ttlMs: 30_000, now: c.now });

    cache.snapshot();
    await cache.settled();
    c.advance(29_000);
    cache.snapshot();
    cache.snapshot();
    await cache.settled();

    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('refreshes in the background once the reading goes stale', async () => {
    const compute = vi.fn(async () => READING);
    const c = clock();
    const cache = createCoverageCache({ compute, ttlMs: 30_000, now: c.now });

    cache.snapshot();
    await cache.settled();
    c.advance(31_000);
    cache.snapshot();
    await cache.settled();

    expect(compute).toHaveBeenCalledTimes(2);
  });

  // The whole point of the fix: a stale reading is served immediately instead
  // of the caller waiting out another full-vault parse.
  it('serves the stale reading immediately while the refresh runs', async () => {
    const c = clock();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let call = 0;
    const compute = async () => {
      call += 1;
      if (call === 1) return READING;
      await gate;
      return [{ layer: 'global', nodes: 2602, embedded: 0, vector_search: 'OFF — keyword-only' }];
    };
    const cache = createCoverageCache({ compute, ttlMs: 30_000, now: c.now });

    cache.snapshot();
    await cache.settled();
    const firstAt = cache.snapshot().as_of;

    c.advance(31_000);
    const during = cache.snapshot();          // refresh is now in flight and blocked

    expect(during.coverage).toEqual(READING); // old reading, served without waiting
    expect(during.as_of).toBe(firstAt);       // and honestly dated as the old one

    release();
    await cache.settled();
    expect(cache.snapshot().coverage[0].embedded).toBe(0);
  });

  // Two probes arriving together must not each start a full-vault parse.
  it('collapses concurrent refreshes into one computation', async () => {
    const compute = vi.fn(async () => READING);
    const cache = createCoverageCache({ compute });

    cache.snapshot();
    cache.snapshot();
    cache.snapshot();
    await cache.settled();

    expect(compute).toHaveBeenCalledTimes(1);
  });

  // A failed refresh must not read as a fresh clean result — that would hide
  // exactly the degraded-vector-search condition this reading exists to catch.
  it('keeps the previous reading and its timestamp when a refresh fails', async () => {
    const c = clock();
    let call = 0;
    const compute = async () => {
      call += 1;
      if (call === 1) return READING;
      throw new Error('vault unreadable');
    };
    const cache = createCoverageCache({ compute, ttlMs: 30_000, now: c.now });

    cache.snapshot();
    await cache.settled();
    const before = cache.snapshot();

    c.advance(31_000);
    cache.snapshot();
    await cache.settled();

    expect(cache.snapshot()).toEqual(before);
  });

  it('recovers on a later refresh after a failure', async () => {
    const c = clock();
    let call = 0;
    const compute = async () => {
      call += 1;
      if (call === 2) throw new Error('transient');
      return [{ layer: 'global', nodes: call, embedded: call, vector_search: 'on' }];
    };
    const cache = createCoverageCache({ compute, ttlMs: 30_000, now: c.now });

    cache.snapshot();
    await cache.settled();
    c.advance(31_000);
    cache.snapshot();
    await cache.settled();   // fails, keeps reading 1
    c.advance(31_000);
    cache.snapshot();
    await cache.settled();   // succeeds

    expect(cache.snapshot().coverage[0].nodes).toBe(3);
  });
});
