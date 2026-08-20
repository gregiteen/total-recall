/**
 * mesh-late-bind — bind the mesh address when the mesh shows up late.
 *
 * `resolveServerHost()` runs once, during startup, and whatever it decides is
 * permanent for the life of the process. At boot that is a race the brain can
 * lose: if the mesh client is still starting, `getMeshIp()` returns null, the
 * bind falls back to loopback, and the node is unreachable from every other
 * device until somebody restarts it by hand.
 *
 * Nothing reports this. The node looks healthy from its own console, answers
 * `/health` on loopback, and is simply absent from the tailnet. One machine sat
 * that way for a week.
 *
 * So: when the brain ends up loopback-only, watch for a mesh address and bind
 * it the moment one exists. Polling is the honest mechanism here -- the mesh
 * client offers no readiness event to subscribe to.
 */

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_MAX_WAIT_MS = 10 * 60 * 1000;

/**
 * @param {object} opts
 * @param {() => (string|null)} opts.getMeshIp
 * @param {(ip: string) => Promise<void>} opts.bind   resolves once listening
 * @param {() => string[]} opts.boundHosts            addresses already listening
 * @param {number} [opts.intervalMs]
 * @param {number} [opts.maxWaitMs]  give up after this long; 0 disables the cap
 * @param {{info: Function, warn: Function}} [opts.logger]
 * @returns {{stop: () => void, promise: Promise<string|null>}}
 */
export function startMeshBindWatch({
  getMeshIp,
  bind,
  boundHosts,
  intervalMs = DEFAULT_INTERVAL_MS,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
  logger,
} = {}) {
  let timer = null;
  let stopped = false;
  let settle;
  const promise = new Promise((resolve) => { settle = resolve; });
  const startedAt = Date.now();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    settle(null);
  };

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(tick, intervalMs);
    // Never keep the process alive for this; it is opportunistic repair.
    timer.unref?.();
  };

  const tick = async () => {
    if (stopped) return;
    if (maxWaitMs > 0 && Date.now() - startedAt >= maxWaitMs) {
      logger?.warn?.(
        'server',
        'Mesh address never appeared; this brain stays reachable only on loopback. '
        + 'Other devices cannot open its UI until the mesh client is running and the brain restarts.',
      );
      stop();
      return;
    }

    let ip = null;
    try {
      ip = getMeshIp();
    } catch {
      ip = null;
    }

    if (!ip || boundHosts().includes(ip)) {
      schedule();
      return;
    }

    try {
      await bind(ip);
      logger?.info?.(
        'server',
        `Mesh address ${ip} appeared after startup — now also listening there, `
        + 'so other devices on the mesh can reach this brain.',
      );
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      settle(ip);
    } catch (err) {
      // Port taken by another process, address not ready yet: keep trying.
      logger?.warn?.('server', `Late mesh bind to ${ip} failed: ${err?.message || err}`);
      schedule();
    }
  };

  schedule();
  return { stop, promise };
}
