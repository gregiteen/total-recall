import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from './logger.mjs';

const execFileAsync = promisify(execFile);

/**
 * Sends a macOS desktop notification using terminal-notifier if available,
 * falling back to osascript.
 *
 * @param {string} title - The notification title
 * @param {string} message - The notification message content
 * @param {object} [options] - Additional parameters
 * @param {string} [options.open] - Absolute path or URL to open on clicking "Open" or "Show"
 * @param {string} [options.sound] - macOS sound name (e.g., 'Glass', 'Hero', 'Sosumi', 'default')
 * @param {string} [options.subtitle] - Subtitle text to show
 * @param {string} [options.group] - Group ID to allow notification replacement rather than stacking
 */
export async function sendSystemNotification(title, message, options = {}) {
  // Bypassed in tests
  const isTest = process.env.VITEST || process.env._TR_TEST_AGENT_DIR || process.env.NODE_ENV === 'test';
  if (isTest) {
    logger.debug('notifications: bypassing system notification in test environment');
    return;
  }

  const {
    open,
    sound = 'default',
    subtitle = 'Total Recall',
    group = 'total-recall-system'
  } = options;

  // Sanitize inputs to prevent unexpected arguments/escaping issues
  const cleanMessage = String(message).replace(/[^ -~]/g, '').replace(/["'`$\\]/g, '').slice(0, 200);
  const cleanTitle = String(title).replace(/[^ -~]/g, '').replace(/["'`$\\]/g, '').slice(0, 100);
  const cleanSubtitle = subtitle ? String(subtitle).replace(/[^ -~]/g, '').replace(/["'`$\\]/g, '').slice(0, 100) : '';

  try {
    // 1. Try terminal-notifier first (supports click actions, custom sounds, subtitles, grouping)
    const args = [
      '-title', cleanTitle,
      '-message', cleanMessage,
      '-group', group,
    ];
    if (cleanSubtitle) {
      args.push('-subtitle', cleanSubtitle);
    }
    if (open) {
      // Ensure file url is correct format or HTTP(S) URL
      const openTarget = (open.startsWith('/') || open.startsWith('~')) ? `file://${open}` : open;
      args.push('-open', openTarget);
      args.push('-actions', 'Open');
    }
    if (sound && sound !== 'default') {
      args.push('-sound', sound);
    }

    await execFileAsync('terminal-notifier', args, { timeout: 3000 });
    logger.debug('notifications: successfully sent notification via terminal-notifier', { title, message });
  } catch (err) {
    // 2. Fall back to plain AppleScript display notification if terminal-notifier fails
    try {
      const appleScriptParts = [
        `display notification "${cleanMessage.replace(/"/g, '\\"')}"`,
        `with title "${cleanTitle.replace(/"/g, '\\"')}"`
      ];
      if (sound && sound !== 'default') {
        appleScriptParts.push(`sound name "${sound}"`);
      }
      await execFileAsync('osascript', ['-e', appleScriptParts.join(' ')], { timeout: 3000 });
      logger.debug('notifications: successfully sent fallback osascript notification', { title, message });
    } catch (fallbackErr) {
      logger.debug('notifications: both terminal-notifier and osascript failed', { err: fallbackErr.message });
    }
  }
}
