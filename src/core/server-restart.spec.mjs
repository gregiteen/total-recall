import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { execFileSyncMock } = vi.hoisted(() => ({ execFileSyncMock: vi.fn() }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, execFileSync: execFileSyncMock, default: { ...actual, execFileSync: execFileSyncMock } };
});

import { detectSupervisor, requestSelfRestart, packageVersionOnDisk, planServerReplacement, openServerConnections, replaceStaleServer } from './server-restart.mjs';

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

describe('planServerReplacement', () => {
  let root;
  let install;
  const owner = { supervised: true, kind: 'launchd', label: 'com.totalrecall.brain', scope: 'user', reason: 'launchd job owns it' };
  const plan = (overrides = {}) => planServerReplacement({
    brainDir: '/brain',
    globalRoot: root,
    latest: '3.43.3',
    env: {},
    identity: () => ({ status: 'running', pid: 520 }),
    supervisor: () => owner,
    ...overrides,
  });
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-replace-'));
    install = path.join(root, 'total-recall-brain');
    fs.mkdirSync(install);
    fs.writeFileSync(path.join(install, 'package.json'), JSON.stringify({ version: '3.43.3' }));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('restarts a server its login owns, running from the global install at the release', () => {
    const identity = vi.fn(() => ({ status: 'running', pid: 520 }));
    expect(plan({ identity })).toEqual({ method: 'restart', kind: 'launchd', label: 'com.totalrecall.brain', pid: 520 });
    expect(identity).toHaveBeenCalledWith('/brain/server.pid', path.join(install, 'src', 'server', 'index.mjs'));
  });

  it('never restarts a system service, whatever it runs from', () => {
    const system = { supervised: true, kind: 'systemd', label: 'total-recall-server', scope: 'system', reason: 'unit owns it' };
    expect(plan({ supervisor: () => system }).method).toBe('deploy');
    const elsewhere = plan({ supervisor: () => system, identity: () => ({ status: 'conflict', pid: 7, entry: '/srv/checkout/src/server/index.mjs' }) });
    expect(elsewhere.method).toBe('deploy');
    expect(elsewhere.reason).toMatch(/deploy release/);
  });

  it('leaves a server that runs from somewhere else, because a restart would not move it', () => {
    const result = plan({ identity: () => ({ status: 'conflict', pid: 7, entry: '/srv/checkout/src/server/index.mjs' }) });
    expect(result.method).toBe('none');
    expect(result.reason).toContain('/srv/checkout');
  });

  it('leaves a global link to a checkout, which auto-pull owns', () => {
    fs.mkdirSync(path.join(install, '.git'));
    const result = plan();
    expect(result.method).toBe('none');
    expect(result.reason).toMatch(/checkout/);
  });

  it('leaves a server when the install on disk is not the release', () => {
    const result = plan({ latest: '3.44.0' });
    expect(result.method).toBe('none');
    expect(result.reason).toContain('3.43.3');
  });

  it('leaves a process nothing would bring back, and one only declared as supervised', () => {
    expect(plan({ supervisor: () => ({ supervised: false, reason: 'no launchd job reports this pid' }) }).method).toBe('none');
    expect(plan({ supervisor: () => ({ supervised: true, kind: 'declared', label: 'TR_SUPERVISED=1', reason: 'declared by operator' }) }).method).toBe('none');
  });

  it('leaves a server when no process could be identified', () => {
    const supervisor = vi.fn();
    expect(plan({ supervisor, identity: () => ({ status: 'not-started' }) }).method).toBe('none');
    expect(supervisor).not.toHaveBeenCalled();
  });

  it('honors the opt-out and an unknown global root', () => {
    expect(plan({ env: { TR_SERVER_AUTO_RESTART: '0' } }).reason).toMatch(/TR_SERVER_AUTO_RESTART/);
    expect(plan({ globalRoot: undefined }).method).toBe('none');
  });
});

describe('detectSupervisor scope', () => {
  afterEach(() => { delete process.env.TR_SUPERVISED; });

  it('says a declared supervisor has no scope it can drive', () => {
    process.env.TR_SUPERVISED = '1';
    expect(detectSupervisor().scope).toBe(null);
  });

  it('says which scope owns the process', () => {
    delete process.env.TR_SUPERVISED;
    if (process.platform === 'darwin') {
      execFileSyncMock.mockReturnValue(`{\n\t"PID" = ${process.pid};\n};`);
      expect(detectSupervisor().scope).toBe(process.getuid() === 0 ? 'system' : 'user');
    } else {
      execFileSyncMock.mockImplementation((_bin, args) => (args[0] === '--user' ? String(process.pid) : '0'));
      expect(detectSupervisor().scope).toBe('user');
    }
  });
});

describe('openServerConnections', () => {
  const lsof = (stdout, status = 0, stderr = '') => () => ({ status, stdout, stderr });

  it('counts connections to the server, not ones it made to the same port elsewhere', () => {
    const stdout = 'p520\nf21\nn127.0.0.1:3000->127.0.0.1:52344\nf22\nn100.64.0.6:3000->100.64.0.2:60000\nf23\nn100.64.0.6:51000->100.64.0.1:3000\n';
    expect(openServerConnections({ pid: 520, port: 3000, platform: 'darwin', run: lsof(stdout) })).toBe(2);
  });

  it('reads an empty lsof as none, because lsof exits 1 when nothing matches', () => {
    expect(openServerConnections({ pid: 520, port: 3000, platform: 'darwin', run: lsof('', 1) })).toBe(0);
  });

  it('returns null when it cannot tell', () => {
    expect(openServerConnections({ pid: 520, port: 3000, platform: 'darwin', run: lsof('', 1, 'lsof: permission denied') })).toBe(null);
    expect(openServerConnections({ pid: 520, port: 3000, platform: 'darwin', run: () => ({ error: new Error('ENOENT') }) })).toBe(null);
  });

  it('counts established sockets with ss on Linux', () => {
    const run = vi.fn(() => ({ status: 0, stdout: '0 0 127.0.0.1:3000 127.0.0.1:52344\n0 0 100.64.0.6:3000 100.64.0.2:60000\n' }));
    expect(openServerConnections({ pid: 520, port: 3000, platform: 'linux', run })).toBe(2);
    expect(run).toHaveBeenCalledWith('ss', ['-tnH', 'state', 'established', 'sport', '=', ':3000'], expect.anything());
  });
});

describe('replaceStaleServer', () => {
  const server = { status: 'stale', url: 'http://127.0.0.1:3000', running: '3.43.2', latest: '3.43.3', reason: 'old process' };
  const restart = { method: 'restart', kind: 'launchd', label: 'com.totalrecall.brain', pid: 520 };
  // A clock that only moves when the code sleeps, so waits are exercised without waiting.
  const clock = (start = 1000) => {
    let time = start;
    return { now: () => time, sleep: async (ms) => { time += ms; }, advance: (ms) => { time += ms; } };
  };
  const launchctl = () => vi.fn(() => ({ status: 0, stdout: '', stderr: '' }));
  const base = (overrides = {}) => {
    const time = clock();
    return {
      brainDir: '/brain',
      server,
      globalRoot: '/global',
      uid: 501,
      plan: () => restart,
      connections: () => 0,
      run: launchctl(),
      observe: vi.fn().mockResolvedValue({ status: 'current', url: server.url, running: '3.43.3', latest: '3.43.3' }),
      now: time.now,
      sleep: time.sleep,
      ...overrides,
    };
  };

  it('restarts through the login domain and reports what /health then says', async () => {
    const options = base();
    const result = await replaceStaleServer(options);
    expect(options.run).toHaveBeenCalledWith('launchctl', ['print', 'gui/501/com.totalrecall.brain'], expect.anything());
    expect(options.run).toHaveBeenCalledWith('launchctl', ['kickstart', '-k', 'gui/501/com.totalrecall.brain'], expect.anything());
    expect(result).toMatchObject({ status: 'current', running: '3.43.3', replacement: { method: 'restart', state: 'replaced', from: '3.43.2' } });
  });

  it('uses the user domain on a Mac with no login session', async () => {
    const run = vi.fn((_bin, args) => ({ status: args[0] === 'print' && args[1].startsWith('gui/') ? 113 : 0, stdout: '', stderr: '' }));
    await replaceStaleServer(base({ run }));
    expect(run).toHaveBeenCalledWith('launchctl', ['kickstart', '-k', 'user/501/com.totalrecall.brain'], expect.anything());
  });

  it('restarts a systemd user unit through the user manager', async () => {
    const run = launchctl();
    await replaceStaleServer(base({ run, plan: () => ({ ...restart, kind: 'systemd', label: 'total-recall-server' }) }));
    expect(run).toHaveBeenCalledWith('systemctl', ['--user', 'restart', 'total-recall-server'], expect.anything());
  });

  it('reports the plan and touches nothing on a host it may not restart', async () => {
    const run = launchctl();
    const result = await replaceStaleServer(base({ run, plan: () => ({ method: 'deploy', reason: 'production' }) }));
    expect(run).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'stale', replacement: { method: 'deploy', reason: 'production' } });
  });

  it('waits out a short connection before restarting', async () => {
    const connections = vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(1).mockReturnValue(0);
    const run = launchctl();
    const result = await replaceStaleServer(base({ connections, run }));
    expect(connections).toHaveBeenCalledTimes(3);
    expect(result.replacement.state).toBe('replaced');
  });

  it('holds while a connection stays open, and keeps the time the hold began', async () => {
    const run = launchctl();
    const first = await replaceStaleServer(base({ connections: () => 2, run }));
    expect(run).not.toHaveBeenCalled();
    // The clock starts at 1000 and the wait for a quiet moment takes 30 seconds of it.
    expect(first).toMatchObject({ status: 'stale', replacement: { state: 'held', held_since: 31000 } });
    expect(first.replacement.reason).toMatch(/2 connection/);
    const second = await replaceStaleServer(base({ connections: () => 2, run, previous: { replacement: { state: 'held', held_since: 500 } } }));
    expect(second.replacement.held_since).toBe(500);
  });

  it('does not inherit the start of a hold from a replacement that finished', async () => {
    const result = await replaceStaleServer(base({ connections: () => 2, previous: { replacement: { state: 'replaced', held_since: 1 } } }));
    expect(result.replacement.held_since).toBe(31000);
  });

  it('restarts anyway once a connection has held it for six hours', async () => {
    const run = launchctl();
    const result = await replaceStaleServer(base({ connections: () => 1, run, previous: { replacement: { state: 'held', held_since: 1000 - 6 * 60 * 60 * 1000 } } }));
    expect(run).toHaveBeenCalledWith('launchctl', ['kickstart', '-k', 'gui/501/com.totalrecall.brain'], expect.anything());
    expect(result.replacement.state).toBe('replaced');
  });

  it('treats unreadable connections as a hold, not as idle', async () => {
    const result = await replaceStaleServer(base({ connections: () => null }));
    expect(result.replacement).toMatchObject({ state: 'held' });
    expect(result.replacement.reason).toMatch(/could not be read/);
  });

  it('fails when the supervisor has no such job', async () => {
    const run = vi.fn(() => ({ status: 113, stdout: '', stderr: 'Could not find service' }));
    const result = await replaceStaleServer(base({ run }));
    expect(result).toMatchObject({ status: 'stale', replacement: { state: 'failed' } });
    expect(run).not.toHaveBeenCalledWith('launchctl', expect.arrayContaining(['kickstart']), expect.anything());
  });

  it('fails when the restart command fails', async () => {
    const run = vi.fn((_bin, args) => (args[0] === 'kickstart' ? { status: 5, stdout: '', stderr: 'Input/output error' } : { status: 0, stdout: '', stderr: '' }));
    const result = await replaceStaleServer(base({ run }));
    expect(result).toMatchObject({ status: 'stale', replacement: { state: 'failed' } });
    expect(result.replacement.reason).toContain('Input/output error');
  });

  it('does not call it replaced until /health reports the release', async () => {
    const observe = vi.fn()
      .mockResolvedValueOnce({ status: 'none', url: server.url, reason: 'No server runs on this host.' })
      .mockResolvedValueOnce({ status: 'stale', url: server.url, running: '3.43.2', latest: '3.43.3' })
      .mockResolvedValue({ status: 'current', url: server.url, running: '3.43.3', latest: '3.43.3' });
    const result = await replaceStaleServer(base({ observe }));
    expect(observe).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ status: 'current', replacement: { state: 'replaced' } });
  });

  it('fails when /health never reports the release, and says what it last saw', async () => {
    const observe = vi.fn().mockResolvedValue({ status: 'stale', url: server.url, running: '3.43.2', latest: '3.43.3', reason: 'still old' });
    const result = await replaceStaleServer(base({ observe }));
    expect(result).toMatchObject({ status: 'stale', running: '3.43.2', replacement: { state: 'failed' } });
    expect(result.replacement.reason).toContain('3.43.3');
  });

  it('turns an unexpected error into a failed replacement, so it cannot lose the maintenance report', async () => {
    const result = await replaceStaleServer(base({ plan: () => { throw new Error('boom'); } }));
    expect(result).toMatchObject({ status: 'stale', replacement: { state: 'failed', reason: 'boom' } });
  });
});
