import fs from 'node:fs';
import path from 'node:path';
import { invalidate, getNodes } from './vault-cache.mjs';
import { compileSurface } from './surface.mjs';
import { buildEmbeddingsIndex, buildSessionEmbeddingsIndex } from './embeddings.mjs';
import { logger } from './logger.mjs';

/**
 * Vault Watcher
 * Watches the memory-vault directory for external edits (e.g., from Obsidian).
 * Debounces changes and triggers cache invalidation, surface compilation, and embeddings rebuild.
 */

let recompileTimer = null;
const RECOMPILE_DEBOUNCE_MS = 2000;
let watcher = null;
let stopWrapper = null;

export function startVaultWatcher(vaultDir, skillsDir, derivedDir, sessionsDir, instructionsFile) {
  if (watcher && stopWrapper) return stopWrapper;
  
  if (!fs.existsSync(vaultDir)) {
    fs.mkdirSync(vaultDir, { recursive: true });
  }

  const callback = (eventType, filename) => {
    // Only react to markdown files
    if (!filename || !filename.endsWith('.md')) return;

    // Immediately invalidate the cache so subsequent reads see the change
    invalidate(vaultDir);

    if (recompileTimer) clearTimeout(recompileTimer);
    recompileTimer = setTimeout(async () => {
      recompileTimer = null;
      try {
        logger.info({
          subsystem: 'vault-watcher',
          message: `Detected external edits (${filename} etc). Recompiling surface and embeddings...`,
        });

        // 1. Recompile instructions surface
        await compileSurface({
          vaultDir,
          skillsDir,
          derivedDir,
          instructionsFile,
        });

        // 2. Rebuild embeddings
        try {
          const vaultNodes = getNodes(vaultDir);
          await buildEmbeddingsIndex(vaultNodes, derivedDir);
          await buildSessionEmbeddingsIndex(sessionsDir, derivedDir);
        } catch (embedErr) {
          // local_llm/embeddings offline non-fatal
        }

        logger.info({
          subsystem: 'vault-watcher',
          message: 'Finished rebuilding index for external changes.',
        });
      } catch (err) {
        logger.error({
          subsystem: 'vault-watcher',
          message: `Recompile failed: ${err.message}`,
        });
      }
    }, RECOMPILE_DEBOUNCE_MS);
  };

  try {
    watcher = fs.watch(vaultDir, { recursive: false }, callback);
    logger.info({
      subsystem: 'vault-watcher',
      message: `Watching ${vaultDir} for external Obsidian edits`,
    });
  } catch (err) {
    logger.error({
      subsystem: 'vault-watcher',
      message: `Failed to start vault watcher: ${err.message}`,
    });
  }

  stopWrapper = {
    stop() {
      if (watcher) {
        try { watcher.close(); } catch {}
        watcher = null;
        stopWrapper = null;
      }
    }
  };
  return stopWrapper;
}
