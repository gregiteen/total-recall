import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { latestAuthId, startWatch, stopWatch, getWatchStatus, resolveLogSource } from './registration-watch.mjs';

vi.mock('./logger.mjs', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const LOG = (...ids) => ids.map((i) => `{"path":"/register/${i}","status":200}`).join('\n');

describe('latestAuthId', () => {
  it('takes the newest id out of log noise', () => {
    expect(latestAuthId(LOG('hskey-authreq-AAA', 'hskey-authreq-BBB'))).toBe('hskey-authreq-BBB');
  });
  it('returns null when there is none', () => {
    expect(latestAuthId('{"path":"/machine/map"}')).toBeNull();
    expect(latestAuthId('')).toBeNull();
  });
});

describe('resolveLogSource', () => {
  afterEach(() => { delete process.env.TR_HEADSCALE_LOG_CMD; });

  it('prefers the env override', async () => {
    process.env.TR_HEADSCALE_LOG_CMD = 'echo hi';
    expect(await resolveLogSource('/tmp')).toMatchObject({ cmd: 'echo hi' });
  });

  it('falls back to the headscale key config', async () => {
    const findMeta = vi.fn().mockResolvedValue({ headscale_log_command: 'cat /var/log/hs' });
    expect(await resolveLogSource('/tmp', { findMeta })).toMatchObject({ cmd: 'cat /var/log/hs' });
  });

  it('returns null when nothing is configured', async () => {
    expect(await resolveLogSource('/tmp', { findMeta: vi.fn().mockResolvedValue(null) })).toBeNull();
  });
});

describe('startWatch', () => {
  beforeEach(() => { stopWatch(); });
  afterEach(() => { stopWatch(); vi.useRealTimers(); });

  it('reports unavailable instead of a button that cannot work', async () => {
    const res = await startWatch({ brainDir: '/tmp', register: vi.fn(), logSource: async () => null });
    expect(res.state).toBe('unavailable');
    expect(res.error).toMatch(/no pending-registration API|log source/i);
  });

  it('ignores ids already in the log when it arms', async () => {
    // Those are from earlier attempts; headscale has forgotten them, so
    // approving one always fails AND would consume the watch, reporting
    // success for a device that never connected.
    const register = vi.fn();
    process.env.TR_HEADSCALE_LOG_CMD = `printf '%s' '${LOG('hskey-authreq-OLD')}'`;
    const res = await startWatch({ brainDir: '/tmp', register });
    expect(res.state).toBe('watching');
    expect(res.ignored_existing).toBe(1);
    await new Promise((r) => setTimeout(r, 2600));
    expect(register).not.toHaveBeenCalled();
    delete process.env.TR_HEADSCALE_LOG_CMD;
  }, 10000);

  it('approves a NEW id and reports the node', async () => {
    const file = `/tmp/tr-watch-${process.pid}.log`;
    const fs = await import('node:fs');
    fs.writeFileSync(file, LOG('hskey-authreq-OLD'));
    process.env.TR_HEADSCALE_LOG_CMD = `cat ${file}`;
    const register = vi.fn().mockResolvedValue({ id: '9', name: 'iphone', ip_addresses: ['100.64.0.9'] });

    await startWatch({ brainDir: '/tmp', register });
    fs.writeFileSync(file, LOG('hskey-authreq-OLD', 'hskey-authreq-NEW'));
    await new Promise((r) => setTimeout(r, 2600));

    expect(register).toHaveBeenCalledWith('hskey-authreq-NEW');
    expect(getWatchStatus().state).toBe('registered');
    fs.rmSync(file, { force: true });
    delete process.env.TR_HEADSCALE_LOG_CMD;
  }, 10000);

  it('keeps watching when an approve fails rather than giving up', async () => {
    // A stale-cache rejection is expected; the next sign-in yields a fresh id.
    const file = `/tmp/tr-watch2-${process.pid}.log`;
    const fs = await import('node:fs');
    fs.writeFileSync(file, '');
    process.env.TR_HEADSCALE_LOG_CMD = `cat ${file}`;
    const register = vi.fn().mockRejectedValue(new Error('node not found in registration cache'));

    await startWatch({ brainDir: '/tmp', register });
    fs.writeFileSync(file, LOG('hskey-authreq-STALE'));
    await new Promise((r) => setTimeout(r, 2600));

    expect(register).toHaveBeenCalled();
    expect(getWatchStatus().state).toBe('watching');
    expect(getWatchStatus().error).toMatch(/registration cache/);
    fs.rmSync(file, { force: true });
    delete process.env.TR_HEADSCALE_LOG_CMD;
  }, 10000);

  it('will not arm twice', async () => {
    process.env.TR_HEADSCALE_LOG_CMD = 'printf ""';
    await startWatch({ brainDir: '/tmp', register: vi.fn() });
    const second = await startWatch({ brainDir: '/tmp', register: vi.fn() });
    expect(second.already_running).toBe(true);
    delete process.env.TR_HEADSCALE_LOG_CMD;
  });

  it('stopWatch clears it', async () => {
    process.env.TR_HEADSCALE_LOG_CMD = 'printf ""';
    await startWatch({ brainDir: '/tmp', register: vi.fn() });
    expect(stopWatch().state).toBe('stopped');
    expect(getWatchStatus().state).toBe('idle');
    delete process.env.TR_HEADSCALE_LOG_CMD;
  });
});
