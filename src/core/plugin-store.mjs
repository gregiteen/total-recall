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

const execFileAsync = promisify(execFile);
const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const EVENT_WORKSPACE = 'default';

export function recordPath(id) {
  return `system/plugins/${id}.md`;
}

export function vaultFor(plugin) {
  return vaultForPluginsDir(plugin.pluginsDir);
}

export function readPluginRecord(plugin) {
  try {
    return findVfsDocumentByPath(recordPath(plugin.id), vaultFor(plugin));
  } catch {
    return null;
  }
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
  const previous = findVfsDocumentByPath(recordPath(id), vaultForPluginsDir(pluginsDir));
  const frontmatter = {
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
    installed_at: now,
    branding: previous?.branding || manifest?.branding || null,
    configuration: previous?.configuration || {},
    task_runs: previous?.task_runs || {},
    locked: previous?.locked === true,
    secrets: manifest?.secrets || [],
    commands: manifest?.cli?.subcommands?.map((s) => s.name) || []
  };
  const body = buildPluginDocumentBody(manifest, id);
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
    pluginsDir: plugin.pluginsDir,
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
    cli: m.cli ? { command: m.cli.command || null, subcommands: m.cli.subcommands || [] } : null,
    has_generator: !!m.compile?.generator,
    branding: record?.branding || m.branding || { icon: null, image: null, color: null, badge: null },
    locked: record?.locked === true || m.locked === true,
    store_deployed: record?.store_deployed === true,
    secrets: m.secrets || [],
    ui: m.ui || null,
    configuration: m.configuration || null
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

export async function recompileAfterPluginMutation(projectRoot = process.cwd(), isGlobal = false) {
  try {
    const { compileSurface } = await import('./surface.mjs');
    const { resolveAgentDir, resolveBrainDir } = await import('../cli/agent-dir.mjs');
    const layer = isGlobal ? 'global' : 'project';
    const agentDir = resolveAgentDir(layer, projectRoot);
    const brainDir = resolveBrainDir(layer, projectRoot);
    const vaultDir = path.join(brainDir, 'memory-vault');
    const skillsDir = path.join(agentDir, 'skills');
    const derivedDir = path.join(brainDir, 'memory-derived');
    const instructionsFile = path.join(agentDir, 'INSTRUCTIONS.md');
    await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile, force: true, semantic: false });
  } catch (err) {
    try {
      const { logger } = await import('./logger.mjs');
      logger.warn('plugin-store', `Automatic compilation after plugin change failed: ${err.message}`);
    } catch {}
  }
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

  const resolved = resolveBundle ? await resolveBundle(source, options) : null;
  const bundled = !resolved && ID_PATTERN.test(source) ? listBundledPlugins().find((p) => p.id === source) : null;

  if (resolved) {
    manifest = resolved.manifest;
    const validation = validatePluginManifest(manifest);
    if (!validation.valid) throw new Error(`Invalid plugin manifest: ${validation.errors.join('; ')}`);
    assertNotInstalled(manifest.id, pluginsDir);
    dest = writeEntriesAtomic(pluginsDir, manifest.id, resolved.entries);
    verifiedSha = resolved.sha256;
    sourceRecord = resolved.source;
  } else if (bundled) {
    if (!bundled.valid) throw new Error(`Bundled plugin '${source}' is invalid: ${bundled.errors.join('; ')}`);
    manifest = bundled.manifest;
    assertNotInstalled(manifest.id, pluginsDir);
    dest = copyPluginAtomic(bundled.dir, pluginsDir, manifest.id);
    sourceRecord = { kind: 'bundled', ref: manifest.id };
  } else if (isGitSource(source)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-plugin-'));
    try {
      try {
        await execFileAsync('git', ['clone', '--depth', '1', '--', source, tmp], { timeout: 120_000 });
      } catch (err) {
        throw new Error(`Failed to clone ${source}: ${(err.stderr || err.message || '').toString().trim()}`);
      }
      manifest = readManifestFrom(tmp);
      assertNotInstalled(manifest.id, pluginsDir);
      dest = copyPluginAtomic(tmp, pluginsDir, manifest.id);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    sourceRecord = { kind: 'git', ref: source };
  } else {
    const abs = path.isAbsolute(source) ? source : path.resolve(projectRoot, source);
    if (!fs.existsSync(abs)) {
      throw new Error(`No bundled plugin, share link, peer source, git URL or directory matches '${source}'`);
    }
    manifest = readManifestFrom(abs);
    assertNotInstalled(manifest.id, pluginsDir);
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

  const sha256 = verifiedSha || hashPluginDir(dest).sha256;
  const vaultRoot = vaultForPluginsDir(pluginsDir);
  try {
    await writeRecord({ id: manifest.id, manifest, scope, pluginsDir, source: sourceRecord, sha256 });
    await emit(vaultRoot, manifest.id, 'installed', { version: manifest.version, scope, source: sourceRecord, sha256 });
    await recompileAfterPluginMutation(projectRoot, isGlobal);
  } catch (err) {
    // A plugin on disk without its record would be installed but unaccounted
    // for. Undo the install rather than leave the two out of step.
    const stat = fs.lstatSync(dest);
    if (stat.isSymbolicLink()) fs.unlinkSync(dest);
    else fs.rmSync(dest, { recursive: true, force: true });
    throw new Error(`Plugin files were written but its record could not be: ${err.message}`);
  }

  return {
    plugin: { id: manifest.id, name: manifest.name, version: manifest.version, dir: dest, scope },
    source: sourceRecord,
    sha256
  };
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
  await recompileAfterPluginMutation(options.projectRoot || process.cwd(), plugin.scope === 'global');
  return { id, dir: plugin.dir, scope: plugin.scope };
}
