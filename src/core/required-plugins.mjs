/**
 * Required native capability installation checks; never opens credential state.
 *
 * The defaults live in one shared folder per machine: the global brain.
 * A project brain never receives its own copy: discovery already falls back to
 * the shared folder, and a repository switches a shared plugin on or off with
 * its own `plugin_record` overlay. Copies made by earlier releases are reported
 * by `plugin copies` so they can be audited and removed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readPluginsDir, globalPluginsDir, PACKAGE_ROOT, resolvePluginFile, validatePluginManifest } from './plugin-loader.mjs';
import { DEFAULT_PLUGIN_IDS, REQUIRED_INSTALLATION_PLUGIN_IDS } from './default-plugins.mjs';
import { comparePackageVersions } from './package-version.mjs';
import { preparePluginDependencies } from './plugin-dependencies.mjs';
import { resolveRelocatedGlobalBrainDir } from './global-brain-relocation.mjs';

const require = createRequire(import.meta.url);
export const BUNDLED_PLUGIN_DIR = path.join(PACKAGE_ROOT, 'scaffold', '.agent', 'skills', 'total-recall', 'plugins');

function installationHook(id, directory, manifest) {
  const relative = manifest.runtime?.modules?.installation;
  if (!relative?.endsWith('.cjs')) throw new Error('Required ' + id + ' installation module is missing');
  const hook = require(resolvePluginFile(directory, relative));
  for (const name of ['inspectSource', 'inspectInstallation', 'ensureInstallation']) {
    if (typeof hook[name] !== 'function') throw new Error('Required ' + id + ' installation module lacks ' + name);
  }
  return hook;
}

export function loadRequiredInstallationHooks(sourceDir = BUNDLED_PLUGIN_DIR, { fallbackDir } = {}) {
  return REQUIRED_INSTALLATION_PLUGIN_IDS.map(id => {
    const primary = path.resolve(sourceDir, id);
    const directory = fallbackDir && !fs.existsSync(primary) ? path.resolve(fallbackDir, id) : primary;
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'plugin.json'), 'utf8'));
    if (manifest.id !== id) throw new Error('Required bundled plugin identity mismatch: ' + id);
    return { id, directory, manifest, hook: installationHook(id, directory, manifest) };
  });
}

export function loadInstalledRequiredInstallationHooks(brainDir, sharedBrainDir = path.dirname(globalPluginsDir())) {
  return loadRequiredInstallationHooks(path.join(brainDir, 'plugins'), {
    fallbackDir: path.join(sharedBrainDir, 'plugins'),
  });
}

export function resolveRequiredInstallationPaths(brainDir, sharedBrainDir = path.dirname(globalPluginsDir())) {
  const shared = resolveRelocatedGlobalBrainDir(sharedBrainDir);
  const selected = path.resolve(brainDir);
  if (selected === path.resolve(sharedBrainDir)) return { brainDir: shared, sharedBrainDir: shared };
  const skillsDir = path.dirname(selected);
  if (!fs.lstatSync(skillsDir, { throwIfNoEntry: false })?.isSymbolicLink()) {
    return { brainDir: selected, sharedBrainDir: shared };
  }
  const projectRoot = fs.realpathSync(path.resolve(skillsDir, '..', '..'));
  const realSkillsDir = fs.realpathSync(skillsDir);
  const localSkillsDirs = ['.agent', '.agents'].map(dir => path.join(projectRoot, dir, 'skills'));
  if (!localSkillsDirs.includes(realSkillsDir)) throw new Error('Unsafe project skills link: ' + skillsDir);
  return { brainDir: path.join(realSkillsDir, path.basename(selected)), sharedBrainDir: shared };
}

/**
 * Validate the required capability for a brain. A shared brain validates its own
 * installs; a project brain validates its own copy when it still has one and
 * otherwise the shared folder that discovery already falls back to.
 */
export function inspectRequiredPlugins(brainDir, { pluginsDir, sharedBrainDir = path.dirname(globalPluginsDir()) } = {}) {
  try {
    ({ brainDir, sharedBrainDir } = resolveRequiredInstallationPaths(brainDir, sharedBrainDir));
  } catch (error) {
    return { status: 'failed', errors: [error.message], source: null, installations: {} };
  }
  const ownDir = path.join(brainDir, 'plugins');
  const resolved = pluginsDir || path.join(sharedBrainDir, 'plugins');
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
  const installations = {};
  for (const id of REQUIRED_INSTALLATION_PLUGIN_IDS) {
    const plugin = plugins.find(entry => entry.id === id);
    try {
      if (!plugin?.valid) throw new Error('Required ' + id + ' plugin is missing or invalid');
      const hook = installationHook(id, plugin.dir, plugin.manifest);
      const report = hook.inspectInstallation({ brainDir, sharedBrainDir });
      installations[id] = report;
      if (report?.ok !== true) {
        const detail = Object.values(report || {}).map(value => value?.error).filter(Boolean).join('; ');
        throw new Error('Required ' + id + ' installation is incomplete' + (detail ? ': ' + detail : ''));
      }
    } catch (error) {
      errors.push(error.message);
    }
  }
  const source = !auth ? null : (path.resolve(auth.pluginsDir) === path.resolve(ownDir) ? 'local' : 'shared');
  return { status: errors.length ? 'failed' : 'ready', errors, source, installations };
}

const LEGACY_PRESENTATION_FIELDS = ['card', 'card_face', 'card_layout'];

function hasLegacyPresentation(manifest) {
  return LEGACY_PRESENTATION_FIELDS.some(field => Object.hasOwn(manifest, field))
    || (Array.isArray(manifest.ui?.elements) && manifest.ui.elements.some(element => ['card', 'card-face'].includes(element?.kind)));
}

function hasPluginFiles(directory, files) {
  return files.every(file => fs.statSync(resolvePluginFile(directory, file)).isFile());
}

function runtimeFiles(manifest) {
  return ['package.json', ...(manifest.cli ? [manifest.cli.handler] : []), ...Object.values(manifest.runtime?.modules || {})];
}

/** Refresh older copies and migrate the retired presentation of an otherwise intact same-release copy. */
function isStaleInstall(target, source) {
  try {
    // A link is its owner's checkout. Replacing it would delete that repository's files, .git included.
    if (fs.lstatSync(target).isSymbolicLink()) return false;
    const installed = JSON.parse(fs.readFileSync(path.join(target, 'plugin.json'), 'utf8'));
    const bundled = JSON.parse(fs.readFileSync(path.join(source, 'plugin.json'), 'utf8'));
    if (comparePackageVersions(installed.version, bundled.version) === -1) return true;
    if (installed.version !== bundled.version || installed.id !== bundled.id || bundled.id !== path.basename(source)
      || installed.cli?.command !== bundled.cli?.command || !hasLegacyPresentation(installed)
      || hasLegacyPresentation(bundled) || !bundled.ui?.home || !validatePluginManifest(bundled).valid) return false;

    const migrated = { ...installed, ui: bundled.ui };
    for (const field of LEGACY_PRESENTATION_FIELDS) delete migrated[field];
    if (!validatePluginManifest(migrated).valid || !hasPluginFiles(target, runtimeFiles(installed))) return false;
    return hasPluginFiles(source, [
      ...runtimeFiles(bundled), bundled.ui.design_tokens, ...bundled.ui.elements.map(element => element.module),
    ]);
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
export function ensureRequiredPlugins(brainDir, { sourceDir = BUNDLED_PLUGIN_DIR, sharedBrainDir = path.dirname(globalPluginsDir()) } = {}) {
  const { brainDir: selected, sharedBrainDir: shared } = resolveRequiredInstallationPaths(brainDir, sharedBrainDir);
  // Validate the complete package before changing any installation.
  for (const id of DEFAULT_PLUGIN_IDS) {
    if (!fs.existsSync(path.join(sourceDir, id, 'plugin.json'))) throw new Error(`Required bundled ${id} plugin is missing`);
  }
  const hooks = loadRequiredInstallationHooks(sourceDir);
  for (const { id, hook } of hooks) {
    if (hook.inspectSource()?.ok !== true) throw new Error('Required bundled ' + id + ' payload is incomplete');
  }
  installDefaultsInto(shared, sourceDir);
  for (const target of new Set([shared, selected])) {
    for (const { id, hook } of loadInstalledRequiredInstallationHooks(target, shared)) {
      if (hook.ensureInstallation({ brainDir: target, sharedBrainDir: shared })?.ok !== true) {
        throw new Error('Required ' + id + ' installation is incomplete');
      }
    }
  }
  return inspectRequired(selected, { sharedBrainDir: shared });
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
      // Keep installed dependencies when refreshing the bundled plugin files.
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
  if (!fs.existsSync(pluginsDir) || (fs.existsSync(sharedDir) && fs.realpathSync(pluginsDir) === fs.realpathSync(sharedDir))) {
    return { copies: [], count: 0, sourceDir };
  }
  const copies = [];
  const realpath = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
  // A link in a repository that resolves to the same plugin as the shared
  // install only shadows it: state and records split between brains and the
  // repository can drift onto another checkout. Defaults never belong to a
  // repository, so any linked default is a shadow too.
  const isShadowLink = (id, copyDir, shared) => {
    if (!fs.lstatSync(copyDir).isSymbolicLink() || !fs.existsSync(shared)) return false;
    return DEFAULT_PLUGIN_IDS.includes(id) || realpath(copyDir) === realpath(shared);
  };
  const entries = fs.readdirSync(pluginsDir).filter((name) => !name.startsWith('.'));
  const ids = [...new Set([...DEFAULT_PLUGIN_IDS, ...entries])];
  for (const id of ids) {
    const copyDir = path.join(pluginsDir, id);
    if (!fs.lstatSync(copyDir, { throwIfNoEntry: false })) continue;
    const source = path.join(sourceDir, id);
    const shared = path.join(sharedDir, id);
    const linked = fs.lstatSync(copyDir).isSymbolicLink();
    // The source checkout a shared link points at is not a copy.
    if (!linked && fs.existsSync(shared) && realpath(shared) === realpath(copyDir)) continue;
    const shadow = isShadowLink(id, copyDir, shared);
    // Nothing is installed per repository. A plugin found only here must be
    // installed in the shared folder before its repository entry can go.
    const repoOnly = !fs.existsSync(shared);
    const row = {
      id, dir: copyDir,
      sourceDir: fs.existsSync(source) ? source : null,
      sharedDir: fs.existsSync(shared) ? shared : null,
      edited: null, version: null, sourceVersion: null, sharedVersion: null,
      linked,
      shadow,
      repoOnly,
      target: fs.lstatSync(copyDir).isSymbolicLink() ? fs.readlinkSync(copyDir) : null,
    };
    const version = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8')).version; } catch { return null; } };
    row.version = version(copyDir);
    row.sourceVersion = row.sourceDir ? version(row.sourceDir) : null;
    row.sharedVersion = row.sharedDir ? version(row.sharedDir) : null;
    // A link is owned by its target checkout, so its tree is never "edited" here; a dangling link has no tree.
    row.edited = row.linked || !fs.existsSync(copyDir) ? null : row.sourceDir ? !sameTree(copyDir, row.sourceDir) : null;
    // Older copies shadow the shared install. Version skew identifies stale
    // candidates for archival but does not prove the local source is disposable.
    row.stale = Boolean(row.version && row.sharedVersion && comparePackageVersions(row.version, row.sharedVersion) < 0);
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
