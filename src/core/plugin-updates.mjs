/** Automatic maintenance keeps every installed plugin current with the source it was installed from. */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { discoverPlugins, listBundledPlugins } from './plugin-loader.mjs';
import { describePlugin } from './plugin-store.mjs';
import { hashPluginDir } from './plugin-bundle.mjs';
import { DEFAULT_PLUGIN_IDS } from './default-plugins.mjs';

const execFileAsync = promisify(execFile);

/** The commit a git source's default branch points at now. */
export async function remoteGitHead(ref) {
  const { stdout } = await execFileAsync('git', ['ls-remote', '--', ref, 'HEAD'], { timeout: 30_000 });
  const commit = stdout.split(/\s/)[0];
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`No HEAD commit advertised by ${ref}`);
  return commit;
}

async function peerSha({ id, ref }) {
  const { listPeerPlugins } = await import('./plugin-peers.mjs');
  const host = ref.slice('peer:'.length, ref.lastIndexOf('/'));
  const { peers } = await listPeerPlugins();
  const peer = peers.find(p => p.hostname === host || p.ip === host);
  if (!peer) throw new Error(`Mesh peer '${host}' is not reachable`);
  const offered = (peer.plugins || []).find(p => p.id === id);
  if (!offered?.sha256) throw new Error(`Mesh peer '${host}' no longer shares '${id}'`);
  return offered.sha256;
}

/**
 * Decide whether one installed plugin is behind its source.
 * Returns { status, install? } where install is the source to reinstall from.
 */
export async function checkPlugin(plugin, { gitHead = remoteGitHead, peerHash = peerSha, bundled = listBundledPlugins } = {}) {
  const { id, source } = plugin;
  // The filesystem decides, not the record: a linked plugin is its owner's
  // checkout (often recorded long ago as a copy) and is as current as that checkout.
  if (plugin.linked || source?.kind === 'link') return { status: 'linked', ref: source?.ref || plugin.dir };
  // Default plugins are refreshed in every brain by ensureRequiredPlugins with the package.
  if (DEFAULT_PLUGIN_IDS.includes(id)) return { status: 'package' };
  // A copy that records itself (or nothing) as its source has no upstream to follow.
  if (!source?.ref || (source.kind === 'local' && path.resolve(source.ref) === path.resolve(plugin.dir))) {
    return { status: 'unmanaged', error: 'No install source recorded; reinstall it from its git repository or a mesh peer with --replace to keep it updated' };
  }
  switch (source.kind) {
    case 'public':
      // A public share link pins one content hash by design.
      return { status: 'pinned', ref: source.ref };
    case 'bundled': {
      const shipped = bundled().find(p => p.id === id);
      if (!shipped) return { status: 'failed', error: `Bundled plugin '${id}' is no longer shipped in this package; reinstall it from its git repository with: total-recall plugin install <git-url> --global --replace` };
      return hashPluginDir(shipped.dir).sha256 === plugin.installed_sha256 ? { status: 'current' } : { status: 'behind', install: id };
    }
    case 'git': {
      const head = await gitHead(source.ref);
      return head === source.commit ? { status: 'current', commit: head } : { status: 'behind', install: source.ref, from: source.commit || null, to: head };
    }
    case 'peer': {
      const sha = await peerHash({ id, ref: source.ref });
      return sha === plugin.installed_sha256 ? { status: 'current' } : { status: 'behind', install: source.ref, from: plugin.installed_sha256, to: sha };
    }
    case 'local': {
      if (!source.ref || !fs.existsSync(source.ref)) {
        return { status: 'failed', error: `Installed from a directory that no longer exists (${source.ref}); reinstall it from its git repository or a mesh peer with --replace` };
      }
      return hashPluginDir(source.ref).sha256 === plugin.installed_sha256 ? { status: 'current' } : { status: 'behind', install: source.ref };
    }
    default:
      return { status: 'failed', error: `Plugin '${id}' has no recorded install source` };
  }
}

/**
 * Check every installed plugin under the given roots and reinstall the ones that
 * are behind. Surfaces are compiled once by the caller, not once per plugin.
 */
export async function updateInstalledPlugins({ roots = [process.cwd()], dryRun = false, check = checkPlugin, install, discover = discoverPlugins, describe = describePlugin } = {}) {
  if (!install) ({ installPlugin: install } = await import('./plugin-distribution.mjs'));
  const seen = new Set();
  const results = [];
  for (const root of roots) {
    let plugins;
    try { plugins = discover(root); }
    catch (error) { results.push({ root, status: 'failed', error: error.message }); continue; }
    for (const found of plugins) {
      if (found.scope === 'scaffold' || !found.dir || seen.has(found.dir)) continue;
      seen.add(found.dir);
      const row = { id: found.id, scope: found.scope, dir: found.dir };
      results.push(row);
      try {
        const plugin = describe(found);
        row.version = plugin.version;
        row.source = plugin.source?.kind || null;
        const verdict = await check(plugin);
        Object.assign(row, verdict);
        delete row.install;
        if (verdict.status !== 'behind' || dryRun) continue;
        const result = await install(verdict.install, { projectRoot: root, global: found.scope === 'global', replace: true, recompile: false });
        row.status = 'updated';
        row.previous_version = plugin.version;
        row.version = result.plugin.version;
        row.previous_directory = result.previousDirectory;
      } catch (error) {
        row.status = 'failed';
        row.error = error.message;
      }
    }
  }
  return {
    updated: results.filter(row => row.status === 'updated').length,
    failed: results.filter(row => row.status === 'failed').length,
    unmanaged: results.filter(row => row.status === 'unmanaged').length,
    results
  };
}
