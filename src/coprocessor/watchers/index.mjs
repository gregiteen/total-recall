/**
 * watchers/index.mjs — Dynamic Watcher Loader (Phase 11.1 + 12)
 *
 * Loads IDE-specific conversation watchers by name. Each watcher must export
 * a `createWatcher({ onNewTurns, ...opts })` function that returns
 * `{ stop(), getStatus() }`.
 *
 * Supports multiple concurrent watchers via a Map.
 *
 * Supported watchers:
 *   - antigravity  (Antigravity IDE — watches overview.txt)
 *   - claude-code  (Claude Code — watches ~/.claude/projects/ JSONL sessions)
 *   - aider        (Aider — watches .aider.chat.history.md)
 *   - cursor       (Cursor IDE — watches workspaceStorage conversation files)
 *   - generic      (User-specified path + format: jsonl|markdown|plaintext)
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Registry of available watcher modules (lazy-loaded)
const WATCHER_REGISTRY = {
  antigravity: () => import('./antigravity.mjs'),
  'claude-code': () => import('./claude-code.mjs'),
  aider: () => import('./aider.mjs'),
  cursor: () => import('./cursor.mjs'),
  generic: () => import('./generic.mjs'),
};

/**
 * Load a single watcher by name.
 *
 * @param {string} name - Watcher name (e.g., 'antigravity')
 * @param {Object} options - Options passed to createWatcher
 * @returns {Promise<{ stop: Function, getStatus: Function }>}
 * @throws {Error} If watcher is not found
 */
export async function loadWatcher(name, options) {
  const loader = WATCHER_REGISTRY[name];
  if (!loader) {
    const available = Object.keys(WATCHER_REGISTRY).join(', ');
    throw new Error(`Unknown watcher "${name}". Available: ${available}`);
  }

  const mod = await loader();
  if (typeof mod.createWatcher !== 'function') {
    throw new Error(`Watcher "${name}" does not export createWatcher()`);
  }

  return mod.createWatcher(options);
}

/**
 * Load multiple watchers and return a Map.
 * Config can be:
 *   - string: single watcher name (e.g., 'antigravity')
 *   - string[]: array of watcher names (e.g., ['antigravity', 'claude-code'])
 *   - object[]: array of watcher configs (e.g., [{ name: 'generic', path: '~/chat.log', format: 'jsonl' }])
 *
 * @param {string|Array<string|Object>} watcherConfig - Watcher name(s) or config(s)
 * @param {Object} options - Base options passed to each createWatcher (e.g., onNewTurns)
 * @returns {Promise<Map<string, { stop: Function, getStatus: Function }>>}
 */
export async function loadWatchers(watcherConfig, options) {
  // Normalize: string → array
  const configs = Array.isArray(watcherConfig)
    ? watcherConfig
    : [watcherConfig];

  const watchers = new Map();

  for (const config of configs) {
    const name = typeof config === 'string' ? config : config.name;
    const extraOpts = typeof config === 'object' ? config : {};
    const mergedOptions = { ...options, ...extraOpts };

    try {
      const watcher = await loadWatcher(name, mergedOptions);
      // Use a unique key for multiple generics
      const key = name === 'generic' && extraOpts.path
        ? `generic:${path.basename(extraOpts.path)}`
        : name;
      watchers.set(key, watcher);
    } catch (err) {
      // Log but don't fail — partial watcher loading is acceptable
      console.error(`⚠️  Failed to load watcher "${name}": ${err.message}`);
    }
  }

  return watchers;
}

/**
 * Stop all watchers in a Map.
 * @param {Map<string, { stop: Function }>} watchers
 */
export function stopAll(watchers) {
  for (const [, watcher] of watchers) {
    try { watcher.stop(); } catch { /* ignore */ }
  }
  watchers.clear();
}

/**
 * Get combined status from all watchers.
 * @param {Map<string, { getStatus: Function }>} watchers
 * @returns {Object<string, any>}
 */
export function getAllStatus(watchers) {
  const status = {};
  for (const [name, watcher] of watchers) {
    status[name] = watcher.getStatus();
  }
  return status;
}

/**
 * List all available watcher names.
 * @returns {string[]}
 */
export function listAvailable() {
  return Object.keys(WATCHER_REGISTRY);
}
