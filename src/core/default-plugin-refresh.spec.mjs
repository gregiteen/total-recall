import { describe, expect, it, vi } from 'vitest';
import { REFRESHED_ENV, isDefaultPluginRefusal, rerunAfterDefaultRefresh } from './default-plugin-refresh.mjs';

const refusal = new Error('Required plugin auth is missing or invalid');

describe('refreshing the default plugins a new contract refuses', () => {
  it('recognizes both forms of the refusal and nothing else', () => {
    expect(isDefaultPluginRefusal(refusal)).toBe(true);
    expect(isDefaultPluginRefusal(new Error('Required auth plugin is missing or invalid'))).toBe(true);
    expect(isDefaultPluginRefusal(new Error('Plugin auth is inactive'))).toBe(false);
    expect(isDefaultPluginRefusal(undefined)).toBe(false);
  });

  it('refreshes the shared defaults and runs the same command again, once', () => {
    const ensure = vi.fn();
    const run = vi.fn(() => ({ status: 0 }));
    const log = vi.fn();
    const status = rerunAfterDefaultRefresh(refusal, {
      env: { HOME: '/home/a' }, argv: ['node', '/pkg/bin/total-recall.mjs', 'update', '--automatic'], execPath: '/bin/node',
      ensure, run, log, sharedBrainDir: '/home/a/.agent/skills/total-recall',
    });
    expect(status).toBe(0);
    expect(ensure).toHaveBeenCalledWith('/home/a/.agent/skills/total-recall', { sharedBrainDir: '/home/a/.agent/skills/total-recall' });
    expect(run).toHaveBeenCalledWith('/bin/node', ['/pkg/bin/total-recall.mjs', 'update', '--automatic'],
      { stdio: 'inherit', env: { HOME: '/home/a', [REFRESHED_ENV]: '1' } });
  });

  it('passes the rerun exit status through', () => {
    const status = rerunAfterDefaultRefresh(refusal, { env: {}, argv: ['node', 'cli', 'x'], ensure: () => {}, run: () => ({ status: 3 }), log: () => {}, sharedBrainDir: '/s' });
    expect(status).toBe(3);
  });

  it('never refreshes again inside the rerun, so a refusal the refresh cannot fix ends', () => {
    const ensure = vi.fn();
    const run = vi.fn();
    expect(rerunAfterDefaultRefresh(refusal, { env: { [REFRESHED_ENV]: '1' }, ensure, run, log: () => {}, sharedBrainDir: '/s' })).toBeNull();
    expect(ensure).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('leaves other errors alone', () => {
    const ensure = vi.fn();
    expect(rerunAfterDefaultRefresh(new Error('boom'), { env: {}, ensure, run: vi.fn(), log: () => {}, sharedBrainDir: '/s' })).toBeNull();
    expect(ensure).not.toHaveBeenCalled();
  });

  it('reports a refresh that fails and does not rerun', () => {
    const run = vi.fn();
    const log = vi.fn();
    const status = rerunAfterDefaultRefresh(refusal, { env: {}, ensure: () => { throw new Error('Required bundled auth plugin is missing'); }, run, log, sharedBrainDir: '/s' });
    expect(status).toBeNull();
    expect(run).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Required bundled auth plugin is missing'));
  });

  it('reports a rerun that cannot start', () => {
    const status = rerunAfterDefaultRefresh(refusal, { env: {}, argv: ['node', 'cli'], ensure: () => {}, run: () => ({ error: new Error('ENOENT') }), log: () => {}, sharedBrainDir: '/s' });
    expect(status).toBe(1);
  });
});
