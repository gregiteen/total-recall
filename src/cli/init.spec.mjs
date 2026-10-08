// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import init, { connectDetectedClients } from './init.mjs';

describe('init.mjs', () => {
  it('exports default', () => {
    expect(init).toBeDefined();
  });
});

describe('connectDetectedClients', () => {
  it('connects each detected IDE once so compile writes its instruction shim', async () => {
    const calls = [];
    const connected = await connectDetectedClients(
      [
        { clients: ['claude-code'] },
        { clients: ['antigravity', 'gemini'] },
        { clients: ['claude-code'] },
      ],
      { connectFn: async (args) => { calls.push(args[0]); } },
    );
    expect(calls).toEqual(['claude-code', 'antigravity']);
    expect(connected).toEqual(['claude-code', 'antigravity']);
  });

  it('skips targets with no known connect client and keeps going after a failure', async () => {
    const connected = await connectDetectedClients(
      [{ clients: ['not-a-client'] }, { clients: ['codex'] }, { clients: ['claude-code'] }],
      { connectFn: async ([c]) => { if (c === 'codex') throw new Error('boom'); } },
    );
    expect(connected).toEqual(['claude-code']);
  });
});


describe('compatibility initialization explicit root isolation', () => {
  for (const layer of ['global', 'project']) {
    it(`initializes the explicit ${layer} root without writing HOME/.agent`, () => {
      const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-legacy-init-root-'));
      const home = path.join(fixture, 'home'), cwd = path.join(fixture, 'repository'), selected = path.join(fixture, 'selected-agent');
      fs.mkdirSync(home); fs.mkdirSync(cwd);
      try {
        execFileSync(process.execPath, [fileURLToPath(new URL('../../bin/total-recall.mjs', import.meta.url)), 'init', '--yes', ...(layer === 'project' ? ['--project'] : [])], {
          cwd, timeout: 20000, stdio: 'pipe', env: { ...process.env, HOME: home,
            AGENT_DIR: selected, _TR_TEST_AGENT_DIR: selected, TR_SECRETS_NO_KEYCHAIN: '1',
            TR_ENV_FILE: path.join(fixture, 'missing.env'), TR_SECRETS_PASSWORD: '', TR_MASTER_PASSWORD: '',
            OPENROUTER_API_KEY: '', OPENAI_API_KEY: '', GOOGLE_API_KEY: '', ANTHROPIC_API_KEY: '',
            TR_EMBEDDINGS_DISABLED: '1', DISABLE_DAEMON: 'true' },
        });
        expect(fs.existsSync(path.join(selected, 'skills', 'total-recall', 'config', 'brain.json'))).toBe(true);
        expect(fs.existsSync(path.join(home, '.agent'))).toBe(false);
        // Project init also creates the repository-owned expert skill.
        expect(fs.existsSync(path.join(cwd, '.agent', 'skills', 'total-recall', 'config', 'brain.json'))).toBe(false);
        expect(fs.existsSync(path.join(cwd, '.agent', 'skills', 'total-recall', 'config', 'secrets.enc'))).toBe(false);
      } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
    });
  }
});
