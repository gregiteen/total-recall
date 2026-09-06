import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { discoverPlugins, getPluginWatchPaths, getPlugin, getPluginCategories, validatePluginManifest } from './plugin-loader.mjs';

export { discoverPlugins, getPluginWatchPaths, getPlugin, getPluginCategories, validatePluginManifest };

/**
 * Assemble evolving context injections from active plugins.
 * Supports plugin-directed compilation via custom generators or standard SSSS category aggregation.
 */
export async function assemblePluginContexts({ projectRoot = process.cwd(), vaultDir, nodes = [], derivedDir } = {}) {
  let resolvedProjectRoot = projectRoot;
  if (vaultDir && (!resolvedProjectRoot || resolvedProjectRoot === process.cwd())) {
    try {
      const parent = path.resolve(vaultDir, '..', '..', '..');
      if (fs.existsSync(path.join(parent, '.agent'))) {
        resolvedProjectRoot = parent;
      }
    } catch {}
  }

  const plugins = discoverPlugins(resolvedProjectRoot);
  if (plugins.length === 0) return '';

  const blocks = [];

  for (const plugin of plugins) {
    const { manifest, dir, id } = plugin;
    const name = manifest.name || id;

    // 1. Check if plugin directs compilation via a custom generator
    if (manifest.compile?.generator) {
      const generatorRel = manifest.compile.generator;
      const generatorPath = path.isAbsolute(generatorRel)
        ? generatorRel
        : path.resolve(dir, generatorRel);

      if (!fs.existsSync(generatorPath)) generatorPath = path.resolve(resolvedProjectRoot, generatorRel);
      if (fs.existsSync(generatorPath)) {
        try {
          const mod = await import(generatorPath);
          const fn = mod.generateContext || mod.default;
          if (typeof fn === 'function') {
            const generated = await fn({
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
    }

    // 2. Standard SSSS category aggregation fallback
    const categories = (manifest.ssss_schemas?.categories || []).map(c => c.name);
    const pluginNodes = nodes.filter(n => categories.includes(n.category) && n.status === 'active');

    const userProjects = pluginNodes.filter(n => n.category === 'user-projects');
    const benchmarks = pluginNodes.filter(n => n.category === 'benchmarks');
    const research = pluginNodes.filter(n => n.category === 'research');

    let externalContext = '';
    const candidates = [
      derivedDir ? path.join(derivedDir, 'evolving-context.md') : null,
      path.join(dir, 'evolving-context.md'),
      path.join(dir, 'context.md')
    ].filter(Boolean);

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        try {
          externalContext = fs.readFileSync(cand, 'utf8').trim();
          break;
        } catch {}
      }
    }

    if (pluginNodes.length === 0 && !externalContext) {
      continue;
    }

    let pluginBlock = `### Active Plugin: ${name}\n`;
    if (manifest.description) {
      pluginBlock += `> ${manifest.description}\n\n`;
    }

    if (userProjects.length > 0) {
      pluginBlock += `#### Grounded User Projects & Bottlenecks\n`;
      for (const p of userProjects) {
        pluginBlock += `- **${p.title || p.slug}** (\`${p.source?.repo_path || 'local'}\`)\n`;
        if (p.description) pluginBlock += `  - Context: ${p.description}\n`;
        if (Array.isArray(p.enables) && p.enables.length > 0) {
          pluginBlock += `  - Active Frontier Unlocks: ${p.enables.join(', ')}\n`;
        }
      }
      pluginBlock += '\n';
    }

    if (benchmarks.length > 0) {
      pluginBlock += `#### State-of-the-Art Benchmark Ledger\n`;
      for (const b of benchmarks) {
        const src = b.source || {};
        const metric = src.metric_name || b.title;
        const current = `${src.current_record ?? '—'} ${src.unit || ''}`.trim();
        const prev = src.previous_record ? ` (Previous: ${src.previous_record} ${src.unit || ''})` : '';
        const status = src.verification_status ? ` | Status: ${src.verification_status}` : '';
        pluginBlock += `- **${metric}**: \`${current}\`${prev}${status}\n`;
        if (src.doi) pluginBlock += `  - Source/DOI: https://doi.org/${src.doi}\n`;
      }
      pluginBlock += '\n';
    }

    if (research.length > 0) {
      pluginBlock += `#### Verified Capability Breakthroughs\n`;
      for (const r of research) {
        const src = r.source || {};
        const tier = src.epistemic_tier ? `[Tier ${src.epistemic_tier}] ` : '';
        const modality = src.empirical_modality ? `(\`${src.empirical_modality}\`) ` : '';
        pluginBlock += `- ${tier}**${r.title || r.slug}** ${modality}\n`;
        if (r.description) pluginBlock += `  - ${r.description}\n`;
        if (src.doi) pluginBlock += `  - DOI: https://doi.org/${src.doi}\n`;
        if (Array.isArray(r.enables) && r.enables.length > 0) {
          pluginBlock += `  - Unlocks: ${r.enables.join(', ')}\n`;
        }
      }
      pluginBlock += '\n';
    }

    if (externalContext) {
      pluginBlock += `#### Deep Evolving Context Block\n${externalContext}\n\n`;
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
