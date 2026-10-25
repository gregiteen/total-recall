/** Generic in-process extension loading. Domain behavior stays with its owner. */
import { pathToFileURL } from 'node:url';
import { discoverPlugins, resolvePluginFile, PACKAGE_ROOT } from './plugin-loader.mjs';
import { pluginActivation } from './plugin-state.mjs';

export async function loadPluginModule(id, name, { activeRequired = false, projectRoot = process.cwd() } = {}) {
  const plugin = discoverPlugins(projectRoot).find(item => item.id === id);
  if (!plugin?.valid) throw new Error(`Required plugin ${id} is missing or invalid`);
  if (activeRequired && !pluginActivation(plugin, { projectRoot }).enabled) throw new Error(`Plugin ${id} is inactive`);
  // Pure bootstrap bindings remain importable so an inactive auth/config owner
  // cannot prevent the management CLI from turning it back on. Execution is
  // gated at the runner, scheduler and mounted router boundaries.
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
  const projectRoot = process.cwd();
  for (const plugin of discoverPlugins(projectRoot).filter(item => item.valid)) {
    for (const relative of plugin.manifest.runtime?.routers || []) {
      process.env.TR_PACKAGE_ROOT = PACKAGE_ROOT;
      const file = resolvePluginFile(plugin.dir, relative);
      const module = await import(process.platform === 'win32' ? pathToFileURL(file).href : file);
      if (typeof module.default !== 'function') throw new Error(`Plugin ${plugin.id} router must export middleware`);
      const guarded = function router(req, res, next) {
        const ownsPath = module.default.stack?.some(layer => layer.route && layer.match(req.path));
        if (!pluginActivation(plugin, { projectRoot }).enabled && ownsPath) return res.status(503).json({ error: `Plugin ${plugin.id} is inactive` });
        if (!pluginActivation(plugin, { projectRoot }).enabled) return next();
        return module.default(req, res, next);
      };
      // Preserve the real mounted route stack for API/CLI discovery.
      guarded.stack = module.default.stack;
      routers.push(guarded);
    }
  }
  return routers;
}

export function unavailablePluginOperation(id, operation) {
  return () => { throw new Error(`Install plugin ${id} to use ${operation}`); };
}
