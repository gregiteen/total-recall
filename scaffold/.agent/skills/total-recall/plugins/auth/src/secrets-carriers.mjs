/**
 * Where the secrets-store master password lives on this host.
 *
 * The sanctioned carriers are owner-only: the macOS Keychain, the launchd
 * agent plist and `~/.agent/tr.env`. An `export TR_SECRETS_PASSWORD=…` in a
 * shell profile or in /etc/environment is ambient: every process started from
 * a shell (or, for /etc/environment, every login) inherits it, and a process
 * manager such as pm2 then captures it into each app it starts. This module
 * finds those exports and removes them once a sanctioned carrier holds the
 * same password. It reports files and line numbers, never values.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { secretsPassword } from './secrets-gateway.mjs';

const EXPORT = /^\s*(?:export\s+)?(?:TR_SECRETS_PASSWORD|TR_MASTER_PASSWORD)\s*=/;
const PROFILES = ['.bashrc', '.bash_profile', '.profile', '.zshrc', '.zprofile', '.zshenv'];

/** Shell and system files that can make the password ambient. */
export function ambientCandidateFiles({ home = os.homedir(), etc = '/etc' } = {}) {
  const files = PROFILES.map((name) => path.join(home, name));
  files.push(path.join(etc, 'environment'), path.join(etc, 'profile'), path.join(etc, 'zshenv'));
  try {
    for (const name of fs.readdirSync(path.join(etc, 'profile.d'))) {
      if (name.endsWith('.sh')) files.push(path.join(etc, 'profile.d', name));
    }
  } catch { /* no profile.d */ }
  return files;
}

/** Lines that export the master password, by file. */
export function findAmbientPasswordExports(files = ambientCandidateFiles()) {
  const found = [];
  for (const file of files) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const lines = text.split('\n').map((line, index) => (EXPORT.test(line) ? index + 1 : 0)).filter(Boolean);
    if (lines.length) found.push({ file, lines });
  }
  return found;
}

/** The password a sanctioned carrier returns with the environment ignored. */
export function carrierPassword(env = process.env, resolve = secretsPassword) {
  const quiet = { ...env };
  delete quiet.TR_SECRETS_PASSWORD;
  delete quiet.TR_MASTER_PASSWORD;
  return resolve({ env: quiet }) || null;
}

/**
 * Remove ambient exports, only when a sanctioned carrier already returns the
 * password this process was given; otherwise the store would be locked out.
 *
 * @param {{ files?: string[], env?: object, resolve?: Function }} [opts]
 */
export function removeAmbientPasswordExports({ files = ambientCandidateFiles(), env = process.env, resolve = secretsPassword } = {}) {
  const exports = findAmbientPasswordExports(files);
  if (!exports.length) return { removed: [], carrier: 'not-checked' };
  const current = env.TR_SECRETS_PASSWORD || env.TR_MASTER_PASSWORD;
  const carried = carrierPassword(env, resolve);
  if (!carried) throw new Error('No owner-only carrier (Keychain, launchd agent or ~/.agent/tr.env) holds the master password; set one with `auth secret rekey --env-file|--keychain` before removing ambient exports');
  if (current && carried !== current) throw new Error('The owner-only carrier holds a different password than this environment; reconcile them before removing ambient exports');
  const removed = [];
  for (const { file, lines } of exports) {
    const text = fs.readFileSync(file, 'utf8');
    const kept = text.split('\n').filter((line) => !EXPORT.test(line)).join('\n');
    const mode = fs.statSync(file).mode & 0o777;
    const tmp = `${file}.tr-tmp-${process.pid}`;
    fs.writeFileSync(tmp, kept, { mode });
    fs.renameSync(tmp, file);
    removed.push({ file, lines });
  }
  return { removed, carrier: 'verified' };
}
