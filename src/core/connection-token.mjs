/**
 * Backend connection token for the CLI consumers. The Auth configuration owner is mandatory:
 * it resolves the saved token, binds it to the configured endpoint's origin and reads a
 * legacy brain.json in place when an old install needs it. Core never reads a token field
 * from brain.json and never falls back to one when Auth is missing, locked or failing.
 */
import { loadPluginModule } from './plugin-runtime.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { globalBrainDir } from './local-config.mjs';
import { writeBrainConnection } from './memory-brain.mjs';

/**
 * The one Auth store of this host: TR_SECRETS_BRAIN when set, else the global brain. Settings, connect,
 * relay, startup and deploy all resolve it here; no project or cwd selects another store.
 */
export function authStoreDir(env = process.env) {
  return env.TR_SECRETS_BRAIN || globalBrainDir;
}

/**
 * @param {{ explicit?: string, url?: string|null, legacyBrainJson?: string[], authBrainDir?: string, owner?: object }} options
 * @returns {Promise<{ token: string|null, source: string|null, origin?: string|null, reason?: string }>}
 */
export async function resolveConnectionToken({ explicit, url = null, legacyBrainJson = [], authBrainDir, owner } = {}) {
  // An explicit operator token is the operator's own choice and needs no saved credential.
  if (explicit) return { token: explicit, source: 'explicit' };
  const module = owner || await loadPluginModule('auth', 'configuration');
  if (typeof module.connectionToken !== 'function') throw new Error('The installed Auth owner has no connectionToken contract; update Auth.');
  return module.connectionToken({ brainDir: authBrainDir || authStoreDir(), url, legacyBrainJson });
}

/**
 * Write the public brain connection (url and other settings) and keep an explicitly supplied
 * token in Auth, bound to that url. Order: legacy-rebind check, Auth save, then the public write,
 * so a refusal or an Auth failure changes nothing and a failed file write can only leave a token
 * bound to the new endpoint. A token already saved elsewhere is never passed here, so nothing is
 * migrated. Returns the brain.json path; the token is never returned or written to it.
 */
export async function saveBackendConnection(brainDir, { url, token, ...publicFields } = {}, { owner, authBrainDir } = {}) {
  const file = path.join(brainDir, 'config', 'brain.json');
  const hasToken = typeof token === 'string' && token !== '';
  if (hasToken && !url) throw new Error('A connection token needs a backend URL to bind to.');
  // The legacy-token check only matters when a brain.json already exists; the owner is loaded when needed.
  const needsGuard = Boolean(url) && fs.existsSync(file);
  if (needsGuard || hasToken) {
    const module = owner || await loadPluginModule('auth', 'configuration');
    if (needsGuard) module.assertLegacyTokenNotRebound({ file, url });
    if (hasToken) {
      await module.saveConnectionToken({ brainDir: authBrainDir || authStoreDir(), url, token, actor: 'connection-writer' });
    }
  }
  return writeBrainConnection(brainDir, { ...(url ? { url } : {}), ...publicFields });
}
