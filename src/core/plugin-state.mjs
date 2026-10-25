/** Read-only host activation, safe during configuration bootstrap. */
import fs from 'node:fs';
import path from 'node:path';
import matter from './frontmatter.mjs';
import { globalPluginsDir, projectPluginsDir, vaultForPluginsDir } from './plugin-loader.mjs';

/**
 * Enablement has two layers. The plugin's own brain holds the shared setting —
 * the global brain, since a shared plugin lives in one folder per machine. A
 * repository adds its own `plugin_record` in its project brain whose
 * `runtime_enabled` overrides that setting for that repository alone. With no
 * override the shared setting applies; an override carrying only a
 * `runtime_disabled: false` tombstone means "follow the shared setting" and
 * keeps no second copy of the plugin on disk.
 */
export function projectActivationOverride(id, projectRoot) {
  const pluginsDir = projectPluginsDir(projectRoot);
  const file = path.join(vaultForPluginsDir(pluginsDir), 'system', 'plugins', `${id}.md`);
  return { pluginsDir, file, record: readActivationRecord(file, id) };
}

export function pluginActivation(plugin, { projectRoot } = {}) {
  const pluginsDir = plugin.scope === 'scaffold' ? globalPluginsDir() : plugin.pluginsDir;
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(plugin.id)) throw new Error('Invalid plugin identity');
  const file = pluginsDir ? path.join(vaultForPluginsDir(pluginsDir), 'system', 'plugins', `${plugin.id}.md`) : null;
  const record = readActivationRecord(file, plugin.id);
  // Only a plugin owned by the shared (global) folder has an override to read:
  // a project's own copy already is that repository's setting.
  const override = plugin.scope === 'global' && projectRoot ? projectActivationOverride(plugin.id, projectRoot).record : null;
  const applied = override?.runtime_enabled;
  const source = typeof applied === 'boolean' ? 'project' : 'shared';
  const shared = record?.runtime_enabled !== false;
  const enabled = plugin.valid === true && (typeof applied === 'boolean' ? applied : shared);
  const runtime = plugin.manifest?.runtime || {};
  return {
    state: enabled ? 'active' : 'inactive', enabled, source,
    overridden: source === 'project' && applied !== shared,
    evidence: 'Host activation policy, not external process or provider health',
    hasRuntime: Boolean(plugin.manifest?.tasks?.length || Object.keys(runtime).length),
    externalRuntime: Boolean(runtime.jobs?.length || runtime.daemons?.length || runtime.startup?.length),
  };
}

/**
 * Whether execution is permitted. `pluginActivation` reports a plugin's policy
 * state, which includes whether the plugin is valid at all; a caller that
 * already holds a usable plugin object asks this instead, because the only thing
 * that switches execution off is an explicit negative — the shared setting or
 * the repository's own override.
 */
export function pluginExecutionEnabled(plugin, { projectRoot } = {}) {
  if (!plugin) return false;
  const pluginsDir = plugin.scope === 'scaffold' ? globalPluginsDir() : plugin.pluginsDir;
  if (!pluginsDir) return true;
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(plugin.id)) throw new Error('Invalid plugin identity');
  const file = path.join(vaultForPluginsDir(pluginsDir), 'system', 'plugins', `${plugin.id}.md`);
  const record = readActivationRecord(file, plugin.id);
  const override = plugin.scope === 'global' && projectRoot ? projectActivationOverride(plugin.id, projectRoot).record : null;
  const applied = override?.runtime_enabled;
  return typeof applied === 'boolean' ? applied : record?.runtime_enabled !== false;
}

/** Pure bootstrap read, avoiding configuration/kernel cycles; malformed existing policy fails closed. */
export function readActivationRecord(file, id) {
  if (!file) return null;
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Plugin policy must be a regular canonical document');
  let parent = path.dirname(file);
  for (let depth = 0; depth < 3; depth++, parent = path.dirname(parent)) {
    const directory = fs.lstatSync(parent);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Plugin policy cannot follow a linked vault path');
  }
  const record = matter(fs.readFileSync(file, 'utf8')).data;
  if (record.type !== 'plugin_record' || record.plugin_id !== id || ['title', 'description', 'timestamp'].some(key => typeof record[key] !== 'string' || !record[key].trim()) || record.runtime_enabled !== undefined && typeof record.runtime_enabled !== 'boolean') throw new Error('Plugin policy is malformed; repair it before execution');
  return record;
}
