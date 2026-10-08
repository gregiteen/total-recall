import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverPlugins, getPluginWatchPaths, getPlugin, getPluginCategories, validatePluginManifest, resolveProjectRoot, resolvePluginFile, PACKAGE_ROOT } from './plugin-loader.mjs';

export { discoverPlugins, getPluginWatchPaths, getPlugin, getPluginCategories, validatePluginManifest };

/**
 * Assemble evolving context injections from active plugins.
 * Supports plugin-directed compilation via custom generators or standard SSSS category aggregation.
 */
export async function assemblePluginContexts({ projectRoot = process.cwd(), vaultDir, nodes = [], derivedDir } = {}) {
  const resolvedProjectRoot = resolveProjectRoot(projectRoot, vaultDir);
  const plugins = discoverPlugins(resolvedProjectRoot);
  if (plugins.length === 0) return '';

  const blocks = [];

  for (const plugin of plugins) {
    if (!plugin.valid) continue;
    const { manifest, dir, id } = plugin;
    const name = manifest.name || id;

    // 1. Check if plugin directs compilation via a custom generator
    if (manifest.compile?.generator) {
        try {
          const generatorPath = resolvePluginFile(dir, manifest.compile.generator);
          // Keyed by mtime so an edited generator is picked up without a restart.
          const url = pathToFileURL(generatorPath);
          url.searchParams.set('mtime', String(fs.statSync(generatorPath).mtimeMs));
          const mod = await import(url.href);
          const fn = mod.generateContext || mod.default;
          if (typeof fn === 'function') {
            const generated = await fn({
              plugin,
              packageRoot: PACKAGE_ROOT,
              projectRoot: resolvedProjectRoot,
              vaultDir,
              nodes,
              derivedDir,
              manifest
            });
            if (generated && typeof generated === 'string' && generated.trim().length > 0) {
              let pluginBlock = `### Active Plugin: ${name}\n`;
              if (manifest.description) {
                pluginBlock += `> ${manifest.description}\n\n`;
              }
              pluginBlock += generated.trim();
              blocks.push(pluginBlock);
              continue; // Plugin-directed compilation completed for this plugin
            }
          }
        } catch (err) {
          // Generator error falls back to standard assembly
        }
    }

    // 2. Standard SSSS category aggregation fallback
    const categories = (manifest.ssss_schemas?.categories || []).map(c => c.name);
    const pluginNodes = nodes.filter(n => categories.includes(n.category) && n.status === 'active');

    let externalContext = '';
    for (const relative of ['evolving-context.md', 'context.md']) {
        try {
          externalContext = fs.readFileSync(resolvePluginFile(dir, relative), 'utf8').trim();
          break;
        } catch {}
    }

    if (pluginNodes.length === 0 && !externalContext) {
      continue;
    }

    let pluginBlock = `### Active Plugin: ${name}\n`;
    if (manifest.description) {
      pluginBlock += `> ${manifest.description}\n\n`;
    }

    for (const node of pluginNodes) {
      pluginBlock += `#### ${node.title || node.slug}\n`;
      const text = node.body || node.content || node.description || '';
      if (text) pluginBlock += `${text}\n`;
    }

    if (externalContext) {
      pluginBlock += `${externalContext}\n\n`;
    }

    blocks.push(pluginBlock.trim());
  }

  if (blocks.length === 0) return '';

  return `\n\n## Evolving Plugin Context Surfaces\n\nThe following dynamic context is compiled from active plugins and grounded directly in the workspace:\n\n${blocks.join('\n\n---\n\n')}`;
}

/**
 * Start a continuous file watcher directed by active plugins.
 * Triggers recompile whenever any watched plugin resource changes.
 */
export function startPluginDirectedWatcher({
  projectRoot = process.cwd(),
  vaultDir,
  onRecompile,
  debounceMs = 1200
}) {
  const watchPaths = getPluginWatchPaths(projectRoot, vaultDir);
  const watchers = [];
  let timer = null;

  const trigger = (targetPath, filename) => {
    if (filename && (filename.startsWith('.') || filename.endsWith('.swp') || filename.endsWith('~'))) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = null;
      if (typeof onRecompile === 'function') {
        try {
          await onRecompile(path.join(targetPath, filename || ''));
        } catch (err) {
          console.error('[plugin-watcher] Recompile error:', err.message);
        }
      }
    }, debounceMs);
  };

  for (const wp of watchPaths) {
    try {
      const w = fs.watch(wp, { recursive: true }, (ev, fn) => trigger(wp, fn));
      watchers.push(w);
    } catch {
      try {
        const w = fs.watch(wp, { recursive: false }, (ev, fn) => trigger(wp, fn));
        watchers.push(w);
      } catch {}
    }
  }

  return {
    watchPaths,
    stop() {
      for (const w of watchers) {
        try { w.close(); } catch {}
      }
      watchers.length = 0;
      if (timer) clearTimeout(timer);
    }
  };
}
