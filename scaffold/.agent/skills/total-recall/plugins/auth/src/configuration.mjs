import fs from 'node:fs';
import path from 'node:path';
import { loadSecretsSync } from './secrets-gateway.mjs';

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

/**
 * The backend connection token for one endpoint, bound to that endpoint's origin.
 *
 * The Auth store is mandatory and its failures propagate: a missing password, a plaintext or
 * undecryptable store never falls back to a legacy file. `legacyBrainJson` lists explicit
 * brain.json files of the brain context, in precedence order. The first one with a valid
 * http(s) `url` defines the configured endpoint. A saved token (the Auth key TOTAL_RECALL_TOKEN,
 * else that file's legacy `token`) is returned only when `url` has the same origin as the
 * configured endpoint. With no configured endpoint, or a different origin, no saved token is
 * returned. Legacy data is read in place: never copied, migrated or rotated.
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
  if (!configured) return { token: null, source: null, origin: null, reason: 'no-configured-endpoint' };
  const requested = url == null ? configured : originOf(url);
  if (!requested || requested !== configured) return { token: null, source: null, origin: configured, reason: 'origin-mismatch' };
  const authToken = typeof secrets.TOTAL_RECALL_TOKEN === 'string' && secrets.TOTAL_RECALL_TOKEN ? secrets.TOTAL_RECALL_TOKEN : null;
  if (authToken) return { token: authToken, source: 'auth', origin: configured };
  if (legacyToken) return { token: legacyToken, source: 'legacy', origin: configured };
  return { token: null, source: null, origin: configured, reason: 'no-saved-token' };
}
