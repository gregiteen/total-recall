import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  resolveCapabilitySource,
  isProhibitedSecretFile,
  assertSafeSourcePath,
  scanAndVerifyDirectory,
  extractEntriesSafely
} from './source.mjs';
import { packPlugin } from '../plugin-bundle.mjs';

describe('Capability Source Resolver (app-deploy/source.mjs)', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-source-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  function createValidPluginFixture(dir, overrides = {}) {
    fs.mkdirSync(dir, { recursive: true });
    const manifest = {
      $schema: 'https://github.com/total-recall/total-recall/blob/main/metadata.plugin.schema.json',
      id: 'test-cap',
      name: 'Test Capability',
      version: '1.0.0',
      description: 'Test capability description for app deployment',
      deploy: {
        targets: ['ssss-app', 'flask', 'nextjs'],
        required_ssss_version: '>=0.9.3',
        access_grants: ['ssss:vault:read']
      },
      skills: [{ id: 'test-cap', path: './skills/test/SKILL.md' }],
      cli: { command: 'test-cap', handler: './cli.mjs' },
      ...overrides
    };
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest, null, 2), 'utf8');
    fs.mkdirSync(path.join(dir, 'skills', 'test'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'skills', 'test', 'SKILL.md'), '# Test Skill\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'cli.mjs'), 'export default function(){}\n', 'utf8');
    return manifest;
  }

  describe('Path & Secret Boundary Checks', () => {
    it('detects prohibited secret and env credential files', () => {
      expect(isProhibitedSecretFile('.env')).toBe(true);
      expect(isProhibitedSecretFile('.env.production')).toBe(true);
      expect(isProhibitedSecretFile('server.key')).toBe(true);
      expect(isProhibitedSecretFile('cert.pem')).toBe(true);
      expect(isProhibitedSecretFile('id_rsa')).toBe(true);
      expect(isProhibitedSecretFile('id_ed25519')).toBe(true);
      expect(isProhibitedSecretFile('secrets.enc')).toBe(true);
      expect(isProhibitedSecretFile('client_secret.json')).toBe(true);

      expect(isProhibitedSecretFile('plugin.json')).toBe(false);
      expect(isProhibitedSecretFile('SKILL.md')).toBe(false);
      expect(isProhibitedSecretFile('cli.mjs')).toBe(false);
    });

    it('enforces assertSafeSourcePath against traversal and absolute paths', () => {
      expect(() => assertSafeSourcePath('../etc/passwd')).toThrow(/illegal traversal/);
      expect(() => assertSafeSourcePath('foo/../../bar')).toThrow(/illegal traversal/);
      expect(() => assertSafeSourcePath('/usr/bin/node')).toThrow(/must be relative/);
      expect(() => assertSafeSourcePath('C:\\Windows\\system32')).toThrow(/forbidden characters/);
      expect(() => assertSafeSourcePath('foo\0bar')).toThrow(/forbidden characters/);
      expect(() => assertSafeSourcePath('')).toThrow(/empty or exceeds/);

      expect(() => assertSafeSourcePath('skills/test/SKILL.md')).not.toThrow();
      expect(() => assertSafeSourcePath('plugin.json')).not.toThrow();
    });
  });

  describe('Local Source Scanning & Safe Extraction', () => {
    it('resolves and stages a valid local capability plugin directory', async () => {
      const srcDir = path.join(tmpRoot, 'plugin-src');
      createValidPluginFixture(srcDir);

      const resolved = await resolveCapabilitySource(srcDir);
      try {
        expect(resolved.id).toBe('test-cap');
        expect(resolved.version).toBe('1.0.0');
        expect(resolved.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(resolved.sourceType).toBe('local');
        expect(fs.existsSync(path.join(resolved.stagedDir, 'plugin.json'))).toBe(true);
        expect(fs.existsSync(path.join(resolved.stagedDir, 'cli.mjs'))).toBe(true);
      } finally {
        resolved.cleanup();
      }
    });

    it('asserts hash pin and rejects on hash mismatch', async () => {
      const srcDir = path.join(tmpRoot, 'plugin-src');
      createValidPluginFixture(srcDir);

      const bogusHash = 'a'.repeat(64);
      await expect(resolveCapabilitySource(srcDir, { expectedHash: bogusHash })).rejects.toThrow(
        /Capability source hash mismatch/
      );
    });

    it('rejects source directory containing prohibited secret files', async () => {
      const srcDir = path.join(tmpRoot, 'leaky-plugin');
      createValidPluginFixture(srcDir);
      fs.writeFileSync(path.join(srcDir, '.env'), 'SECRET_TOKEN=12345', 'utf8');

      await expect(resolveCapabilitySource(srcDir)).rejects.toThrow(/Prohibited credential file/);
    });

    it('rejects capability sources containing symbolic links', async () => {
      const srcDir = path.join(tmpRoot, 'symlink-plugin');
      createValidPluginFixture(srcDir);
      const outsideTarget = path.join(tmpRoot, 'secret.txt');
      fs.writeFileSync(outsideTarget, 'classified', 'utf8');
      fs.symlinkSync(outsideTarget, path.join(srcDir, 'linked.txt'));

      await expect(resolveCapabilitySource(srcDir)).rejects.toThrow(/Symbolic link detected/);
    });

    it('resolves in-memory bundle objects with strict hash verification', async () => {
      const srcDir = path.join(tmpRoot, 'bundle-src');
      const manifest = createValidPluginFixture(srcDir);
      const bundle = packPlugin(srcDir, manifest);

      const resolved = await resolveCapabilitySource(bundle, { expectedHash: bundle.sha256 });
      try {
        expect(resolved.sourceType).toBe('bundle');
        expect(resolved.sha256).toBe(bundle.sha256);
        expect(fs.existsSync(path.join(resolved.stagedDir, 'plugin.json'))).toBe(true);
      } finally {
        resolved.cleanup();
      }
    });

    it('resolves bundled plugins by ID', async () => {
      const resolved = await resolveCapabilitySource('code-quality');
      try {
        expect(resolved.id).toBe('code-quality');
        expect(resolved.sourceType).toBe('bundled');
        expect(resolved.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(fs.existsSync(path.join(resolved.stagedDir, 'plugin.json'))).toBe(true);
      } finally {
        resolved.cleanup();
      }
    });
  });
});
