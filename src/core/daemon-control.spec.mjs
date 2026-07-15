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
    renameSync: vi.fn()
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
const PID_FILE = '/mock/brain/logs/daemon.pid';
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
    fs.readFileSync.mockReturnValue('');
    fs.writeFileSync.mockReturnValue(undefined);
    fs.mkdirSync.mockReturnValue(undefined);
    fs.openSync.mockReturnValue(3);
    fs.closeSync.mockReturnValue(undefined);
    fs.unlinkSync.mockReturnValue(undefined);
    fs.renameSync.mockReturnValue(undefined);

    child_process.spawn.mockReturnValue({ pid: 12345, unref: vi.fn() });

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
      killSpy.mockImplementation(() => { throw new Error('ESRCH'); });

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
      killSpy.mockImplementation(() => { throw new Error('ESRCH'); });

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
    it('spawns a detached child, writes PID file, and returns the pid', async () => {
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
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        PID_FILE,
        expect.stringContaining(String(fakePid)),
        'utf8'
      );
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
    it('sends SIGTERM, removes PID file, and returns true when pid exists', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('9876\n');
      killSpy.mockReturnValue(true);

      const result = await stopDaemon();

      expect(result).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(9876, 'SIGTERM');
      expect(fs.unlinkSync).toHaveBeenCalledWith(PID_FILE);
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
