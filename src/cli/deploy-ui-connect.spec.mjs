import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runConnectIdes } from './deploy-ui-connect.mjs';

process.env.TR_PACKAGE_ROOT = process.cwd();
const owner = await import(pathToFileURL(path.resolve('scaffold/.agent/skills/total-recall/plugins/auth/src/configuration.mjs')).href);
const PASSWORD = 'test-only-password-for-aes-gcm';
const TOKEN = 'tr_wizard_token_canary_77';

describe('deploy wizard connect step', () => {
  let root, authDir, relayDir, calls;
  const prev = process.env.TR_SECRETS_PASSWORD;
  const spawn = (status = 0) => vi.fn((cmd, args, opts) => { calls.push({ args, input: opts?.input, env: opts?.env }); return { status, stdout: '', stderr: status ? 'child failed' : '' }; });
  const deps = (over = {}) => ({ spawnSync: spawn(), nodeBin: 'node', scriptPath: '/x/total-recall.mjs', loadAuthConfiguration: async () => owner,
    authBrainDir: async () => authDir, relayConfigDir: async () => relayDir, ...over });
  const brainJson = () => path.join(relayDir, 'brain.json');
  beforeEach(() => {
    calls = [];
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-wizard-'));
    authDir = path.join(root, 'auth'); fs.mkdirSync(path.join(authDir, 'config'), { recursive: true });
    relayDir = path.join(root, 'relay'); fs.mkdirSync(relayDir, { recursive: true });
    process.env.TR_SECRETS_PASSWORD = PASSWORD;
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); if (prev === undefined) delete process.env.TR_SECRETS_PASSWORD; else process.env.TR_SECRETS_PASSWORD = prev; });

  it('stores the token in Auth bound to the URL, passes it to children on stdin only, and keeps brain.json public', async () => {
    fs.writeFileSync(brainJson(), JSON.stringify({ name: 'relay-brain', tags: ['t'] }));
    const out = await runConnectIdes({ ides: ['claude-code', 'codex'], installRelay: true, brainUrl: 'https://brain.test', token: TOKEN }, deps());
    expect(out.ok).toBe(true);
    expect(owner.connectionToken({ brainDir: authDir, url: 'https://brain.test', legacyBrainJson: [] })).toMatchObject({ token: TOKEN, source: 'auth', origin: 'https://brain.test' });
    expect(owner.connectionToken({ brainDir: authDir, url: 'https://other.test', legacyBrainJson: [] })).toMatchObject({ token: null });
    // No child ever sees the token in argv; IDE children get it on stdin.
    expect(JSON.stringify(calls.map(c => c.args))).not.toContain(TOKEN);
    const ideCalls = calls.filter(c => c.args.includes('connect'));
    expect(ideCalls).toHaveLength(2);
    for (const c of ideCalls) { expect(c.args).toContain('--token-stdin'); expect(c.args).not.toContain('--token'); expect(c.input).toBe(`${TOKEN}\n`); }
    const relayCall = calls.find(c => c.args.includes('relay'));
    expect(relayCall.input).toBeUndefined();
    // Public config merged, token absent.
    expect(JSON.parse(fs.readFileSync(brainJson(), 'utf8'))).toEqual({ name: 'relay-brain', tags: ['t'], url: 'https://brain.test' });
    expect(fs.readFileSync(brainJson(), 'utf8')).not.toContain(TOKEN);
    expect(JSON.stringify(out)).not.toContain(TOKEN);
  });

  it('fails truthfully and starts nothing when Auth cannot store the token', async () => {
    const out = await runConnectIdes({ ides: ['codex'], installRelay: true, installObsidian: true, brainUrl: 'https://brain.test', token: TOKEN },
      deps({ loadAuthConfiguration: async () => { throw new Error('Auth owner missing'); } }));
    expect(out.ok).toBe(false);
    expect(out.results[0]).toMatchObject({ label: 'Auth credential', ok: false });
    expect(out.relayResult).toMatchObject({ ok: false });
    expect(out.obsidianResult).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
    expect(fs.existsSync(brainJson())).toBe(false);
    expect(JSON.stringify(out)).not.toContain(TOKEN);
  });

  it('fails truthfully for a token without an http(s) URL, and on a locked store', async () => {
    expect((await runConnectIdes({ ides: ['codex'], installRelay: false, token: TOKEN }, deps())).ok).toBe(false);
    expect((await runConnectIdes({ ides: ['codex'], installRelay: false, brainUrl: 'ftp://x.test', token: TOKEN }, deps())).ok).toBe(false);
    delete process.env.TR_SECRETS_PASSWORD;
    fs.writeFileSync(path.join(authDir, 'config', 'secrets.enc'), 'x');
    const out = await runConnectIdes({ ides: ['codex'], installRelay: false, brainUrl: 'https://brain.test', token: TOKEN }, deps());
    expect(out.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it('reports a failed IDE child instead of success', async () => {
    const out = await runConnectIdes({ ides: ['codex'], installRelay: false, brainUrl: 'https://brain.test', token: TOKEN }, deps({ spawnSync: spawn(1) }));
    expect(out.ok).toBe(false);
    expect(out.results[0]).toMatchObject({ ok: false, message: 'child failed' });
  });

  it('refuses to move a relay brain.json that holds a legacy token, leaving it untouched', async () => {
    fs.writeFileSync(brainJson(), JSON.stringify({ url: 'https://old.test', token: 'tr_legacy_canary' }));
    const out = await runConnectIdes({ ides: [], installRelay: true, brainUrl: 'https://new.test' }, deps());
    expect(out.ok).toBe(false);
    expect(out.relayResult.message).toMatch(/legacy token/);
    expect(JSON.parse(fs.readFileSync(brainJson(), 'utf8'))).toEqual({ url: 'https://old.test', token: 'tr_legacy_canary' });
    expect(calls).toEqual([]);
  });

  it('allows the same endpoint and preserves the legacy token in place without copying it to Auth', async () => {
    fs.writeFileSync(brainJson(), JSON.stringify({ url: 'https://old.test', token: 'tr_legacy_canary', name: 'n' }));
    const out = await runConnectIdes({ ides: [], installRelay: true, brainUrl: 'https://old.test' }, deps());
    expect(out.ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(brainJson(), 'utf8'))).toEqual({ url: 'https://old.test', token: 'tr_legacy_canary', name: 'n' });
    expect(fs.existsSync(path.join(authDir, 'config', 'secrets.enc'))).toBe(false);
  });

  it('does not overwrite an unreadable relay brain.json', async () => {
    fs.writeFileSync(brainJson(), '{ not json');
    const out = await runConnectIdes({ ides: [], installRelay: true, brainUrl: 'https://brain.test' }, deps());
    expect(out.relayResult).toMatchObject({ ok: false });
    expect(fs.readFileSync(brainJson(), 'utf8')).toBe('{ not json');
    expect(calls).toEqual([]);
  });
});
