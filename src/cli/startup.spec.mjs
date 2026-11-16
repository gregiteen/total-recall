import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
vi.mock('../core/startup-health.mjs', () => ({ startupHealth: vi.fn(async () => ({ ready: true, server: {status:'ready'},brain:{status:'ready'},daemon:{status:'running'},ssss:{status:'available'},app:{status:'not-declared'},actions:[] })) }));
const conn = vi.hoisted(() => ({ resolve: vi.fn(async () => ({ token: null, source: null, reason: 'no-saved-token' })), brain: '', global: '' }));
vi.mock('../core/connection-token.mjs', () => ({ resolveConnectionToken: conn.resolve }));
vi.mock('./agent-dir.mjs', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, resolveBrainDir: () => conn.brain || actual.resolveBrainDir(), getGlobalBrainDir: () => conn.global || actual.getGlobalBrainDir() };
});
import startup, { inspectStartup, startupFindings } from './startup.mjs';
import { startupHealth } from '../core/startup-health.mjs';
describe('startup CLI contract', () => {
  let log;
  beforeEach(() => { log = vi.spyOn(console, 'log').mockImplementation(() => {}); vi.clearAllMocks(); process.exitCode = undefined; });
  afterEach(() => { log.mockRestore(); process.exitCode = undefined; });
  it('help returns without probing', async () => { await startup(['--help']); expect(startupHealth).not.toHaveBeenCalled(); expect(log).toHaveBeenCalled(); });
  it('invalid options never start anything', async () => { await expect(startup(['bogus'])).rejects.toThrow(); await expect(startup(['ensure','--app-start','run-app'])).rejects.toThrow(); await expect(startup(['check','--unknown'])).rejects.toThrow(); expect(startupHealth).not.toHaveBeenCalled(); });
  it('check is read-only and ensure explicit', async () => { await startup(['check','--json']); expect(startupHealth.mock.calls[0][0].ensure).toBe(false); await startup(['ensure','--app-check','app-health','--app-start','app-launch']); expect(startupHealth.mock.calls[1][0]).toMatchObject({ensure:true,appCheck:'app-health',appStart:'app-launch'}); });
  it('unready JSON fails exit status without leaking raw payload', async () => { startupHealth.mockResolvedValueOnce({ready:false}); await startup(['check','--json']); expect(process.exitCode).toBe(1); expect(JSON.parse(log.mock.calls[0][0])).toEqual({ready:false}); });
  it('configured override options are passed to core', async () => { await inspectStartup({brainUrl:null,token:null}); expect(startupHealth.mock.calls[0][0]).toMatchObject({brainUrl:null,token:null}); });
});
describe('startup findings', () => {
  it('names a stale dashboard and each plugin check that needs attention or could not run', () => {
    const lines = startupFindings({
      dashboard: { status: 'stale', newer_source: 'frontend/src/App.tsx' },
      plugin_checks: [
        { command: 'git unmerged', status: 'attention', outstanding: 2, summary: '2 branches hold work not in main: codex/plugin-workspaces (+4)' },
        { command: 'git unmerged', status: 'ok', outstanding: 0, summary: 'nothing outstanding' },
        { command: 'mesh drift', status: 'unavailable', reason: 'timed out after 15000 ms' },
        { command: 'auth due', status: 'inactive' },
      ],
    });
    expect(lines).toEqual([
      'Dashboard: bundle stale (frontend/src/App.tsx is newer); the server rebuilds it, see /health dashboard.',
      'git unmerged: 2 branches hold work not in main: codex/plugin-workspaces (+4)',
      'mesh drift: unavailable (timed out after 15000 ms)',
    ]);
  });
  it('is silent when everything is current', () => {
    expect(startupFindings({ dashboard: { status: 'current' }, plugin_checks: [{ command: 'git unmerged', status: 'ok', outstanding: 0, summary: 'none' }] })).toEqual([]);
  });
});

describe('startup saved credential', () => {
  let root;
  const saved = { pat: process.env.TR_PAT, tok: process.env.TOTAL_RECALL_TOKEN, brain: process.env.TR_BRAIN };
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TR_PAT; delete process.env.TOTAL_RECALL_TOKEN; delete process.env.TR_BRAIN;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-startup-'));
    conn.brain = path.join(root, 'project'); conn.global = path.join(root, 'global');
    for (const dir of [conn.brain, conn.global]) fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(conn.brain, 'config', 'brain.json'), JSON.stringify({ url: 'https://brain.test', token: 'legacy-file-token-canary', layer: 'project', name: 'demo' }));
    conn.resolve.mockImplementation(async () => ({ token: null, source: null, reason: 'no-saved-token' }));
  });
  afterEach(() => {
    conn.brain = ''; conn.global = ''; fs.rmSync(root, { recursive: true, force: true });
    for (const [k, v] of [['TR_PAT', saved.pat], ['TOTAL_RECALL_TOKEN', saved.tok], ['TR_BRAIN', saved.brain]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });

  it('asks the Auth owner with the endpoint and explicit legacy context, and sends only its token', async () => {
    conn.resolve.mockResolvedValue({ token: 'owner-token', source: 'auth' });
    await inspectStartup();
    expect(conn.resolve).toHaveBeenCalledWith({ url: 'https://brain.test', legacyBrainJson: [path.join(conn.brain, 'config', 'brain.json'), path.join(conn.global, 'config', 'brain.json')] });
    expect(startupHealth.mock.calls[0][0]).toMatchObject({ brainUrl: 'https://brain.test', token: 'owner-token' });
  });

  it('checks without a token and reports the credential unavailable when Auth fails, never using the file token', async () => {
    conn.resolve.mockRejectedValue(new Error('Unlock auth to read the encrypted credential store'));
    const report = await inspectStartup();
    expect(startupHealth.mock.calls[0][0].token).toBeNull();
    expect(JSON.stringify(startupHealth.mock.calls)).not.toContain('legacy-file-token-canary');
    expect(report.credential).toEqual({ status: 'unavailable', reason: 'Unlock auth to read the encrypted credential store' });
    expect(startupFindings(report).join('\n')).toMatch(/Credential: unavailable \(Unlock auth/);
  });

  it('does not forward a saved token to a TR_BRAIN on another origin', async () => {
    process.env.TR_BRAIN = 'https://other.example';
    conn.resolve.mockImplementation(async ({ url }) => url === 'https://brain.test' ? { token: 'owner-token', source: 'auth' } : { token: null, source: null, reason: 'origin-mismatch' });
    await inspectStartup();
    expect(conn.resolve.mock.calls[0][0].url).toBe('https://other.example');
    expect(startupHealth.mock.calls[0][0].token).toBeNull();
  });

  it('keeps an explicit environment token without calling the owner', async () => {
    process.env.TR_PAT = 'operator-env-token';
    await inspectStartup();
    expect(conn.resolve).not.toHaveBeenCalled();
    expect(startupHealth.mock.calls[0][0].token).toBe('operator-env-token');
  });
});
