import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('node:os', () => ({ default: { platform: () => 'darwin', homedir: () => '/fixture' } }));
vi.mock('node:fs', () => ({ default: { existsSync: () => true } }));
vi.mock('node:child_process', () => {
  const methods = { execSync: vi.fn(), execFileSync: vi.fn(), spawnSync: vi.fn(), spawn: vi.fn() };
  return { ...methods, default: methods };
});
vi.mock('./agent-dir.mjs', () => ({ resolveBrainDir: () => '/fixture/brain' }));
vi.mock('../core/daemon-control.mjs', () => ({ startDaemon: vi.fn(), stopDaemon: vi.fn(), readPid: vi.fn(), getDaemonObservation: vi.fn() }));
import { execSync, execFileSync, spawnSync } from 'node:child_process';
import { getDaemonObservation, startDaemon, stopDaemon } from '../core/daemon-control.mjs';
import daemon from './daemon.mjs';

describe('daemon manager ownership', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });
  for (const status of ['conflict', 'unknown']) {
    it.each(['start', 'ensure', 'stop'])(`refuses managed %s on ${status} without manager mutation`, async command => {
      getDaemonObservation.mockReturnValue({ status, reason: 'foreign-pid', expected_entry: '/own/daemon', entry: '/other/daemon' });
      await expect(daemon([command])).rejects.toThrow('refused');
      expect(execSync).not.toHaveBeenCalled();
      expect(execFileSync).not.toHaveBeenCalled();
      expect(spawnSync).not.toHaveBeenCalled();
      expect(startDaemon).not.toHaveBeenCalled();
      expect(stopDaemon).not.toHaveBeenCalled();
    });
  }
  it('reports shared observation separately from manager registration', async () => {
    const observation = { status: 'unknown', reason: 'process-identity-unavailable' };
    getDaemonObservation.mockReturnValue(observation);
    spawnSync.mockReturnValue({ status: 1, stdout: '' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await daemon(['status']);
    expect(JSON.parse(log.mock.calls[0][0])).toEqual({ daemon: observation });
  });
  const launchctlCalls = () => spawnSync.mock.calls.filter(([cmd]) => cmd === 'launchctl').map(([, args]) => args);
  it('stop disables and unloads the launchd job so KeepAlive cannot restart it', async () => {
    getDaemonObservation.mockReturnValue({ status: 'running' });
    let loaded = true;
    spawnSync.mockImplementation((cmd, args) => {
      if (args[0] === 'bootout') loaded = false;
      return { status: args[0] === 'print' ? (loaded ? 0 : 113) : 0, stdout: '', stderr: '' };
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await daemon(['stop']);
    const target = `gui/${process.getuid()}/com.totalrecall.daemon`;
    expect(launchctlCalls()).toEqual([['disable', target], ['print', target], ['bootout', target], ['print', target]]);
  });
  it('stop fails loudly when launchctl fails', async () => {
    getDaemonObservation.mockReturnValue({ status: 'running' });
    spawnSync.mockImplementation((cmd, args) => ({ status: args[0] === 'bootout' ? 5 : 0, stdout: '', stderr: 'Boot-out failed: 5' }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(daemon(['stop'])).rejects.toThrow('launchctl bootout failed: Boot-out failed: 5');
  });
  it('start re-enables, bootstraps when unloaded and kickstarts', async () => {
    getDaemonObservation.mockReturnValue({ status: 'stopped' });
    spawnSync.mockImplementation((cmd, args) => ({ status: args[0] === 'print' ? 113 : 0, stdout: '', stderr: '' }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await daemon(['start']);
    expect(launchctlCalls().map(args => args[0])).toEqual(['enable', 'print', 'bootstrap', 'kickstart']);
    expect(launchctlCalls()[2]).toEqual(['bootstrap', `gui/${process.getuid()}`, '/fixture/Library/LaunchAgents/com.totalrecall.daemon.plist']);
  });
});
