import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { writeInterrupt, acquirePidLock, releasePidLock, reassertPidLock } from './daemon-loop.mjs';
import fs from 'fs';



describe('daemon-loop.mjs', () => {
  let originalExit;
  let originalKill;

  beforeEach(() => {
    vi.resetAllMocks();
    originalExit = process.exit;
    originalKill = process.kill;
    Object.defineProperty(process, 'exit', { value: vi.fn() });
    Object.defineProperty(process, 'kill', { value: vi.fn() });
    
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('');
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(process, 'exit', { value: originalExit });
    Object.defineProperty(process, 'kill', { value: originalKill });
    vi.restoreAllMocks();
  });

  it('exports writeInterrupt', () => {
    expect(writeInterrupt).toBeDefined();
  });

  describe('acquirePidLock', () => {
    it('creates PID lockfile if it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      acquirePidLock();
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('daemon.pid'), String(process.pid), { mode: 0o644 });
    });

    it('overwrites PID lockfile if existing PID is dead', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('99999');
      process.kill.mockImplementation(() => { throw new Error('Process dead'); });

      acquirePidLock();
      
      expect(process.kill).toHaveBeenCalledWith(99999, 0);
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('daemon.pid'), String(process.pid), { mode: 0o644 });
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('treats a lockfile holding its own pid as its own lock', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(String(process.pid));
      process.kill.mockReturnValue(true);

      acquirePidLock();

      expect(process.exit).not.toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('daemon.pid'), String(process.pid), { mode: 0o644 });
    });

    it('exits 0 when another daemon is already serving', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('99999');
      process.kill.mockReturnValue(true); // process alive

      acquirePidLock();

      expect(process.kill).toHaveBeenCalledWith(99999, 0);
      // Exit 0, NOT 1. The desired end state -- one daemon serving this brain --
      // already holds, so this is a successful no-op. Exiting 1 told the
      // supervisor the service had crashed, so systemd (`Restart=on-failure`)
      // restarted it every 10s forever: the cloud unit passed a restart counter
      // of 85 and filled its journal while the real daemon had been up for over
      // a day. This assertion previously required 1, i.e. it encoded the bug.
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  describe('releasePidLock', () => {
    it('deletes PID lockfile if PID matches', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(String(process.pid));
      
      releasePidLock();
      
      expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('daemon.pid'));
    });

    it('does not delete PID lockfile if PID does not match', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('99999');
      
      releasePidLock();
      
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('reassertPidLock', () => {
    it('restores a missing lock file', () => {
      fs.existsSync.mockReturnValue(false);
      expect(reassertPidLock()).toBe('owner');
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('daemon.pid'), String(process.pid), { mode: 0o644 });
    });

    it('takes the lock back from a dead holder', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('99999');
      process.kill.mockImplementation(() => { throw new Error('Process dead'); });
      expect(reassertPidLock()).toBe('owner');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('leaves its own lock untouched', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(String(process.pid));
      expect(reassertPidLock()).toBe('owner');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('reports a duplicate when another live daemon holds the lock', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('99999');
      process.kill.mockReturnValue(true);
      expect(reassertPidLock()).toBe('duplicate');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });
});
