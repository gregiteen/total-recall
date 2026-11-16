import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
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

function snapshot(dir) {
  const files = {};
  const walk = (at, prefix = '') => {
    for (const name of fs.readdirSync(at).sort()) {
      const abs = path.join(at, name);
      const rel = prefix + name;
      const stat = fs.lstatSync(abs);
      if (stat.isSymbolicLink()) files[rel] = { link: fs.readlinkSync(abs) };
      else if (stat.isDirectory()) walk(abs, rel + '/');
      else files[rel] = { data: fs.readFileSync(abs).toString('base64'), mode: stat.mode & 0o777 };
    }
  };
  walk(dir);
  return files;
}

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

  it('ships only public bytes to bundle and copy recipients without changing the source', () => {
    const publicFiles = ['skills/demo/SKILL.md', 'skills/demo/references/guide.md', 'capability/run.mjs', 'cli.mjs', 'unknown/assets/data.bin'];
    const privateFiles = ['config/settings.json', 'research-queue.jsonl', 'nested/config/credentials.json', 'nested/research-queue.jsonl', 'nested/memory-vault/note.md', 'nested/session.enc', 'nested/trace.log', 'nested/data.backup'];
    for (const rel of [...publicFiles, ...privateFiles]) {
      fs.mkdirSync(path.dirname(path.join(src, rel)), { recursive: true });
      fs.writeFileSync(path.join(src, rel), `${rel}: fixture bytes`);
    }
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'secret.md'), 'outside-private-canary');
    fs.symlinkSync(outside, path.join(src, 'nested', 'escape'));
    fs.symlinkSync(path.join(outside, 'secret.md'), path.join(src, 'nested', 'escape.md'));
    const before = snapshot(src);
    const expected = Object.fromEntries(['lib/a.mjs', 'plugin.json', ...publicFiles].map((p) => [p, before[p]]));

    const bundle = packPlugin(src, manifest);
    expect(bundle.format).toBe('tr-plugin-bundle/1');
    expect(Object.keys(bundle).sort()).toEqual(['files', 'format', 'id', 'sha256', 'version']);
    expect(bundle.files.map((f) => f.path)).toEqual(Object.keys(expected).sort());
    const decoded = decodeBundle(JSON.parse(JSON.stringify(bundle)));
    const recipient = writeEntriesAtomic(path.join(root, 'received'), 'demo', decoded.entries);
    const copied = copyPluginAtomic(src, path.join(root, 'copied'), 'demo');
    expect(snapshot(recipient)).toEqual(expected);
    expect(snapshot(copied)).toEqual(expected);
    expect(hashPluginDir(recipient)).toEqual(hashPluginDir(src));
    expect(snapshot(src)).toEqual(before);
    expect(fs.readFileSync(path.join(outside, 'secret.md'), 'utf8')).toBe('outside-private-canary');

    const originalHash = hashPluginDir(src);
    fs.writeFileSync(path.join(src, 'config/settings.json'), 'changed-private-state');
    expect(hashPluginDir(src)).toEqual(originalHash);
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

  it.each([
    ['../escape', 'public.txt'],
    ['demo', '../escape'],
    ['demo', 'nested/config/private.json'],
    ['demo', 'research-queue.jsonl']
  ])('preflights unsafe id/path %s %s before writing a recipient', (id, file) => {
    const plugins = path.join(root, 'received');
    expect(() => writeEntriesAtomic(plugins, id, [{ path: file, data: Buffer.from('private'), mode: 0o644 }])).toThrow();
    expect(fs.existsSync(plugins)).toBe(false);
    expect(fs.existsSync(path.join(root, 'escape'))).toBe(false);
  });

  it('removes staging after a mid-write failure and publishes no partial copy', () => {
    const plugins = path.join(root, 'received');
    expect(() => writeEntriesAtomic(plugins, 'demo', [
      { path: 'file', data: Buffer.from('first'), mode: 0o644 },
      { path: 'file/child', data: Buffer.from('second'), mode: 0o644 }
    ])).toThrow();
    expect(fs.readdirSync(plugins)).toEqual([]);
  });

  it('keeps execute bits only for interpreter scripts because the content hash does not cover modes', () => {
    const entries = [['bin/tool.sh', '#!/bin/sh\n'], ['plugin.json', '{}'], ['payload.bin', 'MZ']].map(([file, text]) => ({ path: file, data: Buffer.from(text), mode: 0o755 }));
    const hash = crypto.createHash('sha256');
    for (const e of [...entries].sort((a, b) => (a.path < b.path ? -1 : 1))) hash.update(e.path).update('\0').update(String(e.data.length)).update('\0').update(e.data);
    const decoded = decodeBundle({ format: BUNDLE_FORMAT, id: 'demo', version: '1.0.0', sha256: hash.digest('hex'),
      files: entries.map(e => ({ path: e.path, mode: e.mode, data_b64: e.data.toString('base64') })) });
    const modes = Object.fromEntries(decoded.entries.map(e => [e.path, e.mode]));
    expect(modes).toEqual({ 'bin/tool.sh': 0o755, 'payload.bin': 0o644, 'plugin.json': 0o644 });
  });
});
