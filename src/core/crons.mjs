import { loadPluginModule as __loadOwnedPlugin } from './plugin-runtime.mjs';
import { logger } from './logger.mjs';
import { runGitHubSync, getGitHubSyncStatus } from './github-sync.mjs';
import { watchObsidianDirectory } from './obsidian-sync.mjs';
const { getSecret } = await __loadOwnedPlugin('auth', 'secrets-store');

/**
 * runCrons — scheduled background jobs.
 * @param {{ vaultDir: string, skillsDir: string, brainDir: string }} options
 */
export async function runCrons(options) {
  const { vaultDir, brainDir } = options;
  logger.info({ subsystem: 'cron', message: 'runCrons called — executing sync jobs.' });

  try {
    // 1. GitHub Sync
    const status = await getGitHubSyncStatus({ brainDir, vaultDir });
    if (status.configured) {
      await runGitHubSync({ brainDir, vaultDir });
    }

    // 2. Obsidian Sync (watch based, initialize once)
    try {
      const obSecret = await getSecret(brainDir, 'obsidian_dir');
      if (obSecret.found && obSecret.value) {
        watchObsidianDirectory(obSecret.value, vaultDir, brainDir);
      }
    } catch {
      // Obsidian not configured
    }

    // Package maintenance has its own wall-clock timer in this same daemon.
    // Task-count driven crons must never block the queue on npm installation.
  } catch (err) {
    logger.error({ subsystem: 'cron', message: `Cron execution failed: ${err.message}` });
  }
}
