/**
 * OpenWiki Token & Secret Management.
 *
 * Implements [invariants-473efe83]:
 * Directly checks and sets credentials in Total Recall auth secrets store.
 * Never echoes raw secrets to stdout/stderr.
 */
import { spawnSync } from 'node:child_process';

const PROVIDER_KEY_MAP = {
  openrouter: 'OPENROUTER_API_KEY',
  google: 'GOOGLE_API_KEY',
};

/**
 * Checks token readiness across supported providers.
 */
export function getTokenStatus({ run = spawnSync } = {}) {
  const result = run('total-recall', ['auth', 'secret', 'list', '--json'], {
    encoding: 'utf8',
    timeout: 5000,
  });

  if (result.status !== 0) throw new Error('Auth credential metadata is unavailable');
  let payload;
  try { payload = JSON.parse(result.stdout); }
  catch { throw new Error('Auth credential metadata is invalid'); }
  const rows = Array.isArray(payload) ? payload : payload?.keys;
  if (!Array.isArray(rows)) throw new Error('Auth credential metadata is invalid');
  const saved = new Set(rows.filter(row => row?.set !== false)
    .map(row => typeof row === 'string' ? row : row?.key ?? row?.name));
  const tokens = Object.fromEntries(Object.entries(PROVIDER_KEY_MAP).map(([provider, key]) => {
    const configured = saved.has(key);
    return [provider, { key, configured, status: configured ? 'configured' : 'missing' }];
  }));
  return { ok: true, tokens };
}

/**
 * Securely writes a token into Total Recall auth secrets store using --stdin.
 */
export function setTokenValue(provider, secretValue, { run = spawnSync } = {}) {
  const id = typeof provider === 'string' && provider.toLowerCase();
  if (!Object.hasOwn(PROVIDER_KEY_MAP, id)) throw new Error('Supported token providers are openrouter and google');
  const keyName = PROVIDER_KEY_MAP[id];

  if (!secretValue || typeof secretValue !== 'string' || !secretValue.trim()) {
    throw new Error(`Token value for ${keyName} must be a non-empty string`);
  }

  const trimmed = secretValue.trim();

  // Pipe into total-recall auth secret set <KEY> --stdin
  const child = run('total-recall', ['auth', 'secret', 'set', keyName, '--stdin'], {
    input: trimmed,
    encoding: 'utf8',
    timeout: 5000,
  });

  if (child.status !== 0) {
    throw new Error(`Auth could not save ${keyName}`);
  }

  return {
    ok: true,
    provider,
    key: keyName,
    message: `Secret ${keyName} securely recorded in Total Recall secrets store.`,
  };
}
