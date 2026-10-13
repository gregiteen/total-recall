import { describeHeadscaleAvailability, headscaleFetch } from './headscale-client.mjs';
import { getEnrollmentStatus } from './mesh-enroll.mjs';
import { listEnrichedMeshNodes, isMeshAvailable, meshVaultRoot, clearMeshStatusCache } from './mesh.mjs';
import { resolveNodeAccess } from './mesh-access.mjs';
import { brainDir } from './config.mjs';

/** Observations only. Enrollment, network and control API readiness are separate. */
export async function meshStatus({ brain = brainDir } = {}) {
  clearMeshStatusCache();
  const observedAt = new Date().toISOString();
  const control = await describeHeadscaleAvailability(brain);
  let api = { state: 'not-configured', verified: false };
  if (control.configured) {
    try { const body = await headscaleFetch('/api/v1/user', { redirect: 'error' }, brain); if (!Array.isArray(body?.users)) throw new Error('Unexpected control server response'); api = { state: 'verified', verified: true }; }
    catch (error) { api = { state: error.status === 401 || error.status === 403 ? 'unauthorized' : 'unavailable', verified: false, error: error.message }; }
  }
  let enrollment;
  try { enrollment = await getEnrollmentStatus({ brainDir: brain }); }
  catch (error) { enrollment = { state: 'unknown', error: error.message }; }
  const networkAvailable = isMeshAvailable();
  const nodes = listEnrichedMeshNodes(meshVaultRoot()).map(node => ({
    ...node,
    network_state: node.vault_only ? 'unobserved' : node.online ? 'online' : 'offline',
    access_state: resolveNodeAccess(node).complete ? 'configured' : 'not-configured',
    service_state: 'not-probed',
    observed_at: node.vault_only ? node.last_heartbeat || null : observedAt,
  }));
  return { plugin: 'mesh', configured: control.configured, state: networkAvailable ? 'connected' : 'unavailable', network_available: networkAvailable, control: { ...control, ...api }, enrollment, nodes, observed_at: observedAt };
}
