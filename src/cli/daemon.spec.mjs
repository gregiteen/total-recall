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
});
