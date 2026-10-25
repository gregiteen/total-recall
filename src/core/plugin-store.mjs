/**
 * Portable plugin store — shared local/Git install and remove used by
 * both the CLI and the REST API.
 *
 * Plugin code lives on disk under `<brain>/plugins/<id>/`. What the node knows
 * *about* each plugin — where it came from, its content hash at install, whether
 * it is offered to mesh peers, when its scheduled tasks last ran — is SSSS state:
 * a `plugin_record` document at `system/plugins/<id>.md` in the same brain's
 * vault, written through the Core Contract, with an append-only event for every
 * change.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  discoverPlugins,
  readPluginsDir,
  listBundledPlugins,
  projectPluginsDir,
  globalPluginsDir,
  vaultForPluginsDir,
  validatePluginManifest
} from './plugin-loader.mjs';
import {
  hashPluginDir,
  writeEntriesAtomic,
  copyPluginAtomic
} from './plugin-bundle.mjs';
import { writeVfsDocument, patchVfsDocument, deleteVfsDocument, appendVfsEvent } from './ssss-operation-service.mjs';
import { findVfsDocumentByPath } from './vfs-documents.mjs';
import { readActivationRecord, projectActivationOverride } from './plugin-state.mjs';

const execFileAsync = promisify(execFile);
const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const EVENT_WORKSPACE = 'default';

export function recordPath(id) {
  return `system/plugins/${id}.md`;
}

/**
 * Where a plugin's install record lives. Bundled scaffold plugins sit inside the
 * shipped package, which must stay free of per-brain state, so their records
 * belong to the active (global) brain instead.
 */
export function recordPluginsDir(plugin) {
  return plugin.scope === 'scaffold' ? globalPluginsDir() : plugin.pluginsDir;
}

export function vaultFor(plugin) {
  return vaultForPluginsDir(recordPluginsDir(plugin));
}

export function readPluginRecord(plugin) {
  const file = path.join(vaultFor(plugin), recordPath(plugin.id));
  if (!readActivationRecord(file, plugin.id)) return null;
  const record = findVfsDocumentByPath(recordPath(plugin.id), vaultFor(plugin));
  if (!record) throw new Error('Canonical plugin record could not be read');
  return record;
}

/**
 * A repository's own enablement for a shared plugin, read from its project
 * brain. This is an overlay, never an install: it is absent for a repository
 * that has never switched the plugin either way.
 */
export function readProjectActivationRecord(id, projectRoot) {
  if (!projectRoot) return null;
  const { file } = projectActivationOverride(id, projectRoot);
  if (!readActivationRecord(file, id)) return null;
  return findVfsDocumentByPath(recordPath(id), vaultForPluginsDir(projectPluginsDir(projectRoot)));
}

export async function emit(vaultRoot, id, kind, payload) {
  await appendVfsEvent(
    `plugins/${id}/${kind}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    { kind: `plugin.${kind}`, plugin_id: id, at: new Date().toISOString(), ...payload },
    { actorRole: 'system', intent: `Record plugin ${kind}`, workspaceId: EVENT_WORKSPACE, vaultRoot }
  );
}

export function buildPluginDocumentBody(manifest, id) {
  const m = manifest || {};
  const lines = [`# ${m.name || id}`, ''];
  if (m.description) {
    lines.push(m.description, '');
  }
  if (m.use_cases?.length) {
    lines.push('## Use Cases', ...m.use_cases.map((u) => `- ${u}`), '');
  }
  if (m.cli?.subcommands?.length) {
    lines.push('## CLI Subcommands', ...m.cli.subcommands.map((s) => `- \`${s.name}\`: ${s.description || ''}`), '');
  }
  if (m.secrets?.length) {
    lines.push('## Authentication & Secrets', ...m.secrets.map((s) => `- \`${s.key}\`: ${s.description || ''}${s.required ? ' (required)' : ' (optional)'}`), '');
  }
  return lines.join('\n');
}

async function writeRecord({ id, manifest, scope, pluginsDir, source, sha256, shared = false }) {
  const now = new Date().toISOString();
  readActivationRecord(path.join(vaultForPluginsDir(pluginsDir), recordPath(id)), id);
  const previous = findVfsDocumentByPath(recordPath(id), vaultForPluginsDir(pluginsDir));
  const frontmatter = {
    ...(previous?.frontmatter || {}),
    type: 'plugin_record',
    title: manifest?.name || id,
    description: manifest?.description || `Install record for plugin ${id}.`,
    timestamp: now,
    plugin_id: id,
    version: manifest?.version || '0.1.0',
    category: 'plugins',
    use_cases: manifest?.use_cases || [],
    tags: ['plugin', ...(manifest?.use_cases || [])],
    scope,
    shared,
    public_shared: false,
    source,
    sha256: sha256 || null,
    installed_at: previous?.installed_at || now,
    branding: previous?.branding || manifest?.branding || null,
    configuration: previous?.configuration || {},
    runtime_enabled: previous?.runtime_enabled !== false,
    task_runs: previous?.task_runs || {},
    locked: previous?.locked === true,
    secrets: manifest?.secrets || [],
    commands: manifest?.cli?.subcommands?.map((s) => s.name) || []
  };
  const body = previous?.body ?? buildPluginDocumentBody(manifest, id);
  await writeVfsDocument(recordPath(id), frontmatter, body, {
    actorRole: 'system',
    intent: `Record install of plugin ${id}`,
    vaultRoot: vaultForPluginsDir(pluginsDir)
  });
  return frontmatter;
}

/** Ensure a discovered plugin has a record (a hand-copied plugin has none). */
export async function ensurePluginRecord(plugin, options = {}) {
  const existing = readPluginRecord(plugin);
  const needsRefresh = options.forceRefresh || !existing?.category || !existing?.tags || !existing?.commands;
  if (existing && !needsRefresh) return existing;
  let sha256 = null;
  try {
    sha256 = hashPluginDir(plugin.dir).sha256;
  } catch {}
  return writeRecord({
    id: plugin.id,
    manifest: plugin.manifest,
    scope: plugin.scope,
    pluginsDir: recordPluginsDir(plugin),
    source: existing?.source || { kind: plugin.linked ? 'link' : 'local', ref: plugin.dir },
    sha256: sha256 || existing?.sha256,
    shared: existing?.shared || false
  });
}

export async function syncAllPluginRecords(projectRoot = process.cwd()) {
  const plugins = discoverPlugins(projectRoot);
  for (const p of plugins) {
    if (p.valid) {
      await ensurePluginRecord(p, { forceRefresh: true });
    }
  }
}

export async function patchPluginRecord(plugin, patches) {
  await ensurePluginRecord(plugin);
  return patchVfsDocument(recordPath(plugin.id), { ...patches, timestamp: new Date().toISOString() }, {
    actorRole: 'system',
    intent: `Update plugin record ${plugin.id}`,
    vaultRoot: vaultFor(plugin)
  });
}

/**
 * Write one repository's enablement for a shared plugin as a `plugin_record`
 * overlay in that repository's brain. Passing `null` clears the repository's own
 * setting so it follows the shared one again. The overlay never installs the
 * plugin: a repository without it uses the shared folder's copy.
 */
export async function patchProjectActivationRecord(id, projectRoot, runtimeEnabled, { manifest = null } = {}) {
  if (!ID_PATTERN.test(id)) throw new Error('Invalid plugin identity');
  const pluginsDir = projectPluginsDir(projectRoot);
  const vaultRoot = vaultForPluginsDir(pluginsDir);
  const now = new Date().toISOString();
  // Clear: the overlay is rewritten without `runtime_enabled`, which is what
  // "follow the shared setting" means. A patch cannot remove a key, so this
  // replaces the document rather than merging into it.
  if (runtimeEnabled === null) {
    const existing = readProjectActivationRecord(id, projectRoot);
    if (!existing) return null;
    const { runtime_enabled: _dropped, ...frontmatter } = { ...(existing.frontmatter || {}) };
    await writeVfsDocument(recordPath(id), {
      ...frontmatter,
      type: 'plugin_record',
      runtime_disabled: false,
      timestamp: now
    }, existing.body ?? buildPluginDocumentBody(manifest || {}, id), {
      actorRole: 'system',
      intent: `Clear repository activation override for plugin ${id}`,
      vaultRoot
    });
    return readProjectActivationRecord(id, projectRoot);
  }
  if (typeof runtimeEnabled !== 'boolean') throw new Error('Plugin activation requires a boolean or null');
  const previous = readProjectActivationRecord(id, projectRoot);
  if (previous) {
    return patchVfsDocument(recordPath(id), { runtime_enabled: runtimeEnabled, timestamp: now }, {
      actorRole: 'system',
      intent: `Set repository activation for plugin ${id}`,
      vaultRoot
    });
  }
  const m = manifest || {};
  const frontmatter = {
    type: 'plugin_record',
    title: m.name || id,
    description: `Repository activation for shared plugin ${id}.`,
    timestamp: now,
    plugin_id: id,
    category: 'plugins',
    tags: ['plugin', 'activation-override'],
    runtime_enabled: runtimeEnabled,
    source: { kind: 'shared', ref: globalPluginsDir() }
  };
  await writeVfsDocument(recordPath(id), frontmatter, buildPluginDocumentBody(m, id), {
    actorRole: 'system',
    intent: `Record repository activation for plugin ${id}`,
    vaultRoot
  });
  return frontmatter;
}

/** Facts about one installed plugin, merged with its record. */
export function describePlugin(plugin) {
  const record = readPluginRecord(plugin);
  const m = plugin.manifest || {};
  let current = null;
  try {
    current = hashPluginDir(plugin.dir);
  } catch {}
  const recordedSha = record?.sha256 || null;
  const taskRuns = record?.task_runs || {};
  return {
    id: plugin.id,
    name: m.name || plugin.id,
    version: m.version || '0.0.0',
    description: m.description || '',
    author: m.author || null,
    license: m.license || null,
    homepage: m.homepage || null,
    use_cases: Array.isArray(m.use_cases) ? m.use_cases : [],
    valid: plugin.valid,
    errors: plugin.errors,
    warnings: plugin.warnings || [],
    scope: plugin.scope,
    linked: !!plugin.linked,
    dir: plugin.dir,
    shared: record?.public_shared === true,
    mesh_shared: record?.shared === true,
    share_url: null,
    source: record?.source || { kind: plugin.linked ? 'link' : 'local', ref: plugin.dir },
    installed_at: record?.installed_at || null,
    sha256: current?.sha256 || null,
    installed_sha256: recordedSha,
    modified_since_install: !!(recordedSha && current?.sha256 && recordedSha !== current.sha256),
    file_count: current?.file_count ?? null,
    size_bytes: current?.size_bytes ?? null,
    categories: m.ssss_schemas?.categories || [],
    tasks: (m.tasks || []).map((t) => ({ ...t, last_run: t.command ? taskRuns[t.command] || null : null })),
    openwiki_hubs: m.openwiki_hubs || [],
    cli: m.cli ? { command: m.cli.command || null, subcommands: [...(m.cli.subcommands || []).filter(command => !['on', 'off'].includes(command.name)),
      ...['on', 'off'].map(name => ({ name, description: `${name === 'on' ? 'Enable' : 'Disable'} host execution and compile surfaces`, effect: 'write', output: 'json', args: [] }))] } : null,
    has_generator: !!m.compile?.generator,
    branding: { ...(m.branding || {}), ...(record?.branding || {}) },
    locked: record?.locked === true || m.locked === true,
    store_deployed: record?.store_deployed === true,
    secrets: m.secrets || [],
    ui: m.ui || null,
    configuration: m.configuration || null,
    manifest: m,
    card_face: record?.card_face || m.card_face || null,
    activation: { state: plugin.valid && record?.runtime_enabled !== false ? 'active' : 'inactive', enabled: plugin.valid && record?.runtime_enabled !== false }
  };
}

export function listInstalledPlugins(projectRoot = process.cwd()) {
  return discoverPlugins(projectRoot).map(describePlugin);
}

/** Bundled plugins shipped in the package, flagged with whether they are installed here. */
export function listAvailableBundled(projectRoot = process.cwd()) {
  const installed = new Set(discoverPlugins(projectRoot).map((p) => p.id));
  return listBundledPlugins()
    .filter((p) => p.valid)
    .map((p) => ({
      id: p.id,
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      use_cases: p.manifest.use_cases || [],
      categories: p.manifest.ssss_schemas?.categories || [],
      tasks: p.manifest.tasks || [],
      cli: p.manifest.cli ? { command: p.manifest.cli.command, subcommands: p.manifest.cli.subcommands || [] } : null,
      installed: installed.has(p.id),
      branding: p.manifest.branding || { icon: null, color: null, badge: null },
      locked: p.manifest.locked === true
    }));
}

function readManifestFrom(dir) {
  const manifestPath = path.join(dir, 'plugin.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`${dir} does not contain a plugin.json manifest`);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid plugin.json: ${err.message}`);
  }
  const validation = validatePluginManifest(manifest);
  if (!validation.valid) throw new Error(`Invalid plugin manifest: ${validation.errors.join('; ')}`);
  return manifest;
}

function assertNotInstalled(id, pluginsDir) {
  if (fs.existsSync(path.join(pluginsDir, id))) {
    throw new Error(`Plugin '${id}' is already installed at ${path.join(pluginsDir, id)}. Remove it first.`);
  }
}

export function isGitSource(source) {
  return /^(https:\/\/|http:\/\/|ssh:\/\/|git@)/.test(source) || source.endsWith('.git');
}

export async function recompileAfterPluginMutation(projectRoot = process.cwd(), isGlobal = false, dependencies = {}) {
  try {
    const { compileSurface } = dependencies.compileSurface ? dependencies : await import('./surface.mjs');
    // Match the actual destination chosen by install/remove, not an ambient brain override.
    const pluginsDir = isGlobal ? globalPluginsDir() : projectPluginsDir(projectRoot);
    const brainDir = path.dirname(pluginsDir);
    // `agentDir` is where the brain's own files live: `<project>/.agent` for a
    // project brain, `~/.agent` for the global one. It owns `skills/` and the
    // derived catalog, but NOT the instruction surface.
    const agentDir = path.dirname(path.dirname(brainDir));
    const vaultDir = path.join(brainDir, 'memory-vault');
    const skillsDir = path.join(agentDir, 'skills');
    const derivedDir = path.join(brainDir, 'memory-derived');
    // The surface directory is the workspace root, which differs by layer:
    //   project -> <projectRoot>/INSTRUCTIONS.md  (harnesses read <root>/AGENTS.md)
    //   global  -> ~/.agent/INSTRUCTIONS.md       (agentDir IS the workspace root)
    // Using agentDir for both put every project shim in `<project>/.agent/`,
    // where no harness looks, while compilation still reported success.
    const surfaceDir = isGlobal ? agentDir : projectRoot;
    const instructionsFile = path.join(surfaceDir, 'INSTRUCTIONS.md');
    const result = await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile, force: true, semantic: false });
    if (result.skipped && result.reason === 'stale-surface-code') throw new Error('Instruction compiler is stale; restart the host or run total-recall compile');
    if (isGlobal) {
      const { compileRegisteredProjects } = dependencies.compileRegisteredProjects ? dependencies : await import('../cli/rebuild.mjs');
      const failed = await compileRegisteredProjects();
      if (failed) throw new Error(`${failed} registered project surface compilation(s) failed`);
    }
    return { ok: true, inventoryUpdated: true };
  } catch (err) {
    try {
      const { logger } = await import('./logger.mjs');
      logger.warn('plugin-store', `Automatic compilation after plugin change failed: ${err.message}`);
    } catch {}
    return { ok: false, error: err.message };
  }
}

/**
 * Install a copied plugin's declared runtime dependencies.
 *
 * A plugin must carry its dependencies before the loader imports it: a single
 * unresolvable import from any installed plugin aborts every plugin command in
 * that scope, not just the plugin that owns it. Linked plugins are developer
 * checkouts that keep their own `node_modules`, so they are never touched.
 *
 * @returns {Promise<{ installed: boolean, packages?: string[], reason?: string }>}
 */
export async function installPluginDependencies(dest, id) {
  const pkgPath = path.join(dest, 'package.json');
  if (!fs.existsSync(pkgPath)) return { installed: false, reason: 'no package.json' };

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (err) {
    throw new Error(`Plugin '${id}' was copied but its package.json is unreadable: ${err.message}`);
  }
  const packages = Object.keys(pkg.dependencies || {});
  if (packages.length === 0) return { installed: false, reason: 'no dependencies declared' };

  try {
    await execFileAsync('npm', ['--version'], { timeout: 20_000 });
  } catch {
    console.warn(`⚠️  Plugin '${id}' declares ${packages.length} dependency(ies) but npm is unavailable. Run 'npm install --omit=dev' in ${dest}.`);
    return { installed: false, reason: 'npm unavailable' };
  }

  try {
    await execFileAsync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], {
      cwd: dest,
      timeout: 600_000,
      maxBuffer: 16 * 1024 * 1024
    });
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message || '').toString().trim()
      .split('\n').filter(Boolean).slice(-3).join(' ');
    throw new Error(`Plugin '${id}' was copied but its dependencies (${packages.join(', ')}) failed to install: ${detail}`);
  }
  return { installed: true, packages };
}

const REPLACEMENT_NAME = /^(.+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** Where `install --replace` keeps the copy it replaced, beside a plugins directory. */
export function replacementArchiveDir(pluginsDir) {
  return path.join(path.dirname(pluginsDir), 'memory-derived', 'plugin-replacements');
}

function directoryBytes(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += directoryBytes(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

/**
 * Bound the copies `install --replace` keeps. Every replacement archives the
 * previous install, dependencies included, and nothing removed them, so the
 * hourly automatic plugin update grew the archive without limit: 73 copies
 * filled a laptop disk. Keep the newest `keep` copies of each plugin (or of
 * `id` only), without node_modules, which a rollback reinstalls. A rename
 * keeps a directory's old mtime, so the copy just archived is named in
 * `prefer` and always counts as the newest.
 *
 * @param {string} archiveDir
 * @param {{ id?: string, keep?: number, apply?: boolean, prefer?: string }} [opts]
 */
export function pruneReplacementArchives(archiveDir, { id, keep = 1, apply = true, prefer } = {}) {
  if (!fs.existsSync(archiveDir)) return { archiveDir, kept: [], removed: [], stripped: [], bytesFreed: 0 };
  const byId = new Map();
  for (const name of fs.readdirSync(archiveDir)) {
    const m = REPLACEMENT_NAME.exec(name);
    const full = path.join(archiveDir, name);
    if (!m || (id && m[1] !== id) || !fs.statSync(full).isDirectory()) continue;
    (byId.get(m[1]) || byId.set(m[1], []).get(m[1])).push({ name, full, mtime: fs.statSync(full).mtimeMs });
  }
  const kept = [], removed = [], stripped = [];
  let bytesFreed = 0;
  for (const copies of byId.values()) {
    copies.sort((a, b) => (b.name === prefer) - (a.name === prefer) || b.mtime - a.mtime);
    copies.forEach((copy, index) => {
      if (index >= keep) {
        bytesFreed += directoryBytes(copy.full);
        if (apply) fs.rmSync(copy.full, { recursive: true, force: true });
        removed.push(copy.name);
        return;
      }
      kept.push(copy.name);
      const modules = path.join(copy.full, 'node_modules');
      if (fs.existsSync(modules)) {
        bytesFreed += directoryBytes(modules);
        if (apply) fs.rmSync(modules, { recursive: true, force: true });
        stripped.push(copy.name);
      }
    });
  }
  return { archiveDir, kept, removed, stripped, bytesFreed };
}

/**
 * Install a plugin.
 * @param {string} source  bundled id | public share URL | `peer:<host>/<id>` | git URL | local path
 * @param {{ projectRoot?: string, global?: boolean, link?: boolean, peerDeps?: object, publicDeps?: object }} [options]
 */
export async function installPlugin(source, options = {}) {
  const { projectRoot = process.cwd(), global: isGlobal = false, link = false, resolveBundle } = options;
  if (!source || typeof source !== 'string') throw new Error('Missing plugin source');
  source = source.trim();

  const scope = isGlobal ? 'global' : 'project';
  const pluginsDir = isGlobal ? globalPluginsDir() : projectPluginsDir(projectRoot);

  let manifest;
  let dest;
  let sourceRecord;
  let verifiedSha = null;
  let dependencies = null;
  let previousDirectory=null;
  const prepareDestination=id=>{
    const target=path.join(pluginsDir,id);
    if(!options.replace || !fs.existsSync(target))return assertNotInstalled(id,pluginsDir);
    const archive=path.join(replacementArchiveDir(pluginsDir),`${id}-${crypto.randomUUID()}`);
    fs.mkdirSync(path.dirname(archive),{recursive:true});
    fs.renameSync(target,archive);previousDirectory={target,archive};
  };

  try {

  const resolved = resolveBundle ? await resolveBundle(source, options) : null;
  const bundled = !resolved && ID_PATTERN.test(source) ? listBundledPlugins().find((p) => p.id === source) : null;

  if (resolved) {
    manifest = resolved.manifest;
    const validation = validatePluginManifest(manifest);
    if (!validation.valid) throw new Error(`Invalid plugin manifest: ${validation.errors.join('; ')}`);
    prepareDestination(manifest.id);
    dest = writeEntriesAtomic(pluginsDir, manifest.id, resolved.entries);
    verifiedSha = resolved.sha256;
    sourceRecord = resolved.source;
  } else if (bundled) {
    if (!bundled.valid) throw new Error(`Bundled plugin '${source}' is invalid: ${bundled.errors.join('; ')}`);
    manifest = bundled.manifest;
    prepareDestination(manifest.id);
    dest = copyPluginAtomic(bundled.dir, pluginsDir, manifest.id);
    sourceRecord = { kind: 'bundled', ref: manifest.id };
  } else if (isGitSource(source)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-plugin-'));
    let commit;
    try {
      try {
        await execFileAsync('git', ['clone', '--depth', '1', '--', source, tmp], { timeout: 120_000 });
        // The installed commit is what automatic updates compare against the remote head.
        commit = (await execFileAsync('git', ['-C', tmp, 'rev-parse', 'HEAD'], { timeout: 30_000 })).stdout.trim();
      } catch (err) {
        throw new Error(`Failed to clone ${source}: ${(err.stderr || err.message || '').toString().trim()}`);
      }
      manifest = readManifestFrom(tmp);
      prepareDestination(manifest.id);
      dest = copyPluginAtomic(tmp, pluginsDir, manifest.id);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    sourceRecord = { kind: 'git', ref: source, commit };
  } else {
    const abs = path.isAbsolute(source) ? source : path.resolve(projectRoot, source);
    if (!fs.existsSync(abs)) {
      throw new Error(`No bundled plugin, share link, peer source, git URL or directory matches '${source}'`);
    }
    manifest = readManifestFrom(abs);
    prepareDestination(manifest.id);
    if (link) {
      fs.mkdirSync(pluginsDir, { recursive: true });
      dest = path.join(pluginsDir, manifest.id);
      fs.symlinkSync(abs, dest, 'junction');
      sourceRecord = { kind: 'link', ref: abs };
    } else {
      dest = copyPluginAtomic(abs, pluginsDir, manifest.id);
      sourceRecord = { kind: 'local', ref: abs };
    }
  }

  if (sourceRecord.kind !== 'link') {
    try {
      dependencies = await installPluginDependencies(dest, manifest.id);
    } catch (err) {
      // A plugin copied without its dependencies would break every plugin
      // command in this scope, so undo the copy instead of leaving it behind.
      fs.rmSync(dest, { recursive: true, force: true });
      throw err;
    }
  }

  const sha256 = verifiedSha || hashPluginDir(dest).sha256;
  const vaultRoot = vaultForPluginsDir(pluginsDir);
  try {
    await writeRecord({ id: manifest.id, manifest, scope, pluginsDir, source: sourceRecord, sha256 });
    await emit(vaultRoot, manifest.id, 'installed', { version: manifest.version, scope, source: sourceRecord, sha256 });
  } catch (err) {
    // A plugin on disk without its record would be installed but unaccounted
    // for. Undo the install rather than leave the two out of step.
    const stat = fs.lstatSync(dest);
    if (stat.isSymbolicLink()) fs.unlinkSync(dest);
    else fs.rmSync(dest, { recursive: true, force: true });
    throw new Error(`Plugin files were written but its record could not be: ${err.message}`);
  }

  // The install succeeded: keep only this replacement's copy of the plugin, without dependencies.
  if (previousDirectory) {
    pruneReplacementArchives(replacementArchiveDir(pluginsDir), { id: manifest.id, keep: 1, prefer: path.basename(previousDirectory.archive) });
  }

  // A batch of installs (automatic updates) compiles once after the batch instead.
  const compilation = options.recompile === false ? { skipped: true } : await recompileAfterPluginMutation(projectRoot, isGlobal);
  return {
    plugin: { id: manifest.id, name: manifest.name, version: manifest.version, dir: dest, scope },
    source: sourceRecord,
    sha256,
    dependencies,
    previousDirectory:previousDirectory?.archive || null,
    compilation
  };
  }catch(error){
    if(previousDirectory){
      if(fs.existsSync(previousDirectory.target))fs.rmSync(previousDirectory.target,{recursive:true,force:true});
      fs.renameSync(previousDirectory.archive,previousDirectory.target);
    }
    throw error;
  }
}

export function findInstalled(id, { projectRoot = process.cwd(), global: isGlobal } = {}) {
  const all = isGlobal === true ? [] : discoverPlugins(projectRoot);
  if (isGlobal === true) {
    // discoverPlugins() hides a global plugin shadowed by a project one.
    return readPluginsDir(globalPluginsDir(), 'global').find((p) => p.id === id) || null;
  }
  return all.find((p) => p.id === id) || null;
}

export async function uninstallPlugin(id, options = {}) {
  const plugin = findInstalled(id, options);
  if (!plugin) throw new Error(`Plugin '${id}' is not installed`);
  const stat = fs.lstatSync(plugin.dir);
  if (stat.isSymbolicLink()) fs.unlinkSync(plugin.dir);
  else fs.rmSync(plugin.dir, { recursive: true, force: true });

  const vaultRoot = vaultFor(plugin);
  if (findVfsDocumentByPath(recordPath(id), vaultRoot)) {
    await deleteVfsDocument(recordPath(id), { actorRole: 'system', intent: `Remove plugin record ${id}`, vaultRoot });
  }
  await emit(vaultRoot, id, 'removed', { scope: plugin.scope, linked: stat.isSymbolicLink() });
  const compilation = await recompileAfterPluginMutation(options.projectRoot || process.cwd(), plugin.scope === 'global');
  return { id, dir: plugin.dir, scope: plugin.scope, compilation };
}
