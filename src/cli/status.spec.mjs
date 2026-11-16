/**
 * Unit tests for Total Recall status CLI
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import statusCmd from './status.mjs';
// The Auth configuration owner is faked at its real contract; binding itself is tested in the owner repo and by connection-token.spec.
const authOwner = vi.hoisted(() => ({ connectionToken: vi.fn(), runtimeConfiguration: () => ({}) }));
vi.mock('../core/daemon-control.mjs', () => ({ getDaemonObservation: vi.fn() }));
vi.mock('../core/plugin-runtime.mjs', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, loadPluginModule: vi.fn(async (id, ...args) => id === 'auth' ? authOwner : id === 'mesh'
    ? { leaderPin: () => null } : actual.loadPluginModule(id, ...args)) };
});
import { getDaemonObservation } from '../core/daemon-control.mjs';
import { loadPluginModule } from '../core/plugin-runtime.mjs';

describe('status command', () => {
  let logSpy;
  let existsSyncSpy;
  let readFileSyncSpy;
  let fetchSpy;

  beforeEach(() => {
    loadPluginModule.mockImplementation(async (id) => id === 'auth' ? authOwner : { leaderPin: () => null });
    authOwner.connectionToken.mockReset().mockImplementation(({ url }) => url === 'http://localhost:3000'
      ? { token: 'saved-auth-token', source: 'auth', origin: 'http://localhost:3000' }
      : { token: null, source: null, origin: 'http://localhost:3000', reason: 'origin-mismatch' });
    getDaemonObservation.mockReturnValue({ status: 'not-started', source: 'local-pid', expected_entry: '/own/daemon-loop.mjs' });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Default mock behavior for file existence
    existsSyncSpy = vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (p.includes('brain.json') || p.includes('wizard-config.json') || p.includes('cloudflared.pid') || p.includes('INSTRUCTIONS.md')) {
        return true;
      }
      return false;
    });

    // Default mock behavior for file reading
    readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (p.includes('brain.json')) {
        return JSON.stringify({ url: 'http://localhost:3000', token: 'test-token', layer: 'project', name: 'ssss' });
      }
      if (p.includes('wizard-config.json')) {
        return JSON.stringify({
          'deploy-mode': 'quick-tunnel',
          'cfg-dash-url': 'https://my-tunnel.trycloudflare.com/dashboard'
        });
      }
      if (p.includes('cloudflared.pid')) {
        return '45678';
      }
      if (p.includes('INSTRUCTIONS.md')) {
        return 'Mock instructions content';
      }
      return '';
    });

    // Mock live processes and health check fetch requests
    vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid === 45678) return true;
      throw new Error('Process not found');
    });

    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      url = String(url);
      if (url.includes('/health')) {
        return {
          ok: true,
          json: async () => ({ status: 'healthy', uptime_seconds: 120 })
        };
      }
      if (url.includes('/api/instructions')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ sha256: 'mock-sha', bytes: 100, modified: '2026-05-25T00:00:00Z' })
        };
      }
      return { ok: false };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly reports status details including server health, deploy mode, tunnel PID, and daemon state', async () => {
    // Override fs.statSync to return mock metadata
    vi.spyOn(fs, 'statSync').mockReturnValue({
      size: 100,
      mtime: new Date('2026-05-25T00:00:00Z'),
      mtimeMs: 12345678
    });

    await statusCmd([]);

    const logs = logSpy.mock.calls.map(args => args[0]).join('\n');
    
    expect(logs).toContain('Total Recall — Status');
    expect(logs).toContain('Brain Server:     🟢 Online');
    expect(logs).toContain('Deploy Mode:      quick-tunnel');
    expect(logs).toContain('Dashboard UI:     https://my-tunnel.trycloudflare.com/dashboard');
    expect(logs).toContain('Tunnel Process:   🟢 Active (PID 45678)');
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('brain=project%3Assss'))).toBe(true);
  });

  describe('saved token and origin binding', () => {
    const instructionsCalls = () => fetchSpy.mock.calls.filter(([url]) => String(url).includes('/api/instructions'));
    const auth = call => call[1]?.headers?.Authorization;
    beforeEach(() => { vi.spyOn(fs, 'statSync').mockReturnValue({ size: 100, mtime: new Date('2026-05-25T00:00:00Z'), mtimeMs: 1 }); });

    it('asks the Auth owner for the configured endpoint and sends its token', async () => {
      await statusCmd([]);
      expect(authOwner.connectionToken).toHaveBeenCalledOnce();
      const arg = authOwner.connectionToken.mock.calls[0][0];
      expect(arg.url).toBe('http://localhost:3000');
      expect(arg.legacyBrainJson).toHaveLength(1);
      expect(arg.legacyBrainJson[0]).toMatch(/config\/brain\.json$/);
      expect(auth(instructionsCalls()[0])).toBe('Bearer saved-auth-token');
    });

    it('does not forward the saved token to a --brain on another origin', async () => {
      await statusCmd(['--brain', 'https://other.example']);
      expect(authOwner.connectionToken.mock.calls[0][0].url).toBe('https://other.example');
      const calls = instructionsCalls();
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) expect(auth(call)).toBeUndefined();
      expect(JSON.stringify(fetchSpy.mock.calls)).not.toMatch(/saved-auth-token|test-token/);
    });

    it('keeps an explicit --token for any origin without asking the owner', async () => {
      await statusCmd(['--brain', 'https://other.example', '--token', 'operator-token']);
      expect(authOwner.connectionToken).not.toHaveBeenCalled();
      expect(auth(instructionsCalls()[0])).toBe('Bearer operator-token');
    });

    it('stops when Auth fails and never sends the legacy brain.json token', async () => {
      authOwner.connectionToken.mockImplementation(() => { throw new Error('Unlock auth to read the encrypted credential store'); });
      await expect(statusCmd([])).rejects.toThrow(/Unlock auth/);
      expect(JSON.stringify(fetchSpy.mock.calls)).not.toContain('test-token');
      expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/api/instructions'))).toBe(false);
    });

    it('stops when the installed Auth owner lacks the contract', async () => {
      loadPluginModule.mockImplementation(async (id) => id === 'auth' ? { runtimeConfiguration: () => ({}) } : { leaderPin: () => null });
      await expect(statusCmd([])).rejects.toThrow(/no connectionToken contract/);
      expect(JSON.stringify(fetchSpy.mock.calls)).not.toContain('test-token');
    });
  });

  it('supports JSON output formatting', async () => {
    vi.spyOn(fs, 'statSync').mockReturnValue({
      size: 100,
      mtime: new Date('2026-05-25T00:00:00Z'),
      mtimeMs: 12345678
    });

    await statusCmd(['--json']);

    expect(logSpy).toHaveBeenCalled();
    const jsonOutput = JSON.parse(logSpy.mock.calls[0][0]);
    
    expect(jsonOutput.server).toEqual({
      status: 'healthy',
      uptime_seconds: 120
    });
    expect(jsonOutput.deploy).toEqual({
      mode: 'quick-tunnel',
      dashboard_url: 'https://my-tunnel.trycloudflare.com/dashboard',
      tunnel_pid: 45678,
      tunnel_alive: true
    });
  });

  it.each(['conflict', 'unknown'])('preserves %s and names installation identity in JSON and text', async status => {
    const observation = { status, reason: 'foreign-pid', source: 'local-pid',
      expected_entry: '/own/daemon-loop.mjs', entry: '/other/daemon-loop.mjs' };
    getDaemonObservation.mockReturnValue(observation);
    vi.spyOn(fs, 'statSync').mockReturnValue({ size: 100, mtime: new Date(), mtimeMs: 1 });
    await statusCmd(['--json']);
    const report = JSON.parse(logSpy.mock.calls[0][0]);
    expect(report.daemon).toBe(status);
    expect(report.daemon_observation).toEqual(observation);
    logSpy.mockClear();
    await statusCmd([]);
    const logs = logSpy.mock.calls.flat().join('\n');
    expect(logs).toContain(`${status} (foreign-pid)`);
    expect(logs).toContain('/own/daemon-loop.mjs');
    expect(logs).toContain('/other/daemon-loop.mjs');
    expect(logs).not.toContain('⚪ Not Running');
  });

  it('reports verified delegated work and local absence consistently in JSON and text', async () => {
    loadPluginModule.mockImplementation(async (id, module) => id === 'auth' ? authOwner : module === 'mesh'
      ? { getMeshSelf: () => ({ ip: '100.64.0.20' }) }
      : { leaderPin: () => '100.64.0.10', leaderPort: () => 3900,
        getLeaderInfo: async () => ({ ip: '100.64.0.10', port: 3900, strategy: 'pinned-mesh-ip' }) });
    vi.spyOn(fs, 'statSync').mockReturnValue({ size: 100, mtime: new Date(), mtimeMs: 1 });
    const existing = fetchSpy.getMockImplementation();
    fetchSpy.mockImplementation(async (url, options) => {
      if (String(url).startsWith('http://100.64.0.10:3900/health')) {
        expect(options.headers).toEqual({ 'x-total-recall-health-probe': 'peer' });
        return { ok: true, json: async () => ({ status: 'healthy', version: '1', uptime_seconds: 1,
          embedding_coverage: [], daemon: 'running', vfs: { exists: true, skill_exists: true } }) };
      }
      return existing(url, options);
    });
    await statusCmd(['--json']);
    const report = JSON.parse(logSpy.mock.calls[0][0]);
    expect(report.daemon).toBe('running');
    expect(report.daemon_observation).toMatchObject({ source: 'configured-leader-health', local: { status: 'not-started' } });
    logSpy.mockClear();
    await statusCmd([]);
    const logs = logSpy.mock.calls.flat().join('\n');
    expect(logs).toContain('Worker owner:     http://100.64.0.10:3900');
    expect(logs).toContain('Local daemon:     not-started');
  });

  it('accepts the server markdown instructions response', async () => {
    vi.spyOn(fs, 'statSync').mockReturnValue({
      size: 100,
      mtime: new Date('2026-05-25T00:00:00Z'),
      mtimeMs: 12345678
    });
    fetchSpy.mockImplementation(async (url) => String(url).includes('/health')
      ? { ok: true, json: async () => ({ status: 'healthy' }) }
      : { ok: true, headers: { get: () => 'text/markdown' }, text: async () => '# Instructions\n' });

    await statusCmd(['--json']);

    const report = JSON.parse(logSpy.mock.calls[0][0]);
    expect(report.brain.reachable).toBe(true);
    expect(report.instructions.remote.bytes).toBe(Buffer.byteLength('# Instructions\n'));
    expect(report.instructions.remote.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('serverBrainId', () => {
  it('finds a project brain by its registered directory when brain.json names no layer', async () => {
    const { serverBrainId } = await import('./status.mjs');
    const os = await import('node:os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-status-registry-'));
    try {
      const registry = path.join(dir, 'project-registry.json');
      fs.writeFileSync(registry, JSON.stringify([{ name: 'example-app', brainDir: '/repos/example-app/.agent/skills/total-recall' }]));
      expect(serverBrainId('/repos/example-app/.agent/skills/total-recall', { url: 'http://127.0.0.1:3000' }, registry)).toBe('project:example-app');
      expect(serverBrainId('/home/.agent/skills/total-recall', { url: 'http://127.0.0.1:3000' }, registry)).toBeNull();
      expect(serverBrainId('/anything', { layer: 'project', name: 'ssss' }, registry)).toBe('project:ssss');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

});
