/**
 * Required native capability installation checks; never opens credential state.
 *
 * The nine defaults live in ONE shared folder per machine — the global brain.
 * A project brain never receives its own copy: discovery already falls back to
 * the shared folder, and a repository switches a shared plugin on or off with
 * its own `plugin_record` overlay. Copies made by earlier releases are reported
 * by `plugin copies` so they can be audited and removed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readPluginsDir, globalPluginsDir, PACKAGE_ROOT, resolvePluginFile } from './plugin-loader.mjs';
import { DEFAULT_PLUGIN_IDS } from './default-plugins.mjs';
import { comparePackageVersions } from './package-version.mjs';
import { preparePluginDependencies } from './plugin-dependencies.mjs';

/**
 * True when this brain is the shared (global) brain that owns the defaults.
 */
function isSharedBrain(brainDir) {
  return path.resolve(brainDir) === path.resolve(path.dirname(globalPluginsDir()));
}

/**
 * Validate the required capability for a brain. A shared brain validates its own
 * installs; a project brain validates its own copy when it still has one and
 * otherwise the shared folder that discovery already falls back to.
 */
export function inspectRequiredPlugins(brainDir, { pluginsDir, sharedBrainDir } = {}) {
  const ownDir = path.join(brainDir, 'plugins');
  const sharedPlugins = sharedBrainDir ? path.join(sharedBrainDir, 'plugins') : globalPluginsDir();
  // A project brain's plugins directory can exist yet hold none of the defaults
  // (provisioning creates it empty). The shared folder is what actually serves
  // the repository, so consult it whenever this brain carries no auth of its own.
  const resolved = pluginsDir || (isSharedBrain(brainDir) ? globalPluginsDir()
    : (hasOwnRequired(ownDir) ? ownDir : sharedPlugins));
  const own = readPluginsDir(ownDir, 'required');
  const shared = path.resolve(resolved) === path.resolve(ownDir) ? [] : readPluginsDir(resolved, 'shared');
  const seen = new Set();
  const plugins = [...own, ...shared].filter(plugin => (seen.has(plugin.id) ? false : seen.add(plugin.id)));
  const errors = [];
  const auth = plugins.find(plugin => plugin.id === 'auth');
  if (!auth?.valid) errors.push('Required auth plugin is missing or invalid');
  else {
    if (auth.manifest.cli?.command !== 'auth') errors.push('Required auth namespace is missing');
    for (const name of ['commands', 'secrets-store', 'runtime-credentials']) {
      const file = auth.manifest.runtime?.modules?.[name];
      if (!file) errors.push(`Required auth runtime module ${name} is missing`);
    }
    const files = [auth.manifest.cli?.handler, ...Object.values(auth.manifest.runtime?.modules || {})];
    for (const file of files) {
      try {
        if (!file || !fs.statSync(resolvePluginFile(auth.dir, file)).isFile()) throw new Error();
      } catch { errors.push(`Required auth file is missing or unsafe: ${file || 'CLI handler'}`); }
    }
  }
  const source = !auth ? null : (path.resolve(auth.pluginsDir) === path.resolve(ownDir) ? 'local' : 'shared');
  return { status: errors.length ? 'failed' : 'ready', errors, source };
}

/** True when this brain carries the required plugin itself rather than by fallback. */
function hasOwnRequired(ownDir) {
  return fs.existsSync(path.join(ownDir, 'auth', 'plugin.json'));
}

/** Only a copy that declares an older release than the bundled one is refreshed; damaged same-release copies still fail. */
function isStaleInstall(target, source) {
  try {
    const installed = JSON.parse(fs.readFileSync(path.join(target, 'plugin.json'), 'utf8')).version;
    const bundled = JSON.parse(fs.readFileSync(path.join(source, 'plugin.json'), 'utf8')).version;
    return comparePackageVersions(installed, bundled) === -1;
  } catch { return false; }
}

/**
 * Ensure the required plugins exist for a brain.
 *
 * There is one shared install per machine, in the global brain. A project brain
 * never receives a copy: it is served by the shared folder, and a repository
 * switches a shared plugin on or off with its own record. Provisioning a project
 * therefore makes sure the SHARED brain is seeded, then validates that the
 * required capability resolves for the project. Copies left in a project by an
 * earlier release are refreshed in place (so they stay usable until removed),
 * never created.
 */
export function ensureRequiredPlugins(brainDir, { sourceDir = path.join(PACKAGE_ROOT, 'scaffold', '.agent', 'skills', 'total-recall', 'plugins'), sharedBrainDir } = {}) {
  // Validate the complete package before changing any installation.
  for (const id of DEFAULT_PLUGIN_IDS) {
    if (!fs.existsSync(path.join(sourceDir, id, 'plugin.json'))) throw new Error(`Required bundled ${id} plugin is missing`);
  }
  if (!isSharedBrain(brainDir)) {
    // A repository installs nothing of its own. The shared brain is what serves
    // it, so seed that one — never this project's plugins directory.
    const sharedBrain = sharedBrainDir || path.dirname(globalPluginsDir());
    if (path.resolve(sharedBrain) !== path.resolve(brainDir)) installDefaultsInto(sharedBrain, sourceDir);
    return inspectRequired(brainDir, { sharedBrainDir: sharedBrain });
  }
  installDefaultsInto(brainDir, sourceDir);
  return inspectRequired(brainDir);
}

/** Seed or refresh the default plugins inside one brain. */
function installDefaultsInto(brainDir, sourceDir) {
  for (const id of DEFAULT_PLUGIN_IDS) {
    const target = path.join(brainDir, 'plugins', id);
    const source = path.join(sourceDir, id);
    if (!fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: true });
    } else if (isStaleInstall(target, source)) {
      // A vendored copy that no longer validates (or predates the bundled release) is replaced; node_modules stays.
      for (const entry of fs.readdirSync(target)) if (entry !== 'node_modules') fs.rmSync(path.join(target, entry), { recursive: true, force: true });
      for (const entry of fs.readdirSync(source)) if (entry !== 'node_modules') fs.cpSync(path.join(source, entry), path.join(target, entry), { recursive: true });
    }
    preparePluginDependencies(target);
  }
}

/** Validate and fail loudly; provisioning must not report a brain it cannot serve. */
function inspectRequired(brainDir, options = {}) {
  const report = inspectRequiredPlugins(brainDir, options);
  if (report.status !== 'ready') throw new Error(report.errors.join('; '));
  return report;
}

/**
 * Audit per-repository copies of the shared defaults.
 *
 * A copy is compared with the bundled plugin source this package ships, because
 * that is what an install was made from. The comparison ignores installed
 * dependencies, test scaffolding and a shared install's own generated state, so
 * a copy reports `edited` only when its plugin source differs — meaning somebody
 * changed the plugin inside that repository, and it must not be removed blindly.
 */
export function auditProjectPluginCopies(projectRoot, { sharedDir = globalPluginsDir(), sourceDir = path.join(PACKAGE_ROOT, 'scaffold', '.agent', 'skills', 'total-recall', 'plugins') } = {}) {
  const pluginsDir = path.join(projectRoot, '.agent', 'skills', 'total-recall', 'plugins');
  if (!fs.existsSync(pluginsDir)) return { copies: [], count: 0, sourceDir };
  const copies = [];
  for (const id of DEFAULT_PLUGIN_IDS) {
    const copyDir = path.join(pluginsDir, id);
    if (!fs.existsSync(copyDir)) continue;
    const source = path.join(sourceDir, id);
    const shared = path.join(sharedDir, id);
    const row = {
      id, dir: copyDir,
      sourceDir: fs.existsSync(source) ? source : null,
      sharedDir: fs.existsSync(shared) ? shared : null,
      edited: null, version: null, sourceVersion: null, sharedVersion: null
    };
    const version = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8')).version; } catch { return null; } };
    row.version = version(copyDir);
    row.sourceVersion = row.sourceDir ? version(row.sourceDir) : null;
    row.sharedVersion = row.sharedDir ? version(row.sharedDir) : null;
    row.edited = row.sourceDir ? !sameTree(copyDir, row.sourceDir) : null;
    copies.push(row);
  }
  return { copies, count: copies.length, sourceDir };
}

/** Compare two plugin trees, ignoring installed dependencies and generated state. */
function sameTree(left, right) {
  const ignore = new Set(['node_modules', '.git', 'test', 'vitest.config.mjs', 'package-lock.json']);
  // A shared install runs in place, so its tree also carries compiled surfaces
  // and a local secrets projection. Those are not plugin source.
  const ignored = (name) => ignore.has(name) || name.startsWith('.env');
  const walk = (dir, base = '') => {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (ignored(entry.name)) continue;
      const relative = base ? `${base}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      // Symlinks are compared by their target text; a linked dev checkout is not
      // "edited", it is owned elsewhere.
      if (entry.isSymbolicLink()) { out.push([relative, `link:${fs.readlinkSync(full)}`]); continue; }
      if (entry.isDirectory()) { out.push(...walk(full, relative)); continue; }
      out.push([relative, fs.readFileSync(full, 'utf8')]);
    }
    return out;
  };
  try {
    const a = walk(left); const b = walk(right);
    return JSON.stringify(a) === JSON.stringify(b);
  } catch { return false; }
}
