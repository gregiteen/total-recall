import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
vi.mock('./plugin-loader.mjs', async importOriginal => ({ ...await importOriginal(), discoverPlugins: () => [] }));
vi.mock('./logger.mjs', () => ({ logger: { info() {}, warn() {}, debug() {} } }));
vi.mock('./config.mjs', () => ({ brainDir: '/tmp/brain-update-test', ROOT: '/tmp/brain-update-test' }));
vi.mock('./autopull-install.mjs', () => ({ installAutoPull: vi.fn() }));
import { updateAllBrains, brainInstallOwner, brainUpdateLockPath, acquireBrainUpdateLock, discoverBrainConsumers } from './brain-updates.mjs';
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

  it('excludes managed scaffold assets without hiding real nested consumers', () => {
    const root = manifest(path.join(tmp, 'app'), {});
    const dependency = { dependencies: { '@gregiteen/ssss-cli': '0.11.0' } };
    const managed = manifest(path.join(root, '.agent/skills/total-recall/scaffolds/ssss'), dependency);
    const nested = manifest(path.join(root, 'scaffolds/real-app'), dependency);
    expect(discoverBrainConsumers([root, managed]).map(({ root }) => root)).toEqual([nested]);
  });

  it('fails a registered brain with missing auth even when packages need no update', async () => {
    const root = manifest(path.join(tmp, 'missing-auth'), {});
    fs.mkdirSync(path.join(root, '.agent/skills/total-recall'), { recursive: true });
    const result = await run([root], execWithInstall());
    expect(result.failed).toBe(1);
    expect(result.results[0].error).toMatch(/auth plugin/);
  });

  it('pins aliases in their original section and verifies the actual install', async () => {
    const root = manifest(path.join(tmp, 'app'), { devDependencies: { '@ssss/cli': '^0.10.1' } });
    installed(root, '@ssss/cli', '0.10.1');
    const exec = execWithInstall(() => { installed(root, '@ssss/cli', '0.11.0'); return { status: 0 }; });
    const result = await run([root], exec, { dryRun: false });
    expect(result.updated).toBe(1);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json')))).toEqual({ devDependencies: { '@ssss/cli': 'npm:@gregiteen/ssss-cli@0.11.0' } });
    expect(result.results[0].packages[0].installed).toBe('0.11.0');
  });

  describe('dev dependencies under automatic maintenance', () => {
    const installArgs = (exec) => exec.mock.calls.filter(([, args]) => args[0] === 'install');

    it('never lets NODE_ENV=production strip a full consumer', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('npm_config_omit', 'dev');
      try {
        const root = manifest(path.join(tmp, 'app'), { devDependencies: { 'total-recall-brain': '3.39.0' } });
        installed(root, 'total-recall-brain', '3.39.0');
        const exec = execWithInstall(() => { installed(root, 'total-recall-brain', '3.39.1'); return { status: 0 }; });
        const result = await run([root], exec, { dryRun: false });
        expect(result.updated).toBe(1);
        const [[, args, options]] = installArgs(exec);
        expect(args).not.toContain('--omit=dev');
        expect(args).not.toContain('--package-lock-only');
        expect(options.env.NODE_ENV).toBeUndefined();
        expect(options.env.npm_config_omit).toBeUndefined();
        expect(options.env.PATH).toBe(process.env.PATH);
      } finally { vi.unstubAllEnvs(); }
    });

    it('keeps an absent dev dependency absent, and its pin current', async () => {
      const root = manifest(path.join(tmp, 'app'), { devDependencies: { 'total-recall-brain': '3.39.0' } });
      const exec = execWithInstall();
      const result = await run([root], exec, { dryRun: false });
      expect(result.failed).toBe(0);
      expect(result.updated).toBe(1);
      const [[, args]] = installArgs(exec);
      expect(args).toContain('--package-lock-only');
      expect(fs.existsSync(path.join(root, 'node_modules'))).toBe(false);
      expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).devDependencies['total-recall-brain']).toBe('3.39.1');
    });

    it('leaves an absent dev dependency alone once its pin is current', async () => {
      const root = manifest(path.join(tmp, 'app'), { devDependencies: { 'total-recall-brain': '3.39.1' } });
      const exec = execWithInstall();
      const result = await run([root], exec, { dryRun: false });
      expect(result.failed).toBe(0);
      expect(result.results.find(r => r.root === root).status).toBe('up_to_date');
      expect(installArgs(exec)).toEqual([]);
    });

    it('still installs an absent runtime dependency, and fails when it does not arrive', async () => {
      const root = manifest(path.join(tmp, 'app'), { dependencies: { 'total-recall-brain': '3.39.1' } });
      const exec = execWithInstall();
      const result = await run([root], exec, { dryRun: false });
      const [[, args]] = installArgs(exec);
      expect(args).not.toContain('--package-lock-only');
      expect(result.failed).toBe(1);
    });
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
    expect((await run([root], exec, { dryRun: false, lockWaitMs: 0 })).failed).toBe(1);
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

  it('descends into .agent so plugin installs are updated too', async () => {
    // A plugin that runs `npm install` keeps its own node_modules under
    // <repo>/.agent/skills/total-recall/plugins/<id>. Skipping every dot
    // directory left those copies stranded on an old release: a full
    // propagation reported success while three plugin installs stayed behind.
    const pluginRoot = path.join(tmp, 'repo', '.agent', 'skills', 'total-recall', 'plugins', 'mesh');
    manifest(pluginRoot, { name: 'tr-plugin-mesh', dependencies: { 'total-recall-brain': '3.32.0' } });
    installed(pluginRoot, 'total-recall-brain', '3.32.0');
    const result = await run([path.join(tmp, 'repo')], execWithInstall());
    const row = result.results.find(r => r.root === pluginRoot);
    expect(row, 'plugin install under .agent was not discovered').toBeTruthy();
    expect(row.status).toBe('would_update');
  });

  it('ignores devDependencies of a plugin copied into a shared plugin folder', async () => {
    // Shared installs omit dev dependencies on purpose, so a devDependency there
    // can never be "installed" and must not count as a failing consumer.
    const pluginRoot = path.join(tmp, 'repo3', '.agent', 'skills', 'total-recall', 'plugins', 'marketing');
    manifest(pluginRoot, { name: 'tr-plugin-marketing', devDependencies: { 'total-recall-brain': '3.39.1' } });
    fs.writeFileSync(path.join(pluginRoot, 'plugin.json'), JSON.stringify({ id: 'marketing' }));
    const source = manifest(path.join(tmp, 'repo3', 'tr-plugin-marketing'), { name: 'tr-plugin-marketing', devDependencies: { 'total-recall-brain': '3.39.1' } });
    fs.writeFileSync(path.join(source, 'plugin.json'), JSON.stringify({ id: 'marketing' }));
    const result = await run([path.join(tmp, 'repo3')], execWithInstall());
    expect(result.results.find(r => r.root === pluginRoot)).toBeFalsy();
    // The plugin's own checkout still maintains its dev toolchain.
    expect(result.results.find(r => r.root === source)).toBeTruthy();
  });

  describe('plugin checkouts linked into a brain but not registered as projects', () => {
    const linked = dir => ({ id: path.basename(dir), linked: true, valid: true, scope: 'global', dir });
    function checkout(name, pkg) {
      const root = manifest(path.join(tmp, 'plugins', name), { name, ...pkg });
      fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}');
      return root;
    }
    const tracked = root => ['package.json', 'package-lock.json'].map(name => fs.readFileSync(path.join(root, name), 'utf8'));
    const installs = exec => exec.mock.calls.filter(([, args]) => args[0] !== 'view');

    it('never installs a brain copy for a dev dependency, and reports the shared install', async () => {
      const root = checkout('tr-plugin-maps', { devDependencies: { 'total-recall-brain': '3.1.0' } });
      const before = tracked(root);
      const exec = execWithInstall();
      const result = await run([], exec, { dryRun: false, plugins: [linked(root)] });
      expect(installs(exec)).toEqual([]);
      expect(tracked(root)).toEqual(before);
      expect(fs.existsSync(path.join(root, 'node_modules'))).toBe(false);
      const row = result.results.find(r => r.root === root);
      expect(row.status).toBe('shared_install');
      expect(row.packages[0]).toMatchObject({ key: 'total-recall-brain', declared: '3.1.0', latest: '3.39.1' });
      expect(result.shared_install).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('updates a runtime dependency without dev dependencies or writing tracked files', async () => {
      const root = checkout('tr-plugin-text', { dependencies: { '@gregiteen/ssss-cli': '0.10.0' }, devDependencies: { 'total-recall-brain': '3.1.0' } });
      installed(root, '@gregiteen/ssss-cli', '0.10.0');
      const before = tracked(root);
      const exec = execWithInstall((cmd, args, options) => { installed(options.cwd, '@gregiteen/ssss-cli', '0.11.0'); return { status: 0 }; });
      const result = await run([], exec, { dryRun: false, plugins: [linked(root)] });
      const [[manager, args, options]] = installs(exec);
      expect(manager).toBe('npm');
      expect(options.cwd).toBe(root);
      expect(args).toEqual(expect.arrayContaining(['--omit=dev', '--no-save', '@gregiteen/ssss-cli@0.11.0']));
      expect(args.join(' ')).not.toContain('total-recall-brain');
      expect(tracked(root)).toEqual(before);
      const row = result.results.find(r => r.root === root);
      expect(row.status).toBe('updated');
      expect(row.packages.map(p => p.package)).toEqual(['@gregiteen/ssss-cli']);
    });

    it('fails when the installed runtime dependency does not match the release', async () => {
      const root = checkout('tr-plugin-text', { dependencies: { '@gregiteen/ssss-cli': '0.10.0' } });
      installed(root, '@gregiteen/ssss-cli', '0.10.0');
      const result = await run([], execWithInstall(), { dryRun: false, plugins: [linked(root)] });
      expect(result.results.find(r => r.root === root).status).toBe('failed');
      expect(result.failed).toBe(1);
    });

    it('leaves a current runtime dependency alone even when its pin is older', async () => {
      const root = checkout('tr-plugin-text', { dependencies: { '@gregiteen/ssss-cli': '0.10.0' } });
      installed(root, '@gregiteen/ssss-cli', '0.11.0');
      const exec = execWithInstall();
      const result = await run([], exec, { dryRun: false, plugins: [linked(root)] });
      expect(installs(exec)).toEqual([]);
      expect(result.results.find(r => r.root === root).status).toBe('up_to_date');
    });

    it('keeps the dev toolchain of a linked checkout that is registered as a project', async () => {
      const root = checkout('tr-plugin-maps', { devDependencies: { 'total-recall-brain': '3.1.0' } });
      const exec = execWithInstall((cmd, args, options) => { installed(options.cwd, 'total-recall-brain', '3.39.1'); return { status: 0 }; });
      const result = await run([root], exec, { dryRun: false, plugins: [linked(root)] });
      expect(installs(exec)[0][1]).not.toContain('--omit=dev');
      expect(JSON.parse(tracked(root)[0]).devDependencies['total-recall-brain']).toBe('3.39.1');
      expect(result.results.find(r => r.root === root).status).toBe('updated');
    });
  });

  it('never updates archived plugin copies under memory-derived', async () => {
    const archive = manifest(path.join(tmp, 'brain', 'memory-derived', 'plugin-replacements', 'auth-1'), { name: 'tr-plugin-auth', devDependencies: { 'total-recall-brain': '3.1.0' } });
    fs.writeFileSync(path.join(archive, 'plugin.json'), JSON.stringify({ id: 'auth' }));
    const result = await run([path.join(tmp, 'brain')], execWithInstall());
    expect(result.results.find(r => r.root === archive)).toBeFalsy();
  });

  it('still skips other dot directories such as .git', async () => {
    // Only .agent is exempt; walking every dot directory would descend into
    // .git and cost far more than it finds.
    const gitDir = path.join(tmp, 'repo2', '.git', 'hooks');
    manifest(gitDir, { name: 'git-hooks', dependencies: { 'total-recall-brain': '3.39.1' } });
    installed(gitDir, 'total-recall-brain', '3.39.1');
    const result = await run([path.join(tmp, 'repo2')], execWithInstall());
    expect(result.results.find(r => r.root === gitDir)).toBeFalsy();
  });
});

describe('acquireBrainUpdateLock', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-update-lock-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('reclaims a lock whose process is gone', () => {
    const lock = path.join(dir, 'a.lock');
    fs.writeFileSync(lock, '999999');
    const fd = acquireBrainUpdateLock(lock, { isAlive: () => false, sleep: () => {} });
    fs.closeSync(fd);
    expect(fs.readFileSync(lock, 'utf8')).toBe(String(process.pid));
  });

  it('waits for a live holder and takes the lock once it is released', () => {
    const lock = path.join(dir, 'b.lock');
    fs.writeFileSync(lock, '4242');
    let waits = 0;
    const fd = acquireBrainUpdateLock(lock, { isAlive: () => true, sleep: () => { if (++waits === 3) fs.unlinkSync(lock); } });
    fs.closeSync(fd);
    expect(waits).toBe(3);
    expect(fs.readFileSync(lock, 'utf8')).toBe(String(process.pid));
  });

  it('gives up with the holder named once the wait runs out', () => {
    const lock = path.join(dir, 'c.lock');
    fs.writeFileSync(lock, '4242');
    expect(() => acquireBrainUpdateLock(lock, { waitMs: 0, isAlive: () => true, sleep: () => {} })).toThrow(/pid 4242/);
  });

  it('treats a fresh empty lock as being taken, not abandoned', () => {
    const lock = path.join(dir, 'd.lock');
    fs.writeFileSync(lock, '');
    expect(() => acquireBrainUpdateLock(lock, { waitMs: 0, sleep: () => {} })).toThrow(/still holds/);
    const old = new Date(Date.now() - 60000); fs.utimesSync(lock, old, old);
    fs.closeSync(acquireBrainUpdateLock(lock, { waitMs: 0, sleep: () => {} }));
  });
});
