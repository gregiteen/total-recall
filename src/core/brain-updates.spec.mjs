import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
vi.mock('./plugin-loader.mjs', () => ({ discoverPlugins: () => [] }));
vi.mock('./logger.mjs', () => ({ logger: { info() {}, warn() {}, debug() {} } }));
vi.mock('./config.mjs', () => ({ brainDir: '/tmp/brain-update-test', ROOT: '/tmp/brain-update-test' }));
vi.mock('./autopull-install.mjs', () => ({ installAutoPull: vi.fn() }));
import { updateAllBrains, brainInstallOwner, brainUpdateLockPath } from './brain-updates.mjs';
import { parseArgs } from '../cli/update.mjs';

describe('uniform brain updates', () => {
  let tmp;
  const versions = { 'total-recall-brain': '3.39.1', '@gregiteen/ssss-cli': '0.11.0' };
  function manifest(root, pkg) {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
    return root;
  }
  function installed(root, key, version) {
    const dir = path.join(root, 'node_modules', key);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: key, version }));
  }
  function execWithInstall(install = () => ({ status: 0 })) {
    return vi.fn((cmd, args, options) => args[0] === 'view'
      ? { status: 0, stdout: versions[args[1]] } : install(cmd, args, options));
  }
  const run = (roots, exec, extra = {}) => updateAllBrains({ roots, plugins: [], exec, ...extra });
  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'brain-updates-')));
    vi.spyOn(os, 'homedir').mockReturnValue(tmp);
    delete process.env.TR_SYNC_REPOS;
  });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('plans aliases and nested consumers without writing or installing', async () => {
    const root = manifest(path.join(tmp, 'app'), { dependencies: { '@ssss/cli': 'github:example/engine#old' } });
    const nested = manifest(path.join(root, 'runtime'), { devDependencies: { 'total-recall-brain': '^3.35.0' } });
    const before = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
    const exec = execWithInstall();
    const result = await run([root, nested], exec);
    expect(result.consumer_count).toBe(2);
    expect(result.would_update).toBe(2);
    expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(before);
    expect(exec.mock.calls.every(([, args]) => args[0] === 'view')).toBe(true);
    expect(fs.existsSync(path.join(root, '.total-recall-update.lock'))).toBe(false);
  });

  it('pins aliases in their original section and verifies the actual install', async () => {
    const root = manifest(path.join(tmp, 'app'), { devDependencies: { '@ssss/cli': '^0.10.1' } });
    const exec = execWithInstall(() => { installed(root, '@ssss/cli', '0.11.0'); return { status: 0 }; });
    const result = await run([root], exec, { dryRun: false });
    expect(result.updated).toBe(1);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json')))).toEqual({ devDependencies: { '@ssss/cli': 'npm:@gregiteen/ssss-cli@0.11.0' } });
    expect(result.results[0].packages[0].installed).toBe('0.11.0');
  });

  it('migrates a shared dependency link without changing its former target', async () => {
    const shared = manifest(path.join(tmp, 'shared'), {});
    installed(shared, 'total-recall-brain', '3.39.1');
    const root = manifest(path.join(tmp, 'app'), { dependencies: { 'total-recall-brain': '3.39.1' } });
    fs.symlinkSync(path.join(shared, 'node_modules'), path.join(root, 'node_modules'), 'dir');
    const exec = execWithInstall(() => { installed(root, 'total-recall-brain', '3.39.1'); return { status: 0 }; });
    const result = await run([root], exec, { dryRun: false });
    expect(result.updated).toBe(1);
    expect(fs.lstatSync(path.join(root, 'node_modules')).isSymbolicLink()).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(shared, 'node_modules/total-recall-brain/package.json'))).version).toBe('3.39.1');
  });

  it('restores links, manifests and locks on failure and continues other repos', async () => {
    const shared = path.join(tmp, 'shared'); fs.mkdirSync(shared);
    const bad = manifest(path.join(tmp, 'bad'), { dependencies: { 'total-recall-brain': '^3.35.0' } });
    const good = manifest(path.join(tmp, 'good'), { dependencies: { 'total-recall-brain': '^3.35.0' } });
    fs.symlinkSync(shared, path.join(bad, 'node_modules'), 'dir');
    const before = fs.readFileSync(path.join(bad, 'package.json'), 'utf8');
    const exec = execWithInstall((cmd, args, { cwd }) => {
      if (cwd === bad) { fs.writeFileSync(path.join(bad, 'package-lock.json'), '{}'); return { status: 1, stderr: 'network down' }; }
      installed(good, 'total-recall-brain', '3.39.1'); return { status: 0 };
    });
    const result = await run([bad, good], exec, { dryRun: false });
    expect(result.failed).toBe(1); expect(result.updated).toBe(1);
    expect(fs.readFileSync(path.join(bad, 'package.json'), 'utf8')).toBe(before);
    expect(fs.readlinkSync(path.join(bad, 'node_modules'))).toBe(shared);
    expect(fs.existsSync(path.join(bad, 'package-lock.json'))).toBe(false);
    expect(fs.existsSync(path.join(bad, '.total-recall-update.lock'))).toBe(false);
  });

  it('does not call an unchanged installed version successful merely because npm exited zero', async () => {
    const root = manifest(path.join(tmp, 'app'), { dependencies: { '@gregiteen/ssss-cli': '0.10.1' } });
    installed(root, '@gregiteen/ssss-cli', '0.10.1');
    const result = await run([root], execWithInstall(), { dryRun: false });
    expect(result.failed).toBe(1); expect(result.updated).toBe(0);
    expect(result.results[0].error).toMatch(/verification failed/);
  });

  it('installs a pnpm workspace once for nested consumers', async () => {
    const root = manifest(path.join(tmp, 'workspace'), { packageManager: 'pnpm@10.0.0', workspaces: ['apps/*'] });
    const a = manifest(path.join(root, 'apps/a'), { dependencies: { '@ssss/cli': '0.10.1' } });
    const b = manifest(path.join(root, 'apps/b'), { dependencies: { '@gregiteen/ssss-cli': '0.10.1' } });
    const exec = execWithInstall((cmd, args, { cwd }) => {
      expect(cmd).toBe('pnpm'); expect(cwd).toBe(root);
      installed(root, '@ssss/cli', '0.11.0'); installed(root, '@gregiteen/ssss-cli', '0.11.0'); return { status: 0 };
    });
    expect(brainInstallOwner(a)).toEqual({ owner: root, manager: 'pnpm' });
    expect((await run([root], exec, { dryRun: false })).updated).toBe(2);
    expect(exec.mock.calls.filter(([, args]) => args[0] === 'install')).toHaveLength(1);
    expect(fs.existsSync(path.join(b, '.total-recall-update.lock'))).toBe(false);
  });

  it('refuses preview downgrades and respects another updater lock', async () => {
    const root = manifest(path.join(tmp, 'app'), { dependencies: { 'total-recall-brain': '3.40.0' } });
    installed(root, 'total-recall-brain', '3.40.0');
    const exec = execWithInstall();
    expect((await run([root], exec, { dryRun: false })).failed).toBe(1);
    installed(root, 'total-recall-brain', '3.35.0');
    fs.writeFileSync(brainUpdateLockPath(root), 'another owner');
    expect((await run([root], exec, { dryRun: false })).failed).toBe(1);
    expect(fs.readFileSync(brainUpdateLockPath(root), 'utf8')).toBe('another owner');
    fs.unlinkSync(brainUpdateLockPath(root));
    expect(exec.mock.calls.every(([, args]) => args[0] === 'view')).toBe(true);
  });

  it('rejects invalid manifests, unsupported managers and unavailable release metadata', async () => {
    const root = manifest(path.join(tmp, 'app'), { packageManager: 'yarn@4.0.0', dependencies: { 'total-recall-brain': '*' } });
    expect((await run([root], execWithInstall())).failed).toBe(1);
    fs.writeFileSync(path.join(root, 'package.json'), '{bad');
    expect((await run([root], execWithInstall())).failed).toBe(1);
    const failed = await run([], () => ({ status: 1 }));
    expect(failed.reason).toMatch(/npm-view-failed/); expect(failed.failed).toBe(1);
  });

  it('exposes explicit all-brains, apply and machine-readable CLI flags', () => {
    expect(parseArgs(['--all-brains', '--apply', '--json', '--repo', tmp])).toMatchObject({ allBrains: true, apply: true, json: true, repos: [tmp] });
  });

  it('reports missing and malformed roots while still planning valid brains', async () => {
    const bad = manifest(path.join(tmp, 'bad'), {});
    fs.writeFileSync(path.join(bad, 'package.json'), '{');
    const good = manifest(path.join(tmp, 'good'), { dependencies: { 'total-recall-brain': '3.35.0' } });
    const result = await run([bad, good, path.join(tmp, 'missing')], execWithInstall());
    expect(result.failed).toBe(2);
    expect(result.would_update).toBe(1);
    expect(result.results.find(row => row.root === good).status).toBe('would_update');
  });
});
