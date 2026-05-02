/**
 * macos.mjs — macOS Desktop Notification Channel
 *
 * Uses osascript to fire native macOS notifications.
 * Only works on macOS (process.platform === 'darwin').
 *
 * SECURITY: Input is piped via stdin to avoid shell injection.
 */

import { execFileSync } from 'child_process';

/**
 * Send a macOS desktop notification.
 * @param {string} title
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export async function send(title, message) {
  if (process.platform !== 'darwin') return false;

  try {
    // Escape AppleScript string characters (backslash and double-quote)
    const safeTitle = String(title).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const safeMsg = String(message).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    // Use execFileSync with argument array — no shell interpolation
    execFileSync('osascript', [
      '-e',
      `display notification "${safeMsg}" with title "${safeTitle}"`,
    ], { timeout: 3000, stdio: 'ignore' });

    return true;
  } catch {
    return false;
  }
}
