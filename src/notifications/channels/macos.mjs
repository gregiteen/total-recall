/**
 * macos.mjs — macOS Desktop Notification Channel
 *
 * Uses terminal-notifier (if installed) to fire persistent notifications that open
 * the notification log on click. Falls back to osascript.
 * Only works on macOS (process.platform === 'darwin').
 */

import { execFileSync } from 'child_process';
import path from 'path';
import os from 'os';

const NOTIFY_LOG = path.join(os.homedir(), '.total-recall', 'notifications', 'notification-log.md');

/**
 * Send a macOS desktop notification.
 * @param {string} title
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export async function send(title, message) {
  if (process.platform !== 'darwin') return false;

  const displayTitle = String(title).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const safeMsg = String(message).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  try {
    // Try terminal-notifier first (standard)
    execFileSync('terminal-notifier', [
      '-title', title,
      '-message', message,
      '-open', `file://${NOTIFY_LOG}`,
      '-actions', 'View Log',
      '-closeLabel', 'Dismiss',
      '-group', 'total-recall-system'
    ], { timeout: 3000, stdio: 'ignore' });
    return true;
  } catch {
    // Fallback to plain osascript if terminal-notifier is not installed
    try {
      execFileSync('osascript', [
        '-e',
        `display notification "${safeMsg}" with title "${displayTitle}"`
      ], { timeout: 3000, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
