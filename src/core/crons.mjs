import { logger } from './logger.mjs';

/**
 * runCrons — scheduled background jobs.
 * Real cron jobs (GitHub Sync, Obsidian Sync) are implemented in Phase 4.
 * This shell preserves the export contract so daemon-loop.mjs doesn't break.
 * @param {{ vaultDir: string, skillsDir: string, brainDir: string }} options
 */
export async function runCrons(_options) {
  // No active crons yet — real implementations added in Phase 4.
  // Do NOT add stub jobs that log false success messages.
  logger.info({ subsystem: 'cron', message: 'runCrons called — no active cron jobs registered.' });
}
