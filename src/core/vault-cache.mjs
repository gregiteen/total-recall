import fs from 'fs';
import { loadNodes } from './vault.mjs';
import { logger } from './logger.mjs';

/**
 * Per-directory vault cache with fs.watch auto-invalidation.
 * Supports multiple vault directories (global + project brains)
 * without cross-contamination.
 */
const cacheMap = new Map();   // vaultDir → { nodes, watcher }

/**
 * Retrieves memory nodes from the in-memory cache if fresh, otherwise loads them from disk.
 * Automatically wires a file watcher on first load to track external changes.
 * Supports multiple vault directories simultaneously (global + project).
 *
 * @param {string} vaultDir - Path to the memory vault directory
 * @returns {Array} List of memory node objects
 */
export function getNodes(vaultDir) {
  const entry = cacheMap.get(vaultDir);
  if (entry?.nodes !== null && entry?.nodes !== undefined) {
    logger.debug('Vault cache hit', { vaultDir });
    return entry.nodes;
  }
  logger.info('Vault cache miss, loading nodes from disk', { vaultDir });
  const nodes = loadNodes(vaultDir);
  if (entry) {
    entry.nodes = nodes;
  } else {
    cacheMap.set(vaultDir, { nodes, watcher: null });
    startWatcher(vaultDir);
  }
  return nodes;
}

/**
 * Invalidates the in-memory vault cache for a specific directory,
 * or all directories if none specified.
 * Forces the next read to reload from disk.
 *
 * @param {string} [vaultDir] - Optional specific vault dir to invalidate. If omitted, invalidates all.
 */
export function invalidate(vaultDir) {
  if (vaultDir) {
    const entry = cacheMap.get(vaultDir);
    if (entry) {
      logger.info('Vault cache invalidated', { vaultDir });
      entry.nodes = null;
    }
  } else {
    logger.info('Vault cache invalidated (all)');
    for (const entry of cacheMap.values()) {
      entry.nodes = null;
    }
  }
}

/**
 * Starts a filesystem watcher on the vault directory to automatically invalidate the cache
 * when external edits occur.
 *
 * @param {string} vaultDir - Path to the vault directory to watch
 */
function startWatcher(vaultDir) {
  const entry = cacheMap.get(vaultDir);
  if (!entry || entry.watcher) return;

  if (!fs.existsSync(vaultDir)) {
    try {
      fs.mkdirSync(vaultDir, { recursive: true });
    } catch (err) {
      logger.error('Failed to create vault directory for watcher', { error: err.message });
      return;
    }
  }

  logger.info('Starting filesystem watcher for vault cache', { vaultDir });
  try {
    const watcher = fs.watch(vaultDir, { recursive: true }, (eventType, filename) => {
      if (filename && filename.endsWith('.md')) {
        logger.info(`Vault filesystem change detected (${eventType}: ${filename}), invalidating cache`);
        invalidate(vaultDir);
      }
    });
    // Unref the watcher so it does not prevent Node from exiting cleanly
    watcher.unref();
    entry.watcher = watcher;
  } catch (err) {
    logger.warn('Failed to start vault fs watcher, cache will rely on explicit invalidations', { error: err.message });
  }
}

/**
 * Explicitly boots the filesystem watcher for the vault directory.
 *
 * @param {string} vaultDir - Path to the vault directory to watch
 */
export function start(vaultDir) {
  if (!cacheMap.has(vaultDir)) {
    cacheMap.set(vaultDir, { nodes: null, watcher: null });
  }
  startWatcher(vaultDir);
}
