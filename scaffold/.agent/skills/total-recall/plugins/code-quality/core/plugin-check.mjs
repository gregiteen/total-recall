/**
 * Validate the plugin in one repository: its manifest, every file the manifest names, its UI
 * blocks, and that its versions agree. Unlike `plugin chunks coverage`, which lists what is
 * installed and always succeeds, this reads the working tree and fails when something is wrong.
 *
 * Findings print as `file:line: error: message`, which the runner's generic parser reads.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hostRoot } from './host.mjs';

const hostModule = (name) => import(pathToFileURL(path.join(hostRoot(), 'src', 'core', name)).href);

/** Repo-relative files the manifest points at, as [what, path]. */
function referencedFiles(manifest) {
  const files = [];
  const add = (what, file) => { if (typeof file === 'string' && file) files.push([what, file]); };
  add('cli.handler', manifest.cli?.handler);
  add('compile.generator', manifest.compile?.generator);
  add('ui.design_tokens', manifest.ui?.design_tokens);
  add('capability.entry', manifest.capability?.entry);
  add('branding.logo', manifest.branding?.logo);
  for (const [name, file] of Object.entries(manifest.runtime?.modules || {})) add(`runtime.modules.${name}`, file);
  for (const [i, file] of (manifest.runtime?.routers || []).entries()) add(`runtime.routers[${i}]`, file);
  for (const [i, element] of (manifest.ui?.elements || []).entries()) add(`ui.elements[${i}].module`, element?.module);
  for (const [i, skill] of (manifest.skills || []).entries()) add(`skills[${i}].path`, skill?.path);
  for (const [i, command] of (manifest.commands || []).entries()) add(`commands[${i}].handler`, command?.handler);
  return files;
}

/** @returns {Promise<{ ok: boolean, errors: Array<{ file: string, message: string }>, warnings: string[] }>} */
export async function checkPlugin(repoRoot, { modules } = {}) {
  const root = fs.realpathSync(repoRoot);
  const errors = [];
  const warnings = [];
  const error = (file, message) => errors.push({ file, message });
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8')); }
  catch (err) { error('plugin.json', `cannot read the manifest: ${err.message}`); return { ok: false, errors, warnings }; }

  const { validatePluginManifest } = modules?.loader || await hostModule('plugin-loader.mjs');
  const result = validatePluginManifest(manifest);
  for (const message of result.errors || []) error('plugin.json', message);
  warnings.push(...(result.warnings || []));

  for (const [what, file] of referencedFiles(manifest)) {
    const target = path.resolve(root, file);
    if (target !== root && !target.startsWith(root + path.sep)) error('plugin.json', `${what} leaves the repository: ${file}`);
    else if (!fs.statSync(target, { throwIfNoEntry: false })?.isFile()) error('plugin.json', `${what} is missing: ${file}`);
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (pkg.version && manifest.version && pkg.version !== manifest.version) error('package.json', `version ${pkg.version} does not match plugin.json ${manifest.version}`);
  } catch (err) {
    if (err.code !== 'ENOENT') error('package.json', `cannot read package.json: ${err.message}`);
  }

  const chunkDir = path.join(root, 'ui', 'chunks');
  if (fs.existsSync(chunkDir) && result.valid) {
    const { validateUiChunkFile } = modules?.chunks || await hostModule('ui-chunks.mjs');
    for (const name of fs.readdirSync(chunkDir).filter((f) => f.endsWith('.md')).sort()) {
      const file = path.join(chunkDir, name);
      try { validateUiChunkFile(file, { pluginDir: root }); }
      catch (err) { error(path.join('ui', 'chunks', name), err.message); }
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function formatPluginCheck({ errors, warnings }) {
  const one = (text) => String(text).replace(/\s+/g, ' ').trim();
  return [
    ...errors.map((e) => `${e.file}:1: error: ${one(e.message)}`),
    ...warnings.map((w) => `note: ${one(w)}`),
  ].join('\n');
}
