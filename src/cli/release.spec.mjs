import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseArgs,
  readSourcePackage,
  publishedVersion,
  awaitPublished,
  tarballServed,
  alreadyPublishedRefusal,
  consumerState,
  verifyConsumers,
} from './release.mjs';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tr-release-'));
}

function fakeRepo({ deps = {}, devDeps = {}, installed = null, aliasInstalled = null } = {}) {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'consumer', dependencies: deps, devDependencies: devDeps }, null, 2));
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
    const r = await awaitPublished('x', '1.0.0', { exec: fake, tarball: async () => true });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(1);
  });

  it('retries until the new version appears, then succeeds', async () => {
    let n = 0;
    const fake = () => ({ status: 0, stdout: `${++n >= 3 ? '2.0.0' : '1.0.0'}\n`, stderr: '' });
    const r = await awaitPublished('x', '2.0.0', { exec: fake, attempts: 5, delayMs: 0, sleep: async () => {}, tarball: async () => true });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(3);
  });

  it('fails loudly when the version never appears', async () => {
    const fake = () => ({ status: 0, stdout: '1.0.0\n', stderr: '' });
    const r = await awaitPublished('x', '9.9.9', { exec: fake, attempts: 3, delayMs: 0, sleep: async () => {} });
    expect(r.ok).toBe(false);
    expect(r.version).toBe('1.0.0');
  });

  it('keeps waiting while the version is listed but its tarball is not served', async () => {
    const fake = () => ({ status: 0, stdout: '2.0.0\n', stderr: '' });
    let n = 0;
    const r = await awaitPublished('x', '2.0.0', { exec: fake, attempts: 5, delayMs: 0, sleep: async () => {}, tarball: async () => ++n >= 3 });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(3);
  });

  it('fails loudly when the tarball never appears', async () => {
    const fake = () => ({ status: 0, stdout: '2.0.0\n', stderr: '' });
    const r = await awaitPublished('x', '2.0.0', { exec: fake, attempts: 2, delayMs: 0, sleep: async () => {}, tarball: async () => false });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/tarball/);
  });
});

describe('tarballServed', () => {
  const listed = () => ({ status: 0, stdout: 'https://example.test/x-1.0.0.tgz\n', stderr: '' });

  it('asks the registry for the URL and checks the file itself', async () => {
    const seen = [];
    const ok = await tarballServed('x', '1.0.0', { exec: listed, fetchImpl: async (url, init) => { seen.push([url, init.method]); return { ok: true }; } });
    expect(ok).toBe(true);
    expect(seen).toEqual([['https://example.test/x-1.0.0.tgz', 'HEAD']]);
  });

  it('is false on a 404, a network failure or an unlisted version', async () => {
    expect(await tarballServed('x', '1.0.0', { exec: listed, fetchImpl: async () => ({ ok: false }) })).toBe(false);
    expect(await tarballServed('x', '1.0.0', { exec: listed, fetchImpl: async () => { throw new Error('offline'); } })).toBe(false);
    expect(await tarballServed('x', '1.0.0', { exec: () => ({ status: 1, stdout: '' }), fetchImpl: async () => ({ ok: true }) })).toBe(false);
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

  it('counts a consumer as current when it runs the version named, whatever its pin says', () => {
    // `update` installs plugin copies with --no-save, so their pin stays behind on purpose.
    const root = fakeRepo({ deps: { '@gregiteen/ssss-cli': '0.14.3' }, installed: '0.14.4' });
    const s = consumerState(root, '@gregiteen/ssss-cli', '0.14.4');
    expect(s.satisfied).toBe(true);
    expect(s.reason).toBe('ok');
    expect(s.pinBehind).toBe(true);
  });

  it('never passes a consumer whose pin and install both lag the version named', () => {
    const root = fakeRepo({ deps: { '@gregiteen/ssss-cli': '0.14.3' }, installed: '0.14.3' });
    const s = consumerState(root, '@gregiteen/ssss-cli', '0.14.4');
    expect(s.satisfied).toBe(false);
    expect(s.reason).toBe('installed-mismatch');
  });

  it('fails a consumer whose pin is current but whose install is not', () => {
    const root = fakeRepo({ deps: { '@gregiteen/ssss-cli': '0.14.4' }, installed: '0.14.3' });
    const s = consumerState(root, '@gregiteen/ssss-cli', '0.14.4');
    expect(s.satisfied).toBe(false);
    expect(s.pinBehind).toBe(false);
  });

  it('does not call an absent dev dependency stale: the checkout runs under the shared install', () => {
    const root = fakeRepo({ devDeps: { '@gregiteen/ssss-cli': '0.14.4' } });
    const s = consumerState(root, '@gregiteen/ssss-cli', '0.14.4');
    expect(s.satisfied).toBe(true);
    expect(s.reason).toBe('dev-not-installed');
    expect(s.devNotInstalled).toBe(true);
  });

  it('still fails a dev dependency that is installed at an old version', () => {
    const root = fakeRepo({ devDeps: { '@gregiteen/ssss-cli': '0.14.4' }, installed: '0.14.3' });
    const s = consumerState(root, '@gregiteen/ssss-cli', '0.14.4');
    expect(s.satisfied).toBe(false);
    expect(s.reason).toBe('installed-mismatch');
  });

  it('reads an npm: alias against the version named too', () => {
    const root = fakeRepo({ deps: { '@ssss/cli': 'npm:@gregiteen/ssss-cli@0.10.3' }, aliasInstalled: '0.14.4' });
    expect(consumerState(root, '@ssss/cli', '0.14.4').satisfied).toBe(true);
    expect(consumerState(root, '@ssss/cli', '0.15.0').satisfied).toBe(false);
  });

  it('marks a repo that does not declare the package as not-declared', () => {
    const root = fakeRepo({ deps: {} });
    expect(consumerState(root, '@gregiteen/ssss-cli').reason).toBe('not-declared');
  });
});

describe('verifyConsumers', () => {
  it('finds a consumer nested under a scanned root and reads the version it resolves', () => {
    const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-release-nested-'));
    try {
      const pkgDir = path.join(outer, 'node_modules', 'total-recall-brain');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'total-recall-brain', version: '9.9.9' }));
      const nested = path.join(outer, 'apps', 'worker');
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(path.join(nested, 'package.json'), JSON.stringify({ name: 'worker', dependencies: { 'total-recall-brain': '9.9.9' } }));
      const r = verifyConsumers('total-recall-brain', '9.9.9', { scanRoots: [outer] });
      expect(r.consumers).toBe(1);
      expect(r.failing).toBe(0);
    } finally {
      fs.rmSync(outer, { recursive: true, force: true });
    }
  });

  it('counts only repos that declare the package, and lists failures', () => {
    const good = fakeRepo({ deps: { '@gregiteen/ssss-cli': '0.14.4' }, installed: '0.14.4' });
    const bad = fakeRepo({ deps: { '@gregiteen/ssss-cli': '0.14.4' }, installed: '0.14.3' });
    const unrelated = fakeRepo({ deps: {} });
    const r = verifyConsumers('@gregiteen/ssss-cli', '0.14.4', { roots: [good, bad, unrelated] });
    expect(r.consumers).toBe(2);
    expect(r.failing).toBe(1);
    expect(r.failures[0].root).toBe(bad);
  });

  it('reports a lagging pin without failing, and a lagging install as a failure', () => {
    const copy = fakeRepo({ deps: { '@gregiteen/ssss-cli': '0.14.3' }, installed: '0.14.4' });
    const stale = fakeRepo({ deps: { '@gregiteen/ssss-cli': '0.14.3' }, installed: '0.14.3' });
    const r = verifyConsumers('@gregiteen/ssss-cli', '0.14.4', { roots: [copy, stale] });
    expect(r.failing).toBe(1);
    expect(r.failures[0].root).toBe(stale);
    expect(r.pin_behind).toEqual([{ root: copy, declared: '0.14.3', installed: '0.14.4' }]);
  });

  it('reports absent dev dependencies without failing, and an absent runtime one as a failure', () => {
    const idle = fakeRepo({ devDeps: { '@gregiteen/ssss-cli': '0.14.4' } });
    const broken = fakeRepo({ deps: { '@gregiteen/ssss-cli': '0.14.4' } });
    const r = verifyConsumers('@gregiteen/ssss-cli', '0.14.4', { roots: [idle, broken] });
    expect(r.failing).toBe(1);
    expect(r.failures[0].root).toBe(broken);
    expect(r.dev_not_installed).toEqual([idle]);
  });

  it('passes when every declaring consumer is satisfied', () => {
    const a = fakeRepo({ deps: { '@gregiteen/ssss-cli': '0.14.4' }, installed: '0.14.4' });
    const r = verifyConsumers('@gregiteen/ssss-cli', '0.14.4', { roots: [a] });
    expect(r.failing).toBe(0);
  });
});
