import { logger } from './logger.mjs';
import { runGitHubSync, getGitHubSyncStatus } from './github-sync.mjs';
import { watchObsidianDirectory } from './obsidian-sync.mjs';
import { getSecret } from './secrets-store.mjs';
import { runPackageAutoUpdate } from './package-auto-update.mjs';

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

    // 3. npm package auto-update for registered projects (total-recall-brain)
    try {
      const pkg = await runPackageAutoUpdate({ brainDir });
      if (!pkg.skipped && (pkg.updated > 0 || pkg.failed > 0)) {
        logger.info({
          subsystem: 'cron',
          message: `package-auto-update: latest=${pkg.latest} updated=${pkg.updated} failed=${pkg.failed}`,
        });
      }
    } catch (err) {
      logger.warn({ subsystem: 'cron', message: `package-auto-update failed: ${err.message}` });
    }
  } catch (err) {
    logger.error({ subsystem: 'cron', message: `Cron execution failed: ${err.message}` });
  }
}
