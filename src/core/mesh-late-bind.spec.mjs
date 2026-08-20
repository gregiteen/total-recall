import { describe, it, expect, vi } from 'vitest';
import { startMeshBindWatch } from './mesh-late-bind.mjs';

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

describe('startMeshBindWatch', () => {
  it('binds the mesh address as soon as one appears', async () => {
    // The whole point: the brain started before the mesh client finished, so
    // the address that was missing at startup shows up moments later.
    let ip = null;
    const bound = ['127.0.0.1'];
    const bind = vi.fn(async (addr) => { bound.push(addr); });

    const watch = startMeshBindWatch({
      getMeshIp: () => ip,
      boundHosts: () => bound,
      bind,
      intervalMs: 20,
    });

    await tick(60);
    expect(bind).not.toHaveBeenCalled();

    ip = '100.64.0.2';
    const result = await watch.promise;

    expect(bind).toHaveBeenCalledWith('100.64.0.2');
    expect(result).toBe('100.64.0.2');
    expect(bound).toContain('100.64.0.2');
  });

  it('does not rebind an address that is already listening', async () => {
    const bind = vi.fn();
    const watch = startMeshBindWatch({
      getMeshIp: () => '100.64.0.2',
      boundHosts: () => ['127.0.0.1', '100.64.0.2'],
      bind,
      intervalMs: 20,
    });
    await tick(70);
    watch.stop();
    expect(bind).not.toHaveBeenCalled();
  });

  it('keeps trying when a bind attempt fails', async () => {
    // Port contention or an address not yet routable is transient; giving up
    // on the first error would leave the node invisible exactly as before.
    let attempts = 0;
    const bind = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('EADDRNOTAVAIL');
    });
    const watch = startMeshBindWatch({
      getMeshIp: () => '100.64.0.2',
      boundHosts: () => ['127.0.0.1'],
      bind,
      intervalMs: 15,
      logger: { info: vi.fn(), warn: vi.fn() },
    });
    const result = await watch.promise;
    expect(attempts).toBe(3);
    expect(result).toBe('100.64.0.2');
  });

  it('survives getMeshIp throwing', async () => {
    const bind = vi.fn();
    const watch = startMeshBindWatch({
      getMeshIp: () => { throw new Error('tailscale CLI missing'); },
      boundHosts: () => ['127.0.0.1'],
      bind,
      intervalMs: 15,
    });
    await tick(50);
    watch.stop();
    expect(bind).not.toHaveBeenCalled();
  });

  it('gives up after maxWaitMs and says the node stays loopback-only', async () => {
    const warn = vi.fn();
    const watch = startMeshBindWatch({
      getMeshIp: () => null,
      boundHosts: () => ['127.0.0.1'],
      bind: vi.fn(),
      intervalMs: 10,
      maxWaitMs: 30,
      logger: { info: vi.fn(), warn },
    });
    const result = await watch.promise;
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith('server', expect.stringMatching(/loopback/i));
  });

  it('stop() is idempotent and settles the promise', async () => {
    const watch = startMeshBindWatch({
      getMeshIp: () => null,
      boundHosts: () => [],
      bind: vi.fn(),
      intervalMs: 10,
    });
    watch.stop();
    watch.stop();
    await expect(watch.promise).resolves.toBeNull();
  });
});
