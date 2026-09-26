import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  listPluginFiles,
  hashPluginDir,
  packPlugin,
  decodeBundle,
  writeEntriesAtomic,
  copyPluginAtomic,
  BUNDLE_FORMAT
} from './plugin-bundle.mjs';

const manifest = { id: 'demo', name: 'Demo', version: '1.0.0', description: 'Demo plugin' };

describe('plugin-bundle', () => {
  let root;
  let src;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-bundle-'));
    src = path.join(root, 'src');
    fs.mkdirSync(path.join(src, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(src, 'plugin.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(src, 'lib', 'a.mjs'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(src, '.env'), 'SECRET=1');
    fs.mkdirSync(path.join(src, 'node_modules', 'x'), { recursive: true });
    fs.writeFileSync(path.join(src, 'node_modules', 'x', 'i.js'), '');
    fs.symlinkSync('/etc/hosts', path.join(src, 'link'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('lists files canonically, excluding dotfiles, node_modules and symlinks', () => {
    expect(listPluginFiles(src).map(f => f.path)).toEqual(['lib/a.mjs', 'plugin.json']);
  });

  it('hash is stable and changes with content', () => {
    const h1 = hashPluginDir(src).sha256;
    expect(hashPluginDir(src).sha256).toBe(h1);
    fs.writeFileSync(path.join(src, 'lib', 'a.mjs'), 'export const a = 2;\n');
    expect(hashPluginDir(src).sha256).not.toBe(h1);
  });

  it('round-trips pack → decode → write with an identical hash', () => {
    const bundle = packPlugin(src, manifest);
    expect(bundle.format).toBe(BUNDLE_FORMAT);
    const decoded = decodeBundle(bundle, { expectedSha256: bundle.sha256 });
    const dest = writeEntriesAtomic(path.join(root, 'plugins'), 'demo', decoded.entries);
    expect(hashPluginDir(dest).sha256).toBe(bundle.sha256);
  });

  it('rejects altered content', () => {
    const bundle = packPlugin(src, manifest);
    bundle.files[0].data_b64 = Buffer.from('tampered').toString('base64');
    expect(() => decodeBundle(bundle)).toThrow(/hash mismatch/);
  });

  it('rejects a bundle whose hash differs from what the peer advertised', () => {
    const bundle = packPlugin(src, manifest);
    expect(() => decodeBundle(bundle, { expectedSha256: 'f'.repeat(64) })).toThrow(/does not match the advertised/);
  });

  it.each([
    ['../escape.mjs'],
    ['/etc/passwd'],
    ['lib/../../x'],
    ['.hidden'],
    ['a\\b'],
    ['C:/win']
  ])('rejects unsafe path %s', (bad) => {
    const bundle = packPlugin(src, manifest);
    bundle.files.push({ path: bad, mode: 0o644, data_b64: '' });
    expect(() => decodeBundle(bundle)).toThrow();
  });

  it('refuses to overwrite an installed plugin and leaves no staging dir on failure', () => {
    const plugins = path.join(root, 'plugins');
    copyPluginAtomic(src, plugins, 'demo');
    expect(() => copyPluginAtomic(src, plugins, 'demo')).toThrow(/already installed/);
    expect(fs.readdirSync(plugins)).toEqual(['demo']);
  });
});
