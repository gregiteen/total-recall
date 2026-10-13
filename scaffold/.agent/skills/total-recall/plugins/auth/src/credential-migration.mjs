import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { loadSecretsSync, saveSecretsSync } from './secrets-gateway.mjs';
import { writeFileSecure } from './secure-file.mjs';

/** Explicit one-way migration, never a runtime credential fallback. */
export function migrateLegacyCredentials({ legacyBrainDir, brainDir, removeLegacy = false }) {
  if (!legacyBrainDir || !brainDir) throw new Error('Explicit source and auth store required');
  const selected = path.resolve(legacyBrainDir);
  if (fs.lstatSync(selected).isSymbolicLink()) throw new Error('Legacy source must not be a symlink');
  const root = fs.realpathSync(selected);
  const read = relative => {
    const target = path.join(root, relative);
    if (!fs.existsSync(target)) return null;
    for (let current = target; current !== root; current = path.dirname(current)) if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Symlink source refused');
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size > 1048576 || typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error('Unsafe legacy source');
    return fs.readFileSync(target, 'utf8');
  };
  const securityText = read('config/security.yml');
  const config = securityText === null ? {} : yaml.parse(securityText);
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Malformed legacy configuration');
  const session = read('config/session-secret')?.trim();
  const collaboration = read('collab/.jwt-secret')?.trim();
  const usersText = read('collab/users.json');
  const users = usersText === null ? [] : JSON.parse(usersText);
  if (!Array.isArray(users)) throw new Error('Invalid legacy collaboration users');
  const userHashes = {};
  for (const user of users) {
    if (user.passwordHash === undefined) continue;
    if (typeof user.username !== 'string' || !/^[A-Za-z0-9_.@-]{1,128}$/.test(user.username) || typeof user.passwordHash !== 'string' || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(user.passwordHash)) throw new Error('Invalid legacy collaboration credential');
    const key = user.username.toLowerCase();
    if (Object.hasOwn(userHashes, key)) throw new Error('Duplicate legacy collaboration credential');
    userHashes[key] = user.passwordHash;
  }
  const hash = config.dashboard?.password_hash;
  if (hash !== undefined && hash !== null && (typeof hash !== 'string' || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash))) throw new Error('Invalid legacy password hash');
  for (const value of [session, collaboration]) if (value !== undefined && (typeof value !== 'string' || Buffer.byteLength(value) < 32)) throw new Error('Invalid legacy signing key');
  const updates = {};
  if (hash) { updates.dashboard_password_hash = hash; updates.dashboard_force_password_reset = config.dashboard?.force_password_reset === true; }
  if (session) updates.SESSION_SECRET = session;
  if (collaboration) updates.COLLAB_SESSION_SECRET = collaboration;
  const existing = loadSecretsSync(brainDir);
  if (Object.keys(userHashes).length) {
    const current = existing.collaboration_password_hashes || {};
    for (const [key, value] of Object.entries(userHashes)) if (Object.hasOwn(current, key) && current[key] !== value) throw new Error('Target auth credential conflict; existing values were preserved');
    updates.collaboration_password_hashes = { ...current, ...userHashes };
  }
  if (!Object.keys(updates).length) throw new Error('No legacy credentials found');
  for (const [key, value] of Object.entries(updates)) if (key !== 'collaboration_password_hashes' && Object.hasOwn(existing, key) && existing[key] !== value) throw new Error('Target auth credential conflict; existing values were preserved');
  saveSecretsSync(brainDir, { ...existing, ...updates });
  const verified = loadSecretsSync(brainDir);
  if (Object.entries(updates).some(([key, value]) => JSON.stringify(verified[key]) !== JSON.stringify(value))) throw new Error('Auth migration verification failed');
  if (removeLegacy) {
    if (hash) {
      delete config.dashboard.password_hash; delete config.dashboard.force_password_reset;
      writeFileSecure(path.join(root, 'config/security.yml'), yaml.stringify(config), { mode: 0o600 });
    }
    if (session) fs.unlinkSync(path.join(root, 'config/session-secret'));
    if (collaboration) fs.unlinkSync(path.join(root, 'collab/.jwt-secret'));
    if (Object.keys(userHashes).length) writeFileSecure(path.join(root, 'collab/users.json'), JSON.stringify(users.map(({ passwordHash, ...user }) => user)), { mode: 0o600 });
  }
  return { migrated: true, keys: Object.keys(updates), legacyRemoved: removeLegacy, sessionsRequireReauthentication: true };
}
