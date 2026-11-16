import fs from 'node:fs';
import path from 'node:path';
import { loadSecretsSync, META_KEY } from './secrets-gateway.mjs';

/** Runtime field -> canonical Auth store key. The settings and deploy writers use these exact keys. */
export const RUNTIME_CREDENTIAL_KEYS = Object.freeze({
  googleApiKey: 'GOOGLE_API_KEY',
  openAiApiKey: 'OPENAI_API_KEY',
  openRouterApiKey: 'OPENROUTER_API_KEY',
  braveApiKey: 'BRAVE_SEARCH_API_KEY',
  braveSearchApiKey: 'BRAVE_SEARCH_API_KEY',
  exaApiKey: 'EXA_API_KEY',
  githubToken: 'GITHUB_TOKEN',
  serperApiKey: 'SERPER_API_KEY',
  tavilyApiKey: 'TAVILY_API_KEY',
  totalRecallToken: 'TOTAL_RECALL_TOKEN',
  trPat: 'TR_PAT',
});

/** One explicitly selected auth store; decryption failures propagate. */
export function runtimeConfiguration({ brainDir }) {
  if (!brainDir) throw new Error('Select an auth store');
  const secrets = loadSecretsSync(brainDir);
  return Object.fromEntries(Object.entries(RUNTIME_CREDENTIAL_KEYS).map(([field, key]) => [field, secrets[key]]));
}

function originOf(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch { return null; }
}

/** A legacy brain.json is read in place, only when it is a standalone regular file. Nothing is written. */
function readLegacyBrainJson(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.basename(file) !== 'brain.json') {
    throw new Error('A legacy brain context must be an absolute brain.json path');
  }
  let fd;
  try { fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); } catch { return null; }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) return null;
    const parsed = JSON.parse(fs.readFileSync(fd, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; } finally { fs.closeSync(fd); }
}

/** An Auth credential is bound at save time; the binding lives in Auth metadata and never follows brain.json. */
function authBinding(secrets, key) {
  const row = secrets?.[META_KEY]?.keys?.[key];
  return row && typeof row.bound_origin === 'string' ? row.bound_origin : null;
}

/**
 * Save the backend connection token under its canonical Auth key, bound to one endpoint origin.
 * Binding and value are written in one store update. The outcome names the key and origin, never the token.
 */
export async function saveConnectionToken({ brainDir, url, token, actor = 'configuration' } = {}) {
  if (!brainDir) throw new Error('Select an auth store');
  const origin = originOf(url);
  if (!origin) throw new Error('A connection token needs an http(s) backend URL to bind to');
  if (typeof token !== 'string' || !token.trim()) throw new Error('A connection token must be a non-empty string');
  const { setSecret } = await import('./secrets-store.mjs');
  await setSecret(brainDir, 'TOTAL_RECALL_TOKEN', token, { actor, bound_origin: origin });
  return { key: 'TOTAL_RECALL_TOKEN', origin };
}

/**
 * Refuse to point a brain.json that still holds a legacy token at a different origin: the token
 * was saved for the file's current endpoint and would otherwise follow the new URL. The file is
 * only read, never changed.
 */
export function assertLegacyTokenNotRebound({ file, url }) {
  const cfg = readLegacyBrainJson(file);
  if (!cfg || typeof cfg.token !== 'string' || !cfg.token) return { ok: true };
  const current = typeof cfg.url === 'string' ? originOf(cfg.url) : null;
  const next = originOf(url);
  if (!next) throw new Error('The backend URL must be http(s)');
  if (current === next) return { ok: true };
  throw new Error('This brain.json holds a legacy token for its current endpoint; clear it before changing the endpoint');
}

/**
 * The backend connection token for one endpoint.
 *
 * The Auth store is mandatory and its failures propagate: a missing password, a plaintext or
 * undecryptable store never falls back to a legacy file. An Auth token is returned only for the
 * origin it was bound to when saved (see saveConnectionToken); a token with no binding is never
 * forwarded. `legacyBrainJson` lists explicit brain.json files of the brain context, in precedence
 * order; the first one with a valid http(s) `url` is the configured endpoint, and its own legacy
 * `token` is returned only for that endpoint's origin and only when Auth supplies none. Legacy data
 * is read in place: never copied, migrated or rotated.
 *
 * @returns {{ token: string|null, source: 'auth'|'legacy'|null, origin: string|null, reason?: string }}
 */
export function connectionToken({ brainDir, url = null, legacyBrainJson = [] } = {}) {
  if (!brainDir) throw new Error('Select an auth store');
  if (!Array.isArray(legacyBrainJson)) throw new Error('legacyBrainJson must be a list of brain.json paths');
  // Auth first, so a failed store stops here before any legacy file is consulted.
  const secrets = loadSecretsSync(brainDir);
  let configured = null;
  let legacyToken = null;
  for (const file of legacyBrainJson) {
    const cfg = readLegacyBrainJson(file);
    const origin = cfg && typeof cfg.url === 'string' ? originOf(cfg.url) : null;
    if (!origin) continue;
    configured = origin;
    legacyToken = typeof cfg.token === 'string' && cfg.token ? cfg.token : null;
    break;
  }
  const requested = url == null ? configured : originOf(url);
  if (!requested) return { token: null, source: null, origin: configured, reason: configured ? 'origin-mismatch' : 'no-configured-endpoint' };
  const authToken = typeof secrets.TOTAL_RECALL_TOKEN === 'string' && secrets.TOTAL_RECALL_TOKEN ? secrets.TOTAL_RECALL_TOKEN : null;
  let reason = 'no-saved-token';
  if (authToken) {
    const bound = authBinding(secrets, 'TOTAL_RECALL_TOKEN');
    if (bound && bound === requested) return { token: authToken, source: 'auth', origin: bound };
    reason = bound ? 'origin-mismatch' : 'token-unbound';
  }
  if (legacyToken && configured === requested) return { token: legacyToken, source: 'legacy', origin: configured };
  if (legacyToken) reason = 'origin-mismatch';
  return { token: null, source: null, origin: configured, reason };
}
