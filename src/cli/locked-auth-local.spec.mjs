// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { encryptSecretsSync } from '../../scaffold/.agent/skills/total-recall/plugins/auth/src/crypto.mjs';

it('keeps local CLI and installed help usable when Auth is locked', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-locked-auth-'));
  const agent = path.join(root, 'agent');
  const brain = path.join(agent, 'skills', 'total-recall');
  const bin = fileURLToPath(new URL('../../bin/total-recall.mjs', import.meta.url));
  const auth = fileURLToPath(new URL('../../scaffold/.agent/skills/total-recall/plugins/auth', import.meta.url));
  const env = {
    PATH: process.env.PATH,
    AGENT_DIR: agent,
    _TR_TEST_AGENT_DIR: agent,
    TR_SECRETS_BRAIN: brain,
    TR_SECRETS_NO_KEYCHAIN: '1',
    TR_SECRETS_NO_HOST_CARRIER: '1',
    TR_ENV_FILE: path.join(root, 'missing-carrier.env'),
    TR_EMBEDDINGS_DISABLED: '1',
  };
  const run = (...args) => spawnSync(process.execPath, [bin, ...args], { cwd: root, env, encoding: 'utf8', timeout: 12_000 });
  try {
    fs.mkdirSync(path.join(brain, 'plugins'), { recursive: true });
    fs.symlinkSync(auth, path.join(brain, 'plugins', 'auth'), 'dir');
    const saved = run('remember', 'fact', 'An offline kangaroo indexes local instructions.', '--confined-fact', '--global');
    expect(saved.status, saved.stderr).toBe(0);
    fs.mkdirSync(path.join(brain, 'config'), { recursive: true });
    const ciphertext = encryptSecretsSync({ GOOGLE_API_KEY: 'isolated-provider-value' }, randomBytes(32).toString('hex'));
    fs.writeFileSync(path.join(brain, 'config', 'secrets.enc'), ciphertext, { mode: 0o600 });

    const recall = run('recall', 'kangaroo', '--local', '--global');
    expect(recall.status, recall.stderr).toBe(0);
    expect(recall.stdout).toContain('An offline kangaroo indexes local instructions.');
    const context = run('context', 'kangaroo instructions', '--action', 'read', '--format', 'json', '--global');
    expect(context.status, context.stderr).toBe(0);
    const capsule = context.stdout.split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } }).find(row => row?.ready === true);
    expect(capsule?.context).toContain('kangaroo');
    expect(capsule.context).toContain('lexical');
    const managerHelp = run('plugin', '--help');
    expect(managerHelp.status, managerHelp.stderr).toBe(0);
    expect(managerHelp.stdout).toContain('total-recall plugin');
    const library = run('plugin', 'library', '--json');
    expect(library.status, library.stderr).toBe(0);
    expect(JSON.parse(library.stdout).plugins.some(plugin => plugin.id === 'auth')).toBe(true);
    const composed = run('composable-cli', 'library', '--json');
    expect(composed.status, composed.stderr).toBe(0);
    expect(JSON.parse(composed.stdout).composedCommands).toEqual(expect.any(Array));
    const help = run('auth', '--help');
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('total-recall auth');
    const denied = run('auth', 'secret', 'list', '--json');
    expect(denied.status).not.toBe(0);
    expect(denied.stdout + denied.stderr).toContain('Unlock auth to read the encrypted credential store');
    expect(denied.stdout + denied.stderr).not.toContain('isolated-provider-value');
    const projection = spawnSync(process.execPath, ['--input-type=module', '-e',
      `await import(${JSON.stringify(new URL('../core/config.mjs', import.meta.url).href)})`],
    { cwd: root, env, encoding: 'utf8', timeout: 12_000 });
    expect(projection.status).not.toBe(0);
    expect(projection.stderr).toContain('Unlock auth to read the encrypted credential store');
    expect(projection.stderr).not.toContain('isolated-provider-value');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
