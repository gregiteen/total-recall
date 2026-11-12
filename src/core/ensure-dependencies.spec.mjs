// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureDependencies, DEFAULT_INSTALL_TIMEOUT_MS } from './ensure-dependencies.mjs';

describe('ensureDependencies', () => {
  let root, run;
  const file = name => path.join(root, name);
  const write = (name, body) => fs.writeFileSync(file(name), typeof body === 'string' ? body : JSON.stringify(body));
  const marker = () => file('node_modules/.total-recall-install.json');
  const ensure = options => ensureDependencies(root, { reason: 'fixture', run, ...options });
  const locked = (name = 'package-lock.json', packageManager) => {
    write('package.json', { name: 'dependency-fixture', version: '1.0.0', ...(packageManager ? { packageManager } : {}) });
    write(name, 'lock version one');
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr dependencies '));
    run = vi.fn(async () => {
      fs.mkdirSync(file('node_modules'), { recursive: true });
      return { exitCode: 0 };
    });
  });
  afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

  it('skips repositories without a lockfile and creates nothing', async () => {
    expect(await ensure()).toMatchObject({ ok: true, status: 'skipped', trigger: 'no-lockfile' });
    expect(fs.readdirSync(root)).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
  it('installs missing dependencies with the frozen command and writes a marker', async () => {
    locked();
    expect(await ensure()).toMatchObject({ ok: true, status: 'installed', trigger: 'missing', reason: 'fixture', manager: 'npm' });
    expect(run).toHaveBeenCalledWith('npm', ['ci'], { cwd: fs.realpathSync(root), timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS });
    expect(JSON.parse(fs.readFileSync(marker(), 'utf8'))).toMatchObject({ version: 1, manager: 'npm', lockfile: 'package-lock.json', lockHash: expect.stringMatching(/^[a-f0-9]{64}$/), lockMtimeMs: fs.statSync(file('package-lock.json')).mtimeMs });
  });
  it('does not reinstall a current install', async () => {
    locked();
    await ensure();
    expect(await ensure()).toMatchObject({ ok: true, status: 'current' });
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('reinstalls after node_modules is removed', async () => {
    locked();
    await ensure();
    fs.rmSync(file('node_modules'), { recursive: true });
    expect(await ensure()).toMatchObject({ status: 'installed', trigger: 'missing' });
    expect(run).toHaveBeenCalledTimes(2);
  });
  it.each(['missing', 'invalid'])('reinstalls an existing directory with a %s marker', async kind => {
    locked();
    fs.mkdirSync(file('node_modules'));
    if (kind === 'invalid') fs.writeFileSync(marker(), '{bad json');
    expect(await ensure()).toMatchObject({ status: 'installed', trigger: 'stale' });
  });
  it('reinstalls when only the lockfile mtime changes', async () => {
    locked();
    await ensure();
    const next = new Date(Date.now() + 5000);
    fs.utimesSync(file('package-lock.json'), next, next);
    expect(await ensure()).toMatchObject({ status: 'installed', trigger: 'stale' });
    expect((await ensure()).status).toBe('current');
  });
  it('reinstalls when the hash changes even if the mtime is restored', async () => {
    locked();
    const fixed = new Date('2026-01-01T00:00:00Z');
    fs.utimesSync(file('package-lock.json'), fixed, fixed);
    await ensure();
    write('package-lock.json', 'lock version two');
    fs.utimesSync(file('package-lock.json'), fixed, fixed);
    expect(fs.statSync(file('package-lock.json')).mtimeMs).toBe(JSON.parse(fs.readFileSync(marker(), 'utf8')).lockMtimeMs);
    expect(await ensure()).toMatchObject({ status: 'installed', trigger: 'stale' });
  });
  it.each([
    ['npm-shrinkwrap.json', undefined, 'npm', ['ci']],
    ['pnpm-lock.yaml', undefined, 'pnpm', ['install', '--frozen-lockfile']],
    ['yarn.lock', 'yarn@1.22.22', 'yarn', ['install', '--frozen-lockfile']],
    ['yarn.lock', 'yarn@4.0.0', 'yarn', ['install', '--immutable']],
    ['bun.lock', undefined, 'bun', ['install', '--frozen-lockfile']],
    ['bun.lockb', undefined, 'bun', ['install', '--frozen-lockfile']],
  ])('detects %s (%s)', async (name, declared, manager, args) => {
    locked(name, declared);
    expect((await ensure()).ok).toBe(true);
    expect(run).toHaveBeenCalledWith(manager, args, expect.objectContaining({ cwd: fs.realpathSync(root) }));
  });
  it('recognizes modern Yarn from lockfile metadata and supports PnP installs', async () => {
    locked('yarn.lock');
    write('yarn.lock', '__metadata:\n  version: 8\n');
    run.mockImplementation(async () => { write('.pnp.cjs', 'fixture'); return { exitCode: 0 }; });
    expect((await ensure()).status).toBe('installed');
    expect(run).toHaveBeenCalledWith('yarn', ['install', '--immutable'], expect.anything());
    expect(fs.existsSync(file('node_modules'))).toBe(false);
    expect((await ensure()).status).toBe('current');
    fs.rmSync(file('.pnp.cjs'));
    expect((await ensure()).status).toBe('installed');
  });
  it('rejects ambiguous managers and a declared manager without its lockfile', async () => {
    locked();
    write('pnpm-lock.yaml', 'pnpm lock');
    expect(await ensure()).toMatchObject({ ok: false, status: 'failed', error: expect.stringContaining('package manager') });
    write('package.json', { packageManager: 'yarn@4.0.0' });
    expect((await ensure()).ok).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
  it('uses the declared manager when several managers have lockfiles', async () => {
    locked('package-lock.json', 'pnpm@10.0.0');
    write('pnpm-lock.yaml', 'pnpm lock');
    expect(await ensure()).toMatchObject({ ok: true, manager: 'pnpm', lockfile: 'pnpm-lock.yaml' });
  });
  it('uses npm shrinkwrap before package-lock', async () => {
    locked();
    write('npm-shrinkwrap.json', 'shrinkwrap');
    expect(await ensure()).toMatchObject({ ok: true, lockfile: 'npm-shrinkwrap.json' });
  });
  it.each([
    { exitCode: 7, output: 'fixture install failed' },
    { exitCode: null, timedOut: true },
    { exitCode: null, error: 'spawn ENOENT' },
  ])('reports failure without an install marker: %j', async failure => {
    locked();
    await ensure();
    write('package-lock.json', 'changed');
    run.mockResolvedValue(failure);
    expect(await ensure({ timeoutMs: 100 })).toMatchObject({ ok: false, status: 'failed', ...failure, error: expect.any(String) });
    expect(fs.existsSync(marker())).toBe(false);
    run.mockResolvedValue({ exitCode: 0 });
    expect((await ensure()).status).toBe('installed');
  });
  it('returns filesystem and runner exceptions as failures', async () => {
    locked();
    run.mockRejectedValue(new Error('runner rejected'));
    expect(await ensure()).toMatchObject({ ok: false, error: 'runner rejected' });
    write('package.json', '{invalid');
    expect((await ensure()).ok).toBe(false);
    expect((await ensureDependencies(file('absent'))).ok).toBe(false);
  });
  it('does not certify an install if its lockfile changes during the install', async () => {
    locked();
    run.mockImplementation(async () => { write('package-lock.json', 'raced'); return { exitCode: 0 }; });
    expect(await ensure()).toMatchObject({ ok: false, error: expect.stringContaining('changed during install') });
    expect(fs.existsSync(marker())).toBe(false);
  });
  it.each([0, -1, 1.5, 600001, NaN])('rejects an invalid timeout (%s)', async timeoutMs => {
    locked();
    expect((await ensure({ timeoutMs })).ok).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
  it('shares an in-flight install, then rechecks the install on the next call', async () => {
    locked();
    let finish;
    run.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const first = ensure();
    const second = ensure();
    finish({ exitCode: 0 });
    expect(await first).toEqual(await second);
    expect((await ensure()).status).toBe('current');
    expect(run).toHaveBeenCalledTimes(1);
  });

  const executable = source => {
    fs.mkdirSync(file('bin'));
    fs.symlinkSync(process.execPath, file('bin/node'));
    fs.writeFileSync(file('bin/npm'), `#!/usr/bin/env node\n${source}`, { mode: 0o700 });
    vi.stubEnv('PATH', file('bin'));
  };
  it('bounds a real fixture process and kills it at its deadline', async () => {
    locked();
    executable('setInterval(() => {}, 1000);');
    const result = await ensureDependencies(root, { timeoutMs: 100 });
    expect(result).toMatchObject({ ok: false, status: 'failed', timedOut: true });
    expect(result.durationMs).toBeLessThan(5000);
    expect(fs.existsSync(marker())).toBe(false);
  });
  it('handles a missing executable without an unhandled error event', async () => {
    locked();
    vi.stubEnv('PATH', root);
    expect(await ensureDependencies(root)).toMatchObject({ ok: false, error: expect.stringContaining('ENOENT') });
  });
  it('caps child output and reports the actual exit code', async () => {
    locked();
    executable('console.log("x".repeat(100000)); process.exitCode = 9;');
    const result = await ensureDependencies(root);
    expect(result).toMatchObject({ ok: false, exitCode: 9 });
    expect(result.output.length).toBe(65536);
  });
});

describe('ensureDependencies never wipes a working tree it can trust', () => {
  let root;
  const lockPackages = {
    '': { name: 'fixture', version: '1.0.0' },
    'node_modules/zod': { version: '4.4.3' },
    'node_modules/fsevents': { version: '2.3.3', optional: true },
    'node_modules/frontend': { resolved: 'frontend', link: true },
  };
  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-npm-tree-')));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: lockPackages }));
    fs.mkdirSync(path.join(root, 'node_modules'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const hidden = (packages) => fs.writeFileSync(path.join(root, 'node_modules', '.package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages }));
  const onDisk = (name, version) => {
    fs.mkdirSync(path.join(root, 'node_modules', name), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules', name, 'package.json'), JSON.stringify({ name, version }));
  };

  it('accepts a tree npm installed by hand and writes the marker, without reinstalling', async () => {
    hidden({ 'node_modules/zod': { version: '4.4.3' }, 'node_modules/frontend': { resolved: 'frontend', link: true } });
    onDisk('zod', '4.4.3');
    const run = vi.fn();
    expect(await ensureDependencies(root, { run })).toMatchObject({ ok: true, status: 'current', trigger: 'npm-tree-record' });
    expect(run).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(root, 'node_modules', '.total-recall-install.json'))).toBe(true);
  });

  it('reinstalls a tree whose versions differ from the lockfile', async () => {
    hidden({ 'node_modules/zod': { version: '3.0.0' } });
    onDisk('zod', '3.0.0');
    const run = vi.fn(async () => ({ exitCode: 0 }));
    expect(await ensureDependencies(root, { run })).toMatchObject({ ok: true, status: 'installed' });
    expect(run).toHaveBeenCalledWith('npm', ['ci'], expect.anything());
  });

  it('never trusts npm\'s tree record over the packages on disk (2026-11-12)', async () => {
    // `npm install --package-lock-only` rewrote the record to the locked version; disk kept the old one.
    hidden({ 'node_modules/zod': { version: '4.4.3' } });
    onDisk('zod', '3.0.0');
    const run = vi.fn(async () => ({ exitCode: 0 }));
    expect(await ensureDependencies(root, { run })).toMatchObject({ ok: true, status: 'installed' });
    expect(run).toHaveBeenCalledWith('npm', ['ci'], expect.anything());
  });

  it('treats a required package missing from disk as stale even when the record lists it', async () => {
    hidden({ 'node_modules/zod': { version: '4.4.3' } });
    const run = vi.fn(async () => ({ exitCode: 0 }));
    expect(await ensureDependencies(root, { run })).toMatchObject({ ok: true, status: 'installed' });
  });

  it('never reinstalls the package it runs from, and says how to repair it', async () => {
    hidden({});
    const run = vi.fn();
    const result = await ensureDependencies(root, { run, packageRoot: root });
    expect(result).toMatchObject({ ok: false, status: 'failed', trigger: 'running-package' });
    expect(result.error).toContain("Run 'npm install' there yourself");
    expect(run).not.toHaveBeenCalled();
  });
});
