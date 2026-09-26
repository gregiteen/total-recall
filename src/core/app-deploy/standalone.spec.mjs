import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { createStandaloneApp, AppCreateError } from './standalone.mjs';

describe('Standalone App Creator (app-deploy/standalone.mjs)', () => {
  let tmpParent;
  let tmpTarget;
  let tmpPluginDir;

  beforeEach(() => {
    tmpParent = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-standalone-parent-'));
    tmpTarget = path.join(tmpParent, 'my-chat-app');
    tmpPluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-standalone-plugin-'));

    // Create a minimal capability plugin
    fs.writeFileSync(
      path.join(tmpPluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'chat-feature',
        name: 'Chat Feature',
        version: '1.0.0',
        description: 'Chat capability for standalone test',
        deploy: {
          targets: ['ssss-app']
        }
      })
    );
    fs.writeFileSync(path.join(tmpPluginDir, 'chat.mjs'), 'export const chatActive = true;\n');
  });

  afterEach(() => {
    if (fs.existsSync(tmpParent)) fs.rmSync(tmpParent, { recursive: true, force: true });
    if (fs.existsSync(tmpPluginDir)) fs.rmSync(tmpPluginDir, { recursive: true, force: true });
  });

  it('rejects creation if target directory is non-empty without force', async () => {
    fs.mkdirSync(tmpTarget, { recursive: true });
    fs.writeFileSync(path.join(tmpTarget, 'existing-file.txt'), 'do not overwrite');

    await expect(
      createStandaloneApp(tmpTarget, { plugin: tmpPluginDir })
    ).rejects.toThrow(AppCreateError);
  });

  it('creates, verifies, and publishes a runnable standalone app', async () => {
    const result = await createStandaloneApp(tmpTarget, {
      plugin: tmpPluginDir,
      name: 'TestChatApp'
    });

    expect(result.success).toBe(true);
    expect(result.name).toBe('TestChatApp');
    expect(result.targetDir).toBe(tmpTarget);
    expect(result.capabilities).toContain('chat-feature');

    // 1. Files in target app
    expect(fs.existsSync(path.join(tmpTarget, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpTarget, 'index.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(tmpTarget, 'check.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(tmpTarget, 'chat.mjs'))).toBe(true);

    // 2. SSSS Vault structure
    const capRecord = path.join(tmpTarget, 'vault', 'system', 'capabilities', 'chat-feature.md');
    expect(fs.existsSync(capRecord)).toBe(true);
    const content = fs.readFileSync(capRecord, 'utf8');
    expect(content).toContain('type: "app_capability_installation"');
    expect(content).toContain('capability_id: "chat-feature"');

    // 3. Brain initialization
    expect(fs.existsSync(path.join(tmpTarget, '.agent', 'skills', 'total-recall', 'memory-vault'))).toBe(true);

    // 4. Executable standalone process and verification gate check
    const startOutput = execSync('node index.mjs', { cwd: tmpTarget, encoding: 'utf8' });
    expect(startOutput).toContain('started in standalone mode');
    expect(startOutput).toContain('TestChatApp');

    const checkOutput = execSync('node check.mjs', { cwd: tmpTarget, encoding: 'utf8' });
    expect(checkOutput).toContain('All verification gates passed');
  });

  it('allows overwriting an existing directory when --force is provided', async () => {
    fs.mkdirSync(tmpTarget, { recursive: true });
    fs.writeFileSync(path.join(tmpTarget, 'old-file.txt'), 'stale content');

    const result = await createStandaloneApp(tmpTarget, {
      plugin: tmpPluginDir,
      force: true
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tmpTarget, 'old-file.txt'))).toBe(false);
    expect(fs.existsSync(path.join(tmpTarget, 'chat.mjs'))).toBe(true);
  });
});
