import fs from 'fs';
import path from 'path';
import { loadNodes } from './vault.mjs';
import { logger } from './logger.mjs';
import { brainDir } from './config.mjs';

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
 * @param {string} [vaultDir] - Path to the memory vault directory
 * @returns {Array} List of memory node objects
 */
export function getNodes(vaultDir) {
  const resolvedDir = vaultDir || path.join(brainDir, 'memory-vault');
  const entry = cacheMap.get(resolvedDir);
  if (entry?.nodes !== null && entry?.nodes !== undefined) {
    logger.debug('Vault cache hit', { vaultDir: resolvedDir });
    return entry.nodes;
  }
  logger.info('Vault cache miss, loading nodes from disk', { vaultDir: resolvedDir });
  const nodes = loadNodes(resolvedDir);
  if (entry) {
    entry.nodes = nodes;
  } else {
    cacheMap.set(resolvedDir, { nodes, watcher: null });
    startWatcher(resolvedDir);
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
    const resolvedDir = vaultDir || path.join(brainDir, 'memory-vault');
    const entry = cacheMap.get(resolvedDir);
    if (entry) {
      logger.info('Vault cache invalidated', { vaultDir: resolvedDir });
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
 * Watches a directory tree without keeping the process alive.
 *
 * macOS and Windows implement `fs.watch({ recursive: true })` natively as one
 * handle, so `unref()` works. On Linux, Node emulates it with one inotify
 * watcher per subdirectory and `unref()` on the returned object does not reach
 * them, so every CLI command that touched the vault cache hung after printing
 * its result. There, each directory gets its own non-recursive, unref'd
 * watcher instead; directories created later are picked up as they appear.
 *
 * @param {string} root - Directory to watch
 * @param {(eventType: string, filename: string) => void} onChange - Receives paths relative to root
 * @returns {{ close: () => void }}
 */
function watchTree(root, onChange) {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    const watcher = fs.watch(root, { recursive: true }, onChange);
    watcher.unref();
    return watcher;
  }

  const watchers = new Map();
  const watchDir = (dir) => {
    if (watchers.has(dir)) return;
    let watcher;
    try {
      watcher = fs.watch(dir, (eventType, filename) => {
        if (!filename) return;
        const full = path.join(dir, String(filename));
        if (eventType === 'rename') {
          try {
            if (fs.statSync(full).isDirectory()) walk(full);
          } catch {
            // Removed; its watcher closes itself on error.
          }
        }
        onChange(eventType, path.relative(root, full));
      });
    } catch {
      return;
    }
    watcher.on('error', () => {
      watcher.close();
      watchers.delete(dir);
    });
    watcher.unref();
    watchers.set(dir, watcher);
  };
  const walk = (dir) => {
    watchDir(dir);
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of entries) {
      if (item.isDirectory()) walk(path.join(dir, item.name));
    }
  };
  walk(root);
  return {
    close() {
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
}

/**
 * Starts a filesystem watcher on the vault directory to automatically invalidate the cache
 * when external edits occur.
 *
 * @param {string} [vaultDir] - Path to the vault directory to watch
 */
function startWatcher(vaultDir) {
  const resolvedDir = vaultDir || path.join(brainDir, 'memory-vault');
  const entry = cacheMap.get(resolvedDir);
  if (!entry || entry.watcher) return;

  if (!fs.existsSync(resolvedDir)) {
    try {
      fs.mkdirSync(resolvedDir, { recursive: true });
    } catch (err) {
      logger.error('Failed to create vault directory for watcher', { error: err.message });
      return;
    }
  }

  logger.info('Starting filesystem watcher for vault cache', { vaultDir: resolvedDir });
  try {
    entry.watcher = watchTree(resolvedDir, (eventType, filename) => {
      if (filename && filename.endsWith('.md')) {
        logger.info(`Vault filesystem change detected (${eventType}: ${filename}), invalidating cache`);
        invalidate(resolvedDir);
      }
    });
  } catch (err) {
    logger.warn('Failed to start vault fs watcher, cache will rely on explicit invalidations', { error: err.message });
  }
}

/**
 * Explicitly boots the filesystem watcher for the vault directory.
 *
 * @param {string} [vaultDir] - Path to the vault directory to watch
 */
export function start(vaultDir) {
  const resolvedDir = vaultDir || path.join(brainDir, 'memory-vault');
  if (!cacheMap.has(resolvedDir)) {
    cacheMap.set(resolvedDir, { nodes: null, watcher: null });
  }
  startWatcher(resolvedDir);
}
