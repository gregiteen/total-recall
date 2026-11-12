// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { ensureServerService, serverEnvironment, stableNodePath } from './server-service.mjs';

it('leaves systemd hosts to server-release without invoking commands', async () => {
  const exec = vi.fn();
  expect(await ensureServerService({ platform: 'linux', exec })).toMatchObject({ status: 'unchanged', reason: expect.stringContaining('server-release') });
  expect(exec).not.toHaveBeenCalled();
});

// plutil is macOS's parser. These fixtures never use the host LaunchAgents directory.
describe.runIf(process.platform === 'darwin')('server LaunchAgent ensure', () => {
  let tmp, root, home, plistPath, bin, child, loaded, calls;
  const convert = (value, format) => {
    const res = spawnSync('plutil', ['-convert', format, '-o', '-', '-'], { input: value, encoding: 'utf8' });
    if (res.status !== 0) throw new Error('Fixture conversion failed');
    return res.stdout;
  };
  const decode = () => JSON.parse(convert(fs.readFileSync(plistPath, 'utf8'), 'json'));
  function existing(extra = {}) {
    const data = { Label: 'com.totalrecall.server', WorkingDirectory: path.join(tmp, 'old'),
      ProgramArguments: ['/opt/homebrew/Cellar/node/old/bin/node', 'src/server/index.mjs'],
      EnvironmentVariables: { HOST: '100.64.0.2', TR_LEADER_IP: '100.64.0.1',
        TR_DASHBOARD_BRAIN_DIR: path.join(home, 'shared-brain'), TR_SECRETS_BRAIN: path.join(home, 'secret-brain'),
        DISABLE_DAEMON: 'true', TR_SUPERVISED_DAEMON_ENTRY: path.join(home, 'daemon.mjs'),
        TR_RUNTIME_PLUGINS_DIR: path.join(tmp, 'old/plugins'),
        AGENT_DIR: path.join(home, '.agent'), TR_SECRETS_PASSWORD: 'fixture-password', ...extra } };
    fs.writeFileSync(plistPath, convert(JSON.stringify(data), 'xml1'));
  }
  function exec(cmd, args, options) {
    if (cmd !== 'launchctl') return spawnSync(cmd, args, options);
    calls.push(args);
    if (args[0] === 'print') return { status: loaded ? 0 : 113 };
    if (args[0] === 'bootout') { loaded = false; return { status: 0 }; }
    if (args[0] === 'bootstrap') { loaded = true; return { status: 0 }; }
    throw new Error('Unexpected fake launchctl command');
  }
  const options = () => ({ home, packageRoot: root, env: { PATH: bin }, exec, uid: 501, attempts: 3, sleep: async () => {} });
  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'server-service-')));
    root = path.join(tmp, 'current'); home = path.join(tmp, 'home'); bin = path.join(tmp, 'bin');
    plistPath = path.join(home, 'Library/LaunchAgents/com.totalrecall.server.plist');
    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    fs.mkdirSync(path.join(root, 'templates'), { recursive: true }); fs.mkdirSync(bin);
    fs.copyFileSync('templates/com.totalrecall.server.plist', path.join(root, 'templates/com.totalrecall.server.plist'));
    fs.symlinkSync(process.execPath, path.join(bin, 'node'));
    loaded = true; calls = []; child = null;
    existing();
  });
  afterEach(async () => {
    if (child && child.exitCode === null) { const closed = once(child, 'close'); child.kill(); await closed; }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('prints a redacted diff and makes no changes or launchctl calls in dry run', async () => {
    const before = fs.readFileSync(plistPath, 'utf8');
    const result = await ensureServerService({ ...options(), dryRun: true, identity: () => { throw new Error('dry run must not observe lifecycle'); } });
    expect(result.status).toBe('dry_run');
    expect(result.diff).toContain(`+ WorkingDirectory: ${JSON.stringify(root)}`);
    expect(result.diff).toContain(path.join(bin, 'node'));
    expect(result.diff).toContain('- EnvironmentVariables.TR_RUNTIME_PLUGINS_DIR');
    expect(result.diff).not.toContain('fixture-password');
    expect(fs.readFileSync(plistPath, 'utf8')).toBe(before);
    expect(calls).toEqual([]);
  });

  it('reads a binary plist without changing its bytes in dry run', async () => {
    const data = decode();
    const binary = spawnSync('plutil', ['-convert', 'binary1', '-o', '-', '-'], { input: JSON.stringify(data) });
    expect(binary.status).toBe(0);
    fs.writeFileSync(plistPath, binary.stdout);
    const result = await ensureServerService({ ...options(), dryRun: true });
    expect(result.diff).toContain('+ WorkingDirectory:');
    expect(fs.readFileSync(plistPath)).toEqual(binary.stdout);
    expect(calls).toEqual([]);
  });

  it('renders the template, preserves operator env and verifies the real replacement process', async () => {
    const entry = path.join(root, 'src/server/index.mjs');
    const pidFile = path.join(home, '.agent/skills/total-recall/server.pid');
    fs.mkdirSync(path.dirname(entry), { recursive: true }); fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    fs.writeFileSync(entry, "import fs from 'node:fs'; fs.writeFileSync(process.env.FIXTURE_PID, String(process.pid)); setInterval(() => {}, 1000);");
    const fakeLaunchctl = (cmd, args, opts) => {
      const result = exec(cmd, args, opts);
      if (cmd === 'launchctl' && args[0] === 'bootstrap') child = spawn(process.execPath, [entry], { cwd: root, env: { ...process.env, FIXTURE_PID: pidFile }, stdio: 'ignore' });
      return result;
    };
    const result = await ensureServerService({ ...options(), exec: fakeLaunchctl, attempts: 40, sleep: ms => new Promise(resolve => setTimeout(resolve, ms)) });
    expect(result).toMatchObject({ status: 'ready', pid: child.pid, entry });
    const plist = decode();
    expect(plist.WorkingDirectory).toBe(root);
    expect(plist.ProgramArguments).toEqual([path.join(bin, 'node'), 'src/server/index.mjs']);
    expect(plist.EnvironmentVariables).toMatchObject({ HOST: '100.64.0.2', TR_LEADER_IP: '100.64.0.1',
      TR_SECRETS_BRAIN: path.join(home, 'secret-brain'), DISABLE_DAEMON: 'true', TR_SECRETS_PASSWORD: 'fixture-password',
      TR_SUPERVISED_DAEMON_ENTRY: path.join(home, 'daemon.mjs'), TR_DASHBOARD_BRAIN_DIR: path.join(home, 'shared-brain') });
    expect(plist.EnvironmentVariables.TR_RUNTIME_PLUGINS_DIR).toBeUndefined();
    expect(calls.filter(args => ['bootout', 'bootstrap'].includes(args[0]))).toEqual([
      ['bootout', 'gui/501/com.totalrecall.server'], ['bootstrap', 'gui/501', plistPath],
    ]);
  });

  it('maps core paths from another checkout and drops obsolete foreign paths', () => {
    const old = path.join(tmp, 'old');
    expect(serverEnvironment({ AGENT_DIR: `${old}/.agent`, TR_SECRETS_BRAIN: `${old}/.agent/skills/total-recall`,
      TR_SUPERVISED_DAEMON_ENTRY: `${old}/src/core/daemon-loop.mjs`, TR_DASHBOARD_BRAIN_DIR: `${old}/.agent/skills/total-recall`,
      TR_RUNTIME_PLUGINS_DIR: `${old}/plugins`, PATH: `${old}/node_modules/.bin:/usr/bin`, HOST: '127.0.0.1' },
    { packageRoot: root, oldRoot: old })).toEqual({ AGENT_DIR: `${root}/.agent`, TR_SECRETS_BRAIN: `${root}/.agent/skills/total-recall`,
      PATH: `${root}/node_modules/.bin:/usr/bin`, HOST: '127.0.0.1' });
  });

  it('finds a foreign package path even when it differs from WorkingDirectory', () => {
    const other = path.join(tmp, 'another'); fs.mkdirSync(other);
    fs.writeFileSync(path.join(other, 'package.json'), JSON.stringify({ name: 'total-recall-brain' }));
    expect(serverEnvironment({ TR_SERVER_PID_FILE: `${other}/server.pid`, TR_RUNTIME_PLUGINS_DIR: `${other}/plugins` },
      { packageRoot: root, oldRoot: root })).toEqual({ TR_SERVER_PID_FILE: `${root}/server.pid` });
  });

  it('refuses Cellar paths and selects the stable executable path without resolving its symlink', () => {
    const cellar = path.join(tmp, 'Cellar/node/1/bin'); fs.mkdirSync(cellar, { recursive: true });
    fs.symlinkSync(process.execPath, path.join(cellar, 'node'));
    expect(stableNodePath({ PATH: `${cellar}:${bin}` })).toBe(path.join(bin, 'node'));
    expect(() => stableNodePath({ PATH: cellar })).toThrow(/stable node/);
  });

  it('does not change a plist when process identity is unknown', async () => {
    const before = fs.readFileSync(plistPath, 'utf8');
    await expect(ensureServerService({ ...options(), identity: () => ({ status: 'unknown' }) })).rejects.toThrow(/identity is unknown/);
    expect(fs.readFileSync(plistPath, 'utf8')).toBe(before);
    expect(calls).toEqual([]);
  });

  it.each(['reload', 'verification'])('fails closed on %s failure and restores the plist', async failure => {
    const before = fs.readFileSync(plistPath, 'utf8');
    await expect(ensureServerService({ ...options(), identity: () => ({ status: 'running', pid: 11 }),
      exec: (cmd, args, opts) => cmd === 'launchctl' && args[0] === 'bootstrap' && failure === 'reload' ? { status: 5 } : exec(cmd, args, opts) })).rejects.toThrow(failure === 'reload' ? /bootstrap failed/ : /verification failed/);
    expect(fs.readFileSync(plistPath, 'utf8')).toBe(before);
  });
});
