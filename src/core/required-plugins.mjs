/** Required native capability installation checks; never opens credential state. */
import fs from 'node:fs';
import path from 'node:path';
import { readPluginsDir, PACKAGE_ROOT, resolvePluginFile } from './plugin-loader.mjs';
import { DEFAULT_PLUGIN_IDS } from './default-plugins.mjs';
import { comparePackageVersions } from './package-version.mjs';
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

/** Only a copy that declares an older release than the bundled one is refreshed; damaged same-release copies still fail. */
function isStaleInstall(target, source) {
  try {
    const installed = JSON.parse(fs.readFileSync(path.join(target, 'plugin.json'), 'utf8')).version;
    const bundled = JSON.parse(fs.readFileSync(path.join(source, 'plugin.json'), 'utf8')).version;
    return comparePackageVersions(installed, bundled) === -1;
  } catch { return false; }
}

export function ensureRequiredPlugins(brainDir, { sourceDir = path.join(PACKAGE_ROOT, 'scaffold', '.agent', 'skills', 'total-recall', 'plugins') } = {}) {
  // Validate the complete package before changing any installation.
  for (const id of DEFAULT_PLUGIN_IDS) {
    if (!fs.existsSync(path.join(sourceDir, id, 'plugin.json'))) throw new Error(`Required bundled ${id} plugin is missing`);
  }
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
  const report = inspectRequiredPlugins(brainDir);
  if (report.status !== 'ready') throw new Error(report.errors.join('; '));
  return report;
}
