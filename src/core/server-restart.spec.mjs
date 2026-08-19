import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { execFileSyncMock } = vi.hoisted(() => ({ execFileSyncMock: vi.fn() }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, execFileSync: execFileSyncMock, default: { ...actual, execFileSync: execFileSyncMock } };
});

import { detectSupervisor, requestSelfRestart, packageVersionOnDisk } from './server-restart.mjs';

describe('detectSupervisor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TR_SUPERVISED;
  });
  afterEach(() => {
    delete process.env.TR_SUPERVISED;
  });

  it('reports supervised when a launchd job owns THIS pid', () => {
    execFileSyncMock.mockReturnValue(`{\n\t"PID" = ${process.pid};\n};`);
    const result = detectSupervisor();
    if (process.platform === 'darwin') {
      expect(result.supervised).toBe(true);
      expect(result.kind).toBe('launchd');
    } else {
      // systemd path takes a numeric MainPID
      expect(result.kind === 'systemd' || result.supervised === false).toBe(true);
    }
  });

  it('reports UNsupervised when the job reports a different pid', () => {
    // The whole point: a job existing is not proof it owns us. Attaching to a
    // job that supervises some OTHER process and then exiting is an outage.
    execFileSyncMock.mockReturnValue('{\n\t"PID" = 999999;\n};');
    expect(detectSupervisor().supervised).toBe(false);
  });

  it('reports UNsupervised when no job exists at all', () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error('Could not find service');
    });
    const result = detectSupervisor();
    expect(result.supervised).toBe(false);
    expect(result.reason).toMatch(/no (launchd|systemd)/);
  });

  it('accepts TR_SUPERVISED=1 as an operator declaration', () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error('no such job');
    });
    process.env.TR_SUPERVISED = '1';
    const result = detectSupervisor();
    expect(result.supervised).toBe(true);
    expect(result.kind).toBe('declared');
  });
});

describe('requestSelfRestart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TR_SUPERVISED;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TR_SUPERVISED;
  });

  it('refuses to exit when nothing would restart the process', () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error('no such job');
    });
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const result = requestSelfRestart();
    expect(result.scheduled).toBe(false);
    expect(result.reason).toMatch(/refusing to exit/);
    expect(kill).not.toHaveBeenCalled();
    kill.mockRestore();
  });

  it('signals SIGTERM — not process.exit — so the pid lock is released', () => {
    // Exiting hard would strand the server.pid lock and the respawned instance
    // would hit the singleton guard and die: a restart that becomes a stop.
    vi.useFakeTimers();
    process.env.TR_SUPERVISED = '1';
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const result = requestSelfRestart({ delayMs: 10 });
    expect(result.scheduled).toBe(true);
    expect(kill).not.toHaveBeenCalled(); // response must flush first
    vi.advanceTimersByTime(20);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    kill.mockRestore();
  });

  it('force overrides the supervision refusal', () => {
    vi.useFakeTimers();
    execFileSyncMock.mockImplementation(() => {
      throw new Error('no such job');
    });
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const result = requestSelfRestart({ delayMs: 10, force: true });
    expect(result.scheduled).toBe(true);
    vi.advanceTimersByTime(20);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    kill.mockRestore();
  });
});

describe('packageVersionOnDisk', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-restart-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads the version from disk, not from the import cache', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    expect(packageVersionOnDisk(dir)).toBe('1.0.0');
    // An install replacing the directory must be visible immediately — that is
    // the whole signal the restart decision rests on.
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '2.0.0' }));
    expect(packageVersionOnDisk(dir)).toBe('2.0.0');
  });

  it('returns null for a missing or unreadable manifest instead of throwing', () => {
    expect(packageVersionOnDisk(path.join(dir, 'nope'))).toBeNull();
    fs.writeFileSync(path.join(dir, 'package.json'), '{ not json');
    expect(packageVersionOnDisk(dir)).toBeNull();
  });
});
