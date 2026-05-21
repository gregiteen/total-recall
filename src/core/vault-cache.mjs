import fs from 'fs';
import { loadNodes } from './vault.mjs';
import { logger } from './logger.mjs';

let cachedNodes = null;
let watcher = null;
let currentVaultDir = null;

/**
 * Retrieves memory nodes from the in-memory cache if fresh, otherwise loads them from disk.
 * Automatically wires a file watcher on first load to track external changes.
 *
 * @param {string} vaultDir - Path to the memory vault directory
 * @returns {Array} List of memory node objects
 */
export function getNodes(vaultDir) {
  currentVaultDir = vaultDir;
  if (cachedNodes !== null) {
    logger.debug('Vault cache hit');
    return cachedNodes;
  }
  logger.info('Vault cache miss, loading nodes from disk', { vaultDir });
  cachedNodes = loadNodes(vaultDir);
  startWatcher(vaultDir);
  return cachedNodes;
}

/**
 * Invalidates the in-memory vault cache, forcing the next read to load from disk.
 */
export function invalidate() {
  logger.info('Vault cache invalidated');
  cachedNodes = null;
}

/**
 * Starts a filesystem watcher on the vault directory to automatically invalidate the cache
 * when external edits occur.
 *
 * @param {string} vaultDir - Path to the vault directory to watch
 */
function startWatcher(vaultDir) {
  if (watcher) return;
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
    watcher = fs.watch(vaultDir, { recursive: true }, (eventType, filename) => {
      if (filename && filename.endsWith('.md')) {
        logger.info(`Vault filesystem change detected (${eventType}: ${filename}), invalidating cache`);
        invalidate();
      }
    });
    // Unref the watcher so it does not prevent Node from exiting cleanly
    watcher.unref();
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
  currentVaultDir = vaultDir;
  startWatcher(vaultDir);
}
