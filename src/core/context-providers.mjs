/** Native, read-only task evidence extensions. Domain retrieval stays in its owner plugin. */
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { discoverPlugins, resolvePluginFile } from './plugin-loader.mjs';
import { pluginActivation } from './plugin-state.mjs';

const detail = value => String(value?.message || value).replace(/\s+/g, ' ').slice(0, 160);
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

/** The same contract serves CLI and HTTP consumers; never spawn a CLI from an HTTP request. */
export async function retrievePluginContext({ task, projectRoot = process.cwd(), actions = [],
  limit = 6, maxChars = 1400, timeoutMs = 2500, plugins, loadModule } = {}) {
  const root = fs.realpathSync(projectRoot);
  const diagnostics = [], candidates = [], coverage = [];
  let installed;
  try { installed = plugins || discoverPlugins(projectRoot); }
  catch (error) { return { candidates, coverage, diagnostics: [`plugin discovery failed: ${detail(error)}`] }; }
  const owners = installed.filter(plugin => plugin.valid && plugin.manifest?.runtime?.modules?.['context-provider'] &&
    (plugins || pluginActivation(plugin, { projectRoot }).enabled)).sort((a, b) => a.id.localeCompare(b.id));
  if (owners.length > 4) diagnostics.push(`provider limit: using 4 of ${owners.length} declared providers`);
  const reports = await Promise.all(owners.slice(0, 4).map(async plugin => {
    let timer;
    const controller = new AbortController();
    try {
      const file = resolvePluginFile(plugin.dir, plugin.manifest.runtime.modules['context-provider']);
      const load = loadModule || (async source => {
        const url = pathToFileURL(source);
        url.searchParams.set('mtime', String(fs.statSync(source).mtimeMs));
        return import(url.href);
      });
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('task context provider timed out')); }, timeoutMs);
      });
      const result = await Promise.race([(async () => {
        const mod = await load(file);
        if (typeof mod.retrieveContext !== 'function') throw new Error('provider must export retrieveContext');
        return mod.retrieveContext({ task, projectRoot: root, actions, limit, maxChars, signal: controller.signal });
      })(), timeout]);
      if (!result || !Array.isArray(result.candidates)) throw new Error('provider returned no candidates array');
      const accepted = [], errors = (result.diagnostics || []).slice(0, 3).map(detail);
      for (const row of result.candidates.slice(0, limit)) {
        try {
          const source = row.source;
          if (!row.id || typeof row.text !== 'string' || !row.text.trim() || row.text.length > maxChars) throw new Error('invalid or oversized passage');
          if (!source || !path.isAbsolute(source.path || '') || !/^[a-f0-9]{64}$/.test(source.hash || '') ||
            !Number.isInteger(source.startLine) || !Number.isInteger(source.endLine) || source.startLine < 1 || source.endLine < source.startLine) throw new Error('passage provenance is incomplete');
          if (!inside(root, fs.realpathSync(source.path))) throw new Error('passage source escapes the selected workspace');
          accepted.push({ id: `plugin:${plugin.id}:${String(row.id).slice(0, 180)}`, title: String(row.title || row.id).slice(0, 160),
            text: row.text.trim(), score: Math.max(0, Math.min(1, Number(row.score) || 0)),
            source: { kind: String(source.kind || 'plugin'), path: source.path, startLine: source.startLine, endLine: source.endLine,
              hash: source.hash, stale: source.stale ?? 'unknown', ...(row.relatedTo ? { relatedTo: String(row.relatedTo).slice(0, 180) } : {}) },
            provider: plugin.id });
        } catch (error) { errors.push(detail(error)); }
      }
      return { id: plugin.id, candidates: accepted, diagnostics: errors.slice(0, 3), coverage: result.coverage || { scope: 'unspecified' } };
    } catch (error) { return { id: plugin.id, candidates: [], diagnostics: [detail(error)], coverage: { available: false } }; }
    finally { clearTimeout(timer); }
  }));
  for (const report of reports) {
    candidates.push(...report.candidates);
    coverage.push({ provider: report.id, ...report.coverage });
    diagnostics.push(...report.diagnostics.map(message => `${report.id}: ${message}`));
  }
  return { candidates, diagnostics, coverage };
}
