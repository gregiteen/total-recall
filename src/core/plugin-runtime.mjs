/** Generic in-process extension loading. Domain behavior stays with its owner. */
import { pathToFileURL } from 'node:url';
import { discoverPlugins, resolvePluginFile, PACKAGE_ROOT } from './plugin-loader.mjs';

export async function loadPluginModule(id, name, {} = {}) {
  const plugin = discoverPlugins(process.cwd()).find(item => item.id === id);
  if (!plugin?.valid) throw new Error(`Required plugin ${id} is missing or invalid`);
  const relative = plugin.manifest.runtime?.modules?.[name];
  if (!relative) {
    throw new Error(`Plugin ${id} does not provide runtime module ${name}`);
  }
  process.env.TR_PACKAGE_ROOT = PACKAGE_ROOT;
  const file = resolvePluginFile(plugin.dir, relative);
  return import(process.platform === 'win32' ? pathToFileURL(file).href : file);
}

export async function loadPluginRouters() {
  const routers = [];
  for (const plugin of discoverPlugins(process.cwd()).filter(item => item.valid)) {
    for (const relative of plugin.manifest.runtime?.routers || []) {
      process.env.TR_PACKAGE_ROOT = PACKAGE_ROOT;
      const file = resolvePluginFile(plugin.dir, relative);
      const module = await import(process.platform === 'win32' ? pathToFileURL(file).href : file);
      if (typeof module.default !== 'function') throw new Error(`Plugin ${plugin.id} router must export middleware`);
      routers.push(module.default);
    }
  }
  return routers;
}

export function unavailablePluginOperation(id, operation) {
  return () => { throw new Error(`Install plugin ${id} to use ${operation}`); };
}
