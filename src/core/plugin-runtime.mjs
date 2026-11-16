/** Generic in-process extension loading. Domain behavior stays with its owner. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverPlugins, resolvePluginFile, globalPluginsDir, PACKAGE_ROOT } from './plugin-loader.mjs';
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

const statStamp = (file, { content = true } = {}) => {
  try {
    const stat = fs.statSync(file);
    return content ? `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}` : `${stat.dev}:${stat.ino}`;
  } catch { return 'absent'; }
};

/** Cheap identity of one discovered plugin: its manifest, its directory and, for a bundled copy, the shared folder that can shadow it. */
function pluginStamp(plugin) {
  const shadow = plugin.scope === 'scaffold' ? statStamp(globalPluginsDir(), { content: true }) : '';
  return `${statStamp(plugin.manifestPath)}|${statStamp(plugin.dir, { content: false })}|${shadow}`;
}

/**
 * Re-resolve one plugin's current installation without scanning every plugin.
 * An unchanged stamp keeps the discovered record; any change (removal, new
 * owner directory, edited manifest, shadowing install) triggers one full
 * discovery whose answer is remembered against the new stamp, so a removed or
 * replaced plugin is denied immediately and costs no repeated scans.
 */
export function createPluginLocator({ projectRoot, discover = discoverPlugins } = {}) {
  const cheap = discover === discoverPlugins;
  const find = plugin => discover(projectRoot).find(item => item.id === plugin.id && item.valid && item.dir === plugin.dir) || null;
  const states = new WeakMap();
  const prime = plugin => {
    if (cheap && plugin.manifestPath && !states.has(plugin)) states.set(plugin, { stamp: pluginStamp(plugin), plugin });
    return plugin;
  };
  const current = plugin => {
    if (!cheap || !plugin.manifestPath) return find(plugin);
    const state = states.get(plugin) || prime(plugin) && states.get(plugin);
    const stamp = pluginStamp(plugin);
    if (stamp !== state.stamp) { state.stamp = stamp; state.plugin = find(plugin); }
    return state.plugin;
  };
  return { prime, current };
}

const ROUTER_RETRY_MS = 30_000;
const ROUTER_FAILED = Symbol('router-failed');

/**
 * One guarded Express middleware per declared plugin router. Only an enabled
 * plugin's code is imported (at start when already enabled, otherwise on its
 * first enabled request); a failing plugin is logged and isolated, never
 * stopping the other plugins or the REST API. Installation and activation are
 * checked on every request through the plugin's own cheap stamp.
 */
function createGuardedRouter({ plugin, relative, projectRoot, locator, activation, now, load }) {
  let module = null;
  let loading = null;
  let failedAt = 0;
  const guarded = function router(req, res, next) {
    let current = null;
    let enabled = false;
    try {
      current = locator.current(plugin);
      enabled = !!current && activation(current, { projectRoot }).enabled;
    } catch { /* unreadable activation state is inactive */ }
    const ownsPath = () => module?.default.stack?.some(layer => layer.route && layer.match(req.path));
    if (!enabled) {
      if (module && ownsPath()) return res.status(503).json({ error: `Plugin ${plugin.id} is unavailable or inactive` });
      return next();
    }
    if (module) return module.default(req, res, next);
    if (failedAt && now() - failedAt < ROUTER_RETRY_MS) return next();
    loading ||= load(current, relative).finally(() => { loading = null; });
    return loading.then((loaded) => {
      if (loaded === ROUTER_FAILED) { failedAt = now(); return next(); }
      module = loaded; guarded.stack = module.default.stack; failedAt = 0;
      return module.default(req, res, next);
    }, next);
  };
  guarded.stack = [];
  guarded.pluginId = plugin.id;
  guarded.preload = async (current) => {
    const loaded = await load(current, relative);
    if (loaded === ROUTER_FAILED) { failedAt = now(); return; }
    module = loaded; guarded.stack = module.default.stack;
  };
  return guarded;
}

export async function loadPluginRouters({ projectRoot = process.cwd(), discover = discoverPlugins, activation = pluginActivation, now = Date.now, importModule = href => import(href) } = {}) {
  const locator = createPluginLocator({ projectRoot, discover });
  const load = async (plugin, relative) => {
    try {
      process.env.TR_PACKAGE_ROOT = PACKAGE_ROOT;
      const module = await importModule(pathToFileURL(resolvePluginFile(plugin.dir, relative)).href);
      if (typeof module.default !== 'function') throw new Error('router must export middleware');
      return module;
    } catch (error) {
      logger.warn('plugin-runtime', `Plugin ${plugin.id} router unavailable: ${error.message}`);
      return ROUTER_FAILED;
    }
  };
  const routers = [];
  for (const plugin of discover(projectRoot).filter(item => item.valid)) {
    locator.prime(plugin);
    let enabled = false;
    try { enabled = activation(plugin, { projectRoot }).enabled; } catch { /* inactive */ }
    for (const relative of plugin.manifest.runtime?.routers || []) {
      const guarded = createGuardedRouter({ plugin, relative, projectRoot, locator, activation, now, load });
      // Inactive plugin code is never imported; its routes appear when it is enabled.
      if (enabled) await guarded.preload(plugin);
      routers.push(guarded);
    }
  }
  return routers;
}

const UPGRADE_INDEX_TTL_MS = 2000;
const UPGRADE_LOAD_TIMEOUT_MS = 5000;
const UPGRADE_PENDING_LIMIT = 64;

/** Dispatch only manifest-declared upgrade paths on the existing HTTP server.
 * Unknown paths are answered from a short-lived path index (denial only: it
 * never grants anything), so an unauthenticated client cannot force a plugin
 * scan per handshake. A declared path always re-resolves its owner's
 * installation and activation, and again after import; ambiguous or
 * unavailable ownership fails closed. Pending handshakes and owner imports are
 * bounded by a concurrency cap and a timeout.
 */
export function createPluginUpgradeHandler({ projectRoot = process.cwd(), discover = discoverPlugins, activation = pluginActivation, load = loadPluginModule, now = Date.now, ttlMs = UPGRADE_INDEX_TTL_MS, loadTimeoutMs = UPGRADE_LOAD_TIMEOUT_MS, pendingLimit = UPGRADE_PENDING_LIMIT } = {}) {
  const locator = createPluginLocator({ projectRoot, discover });
  const cheap = discover === discoverPlugins;
  const deny = (socket, status) => { if (!socket.destroyed) socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`); };
  let index = null;
  const directoriesStamp = () => cheap ? `${statStamp(globalPluginsDir())}|${statStamp(path.join(PACKAGE_ROOT, 'scaffold', '.agent', 'skills', 'total-recall', 'plugins'))}` : '';
  const upgradeIndex = () => {
    const stamp = directoriesStamp();
    if (index && index.stamp === stamp && now() - index.at < ttlMs) return index.paths;
    const paths = new Map();
    for (const plugin of discover(projectRoot).filter(item => item.valid)) {
      for (const entry of plugin.manifest.runtime?.upgrades || []) {
        locator.prime(plugin);
        paths.set(entry.path, [...(paths.get(entry.path) || []), { plugin, entry }]);
      }
    }
    index = { stamp, at: now(), paths };
    return paths;
  };
  let pending = 0;
  return async (request, socket, head) => {
    socket.on('error', () => {});
    let closed = false;
    socket.once?.('close', () => { closed = true; });
    let counted = false;
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const owners = upgradeIndex().get(pathname) || [];
      if (!owners.length) return deny(socket, '404 Not Found');
      if (owners.length !== 1) return deny(socket, '503 Service Unavailable');
      if (pending >= pendingLimit) return deny(socket, '503 Service Unavailable');
      pending++; counted = true;
      socket.setTimeout?.(loadTimeoutMs * 2, () => socket.destroy());
      const { plugin, entry } = owners[0];
      const isActive = () => {
        const current = locator.current(plugin);
        return !!current && activation(current, { projectRoot }).enabled &&
          current.manifest.runtime?.upgrades?.some(item => item.path === pathname && item.module === entry.module);
      };
      if (!isActive()) return deny(socket, '503 Service Unavailable');
      let timer;
      const module = await Promise.race([
        load(plugin.id, entry.module, { projectRoot, activeRequired: true }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Plugin upgrade module load timed out')), loadTimeoutMs); }),
      ]).finally(() => clearTimeout(timer));
      if (closed || socket.destroyed) return;
      if (!isActive()) return deny(socket, '503 Service Unavailable');
      if (typeof module.handleUpgrade !== 'function') throw new Error('Upgrade module must export handleUpgrade()');
      socket.setTimeout?.(0);
      if (counted) { pending--; counted = false; }
      await module.handleUpgrade(request, socket, head, { isActive });
    } catch (error) {
      logger.warn('plugin-runtime', 'Plugin upgrade unavailable');
      if (!socket.destroyed) deny(socket, '503 Service Unavailable');
    } finally {
      if (counted) pending--;
    }
  };
}

export function unavailablePluginOperation(id, operation) {
  return () => { throw new Error(`Install plugin ${id} to use ${operation}`); };
}
