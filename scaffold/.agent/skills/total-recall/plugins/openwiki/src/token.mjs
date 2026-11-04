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
export function getTokenStatus() {
  const result = spawnSync('total-recall', ['auth', 'secret', 'list', '--json'], {
    encoding: 'utf8',
    timeout: 5000,
  });

  const configured = {
    openrouter: false,
    google: false,
  };

  if (result.status === 0 && result.stdout) {
    try {
      const parsed = JSON.parse(result.stdout);
      const keys = Array.isArray(parsed)
        ? parsed.map((k) => (typeof k === 'string' ? k : k.key || k.name))
        : (parsed.keys || []);

      configured.openrouter = keys.includes('OPENROUTER_API_KEY') || Boolean(process.env.OPENROUTER_API_KEY);
      configured.google = keys.includes('GOOGLE_API_KEY') || Boolean(process.env.GOOGLE_API_KEY);
    } catch {
      configured.openrouter = Boolean(process.env.OPENROUTER_API_KEY);
      configured.google = Boolean(process.env.GOOGLE_API_KEY);
    }
  } else {
    configured.openrouter = Boolean(process.env.OPENROUTER_API_KEY);
    configured.google = Boolean(process.env.GOOGLE_API_KEY);
  }

  return {
    ok: true,
    tokens: {
      openrouter: {
        key: 'OPENROUTER_API_KEY',
        configured: configured.openrouter,
        status: configured.openrouter ? 'configured' : 'missing',
      },
      google: {
        key: 'GOOGLE_API_KEY',
        configured: configured.google,
        status: configured.google ? 'configured' : 'missing',
      },
    },
  };
}

/**
 * Securely writes a token into Total Recall auth secrets store using --stdin.
 */
export function setTokenValue(provider, secretValue) {
  const keyName = PROVIDER_KEY_MAP[provider?.toLowerCase()] || provider;
  if (!keyName) {
    throw new Error(`Unsupported token provider '${provider}'. Allowed: openrouter, google`);
  }

  if (!secretValue || typeof secretValue !== 'string' || !secretValue.trim()) {
    throw new Error(`Token value for ${keyName} must be a non-empty string`);
  }

  const trimmed = secretValue.trim();

  // Pipe into total-recall auth secret set <KEY> --stdin
  const child = spawnSync('total-recall', ['auth', 'secret', 'set', keyName, '--stdin'], {
    input: trimmed,
    encoding: 'utf8',
    timeout: 5000,
  });

  if (child.status !== 0) {
    throw new Error(child.stderr || child.error?.message || `Failed to set ${keyName} in secrets store`);
  }

  return {
    ok: true,
    provider,
    key: keyName,
    message: `Secret ${keyName} securely recorded in Total Recall secrets store.`,
  };
}
