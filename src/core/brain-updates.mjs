/** Uniform package maintenance for registered brains; never touches vault data. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { listUpdateRoots, resolveRegistryFiles, readRegistryEntries, rootsFromEnv } from './package-auto-update.mjs';
import { discoverPlugins } from './plugin-loader.mjs';
import { comparePackageVersions } from './package-version.mjs';
import { inspectRequiredPlugins } from './required-plugins.mjs';
import { ensureRequiredPlugins } from './required-plugins.mjs';
import YAML from 'yaml';

export const BRAIN_PACKAGES = ['total-recall-brain', '@gregiteen/ssss-cli'];
const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const ignored = new Set(['node_modules', 'vendor', 'dist', 'build', 'coverage', 'venv',
  'test', 'tests', '__tests__', 'fixtures', 'tmp', 'scratch', 'scaffold']);
const canonical = key => key === '@ssss/cli' ? '@gregiteen/ssss-cli' : key;
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const isLink = file => { try { return fs.lstatSync(file).isSymbolicLink(); } catch { return false; } };
export const brainUpdateLockPath = owner => path.join(os.tmpdir(),
  `total-recall-update-${createHash('sha256').update(owner).digest('hex')}.lock`);

const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };

/**
 * Take a per-owner update lock. The daemon's hourly `update --automatic` and a
 * manual `update --all-brains` take the same locks, and a plain exclusive create
 * failed the manual run outright with EEXIST. A lock whose process is gone is
 * reclaimed; a live holder is waited for, up to `waitMs`.
 */
export function acquireBrainUpdateLock(lock, { waitMs = 600000, pollMs = 1000, isAlive = alive, sleep = pause } = {}) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      const fd = fs.openSync(lock, 'wx', 0o600);
      fs.writeFileSync(fd, String(process.pid));
      return fd;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    let holder, age;
    try {
      holder = Number.parseInt(fs.readFileSync(lock, 'utf8').trim(), 10);
      age = Date.now() - fs.statSync(lock).mtimeMs;
    } catch (error) {
      if (error.code === 'ENOENT') continue; // released between the create and the read
      throw error;
    }
    // A creator writes its pid right after the exclusive create; an empty lock
    // younger than a few seconds is still being taken, not abandoned. Content
    // that is not a pid names an unknown owner and is respected.
    const content = holder ? 'pid' : fs.statSync(lock).size ? 'unknown' : 'empty';
    const stale = content === 'pid' ? !isAlive(holder) : content === 'empty' && age > 5000;
    if (stale) {
      try { fs.unlinkSync(lock); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      continue;
    }
    if (Date.now() >= deadline) throw new Error(`Another update (${holder ? `pid ${holder}` : 'unknown owner'}) still holds ${lock}`);
    sleep(pollMs);
  }
}

export function installedBrainPackage(root, key) {
  try {
    const paths = createRequire(path.join(root, 'package.json')).resolve.paths(key) || [];
    const file = paths.map(dir => path.join(dir, key, 'package.json')).find(file => fs.existsSync(file));
    if (!file) return { version: null, file: null };
    return { version: read(file).version, file: fs.realpathSync(file) };
  } catch { return { version: null, file: null }; }
}

/** Never traverse dependency trees, brain state or directory links. */
export function discoverBrainConsumers(roots, { onError } = {}) {
  const seen = new Set();
  const consumers = [];
  function walk(dir) {
    const real = fs.realpathSync(dir);
    if (seen.has(real)) return;
    seen.add(real);
    const file = path.join(real, 'package.json');
    if (fs.existsSync(file)) {
      let pkg;
      try { pkg = read(file); }
      catch (error) { if (onError) { onError(real, error); return; } throw error; }
      const deps = sections.flatMap(section => Object.entries(pkg[section] || {})
        .filter(([key]) => BRAIN_PACKAGES.includes(canonical(key)) && canonical(key) !== pkg.name)
        .map(([key, declared]) => ({ section, key, package: canonical(key), declared,
          ...installedBrainPackage(real, key) })));
      if (deps.length) consumers.push({ root: real, file, pkg, deps });
    }
    for (const entry of fs.readdirSync(real, { withFileTypes: true })) {
      if (!entry.isDirectory() || ignored.has(entry.name)) continue;
      // Dot-directories are skipped to avoid descending into .git and similar,
      // but .agent holds the brain and its plugin installs. A plugin that runs
      // `npm install` keeps its own node_modules there, and skipping the whole
      // dot tree left those copies stranded on an old version.
      if (entry.name.startsWith('.') && entry.name !== '.agent') continue;
      walk(path.join(real, entry.name));
    }
  }
  for (const root of roots) walk(root);
  return consumers;
}

/** Resolve a workspace's owning package manager, including nested consumers. */
export function brainInstallOwner(root) {
  let owner = root;
  for (let dir = root; ; dir = path.dirname(dir)) {
    const file = path.join(dir, 'package.json');
    if (fs.existsSync(file)) {
      const pkg = read(file);
      let patterns=Array.isArray(pkg.workspaces)?pkg.workspaces:pkg.workspaces?.packages || [];
      const pnpm=path.join(dir,'pnpm-workspace.yaml');
      if(fs.existsSync(pnpm))patterns=[...patterns,...(YAML.parse(fs.readFileSync(pnpm,'utf8'))?.packages || [])];
      const relative=path.relative(dir,root).split(path.sep).join('/');
      const belongs=patterns.some(pattern=>typeof pattern==='string' && !pattern.startsWith('!') && new RegExp('^'+pattern.split('/').map(part=>part==='**'?'.*':part.split('*').map(chunk=>chunk.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^/]*')).join('/')+'$').test(relative));
      if (dir === root || belongs) owner = dir;
    }
    if (dir === path.dirname(dir)) break;
  }
  const pkg = read(path.join(owner, 'package.json'));
  const manager = pkg.packageManager?.split('@')[0]
    || (fs.existsSync(path.join(owner, 'pnpm-lock.yaml')) ? 'pnpm'
      : fs.existsSync(path.join(owner, 'yarn.lock')) ? 'yarn' : 'npm');
  if (!['npm', 'pnpm'].includes(manager)) throw new Error(`Unsupported package manager: ${manager} (${owner})`);
  return { owner, manager };
}

function targetSpec(key, version) {
  return key === '@ssss/cli' ? `npm:@gregiteen/ssss-cli@${version}` : version;
}

/** Dry by default. Resolve releases once; install independently; verify actual resolution. */
export async function updateAllBrains(opts = {}) {
  const dryRun = opts.dryRun !== false;
  const exec = opts.exec || spawnSync;
  const roots = listUpdateRoots(opts).map(row => row.root);
  const errors = [];
  const brains = roots.map(root => ({ root, brain: path.join(root, '.agent', 'skills', 'total-recall') }))
    .filter(({ brain }) => fs.existsSync(brain));
  if (opts.brainDir) {
    brains.push({ root: opts.brainDir, brain: opts.brainDir });
    roots.push(opts.brainDir);
  }
  for (const { root, brain } of brains) {
    if (!dryRun && opts.ensureDefaults === true) {
      try { ensureRequiredPlugins(brain); }
      catch(error){errors.push({root,status:'failed',error:error.message});continue;}
    }
    const required = inspectRequiredPlugins(brain);
    if (required.status !== 'ready') errors.push({ root, status: 'failed', error: required.errors.join('; ') });
  }
  const requested = [...(opts.roots || []), ...rootsFromEnv(),
    ...resolveRegistryFiles(opts).flatMap(file => readRegistryEntries(file).map(row => row.path)).filter(Boolean)];
  for (const root of new Set(requested.map(root => path.resolve(root)))) {
    if (!fs.existsSync(root)) errors.push({ root, status: 'failed', error: 'Registered/requested root is missing' });
  }
  // Installed plugins can be owned by repositories outside the brain registry.
  const plugins = opts.plugins || roots.flatMap(root => discoverPlugins(root));
  for (const plugin of plugins) {
    // Linked plugin owners are independent repositories. Vendored plugin copies
    // use their host brain's installation, rather than installing dev tools inside it.
    if (plugin.linked && plugin.valid !== false && !plugin.broken && plugin.scope !== 'scaffold' && plugin.dir && fs.existsSync(plugin.dir)) roots.push(fs.realpathSync(plugin.dir));
  }
  const versions = {};
  for (const name of BRAIN_PACKAGES) {
    const result = exec('npm', ['view', name, 'version'], { encoding: 'utf8', timeout: 15000 });
    const value = result.stdout?.trim();
    if (result.status !== 0 || comparePackageVersions(value, value) !== 0) {
      return { failed: 1, skipped: true, reason: `npm-view-failed:${name}`, results: [] };
    }
    versions[name] = value;
  }
  let consumers;
  try { consumers = discoverBrainConsumers(roots, { onError: (root, error) => errors.push({ root, status: 'failed', error: error.message }) }); }
  catch (error) { return { failed: 1, skipped: true, reason: error.message, results: [] }; }
  const groups = new Map();
  const results = [...errors];
  for (const consumer of consumers) {
    let owner;
    try { owner = brainInstallOwner(consumer.root); }
    catch (error) { results.push({ root: consumer.root, status: 'failed', error: error.message }); continue; }
    const row = { root: consumer.root, owner: owner.owner, manager: owner.manager,
      packages: consumer.deps.map(dep => ({ key: dep.key, package: dep.package, declared: dep.declared,
        installed: dep.version, latest: versions[dep.package] })), status: 'up_to_date' };
    results.push(row);
    // Keep previews/local future versions, but mark them explicitly as nonuniform.
    if (consumer.deps.some(dep => comparePackageVersions(dep.version, versions[dep.package]) === 1)) {
      row.status = 'failed'; row.error = 'Newer local/preview package; refusing an implicit downgrade'; continue;
    }
    const shared = isLink(path.join(owner.owner, 'node_modules')) || isLink(path.join(consumer.root, 'node_modules'));
    const needsChange = shared || consumer.deps.some(dep => dep.version !== versions[dep.package]
      || dep.declared !== targetSpec(dep.key, versions[dep.package])
      || !dep.file?.startsWith(path.join(owner.owner, 'node_modules') + path.sep));
    if (!needsChange) continue;
    row.status = dryRun ? 'would_update' : 'pending';
    if (!groups.has(owner.owner)) groups.set(owner.owner, { ...owner, consumers: [] });
    groups.get(owner.owner).consumers.push({ consumer, row });
  }
  if (!dryRun) for (const group of groups.values()) {
    const saved = new Map();
    const links = [];
    const lock = brainUpdateLockPath(group.owner);
    let lockFd;
    const needsInstall = group.consumers.some(({ consumer }) =>
      isLink(path.join(consumer.root, 'node_modules')) || consumer.deps.some(dep =>
        dep.version !== versions[dep.package] || !dep.file?.startsWith(path.join(group.owner, 'node_modules') + path.sep)));
    try {
      lockFd = acquireBrainUpdateLock(lock, opts.lockWaitMs === undefined ? {} : { waitMs: opts.lockWaitMs });
      for (const name of ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml']) {
        const file = path.join(group.owner, name);
        saved.set(file, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
      }
      for (const { consumer } of group.consumers) {
        const text = fs.readFileSync(consumer.file, 'utf8');
        saved.set(consumer.file, text);
        const pkg = read(consumer.file);
        for (const dep of consumer.deps) pkg[dep.section][dep.key] = targetSpec(dep.key, versions[dep.package]);
        const indent = /\n([ \t]+)"/.exec(text)?.[1] || 2;
        fs.writeFileSync(consumer.file, JSON.stringify(pkg, null, indent) + '\n');
      }
      for (const root of new Set([group.owner, ...group.consumers.map(({ consumer }) => consumer.root)])) {
        const dir = path.join(root, 'node_modules');
        if (isLink(dir)) {
          const target = fs.readlinkSync(dir);
          fs.unlinkSync(dir); // Remove only the link, never the shared target.
          links.push({ dir, target });
        }
      }
      const args = group.manager === 'pnpm'
        ? ['install', '--no-frozen-lockfile'] : ['install', '--no-audit', '--no-fund'];
      if (!needsInstall) args.push(group.manager === 'pnpm' ? '--lockfile-only' : '--package-lock-only');
      const install = exec(group.manager, args, { cwd: group.owner, encoding: 'utf8',
        timeout: 600000, maxBuffer: 8 * 1024 * 1024 });
      if (install.status !== 0) throw new Error(install.error?.message || install.stderr?.trim().slice(-1500) || `Install exited ${install.status}`);
      for (const { consumer, row } of group.consumers) {
        row.packages = row.packages.map(dep => ({ ...dep, installed: installedBrainPackage(consumer.root, dep.key).version }));
        // A consumer may legitimately resolve the package from its own node_modules — nested plugin
        // directories do exactly that. Requiring the owner's hoisted copy reported a correct install
        // as a failure and rolled the whole batch back, which is why 30 consumers never updated.
        const allowedRoots = [
          path.join(group.owner, 'node_modules') + path.sep,
          path.join(consumer.root, 'node_modules') + path.sep,
        ];
        const placed = (file) => Boolean(file) && allowedRoots.some((root) => file.startsWith(root));
        const bad = consumer.deps.find(dep => {
          const actual = installedBrainPackage(consumer.root, dep.key);
          return actual.version !== versions[dep.package] || !placed(actual.file);
        });
        // A link is only a fault when it escapes every legitimate root; a self-contained one is fine.
        const linkPath = path.join(consumer.root, 'node_modules');
        const linked = isLink(linkPath) && !placed(path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath)));
        if (bad || linked) throw new Error(`Installed release verification failed: ${consumer.root}${bad ? ` (${bad.key})` : ' (shared link)'}`);
        row.status = 'updated';
      }
    } catch (error) {
      for (const [file, text] of saved) {
        if (text === null) fs.rmSync(file, { force: true });
        else fs.writeFileSync(file, text);
      }
      for (const { dir, target } of links) {
        if (fs.existsSync(dir) || isLink(dir)) fs.rmSync(dir, { recursive: true, force: true });
        fs.symlinkSync(target, dir, 'dir');
      }
      for (const { consumer, row } of group.consumers) {
        row.status = 'failed'; row.error = error.message;
        row.packages = row.packages.map(dep => ({ ...dep, installed: installedBrainPackage(consumer.root, dep.key).version }));
      }
    } finally {
      if (lockFd !== undefined) { fs.closeSync(lockFd); fs.unlinkSync(lock); }
    }
  }
  return { dryRun, versions, root_count: new Set(roots).size, consumer_count: consumers.length,
    updated: results.filter(row => row.status === 'updated').length,
    would_update: results.filter(row => row.status === 'would_update').length,
    failed: results.filter(row => row.status === 'failed').length, results };
}
