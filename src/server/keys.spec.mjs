import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let oldAgentDir;
let agentDir;

async function loadKeysModule() {
  vi.resetModules();
  return import('./keys.mjs');
}

beforeEach(() => {
  oldAgentDir = process.env.AGENT_DIR;
  agentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'total-recall-keys-'));
  process.env.AGENT_DIR = agentDir;
});

afterEach(() => {
  if (oldAgentDir === undefined) delete process.env.AGENT_DIR;
  else process.env.AGENT_DIR = oldAgentDir;
  fs.rmSync(agentDir, { recursive: true, force: true });
});

describe('PAT key store', () => {
  it('stores only token hashes and validates issued PATs', async () => {
    const { issueKey, isValidToken, loadKeys, recordKeyUsage } = await loadKeysModule();

    const issued = issueKey('codex');
    expect(issued.token).toMatch(/^tr_/);
    expect(isValidToken(issued.token)).toBe(true);
    expect(isValidToken('local')).toBe(false);

    const raw = fs.readFileSync(path.join(agentDir, 'config', 'keys.jsonl'), 'utf8');
    expect(raw).not.toContain(issued.token);
    expect(raw).toContain('token_hash');

    expect(recordKeyUsage(issued.token)).toBe(true);
    const [stored] = loadKeys();
    expect(stored.hit_count).toBe(1);
    expect(stored.last_used_at).toBeTruthy();
    expect(stored.scopes).toEqual(['*']);
    expect(stored.expires_at).toBeNull();
  });

  it('stores scoped keys and evaluates exact and wildcard scopes', async () => {
    const { issueKey, findValidKeyByToken, keyHasScope, keyHasAnyScope } = await loadKeysModule();

    const issued = issueKey('readonly', { scopes: ['memory:read', 'ssss:*'] });
    const stored = findValidKeyByToken(issued.token);

    expect(stored.scopes).toEqual(['memory:read', 'ssss:*']);
    expect(keyHasScope(stored, 'memory:read')).toBe(true);
    expect(keyHasScope(stored, 'memory:write')).toBe(false);
    expect(keyHasScope(stored, 'ssss:read')).toBe(true);
    expect(keyHasAnyScope(stored, ['memory:write', 'ssss:read'])).toBe(true);
  });

  it('rejects expired keys', async () => {
    const { issueKey, isValidToken, findValidKeyByToken } = await loadKeysModule();

    const issued = issueKey('expired', {
      scopes: ['memory:read'],
      expires_at: '2000-01-01T00:00:00.000Z',
    });

    expect(isValidToken(issued.token)).toBe(false);
    expect(findValidKeyByToken(issued.token)).toBeNull();
  });

  it('migrates legacy plaintext keys without keeping the plaintext token', async () => {
    const configDir = path.join(agentDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'keys.jsonl'),
      JSON.stringify({
        id: 'legacy-1',
        name: 'legacy',
        token: 'tr_legacy-token',
        created_at: new Date().toISOString(),
        revoked: false,
      }) + '\n'
    );

    const { isValidToken, loadKeys } = await loadKeysModule();

    expect(isValidToken('tr_legacy-token')).toBe(true);
    expect(loadKeys()[0].token).toBeUndefined();
    expect(loadKeys()[0].scopes).toEqual(['*']);
    const raw = fs.readFileSync(path.join(configDir, 'keys.jsonl'), 'utf8');
    expect(raw).not.toContain('tr_legacy-token');
    expect(raw).toContain('token_hash');
  });
});
