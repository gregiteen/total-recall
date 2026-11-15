// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectSource, decodeAssets, noLinks, safePath, parseDeclaration, rejectCredentials, sha256, unresolvedPlaceholders, expandPluginVars, MAX_BYTES, MAX_FILES } from './plugin-import-source.mjs';

const roots = [];
const temp = () => { const p = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-import-src-')); roots.push(p); return p; };
afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); });
const asset = (p, text, mode = 0o644) => ({ path: p, mode, sha256: sha256(Buffer.from(text)), data_b64: Buffer.from(text).toString('base64') });

describe('source collection', () => {
  it('accepts benign env and header values and only rejects sensitive keys', () => {
    expect(() => rejectCredentials({ env: { NODE_ENV: 'production', LOG_LEVEL: 'debug' }, headers: { Accept: 'application/json' } })).not.toThrow();
    expect(() => rejectCredentials({ env: { API_KEY: 'abcdef123456' } })).toThrow(/credential/i);
    expect(() => rejectCredentials({ headers: { Authorization: 'Bearer ${TOKEN}' } })).not.toThrow();
    expect(() => rejectCredentials({ headers: { Authorization: 'Bearer abcdefghijk' } })).toThrow(/credential/i);
    expect(() => rejectCredentials({ url: 'https://u:p@example.com/x' })).toThrow(/URL/);
    expect(() => rejectCredentials({ url: 'https://example.com/x?api_key=abc' })).toThrow(/URL/);
    expect(() => rejectCredentials(JSON.parse('{"__proto__":{"a":1}}'))).toThrow(/Unsafe/);
    try { rejectCredentials({ token: 'topsecretvalue' }); } catch (error) { expect(error.message).not.toContain('topsecretvalue'); }
  });

  it('allows type declarations under sensitive key names', () => {
    expect(() => rejectCredentials({ properties: { password: { type: 'string' } }, password: 'string' })).not.toThrow();
  });

  it('collects regular files with hashes and modes, skipping VCS and dependency directories', () => {
    const root = temp();
    fs.mkdirSync(path.join(root, 'node_modules/x'), { recursive: true }); fs.writeFileSync(path.join(root, 'node_modules/x/a.js'), 'x');
    fs.mkdirSync(path.join(root, '.git')); fs.writeFileSync(path.join(root, '.git/config'), 'x');
    fs.writeFileSync(path.join(root, 'run.sh'), '#!/bin/sh', { mode: 0o755 });
    fs.writeFileSync(path.join(root, 'plugin.json'), '{"name":"a"}');
    const { entries } = collectSource(root);
    expect(entries.map(e => e.path)).toEqual(['plugin.json', 'run.sh']);
    expect(entries.find(e => e.path === 'run.sh').mode).toBe(0o755);
    expect(entries[0].sha256).toBe(sha256(Buffer.from('{"name":"a"}')));
  });

  it('refuses credential files, links, and oversized or over-numerous sources', () => {
    const root = temp(); fs.writeFileSync(path.join(root, '.env'), 'A=1');
    expect(() => collectSource(root)).toThrow(/Credential file/);
    fs.unlinkSync(path.join(root, '.env')); fs.writeFileSync(path.join(root, '.env.example'), 'A=');
    expect(collectSource(root).entries).toHaveLength(1);
    fs.symlinkSync(path.join(root, '.env.example'), path.join(root, 'link'));
    expect(() => collectSource(root)).toThrow(/symlink/i);
    const big = temp(); fs.writeFileSync(path.join(big, 'a.bin'), Buffer.alloc(MAX_BYTES + 1));
    expect(() => collectSource(big)).toThrow(/limit/);
    const many = temp(); for (let i = 0; i <= MAX_FILES; i++) fs.writeFileSync(path.join(many, `f${i}.txt`), 'x');
    expect(() => collectSource(many)).toThrow(/limit/);
  });

  it('follows only the macOS /var alias and still rejects a linked source ancestor', () => {
    const root = temp();
    expect(noLinks(root)).toBeTruthy();
    const real = temp(); fs.writeFileSync(path.join(real, 'a.json'), '{}');
    const link = path.join(temp(), 'l'); fs.symlinkSync(real, link);
    expect(() => noLinks(path.join(link, 'a.json'))).toThrow(/Symlink/);
  });

  it.skipIf(process.platform !== 'darwin')('accepts the real /tmp alias but rejects arbitrary links below it', () => {
    const root = fs.mkdtempSync('/tmp/tr-import-alias-'); roots.push(root);
    fs.writeFileSync(path.join(root, 'a.json'), '{}');
    expect(noLinks(root)).toBe('/private' + root);
    expect(collectSource(root).entries.map(e => e.path)).toEqual(['a.json']);
    fs.symlinkSync(root, path.join(root, 'linked'));
    expect(() => noLinks(path.join(root, 'linked/a.json'))).toThrow(/Symlink/);
    expect(() => collectSource(root)).toThrow(/symlink/i);
  });

  it('rejects unsafe paths', () => {
    for (const bad of ['', '/abs', '../x', 'a/../b', 'a//b', 'a\\b', 'a:b', './x']) expect(() => safePath(bad)).toThrow();
    expect(safePath('a/b.json')).toBe('a/b.json');
  });

  it('parses JSON, YAML and TOML and rejects malformed or duplicate-key YAML', () => {
    expect(parseDeclaration(Buffer.from('{"a":1}'), 'x.json')).toEqual({ a: 1 });
    expect(parseDeclaration(Buffer.from('a: [1, 2]'), 'x.yaml')).toEqual({ a: [1, 2] });
    expect(parseDeclaration(Buffer.from('[p]\nn = "x"'), 'x.toml')).toEqual({ p: { n: 'x' } });
    expect(() => parseDeclaration(Buffer.from('a: 1\na: 2'), 'x.yaml')).toThrow(/Malformed/);
    expect(() => parseDeclaration(Buffer.from('{'), 'x.json')).toThrow(/Malformed/);
  });
});

describe('asset decoding', () => {
  it('verifies hash, base64, duplicates, modes and secret-file exclusions', () => {
    expect(decodeAssets([asset('a.json', '{"a":1}')])).toHaveLength(1);
    expect(() => decodeAssets([])).toThrow();
    expect(() => decodeAssets([{ ...asset('a.txt', 'x'), sha256: 'bad' }])).toThrow(/mismatch/);
    expect(() => decodeAssets([asset('a.txt', 'x'), asset('a.txt', 'x')])).toThrow(/duplicate/i);
    expect(() => decodeAssets([{ ...asset('a.txt', 'x'), data_b64: '***' }])).toThrow(/Invalid/);
    expect(() => decodeAssets([asset('a.txt', 'x', 0o4755)])).toThrow(/mode/);
    expect(() => decodeAssets([asset('.env', 'A=1')])).toThrow(/Credential file/);
    expect(() => decodeAssets([asset('sub/.npmrc', 'x')])).toThrow(/Credential file/);
    expect(() => decodeAssets([asset('a.json', '{"password":"literalvalue1"}')])).toThrow(/credential/i);
    expect(() => decodeAssets([asset('../a.txt', 'x')])).toThrow(/Unsafe/);
  });
});

describe('plugin variables', () => {
  it('expands standard root/data variables and reports every other placeholder', () => {
    expect(unresolvedPlaceholders({ a: '${CLAUDE_PLUGIN_ROOT}/x' })).toEqual([]);
    expect(unresolvedPlaceholders({ a: '${PLUGIN_DATA}', b: '${CLAUDE_PLUGIN_DATA}' })).toEqual(['PLUGIN_DATA', 'CLAUDE_PLUGIN_DATA']);
    expect(unresolvedPlaceholders({ a: '${TOKEN}', b: '{{x}}' }).sort()).toEqual(['TOKEN', '{{x}}']);
    expect(expandPluginVars({ a: ['${CLAUDE_PLUGIN_ROOT}/x', '${PLUGIN_DATA}', '${OTHER}'] }, '/r', '/d')).toEqual({ a: ['/r/x', '/d', '${OTHER}'] });
  });
});
