import { importHostModule } from '../host-runtime.mjs';
const { loadPluginModule: __loadOwnedPlugin } = await importHostModule('src/core/plugin-runtime.mjs');
import { assertSecureControlUrl, normalizeControlUrl, headscaleUrlFromEnv, findHeadscaleKeyMeta } from './headscale-client.mjs';
const { setSecret } = await __loadOwnedPlugin('auth', 'secrets-store');
const { hostSecretsBrainDir } = await __loadOwnedPlugin('auth', 'host-secrets-store');

export async function verifyCredential(value, url, fetchImpl = fetch) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('A credential is required');
  const parsed = assertSecureControlUrl(url);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Control URL must not contain credentials, query or fragment');
  const response = await fetchImpl(`${normalizeControlUrl(url)}/api/v1/user`, {
    headers: { Authorization: `Bearer ${value.trim()}`, Accept: 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Credential verification failed (HTTP ${response.status})`);
  if (!(response.headers.get('content-type') || '').includes('json')) throw new Error('Control server returned a non-JSON response');
  const body = await response.json();
  if (!body || !Array.isArray(body.users)) throw new Error('Control server returned an unexpected user response');
  return { verified: true, url: normalizeControlUrl(url) };
}

export async function saveCredential({ key, value, configuration = {} }, dependencies = {}) {
  if (key !== 'HEADSCALE_API_KEY') throw new Error('Unsupported mesh credential');
  const brainDir = hostSecretsBrainDir();
  const meta = await findHeadscaleKeyMeta(brainDir);
  const url = configuration.controlUrl || headscaleUrlFromEnv() || meta?.headscale_url;
  if (!url) throw new Error('Set the control server URL before saving the credential');
  await verifyCredential(value, url, dependencies.fetchImpl);
  await (dependencies.setSecret || setSecret)(brainDir, key, value.trim(), { provider: 'headscale', headscale_url: normalizeControlUrl(url), key_valid: true });
  return { saved: true, verified: true };
}
