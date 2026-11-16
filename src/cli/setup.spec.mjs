import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveSetupSecret } from './setup.mjs';
vi.hoisted(() => { process.env.TR_PACKAGE_ROOT = process.cwd(); });
import * as authStore from '../../scaffold/.agent/skills/total-recall/plugins/auth/src/secrets-store.mjs';
import setup from './setup.mjs';

describe('setup.mjs', () => {
  it('exports default', () => {
    expect(setup).toBeDefined();
  });

  it('prints help instead of starting the wizard', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await setup(['--help']);
      const printed = log.mock.calls.flat().join('\n');
      expect(printed).toContain('--dry-run');
      expect(printed).not.toContain('Where do you want to run');
    } finally { log.mockRestore(); }
  });
});


describe('setup credential custody with the actual Auth store', () => {
  const roots = [];
  afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
  function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-setup-custody-')); roots.push(root);
    const brainDir = path.join(root, 'auth'); fs.mkdirSync(path.join(brainDir, 'config'), { recursive: true });
    vi.stubEnv('TR_SECRETS_BRAIN', brainDir);
    vi.stubEnv('TR_SECRETS_PASSWORD', 'disposable-test-only-password');
    return { root, brainDir };
  }
  const load = async (id, entry) => {
    expect([id, entry]).toEqual(['auth', 'secrets-store']);
    return authStore;
  };

  it('uses the selected host store and preserves unrelated credentials', async () => {
    const { brainDir } = fixture();
    await authStore.setSecret(brainDir, 'unrelated', 'keep-fixture-value');
    await saveSetupSecret('github_token', 'fixture-new-token', { load });
    const saved = await authStore.loadSecrets(brainDir);
    expect(saved.unrelated).toBe('keep-fixture-value');
    expect(saved.github_token).toBe('fixture-new-token');
  });

  it('propagates a damaged-store read failure without replacing its bytes', async () => {
    const { brainDir } = fixture();
    const file = path.join(brainDir, 'config', 'secrets.enc');
    const original = 'damaged fixture ciphertext'; fs.writeFileSync(file, original, { mode: 0o600 });
    await expect(saveSetupSecret('github_token', 'fixture-new-token', { load })).rejects.toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
  });
});
