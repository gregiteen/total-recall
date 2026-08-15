/**
 * Keeps /health cheap without making it dishonest.
 *
 * Embedding coverage is the expensive half of the health check: for every
 * active brain it parses every node in that brain's vault and loads that
 * brain's embeddings index — 12MB on one machine here. Computed inside the
 * request it made /health take 25-57s on a loaded laptop while the dashboard
 * answered in 116ms, so the server read as dead to everything that probes it.
 * That is the worst endpoint to make slow: /health is what the watchdog polls,
 * and a liveness probe that times out is indistinguishable from a server that
 * is down — which is exactly how it was misread.
 *
 * A cache alone would trade one wrong answer for another, because the reading
 * it holds is a criticality signal: a brain with nodes and no vectors serves
 * keyword results that look like real ones. So the snapshot always carries the
 * time it was taken, and reports "no reading yet" as null rather than as clean.
 */

const DEFAULT_TTL_MS = 30_000;

/**
 * A single-flight, time-bounded cache over an expensive async computation.
 *
 * Never blocks a caller: a stale value is served while a refresh runs behind
 * it, and before the first value lands callers get null. `compute` errors are
 * swallowed rather than left to reject an unawaited promise — a failed refresh
 * keeps the previous reading and its original timestamp, so failure looks like
 * staleness rather than success.
 *
 * @param {object} opts
 * @param {() => Promise<any>} opts.compute  the expensive work
 * @param {number} [opts.ttlMs]              how long a reading stays fresh
 * @param {() => number} [opts.now]          clock seam, for tests
 */
export function createCoverageCache({ compute, ttlMs = DEFAULT_TTL_MS, now = () => Date.now() }) {
  let value = null;
  let takenAt = 0;
  let inFlight = null;

  function refresh() {
    // Single-flight: a second caller during a refresh joins it rather than
    // starting a parallel full-vault parse.
    if (inFlight) return inFlight;
    inFlight = Promise.resolve()
      .then(() => compute())
      .then((next) => {
        value = next;
        takenAt = now();
      })
      .catch(() => {
        // Keep the prior reading and its timestamp; a failed refresh must not
        // be able to masquerade as a fresh clean result.
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  return {
    /** Last known reading, kicking off a background refresh when stale. */
    snapshot() {
      if (!value || now() - takenAt > ttlMs) refresh();
      return value
        ? { coverage: value, as_of: new Date(takenAt).toISOString() }
        : { coverage: null, as_of: null };
    },

    /** Resolves once any in-progress refresh settles. Used to warm at boot. */
    async settled() {
      while (inFlight) await inFlight;
    },
  };
}
