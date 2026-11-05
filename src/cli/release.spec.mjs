import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseArgs,
  readSourcePackage,
  publishedVersion,
  awaitPublished,
  alreadyPublishedRefusal,
  consumerState,
  verifyConsumers,
} from './release.mjs';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tr-release-'));
}

function fakeRepo({ deps = {}, installed = null, aliasInstalled = null } = {}) {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'consumer', dependencies: deps }, null, 2));
  if (installed) {
    const dir = path.join(root, 'node_modules', '@gregiteen', 'ssss-cli');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@gregiteen/ssss-cli', version: installed }));
  }
  if (aliasInstalled) {
    const dir = path.join(root, 'node_modules', '@ssss', 'cli');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@gregiteen/ssss-cli', version: aliasInstalled }));
  }
  return root;
}

describe('release CLI parseArgs', () => {
  it('defaults', () => {
    const o = parseArgs([]);
    expect(o.action).toBeNull();
    expect(o.packages).toEqual([]);
    expect(o.apply).toBe(false);
    expect(o.version).toBeNull();
    expect(o.json).toBe(false);
  });

  it('parses action, package, version and flags', () => {
    const o = parseArgs(['publish', '@scope/pkg', '--version', '1.2.3', '--apply', '--otp', '123456', '--json']);
    expect(o.action).toBe('publish');
    expect(o.packages).toEqual(['@scope/pkg']);
    expect(o.version).toBe('1.2.3');
    expect(o.apply).toBe(true);
    expect(o.otp).toBe('123456');
    expect(o.json).toBe(true);
  });

  it('collects multiple packages', () => {
    const o = parseArgs(['propagate', 'a', 'b']);
    expect(o.packages).toEqual(['a', 'b']);
  });
});

describe('readSourcePackage', () => {
  it('finds the package at the repo root', () => {
    const root = tmp();
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'pkg-a', version: '1.0.0' }));
    const found = readSourcePackage(root, 'pkg-a');
    expect(found.pkgJson.version).toBe('1.0.0');
  });

  it('finds a workspace package one level down', () => {
    const root = tmp();
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'root', version: '0.0.0' }));
    const dir = path.join(root, 'packages', 'child');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'pkg-b', version: '2.0.0' }));
    expect(readSourcePackage(root, 'pkg-b').pkgJson.version).toBe('2.0.0');
  });

  it('returns null for an unknown package and survives malformed json', () => {
    const root = tmp();
    fs.writeFileSync(path.join(root, 'package.json'), '{ not json');
    expect(readSourcePackage(root, 'nope')).toBeNull();
  });
});

describe('publishedVersion', () => {
  it('reads stdout on success', () => {
    const fake = () => ({ status: 0, stdout: '1.2.3\n', stderr: '' });
    expect(publishedVersion('x', { exec: fake })).toEqual({ ok: true, version: '1.2.3', error: null });
  });

  it('reports failure without throwing', () => {
    const fake = () => ({ status: 1, stdout: '', stderr: 'E404' });
    const r = publishedVersion('x', { exec: fake });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('E404');
  });
});

describe('alreadyPublishedRefusal', () => {
  it('recognises npm refusing an existing version, and nothing else', () => {
    expect(alreadyPublishedRefusal('npm error You cannot publish over the previously published versions: 3.42.0.')).toBe(true);
    expect(alreadyPublishedRefusal('npm error code E403 forbidden')).toBe(false);
    expect(alreadyPublishedRefusal()).toBe(false);
  });
});

describe('awaitPublished', () => {
  it('returns immediately when the registry already matches', async () => {
    const fake = () => ({ status: 0, stdout: '1.0.0\n', stderr: '' });
    const r = await awaitPublished('x', '1.0.0', { exec: fake });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(1);
  });

  it('retries until the new version appears, then succeeds', async () => {
    let n = 0;
    const fake = () => ({ status: 0, stdout: `${++n >= 3 ? '2.0.0' : '1.0.0'}\n`, stderr: '' });
    const r = await awaitPublished('x', '2.0.0', { exec: fake, attempts: 5, delayMs: 0, sleep: async () => {} });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(3);
  });

  it('fails loudly when the version never appears', async () => {
    const fake = () => ({ status: 0, stdout: '1.0.0\n', stderr: '' });
    const r = await awaitPublished('x', '9.9.9', { exec: fake, attempts: 3, delayMs: 0, sleep: async () => {} });
    expect(r.ok).toBe(false);
    expect(r.version).toBe('1.0.0');
  });
});

describe('consumerState', () => {
  it('is satisfied when a plain version spec matches the install', () => {
    const root = fakeRepo({ deps: { '@gregiteen/ssss-cli': '0.14.4' }, installed: '0.14.4' });
    const s = consumerState(root, '@gregiteen/ssss-cli');
    expect(s.want).toBe('0.14.4');
    expect(s.satisfied).toBe(true);
  });

  it('reports a mismatch when the install lags the pin', () => {
    const root = fakeRepo({ deps: { '@gregiteen/ssss-cli': '0.14.4' }, installed: '0.14.3' });
    const s = consumerState(root, '@gregiteen/ssss-cli');
    expect(s.satisfied).toBe(false);
    expect(s.reason).toBe('installed-mismatch');
  });

  it('reports not-installed when nothing is present', () => {
    const root = fakeRepo({ deps: { '@gregiteen/ssss-cli': '0.14.4' } });
    const s = consumerState(root, '@gregiteen/ssss-cli');
    expect(s.satisfied).toBe(false);
    expect(s.reason).toBe('not-installed');
  });

  it('resolves an npm: alias pin', () => {
    // An npm: alias installs under the alias dir, which is what .bin shims run.
    const root = fakeRepo({ deps: { '@ssss/cli': 'npm:@gregiteen/ssss-cli@0.14.4' }, aliasInstalled: '0.14.4' });
    const s = consumerState(root, '@ssss/cli');
    expect(s.want).toBe('0.14.4');
    expect(s.installed).toBe('0.14.4');
    expect(s.satisfied).toBe(true);
  });

  it('treats a caret range as satisfied by the expected release version', () => {
    const root = fakeRepo({ deps: { 'pkg-r': '^1.0.0' }, installed: null });
    const dir = path.join(root, 'node_modules', 'pkg-r');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'pkg-r', version: '1.2.0' }));
    const s = consumerState(root, 'pkg-r', '1.2.0');
    expect(s.range).toBe(true);
    expect(s.satisfied).toBe(true);
  });

  it('marks a repo that does not declare the package as not-declared', () => {
    const root = fakeRepo({ deps: {} });
    expect(consumerState(root, '@gregiteen/ssss-cli').reason).toBe('not-declared');
  });
});

describe('verifyConsumers', () => {
  it('counts only repos that declare the package, and lists failures', () => {
    const good = fakeRepo({ deps: { '@gregiteen/ssss-cli': '0.14.4' }, installed: '0.14.4' });
    const bad = fakeRepo({ deps: { '@gregiteen/ssss-cli': '0.14.4' }, installed: '0.14.3' });
    const unrelated = fakeRepo({ deps: {} });
    const r = verifyConsumers('@gregiteen/ssss-cli', '0.14.4', { roots: [good, bad, unrelated] });
    expect(r.consumers).toBe(2);
    expect(r.failing).toBe(1);
    expect(r.failures[0].root).toBe(bad);
  });

  it('passes when every declaring consumer is satisfied', () => {
    const a = fakeRepo({ deps: { '@gregiteen/ssss-cli': '0.14.4' }, installed: '0.14.4' });
    const r = verifyConsumers('@gregiteen/ssss-cli', '0.14.4', { roots: [a] });
    expect(r.failing).toBe(0);
  });
});
