import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

const order = vi.hoisted(() => ({ events: [], sshStatus: 1 }));
const ui = vi.hoisted(() => ({
  options: {},
  emitProgress: vi.fn(),
  finishDeployUI: vi.fn(),
  openBrowser: vi.fn(),
  startDeployUI: vi.fn(async () => 'http://localhost:3001'),
  waitForInstallOptions: vi.fn(async () => ui.options),
}));

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal();
  const record = name => (cmd, args) => {
    order.events.push(`child:${name}:${cmd}`);
    return { status: name === 'spawnSync' && cmd === 'ssh' ? order.sshStatus : 0, stdout: '', stderr: '' };
  };
  const mocked = { execSync: record('execSync'), execFileSync: record('execFileSync'), spawnSync: record('spawnSync'), spawn: record('spawn') };
  return { ...actual, ...mocked, default: { ...actual, ...mocked } };
});
vi.mock('./deploy-ui.mjs', () => ui);

const { default: deploy, _resetStdinPasswordGuard } = await import('./deploy.mjs');

describe('deploy failure and stdin ordering (A309)', () => {
  const silent = () => {};
  beforeEach(() => {
    order.events = []; order.sshStatus = 1;
    _resetStdinPasswordGuard();
    ui.emitProgress.mockClear();
    vi.spyOn(console, 'error').mockImplementation(silent);
    vi.spyOn(console, 'log').mockImplementation(silent);
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  const stdin = text => {
    const real = fs.readFileSync.bind(fs);
    return vi.spyOn(fs, 'readFileSync').mockImplementation((file, ...rest) => {
      if (file === 0) { order.events.push('stdin'); return text; }
      return real(file, ...rest);
    });
  };

  it('rejects empty stdin before any subprocess runs', async () => {
    stdin('\n');
    await expect(deploy(['--dashboard-password-stdin', '--allow-insecure-http'])).rejects.toThrow(/received no password/);
    expect(order.events).toEqual(['stdin']);
  });

  it('rejects an argv password combined with stdin before any subprocess runs', async () => {
    stdin('secret\n');
    await expect(deploy(['--dashboard-password', 'x', '--dashboard-password-stdin', '--allow-insecure-http'])).rejects.toThrow(/either --dashboard-password or/);
    expect(order.events).toEqual([]);
  });

  it('consumes a valid password first, ahead of every child process', async () => {
    stdin('secret\n');
    // --dry-run keeps the rest of deploy from touching the host.
    await deploy(['--dashboard-password-stdin', '--allow-insecure-http', '--dry-run']).catch(() => {});
    expect(order.events[0]).toBe('stdin');
    expect(order.events.filter(e => e === 'stdin')).toHaveLength(1);
  });

  it('--ui rethrows a failed remote connection so the command exits nonzero', async () => {
    ui.options = { deployTarget: 'localnet', localnetHost: '10.0.0.5', localnetUser: 'me', domain: 'example.test' };
    order.sshStatus = 255;
    await expect(deploy(['--ui'])).rejects.toThrow(/Failed to connect to me@10\.0\.0\.5/);
    expect(ui.emitProgress).toHaveBeenCalledWith('error', expect.stringMatching(/Failed to connect/));
  });

  it('--ui refuses an option-shaped host before any ssh call and still fails', async () => {
    ui.options = { deployTarget: 'localnet', localnetHost: '-oProxyCommand=touch', localnetUser: 'me', domain: 'example.test' };
    await expect(deploy(['--ui'])).rejects.toThrow(/Refusing the remote host/);
    expect(order.events.some(e => e.startsWith('child:spawnSync:ssh'))).toBe(false);
    expect(ui.emitProgress).toHaveBeenCalledWith('error', expect.stringMatching(/Refusing the remote host/));
  });
});
