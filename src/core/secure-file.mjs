/**
 * Secure file writes for credential-bearing files.
 *
 * `fs.writeFileSync`/`fs.appendFileSync` only apply their `mode` option when the
 * file is CREATED. Rewriting a file that already exists silently preserves the
 * old permissions, so a security.yml or secrets.enc that was ever created under
 * a loose umask (or restored from a backup, or copied by a sync) stays
 * world-readable forever no matter how many times it is rewritten with
 * `{ mode: 0o600 }`.
 *
 * Observed live: config/security.yml at mode 644 while holding the dashboard
 * bcrypt password_hash.
 *
 * Every writer of a file containing hashes, tokens, or key material must go
 * through here so the mode is re-asserted on every write, not just the first.
 */

import fs from 'fs';

export const SECRET_FILE_MODE = 0o600;

/**
 * Re-assert permissions on an existing file.
 *
 * @param {string} filePath
 * @param {number} [mode]
 * @returns {boolean} true when the mode was applied
 */
export function chmodSecure(filePath, mode = SECRET_FILE_MODE) {
  try {
    fs.chmodSync(filePath, mode);
    return true;
  } catch {
    // Best effort: chmod can fail on non-POSIX filesystems.
    return false;
  }
}

function requireSecureMode(filePath, mode) {
  if (!chmodSecure(filePath, mode)) {
    throw new Error(`Could not secure file permissions: ${filePath}`);
  }
}

/**
 * writeFileSync that actually enforces `mode` on rewrite.
 *
 * @param {string} filePath
 * @param {string|Buffer} data
 * @param {object} [options] same as fs.writeFileSync; `mode` defaults to 0o600
 */
export function writeFileSecure(filePath, data, options = {}) {
  const { mode = SECRET_FILE_MODE, ...rest } = options;
  if (fs.existsSync(filePath)) requireSecureMode(filePath, SECRET_FILE_MODE);
  fs.writeFileSync(filePath, data, { ...rest, mode });
  requireSecureMode(filePath, mode);
}

/**
 * appendFileSync that actually enforces `mode` on an existing file.
 *
 * @param {string} filePath
 * @param {string|Buffer} data
 * @param {object} [options] same as fs.appendFileSync; `mode` defaults to 0o600
 */
export function appendFileSecure(filePath, data, options = {}) {
  const { mode = SECRET_FILE_MODE, ...rest } = options;
  if (fs.existsSync(filePath)) requireSecureMode(filePath, SECRET_FILE_MODE);
  fs.appendFileSync(filePath, data, { ...rest, mode });
  requireSecureMode(filePath, mode);
}
