/** Read-only host activation, safe during configuration bootstrap. */
import fs from 'node:fs';
import path from 'node:path';
import matter from './frontmatter.mjs';
import { globalPluginsDir, vaultForPluginsDir } from './plugin-loader.mjs';

export function pluginActivation(plugin) {
  const pluginsDir = plugin.scope === 'scaffold' ? globalPluginsDir() : plugin.pluginsDir;
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(plugin.id)) throw new Error('Invalid plugin identity');
  const file = pluginsDir ? path.join(vaultForPluginsDir(pluginsDir), 'system', 'plugins', `${plugin.id}.md`) : null;
  const record = file && fs.existsSync(file) ? matter(fs.readFileSync(file, 'utf8')).data : null;
  const enabled = plugin.valid === true && record?.runtime_enabled !== false;
  const runtime = plugin.manifest?.runtime || {};
  return {
    state: enabled ? 'active' : 'inactive', enabled,
    hasRuntime: Boolean(plugin.manifest?.tasks?.length || Object.keys(runtime).length),
    evidence: 'Host activation policy, not external process or provider health',
    externalRuntime: Boolean(runtime.jobs?.length || runtime.daemons?.length || runtime.startup?.length),
  };
}
