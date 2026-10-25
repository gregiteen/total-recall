import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import child_process from 'node:child_process';

vi.mock('./logger.mjs', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('./config.mjs', () => ({ agentDir: '/mock/agent', brainDir: '/mock/brain' }));
vi.mock('node:os');

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    openSync: vi.fn(),
    closeSync: vi.fn(),
    unlinkSync: vi.fn(),
    renameSync: vi.fn(),
    realpathSync: vi.fn()
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  openSync: vi.fn(),
  closeSync: vi.fn(),
  unlinkSync: vi.fn(),
  renameSync: vi.fn()
}));

vi.mock('node:child_process', () => {
  const spawnMock = vi.fn();
  const spawnSyncMock = vi.fn();
  return {
    default: {
      spawn: spawnMock,
      spawnSync: spawnSyncMock
    },
    spawn: spawnMock,
    spawnSync: spawnSyncMock
  };
});

// Constants derived from mocked config
const PID_FILE = '/mock/brain/daemon.pid';
const LOG_FILE = '/mock/brain/logs/daemon.log';

describe('daemon-control', () => {
  let readPid;
  let getDaemonStatus;
  let startDaemon;
  let stopDaemon;
  let ensureDaemonRunning;
  let killSpy;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    fs.existsSync.mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('daemon-loop.mjs')) return true;
      return false;
    });
    fs.readFileSync.mockImplementation(p => {
      if (!fs.existsSync(p)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return '';
    });
    fs.realpathSync.mockImplementation(p => String(p).replace('/fixture', process.cwd()));
    fs.writeFileSync.mockReturnValue(undefined);
    fs.mkdirSync.mockReturnValue(undefined);
    fs.openSync.mockReturnValue(3);
    fs.closeSync.mockReturnValue(undefined);
    fs.unlinkSync.mockReturnValue(undefined);
    fs.renameSync.mockReturnValue(undefined);

    child_process.spawn.mockReturnValue({ pid: 12345, unref: vi.fn() });
    child_process.spawnSync.mockReturnValue({status:0,stdout:'node /fixture/src/core/daemon-loop.mjs'});

    killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);

    const mod = await import('./daemon-control.mjs');
    readPid = mod.readPid;
    getDaemonStatus = mod.getDaemonStatus;
    startDaemon = mod.startDaemon;
    stopDaemon = mod.stopDaemon;
    ensureDaemonRunning = mod.ensureDaemonRunning;
  });

  afterEach(() => {
    if (killSpy && killSpy.mockRestore) {
      killSpy.mockRestore();
    }
  });

  // ---------------------------------------------------------------------------
  // readPid
  // ---------------------------------------------------------------------------
  describe('readPid', () => {
    it('returns null when PID file does not exist', async () => {
      fs.existsSync.mockReturnValue(false);

      const pid = await readPid();

      expect(pid).toBeNull();
    });

    it('returns the pid number when PID file exists and process is alive', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('9876\n');
      killSpy.mockReturnValue(true); // signal 0 succeeds → process alive

      const pid = await readPid();

      expect(pid).toBe(9876);
      expect(killSpy).toHaveBeenCalledWith(9876, 0);
    });

    it('returns null when PID file exists but process is dead (kill throws)', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('9876\n');
      killSpy.mockImplementation(() => { throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' }); });

      const pid = await readPid();

      expect(pid).toBeNull();
    });

    it('returns null when PID file contains invalid (non-numeric) content', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('not-a-number\n');

      const pid = await readPid();

      expect(pid).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getDaemonStatus
  // ---------------------------------------------------------------------------
  describe('getDaemonStatus', () => {
    it('retains unknown for an unreadable lock', () => {
      fs.readFileSync.mockImplementation(() => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); });
      expect(getDaemonStatus()).toBe('unknown');
      expect(() => startDaemon()).toThrow('pid-unreadable');
      expect(child_process.spawn).not.toHaveBeenCalled();
    });

    it("returns 'running' when a live pid is found", async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('9876\n');
      killSpy.mockReturnValue(true);

      const status = await getDaemonStatus();

      expect(status).toBe('running');
    });

    it("returns 'dead' when PID file exists but process is no longer alive", async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('9876\n');
      killSpy.mockImplementation(() => { throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' }); });

      const status = await getDaemonStatus();

      expect(status).toBe('dead');
    });

    it("returns 'not_started' when no PID file exists", async () => {
      fs.existsSync.mockReturnValue(false);

      const status = await getDaemonStatus();

      expect(status).toBe('not_started');
    });
  });

  // ---------------------------------------------------------------------------
  // startDaemon
  // ---------------------------------------------------------------------------
  describe('startDaemon', () => {
    it('fails explicitly when the actual daemon entry is missing', () => {
      fs.existsSync.mockReturnValue(false);
      expect(() => startDaemon()).toThrow('Daemon script not found');
      expect(child_process.spawn).not.toHaveBeenCalled();
    });
    it.each(['node /other/src/core/daemon-loop.mjs', '', 'node /other/src/core/dream.mjs'])(
      'refuses start and ensure for an uncertain or foreign owner: %s', async stdout => {
        fs.readFileSync.mockReturnValue('9876');
        child_process.spawnSync.mockReturnValue({ status: 0, stdout });
        expect(() => startDaemon()).toThrow('refused');
        await expect(ensureDaemonRunning()).rejects.toThrow('refused');
        expect(child_process.spawn).not.toHaveBeenCalled();
        expect(fs.unlinkSync).not.toHaveBeenCalled();
        expect(killSpy.mock.calls.every(([, signal]) => signal === 0)).toBe(true);
      });

    it.each(['9876junk', '0', '-1', ''])('refuses malformed lock %s without spawning', lock => {
      fs.readFileSync.mockReturnValue(lock);
      expect(() => startDaemon()).toThrow('invalid-pid');
      expect(child_process.spawn).not.toHaveBeenCalled();
    });

    it('spawns a detached child and returns the pid, leaving the lockfile to the daemon', async () => {
      // No existing daemon running
      fs.existsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('daemon-loop.mjs')) return true;
        return false;
      });

      const fakePid = 12345;
      const fakeChild = { pid: fakePid, unref: vi.fn() };
      child_process.spawn.mockReturnValue(fakeChild);

      const pid = await startDaemon();

      expect(pid).toBe(fakePid);
      expect(child_process.spawn).toHaveBeenCalled();
      expect(fakeChild.unref).toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalledWith(PID_FILE, expect.anything(), expect.anything());
    });

    it('caps the daemon heap by default and honours TR_DAEMON_MAX_HEAP_MB', async () => {
      fs.existsSync.mockImplementation((p) => typeof p === 'string' && p.includes('daemon-loop.mjs'));
      child_process.spawn.mockReturnValue({ pid: 2, unref: vi.fn() });
      await startDaemon();
      expect(child_process.spawn.mock.calls[0][1][0]).toBe('--max-old-space-size=768');

      child_process.spawn.mockClear();
      process.env.TR_DAEMON_MAX_HEAP_MB = '0';
      try {
        await startDaemon();
        expect(child_process.spawn.mock.calls[0][1].some((a) => String(a).startsWith('--max-old-space-size'))).toBe(false);
      } finally {
        delete process.env.TR_DAEMON_MAX_HEAP_MB;
      }
    });

    it('returns existing pid without re-spawning if daemon is already running', async () => {
      // Make readPid return a live pid
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('9876\n');
      killSpy.mockReturnValue(true); // alive

      const pid = await startDaemon();

      expect(pid).toBe(9876);
      expect(child_process.spawn).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // stopDaemon
  // ---------------------------------------------------------------------------
  describe('stopDaemon', () => {
    it('does not signal or unlink a live unrelated or unidentifiable process',async()=>{
      fs.existsSync.mockReturnValue(true);fs.readFileSync.mockReturnValue('9876\n');
      for(const stdout of ['node /other/service.mjs','node /other/src/core/daemon-loop.mjs','']){
        child_process.spawnSync.mockReturnValue({status:0,stdout});
        expect(await stopDaemon()).toBe(false);
      }
      expect(killSpy).not.toHaveBeenCalledWith(9876,'SIGTERM');
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
    it('sends SIGTERM, waits for the process to exit, and returns true', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('9876\n');
      let probes = 0;
      killSpy.mockImplementation((pid, sig) => {
        if (sig === 0 && ++probes > 3) throw new Error('ESRCH'); // exits after a few polls
        return true;
      });

      const result = await stopDaemon({ graceMs: 1000, pollMs: 1 });

      expect(result).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(9876, 'SIGTERM');
      expect(killSpy).not.toHaveBeenCalledWith(9876, 'SIGKILL');
      expect(fs.unlinkSync).toHaveBeenCalledWith(PID_FILE); // stale lock of the exited pid
    });

    it('escalates to SIGKILL when the daemon outlives the grace period', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('9876\n');
      killSpy.mockReturnValue(true); // never exits on its own

      const result = await stopDaemon({ graceMs: 20, pollMs: 5 });

      expect(result).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(9876, 'SIGKILL');
    });

    it('leaves a lock that now belongs to a different daemon', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValueOnce('9876\n').mockReturnValue('5555\n');
      killSpy.mockImplementation((pid, sig) => { if (sig === 0 && pid === 9876 && killSpy.mock.calls.length > 2) throw new Error('ESRCH'); return true; });

      await stopDaemon({ graceMs: 1000, pollMs: 1 });

      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('returns false immediately when no pid is found', async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await stopDaemon();

      expect(result).toBe(false);
      expect(killSpy).not.toHaveBeenCalledWith(expect.anything(), 'SIGTERM');
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // ensureDaemonRunning
  // ---------------------------------------------------------------------------
  describe('ensureDaemonRunning', () => {
    it('returns the existing pid when daemon is already running', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('9876\n');
      killSpy.mockReturnValue(true);

      const pid = await ensureDaemonRunning();

      expect(pid).toBe(9876);
      expect(child_process.spawn).not.toHaveBeenCalled();
    });

    it('calls startDaemon and returns the new pid when daemon is not running', async () => {
      // First check → not running
      fs.existsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('daemon-loop.mjs')) return true;
        return false;
      });

      const fakePid = 12345;
      child_process.spawn.mockReturnValue({ pid: fakePid, unref: vi.fn() });

      const pid = await ensureDaemonRunning();

      expect(pid).toBe(fakePid);
      expect(child_process.spawn).toHaveBeenCalled();
    });

    it('throws when startDaemon fails (spawn returns no pid)', async () => {
      fs.existsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('daemon-loop.mjs')) return true;
        return false;
      });
      // Simulate a broken spawn (no pid on child)
      child_process.spawn.mockReturnValue({ pid: undefined, unref: vi.fn() });

      await expect(ensureDaemonRunning()).rejects.toThrow();
    });
  });
});
