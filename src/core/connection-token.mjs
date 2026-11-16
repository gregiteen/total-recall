/**
 * Backend connection token for the CLI consumers. The Auth configuration owner is mandatory:
 * it resolves the saved token, binds it to the configured endpoint's origin and reads a
 * legacy brain.json in place when an old install needs it. Core never reads a token field
 * from brain.json and never falls back to one when Auth is missing, locked or failing.
 */
import { loadPluginModule } from './plugin-runtime.mjs';
import { globalBrainDir } from './local-config.mjs';

/**
 * @param {{ explicit?: string, url?: string|null, legacyBrainJson?: string[], authBrainDir?: string, owner?: object }} options
 * @returns {Promise<{ token: string|null, source: string|null, origin?: string|null, reason?: string }>}
 */
export async function resolveConnectionToken({ explicit, url = null, legacyBrainJson = [], authBrainDir, owner } = {}) {
  // An explicit operator token is the operator's own choice and needs no saved credential.
  if (explicit) return { token: explicit, source: 'explicit' };
  const module = owner || await loadPluginModule('auth', 'configuration');
  if (typeof module.connectionToken !== 'function') throw new Error('The installed Auth owner has no connectionToken contract; update Auth.');
  return module.connectionToken({ brainDir: authBrainDir || process.env.TR_SECRETS_BRAIN || globalBrainDir, url, legacyBrainJson });
}
