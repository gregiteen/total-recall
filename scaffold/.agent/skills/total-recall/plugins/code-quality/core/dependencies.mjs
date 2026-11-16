/** Report compatibility only; package-manager readiness belongs to Total Recall core. */
import { dependencyOwner } from './host.mjs';

export async function ensureGateDependencies(root, { enabled = true } = {}) {
  if (!enabled) return { action: 'disabled', status: 'disabled', ok: true };
  try {
    const ensure = await dependencyOwner();
    const result = await ensure(root, { reason: 'code-quality' });
    const action = { skipped: 'none', current: 'present', installed: 'installed', failed: 'failed' }[result.status];
    if (!action || result.ok === false) return { ...result, action: 'failed' };
    return { ...result, action };
  } catch (error) {
    return { action: 'failed', status: 'failed', ok: false, error: error.message };
  }
}
