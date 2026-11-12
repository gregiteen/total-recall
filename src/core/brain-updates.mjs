/** Uniform package maintenance for registered brains; never touches vault data. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { listUpdateRoots, resolveRegistryFiles, readRegistryEntries, rootsFromEnv } from './package-auto-update.mjs';
import { discoverPlugins, PACKAGE_ROOT } from './plugin-loader.mjs';
import { comparePackageVersions } from './package-version.mjs';
import { inspectRequiredPlugins } from './required-plugins.mjs';
import { ensureRequiredPlugins } from './required-plugins.mjs';
import YAML from 'yaml';

export const BRAIN_PACKAGES = ['total-recall-brain', '@gregiteen/ssss-cli'];
const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
// memory-derived holds archived plugin copies (plugin-replacements); updating one
// reinstalled its whole dev tree into an archive nothing ever runs.
const ignored = new Set(['node_modules', 'vendor', 'dist', 'build', 'coverage', 'venv',
  'test', 'tests', '__tests__', 'fixtures', 'tmp', 'scratch', 'scaffold', 'memory-derived']);
const canonical = key => key === '@ssss/cli' ? '@gregiteen/ssss-cli' : key;
// Plugins also force the engine alias through `overrides`. Those pins move with the dependency,
// or a consumer ends up asking for two versions of the same package.
const overrideKeys = pkg => Object.entries(pkg.overrides || {})
  .filter(([key, spec]) => typeof spec === 'string' && BRAIN_PACKAGES.includes(canonical(key)) && canonical(key) !== pkg.name)
  .map(([key]) => key);
const overridesLag = (pkg, versions) => overrideKeys(pkg)
  .some(key => versions[canonical(key)] && pkg.overrides[key] !== targetSpec(key, versions[canonical(key)]));
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

/**
 * Never traverse dependency trees, managed scaffolds, archives or directory links.
 *
 * `installedPlugins` lists real paths of plugin checkouts that are only installed on
 * this machine, not developed here. An installed plugin runs under the shared Total
 * Recall install and is set up without dev dependencies, so only its runtime
 * dependencies make it a consumer (`runtimeOnly`).
 */
export function discoverBrainConsumers(roots, { onError, installedPlugins = new Set() } = {}) {
  const seen = new Set();
  const consumers = [];
  function walk(dir, inherited = false) {
    const real = fs.realpathSync(dir);
    if (seen.has(real)) return;
    seen.add(real);
    const segments = real.split(path.sep);
    if (segments.some((segment, index) => segment === 'scaffolds'
      && segments[index - 1] === 'total-recall' && segments[index - 2] === 'skills')) return;
    const file = path.join(real, 'package.json');
    let runtimeOnly = inherited || installedPlugins.has(real);
    if (fs.existsSync(file)) {
      let pkg;
      try { pkg = read(file); }
      catch (error) { if (onError) { onError(real, error); return; } throw error; }
      // A plugin copied into a shared plugin folder is installed without its dev
      // dependencies, on purpose: full dev trees there filled a disk. Counting its
      // devDependencies made every such plugin a permanently failing consumer, and
      // "fixing" it would mean installing exactly what must never be installed.
      runtimeOnly ||= fs.existsSync(path.join(real, 'plugin.json'))
        && real.split(path.sep).join('/').includes('/skills/total-recall/plugins/');
      const deps = sections.filter(section => !(runtimeOnly && section === 'devDependencies'))
        .flatMap(section => Object.entries(pkg[section] || {})
        .filter(([key]) => BRAIN_PACKAGES.includes(canonical(key)) && canonical(key) !== pkg.name)
        .map(([key, declared]) => ({ section, key, package: canonical(key), declared,
          ...installedBrainPackage(real, key) })));
      // A source checkout of a brain package is not a consumer: its pins move only
      // with its own releases (updateSourceBrainPackage). Rewriting them left the
      // cloud server's checkout dirty, and the release runner refuses a dirty one.
      const brainSource = BRAIN_PACKAGES.includes(pkg.name);
      if (deps.length && !brainSource) consumers.push({ root: real, file, pkg, deps, runtimeOnly });
    }
    for (const entry of fs.readdirSync(real, { withFileTypes: true })) {
      if (!entry.isDirectory() || ignored.has(entry.name)) continue;
      // Dot-directories are skipped to avoid descending into .git and similar,
      // but .agent holds the brain and its plugin installs. A plugin that runs
      // `npm install` keeps its own node_modules there, and skipping the whole
      // dot tree left those copies stranded on an old version.
      if (entry.name.startsWith('.') && entry.name !== '.agent') continue;
      walk(path.join(real, entry.name), runtimeOnly);
    }
  }
  for (const root of roots) walk(root);
  return consumers;
}

/**
 * Installed plugins can be owned by repositories outside the brain registry. A linked
 * owner that is registered as a project is developed here and is a full consumer. Any
 * other is only installed here: see `installedPlugins` in discoverBrainConsumers.
 */
export function linkedPluginOwners(roots, opts = {}) {
  const plugins = opts.plugins || roots.flatMap(root => discoverPlugins(root));
  return plugins
    .filter(plugin => plugin.linked && plugin.valid !== false && !plugin.broken && plugin.scope !== 'scaffold' && plugin.dir && fs.existsSync(plugin.dir))
    .map(plugin => fs.realpathSync(plugin.dir));
}

/** The version of a brain package that this running CLI, and so its plugins, resolves. */
function sharedBrainPackage(name) {
  try {
    const pkg = read(path.join(PACKAGE_ROOT, 'package.json'));
    return pkg.name === name ? pkg.version : installedBrainPackage(PACKAGE_ROOT, name).version;
  } catch { return null; }
}

/** An installed plugin whose brain packages are all dev tools: nothing to install, one line to report. */
function sharedInstallRow(root, versions) {
  let pkg;
  try { pkg = read(path.join(root, 'package.json')); } catch { return null; }
  const packages = Object.entries(pkg.devDependencies || {})
    .filter(([key]) => BRAIN_PACKAGES.includes(canonical(key)) && canonical(key) !== pkg.name)
    .map(([key, declared]) => ({ key, package: canonical(key), declared,
      installed: sharedBrainPackage(canonical(key)), latest: versions[canonical(key)] }));
  return packages.length ? { root, owner: root, status: 'shared_install', packages } : null;
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

/**
 * Automatic maintenance keeps each checkout's tree as found. A dependency with no installed
 * copy, in a checkout (and owner) with no node_modules at all, gets its pin updated and nothing
 * more: the tree was reclaimed for disk space or never installed, and restoring it is the
 * owner's call. A dev dependency absent from a shared install is the same case. Without this,
 * every hourly run reinstalled full trees into idle checkouts (~10 GB on 2026-11-07, again on
 * 2026-11-09 until the disk filled). `installMissing: true` (CLI --install-missing) opts in.
 */
const absentDevDep = (dep) => dep.section === 'devDependencies' && !dep.file;
const noInstallTree = (...roots) => roots.every(root => !fs.existsSync(path.join(root, 'node_modules')));
const keepAsFound = (dep, installMissing, ...roots) =>
  !installMissing && !dep.file && (absentDevDep(dep) || noInstallTree(...roots));

/**
 * The daemon runs with NODE_ENV=production, and under that npm and pnpm remove dev dependencies
 * from whatever they install in. An install that wants a runtime tree says so with a flag.
 */
export function installEnv(env = process.env) {
  const { NODE_ENV, npm_config_omit, NPM_CONFIG_OMIT, npm_config_production, NPM_CONFIG_PRODUCTION, ...kept } = env;
  return kept;
}

export async function updateAllBrains(opts = {}) {
  const dryRun = opts.dryRun !== false;
  const installMissing = opts.installMissing === true;
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
  const registered = new Set(roots.map(root => fs.existsSync(root) ? fs.realpathSync(root) : root));
  const installedPlugins = new Set(linkedPluginOwners(roots, opts).filter(owner => !registered.has(owner)));
  roots.push(...installedPlugins);
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
  try { consumers = discoverBrainConsumers(roots, { installedPlugins, onError: (root, error) => errors.push({ root, status: 'failed', error: error.message }) }); }
  catch (error) { return { failed: 1, skipped: true, reason: error.message, results: [] }; }
  const groups = new Map();
  const results = [...errors];
  // These run under the shared install, which the global and source updates verify.
  const consumerRoots = new Set(consumers.map(consumer => consumer.root));
  for (const root of installedPlugins) {
    const row = consumerRoots.has(root) ? null : sharedInstallRow(root, versions);
    if (row) results.push(row);
  }
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
    const needsChange = shared || (!consumer.runtimeOnly && overridesLag(consumer.pkg, versions)) || consumer.deps.some(dep => {
      const pinLags = !consumer.runtimeOnly && dep.declared !== targetSpec(dep.key, versions[dep.package]);
      if (keepAsFound(dep, installMissing, consumer.root, owner.owner)) return pinLags;
      return pinLags || dep.version !== versions[dep.package]
        || !dep.file?.startsWith(path.join(owner.owner, 'node_modules') + path.sep);
    });
    if (!needsChange) {
      // Kept as found: report the missing tree, install nothing.
      if (consumer.deps.some(dep => !dep.version)) row.status = 'not_installed';
      continue;
    }
    row.status = dryRun ? (consumer.deps.some(dep => !dep.version) ? 'not_installed' : 'would_update') : 'pending';
    if (!groups.has(owner.owner)) groups.set(owner.owner, { ...owner, consumers: [] });
    groups.get(owner.owner).consumers.push({ consumer, row });
  }
  if (!dryRun) for (const group of groups.values()) {
    const saved = new Map();
    const links = [];
    const lock = brainUpdateLockPath(group.owner);
    let lockFd;
    // An installed plugin's manifest and lockfile are its repository's tracked files:
    // pinning them left checkouts dirty and blocked pulls. npm can install the exact
    // release without writing either; pnpm cannot, so it keeps the pin.
    const runtimeOnly = group.consumers.every(({ consumer }) => consumer.runtimeOnly);
    const unpinned = runtimeOnly && group.manager === 'npm';
    const needsInstall = group.consumers.some(({ consumer }) =>
      isLink(path.join(consumer.root, 'node_modules')) || consumer.deps.some(dep =>
        !keepAsFound(dep, installMissing, consumer.root, group.owner)
        && (dep.version !== versions[dep.package] || !dep.file?.startsWith(path.join(group.owner, 'node_modules') + path.sep))));
    try {
      lockFd = acquireBrainUpdateLock(lock, opts.lockWaitMs === undefined ? {} : { waitMs: opts.lockWaitMs });
      for (const name of ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml']) {
        const file = path.join(group.owner, name);
        saved.set(file, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
      }
      for (const { consumer } of unpinned ? [] : group.consumers) {
        const text = fs.readFileSync(consumer.file, 'utf8');
        saved.set(consumer.file, text);
        const pkg = read(consumer.file);
        for (const dep of consumer.deps) pkg[dep.section][dep.key] = targetSpec(dep.key, versions[dep.package]);
        for (const key of overrideKeys(pkg)) {
          if (versions[canonical(key)]) pkg.overrides[key] = targetSpec(key, versions[canonical(key)]);
        }
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
      if (runtimeOnly) args.push(group.manager === 'pnpm' ? '--prod' : '--omit=dev');
      if (unpinned) args.push('--no-save', ...new Set(group.consumers.flatMap(({ consumer }) =>
        consumer.deps.map(dep => `${dep.key}@${targetSpec(dep.key, versions[dep.package])}`))));
      // A lockfile-only update builds no tree, so it runs no lifecycle scripts: npm still
      // ran a checkout's own postinstall here, which fails in a repository that was never
      // installed (a postinstall calling a tool that is not yet installed, 2026-11-09).
      // Only where no tree exists: npm's lockfile-only mode also rewrites the tree record
      // (node_modules/.package-lock.json) to versions it never installs, and npm then reports the
      // stale tree "up to date" forever (21 plugins on @ssss/cli 0.14.4 under 0.14.5, 2026-11-12).
      // A tree that exists gets a real install, so the tree and its record agree.
      else if (!needsInstall && noInstallTree(group.owner)) args.push(group.manager === 'pnpm' ? '--lockfile-only' : '--package-lock-only', '--ignore-scripts');
      const install = exec(group.manager, args, { cwd: group.owner, env: installEnv(), encoding: 'utf8',
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
          if (keepAsFound(dep, installMissing, consumer.root, group.owner) && !actual.file) return false;
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
    shared_install: results.filter(row => row.status === 'shared_install').length,
    would_update: results.filter(row => row.status === 'would_update').length,
    not_installed: results.filter(row => row.status === 'not_installed').length,
    up_to_date: results.filter(row => row.status === 'up_to_date').length,
    failed: results.filter(row => row.status === 'failed').length, results };
}
