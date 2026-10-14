/** Read-only host activation, safe during configuration bootstrap. */
import fs from 'node:fs';
import path from 'node:path';
import matter from './frontmatter.mjs';
import { globalPluginsDir, vaultForPluginsDir } from './plugin-loader.mjs';

export function pluginActivation(plugin) {
  const pluginsDir = plugin.scope === 'scaffold' ? globalPluginsDir() : plugin.pluginsDir;
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(plugin.id)) throw new Error('Invalid plugin identity');
  const file = pluginsDir ? path.join(vaultForPluginsDir(pluginsDir), 'system', 'plugins', `${plugin.id}.md`) : null;
  const record = readActivationRecord(file, plugin.id);
  const enabled = plugin.valid === true && record?.runtime_enabled !== false;
  const runtime = plugin.manifest?.runtime || {};
  return {
    state: enabled ? 'active' : 'inactive', enabled,
    hasRuntime: Boolean(plugin.manifest?.tasks?.length || Object.keys(runtime).length),
    evidence: 'Host activation policy, not external process or provider health',
    externalRuntime: Boolean(runtime.jobs?.length || runtime.daemons?.length || runtime.startup?.length),
  };
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
