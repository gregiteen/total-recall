/** Required native capability installation checks; never opens credential state. */
import fs from 'node:fs';
import path from 'node:path';
import { readPluginsDir, PACKAGE_ROOT, resolvePluginFile } from './plugin-loader.mjs';
import { DEFAULT_PLUGIN_IDS } from './default-plugins.mjs';
import { preparePluginDependencies } from './plugin-dependencies.mjs';

export function inspectRequiredPlugins(brainDir) {
  const plugins = readPluginsDir(path.join(brainDir, 'plugins'), 'required');
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
  return { status: errors.length ? 'failed' : 'ready', errors };
}

export function ensureRequiredPlugins(brainDir, { sourceDir = path.join(PACKAGE_ROOT, 'scaffold', '.agent', 'skills', 'total-recall', 'plugins') } = {}) {
  // Validate the complete package before changing any installation.
  for (const id of DEFAULT_PLUGIN_IDS) {
    if (!fs.existsSync(path.join(sourceDir, id, 'plugin.json'))) throw new Error(`Required bundled ${id} plugin is missing`);
  }
  for (const id of DEFAULT_PLUGIN_IDS) {
  const target = path.join(brainDir, 'plugins', id);
  if (!fs.existsSync(target)) {
    const source = path.join(sourceDir, id);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: true });
  }
  preparePluginDependencies(target);
  }
  const report = inspectRequiredPlugins(brainDir);
  if (report.status !== 'ready') throw new Error(report.errors.join('; '));
  return report;
}
