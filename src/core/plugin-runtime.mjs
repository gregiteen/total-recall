/** Generic in-process extension loading. Domain behavior stays with its owner. */
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { discoverPlugins, resolvePluginFile, PACKAGE_ROOT } from './plugin-loader.mjs';
import { pluginActivation } from './plugin-state.mjs';
import { logger } from './logger.mjs';

/**
 * Start every daemon service an active plugin declares in `runtime.daemon`.
 * Each named runtime module exports `start({ projectRoot })` and may return a
 * stop function. Services run against the global brain (home), never the
 * directory the daemon happens to start in. One failing service is logged and
 * never stops the others.
 * @returns {Promise<{ started: string[], failed: string[], stop: Function }>}
 */
export async function startPluginDaemonServices({ projectRoot = os.homedir(), load = loadPluginModule } = {}) {
  const stops = [];
  const started = [];
  const failed = [];
  for (const plugin of discoverPlugins(projectRoot).filter(item => item.valid)) {
    const names = plugin.manifest.runtime?.daemon || [];
    if (!names.length || !pluginActivation(plugin, { projectRoot }).enabled) continue;
    for (const name of names) {
      const label = `${plugin.id}:${name}`;
      try {
        const module = await load(plugin.id, name, { projectRoot, activeRequired: true });
        if (typeof module.start !== 'function') throw new Error('daemon module must export start()');
        const stop = await module.start({ projectRoot });
        if (typeof stop === 'function') stops.push(stop);
        started.push(label);
      } catch (err) {
        failed.push(label);
        logger.warn('plugin-runtime', `Daemon service ${label} failed to start: ${err.message}`);
      }
    }
  }
  return {
    started,
    failed,
    stop: () => { for (const stop of stops) { try { stop(); } catch { /* already stopped */ } } },
  };
}

export async function loadPluginModule(id, name, { activeRequired = false, requireValid = true, projectRoot = process.cwd() } = {}) {
  const plugin = discoverPlugins(projectRoot).find(item => item.id === id);
  // requireValid:false is for the preflight gate alone: a schema error elsewhere in a
  // manifest must not disable the module that keeps every tool call working.
  if (!plugin || (requireValid && !plugin.valid)) throw new Error(`Required plugin ${id} is missing or invalid`);
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
  // A file URL is unambiguous on every platform and under every module loader.
  return import(pathToFileURL(file).href);
}

export async function loadPluginRouters({ projectRoot = process.cwd(), discover = discoverPlugins, activation = pluginActivation } = {}) {
  const routers = [];
  for (const plugin of discover(projectRoot).filter(item => item.valid)) {
    for (const relative of plugin.manifest.runtime?.routers || []) {
      process.env.TR_PACKAGE_ROOT = PACKAGE_ROOT;
      const file = resolvePluginFile(plugin.dir, relative);
      const module = await import(process.platform === 'win32' ? pathToFileURL(file).href : file);
      if (typeof module.default !== 'function') throw new Error(`Plugin ${plugin.id} router must export middleware`);
      const guarded = function router(req, res, next) {
        const ownsPath = module.default.stack?.some(layer => layer.route && layer.match(req.path));
        const current = discover(projectRoot).find(item => item.id === plugin.id && item.valid && item.dir === plugin.dir);
        const enabled = current && activation(current, { projectRoot }).enabled;
        if (!enabled && ownsPath) return res.status(503).json({ error: `Plugin ${plugin.id} is unavailable or inactive` });
        if (!enabled) return next();
        return module.default(req, res, next);
      };
      // Preserve the real mounted route stack for API/CLI discovery.
      guarded.stack = module.default.stack;
      routers.push(guarded);
    }
  }
  return routers;
}

/** Dispatch only manifest-declared upgrade paths on the existing HTTP server.
 * Resolve current installation/activation for every handshake; never guess an
 * owner or filesystem path. Unknown paths and ambiguous ownership fail closed.
 */
export function createPluginUpgradeHandler({ projectRoot = process.cwd(), discover = discoverPlugins, activation = pluginActivation, load = loadPluginModule } = {}) {
  const deny = (socket, status) => socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  return async (request, socket, head) => {
    socket.on('error', () => {});
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const owners = discover(projectRoot).filter(plugin => plugin.valid).flatMap(plugin =>
        (plugin.manifest.runtime?.upgrades || []).filter(entry => entry.path === pathname).map(entry => ({ plugin, entry })),
      );
      if (!owners.length) return deny(socket, '404 Not Found');
      if (owners.length !== 1) return deny(socket, '503 Service Unavailable');
      const { plugin, entry } = owners[0];
      const isActive = () => {
        const current = discover(projectRoot).find(item => item.id === plugin.id && item.valid && item.dir === plugin.dir);
        return !!current && activation(current, { projectRoot }).enabled &&
          current.manifest.runtime?.upgrades?.some(item => item.path === pathname && item.module === entry.module);
      };
      if (!isActive()) return deny(socket, '503 Service Unavailable');
      const module = await load(plugin.id, entry.module, { projectRoot, activeRequired: true });
      if (!isActive()) return deny(socket, '503 Service Unavailable');
      if (typeof module.handleUpgrade !== 'function') throw new Error('Upgrade module must export handleUpgrade()');
      await module.handleUpgrade(request, socket, head, { isActive });
    } catch (error) {
      logger.warn('plugin-runtime', 'Plugin upgrade unavailable');
      if (!socket.destroyed) deny(socket, '503 Service Unavailable');
    }
  };
}

export function unavailablePluginOperation(id, operation) {
  return () => { throw new Error(`Install plugin ${id} to use ${operation}`); };
}
