import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { writeInterrupt, acquirePidLock, releasePidLock } from './daemon-loop.mjs';
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

    it('exits if existing PID is alive', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('99999');
      process.kill.mockReturnValue(true); // process alive

      acquirePidLock();
      
      expect(process.kill).toHaveBeenCalledWith(99999, 0);
      expect(process.exit).toHaveBeenCalledWith(1);
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
});
