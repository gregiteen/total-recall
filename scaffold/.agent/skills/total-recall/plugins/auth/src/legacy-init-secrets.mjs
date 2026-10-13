/** Restore only a missing store; reinitialization must never replace credentials. */
import fs from 'node:fs';
import path from 'node:path';
import {
  isPlainJsonStore, saveSecrets, resolveSecretsPath, replaceSecretsBufferAtomic,
} from './secrets-gateway.mjs';

export async function restoreLegacyInitSecrets(agentDir, brainDir) {
  const destination = resolveSecretsPath(brainDir);
  if (fs.existsSync(destination)) return { restored: false, reason: 'active-store-exists' };
  const source = path.join(agentDir, 'secrets.enc');
  if (!fs.existsSync(source)) return { restored: false, reason: 'no-legacy-store' };
  if (!fs.lstatSync(source).isFile()) throw new Error('Legacy credential carrier must be a regular file');
  const buffer = fs.readFileSync(source);
  let dashboardPasswordHash;
  try {
    if (isPlainJsonStore(buffer)) {
      const data = JSON.parse(buffer.toString('utf8'));
      dashboardPasswordHash = typeof data.dashboard_password_hash === 'string' ? data.dashboard_password_hash : undefined;
      delete data.dashboard_password_hash;
      // Requires an available password, encrypts, and writes atomically with 0600.
      await saveSecrets(brainDir, data, { onlyIfMissing: true });
    } else {
      // Validation must decrypt successfully before copying any encrypted bytes.
      await replaceSecretsBufferAtomic(brainDir, buffer, { actor: 'cli-init', action: 'legacy_restore', onlyIfMissing: true });
    }
  } catch (error) {
    if (error.code === 'EEXIST') return { restored: false, reason: 'active-store-exists' };
    throw error;
  }
  return { restored: true, dashboardPasswordHash };
}
