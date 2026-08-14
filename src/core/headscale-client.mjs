/**
 * Headscale control-server client.
 *
 * Single implementation shared by the REST proxy (`routes/headscale.mjs`) and
 * automatic node enrollment (`mesh-enroll.mjs`). No control-server URL is ever
 * hardcoded here — it is resolved from the operator's own secret entry or
 * environment, so this works against any Headscale (or Tailscale SaaS) install.
 */
import { getSecretsCatalog, getSecret } from './secrets-store.mjs';
import { throttledFetch } from './throttled-fetch.mjs';

const DEFAULT_TIMEOUT_MS = 10_000;

/** Env override so headless/CI installs can point at a control server without a secret. */
export function headscaleUrlFromEnv() {
  const raw = process.env.TR_HEADSCALE_URL || process.env.TR_LOGIN_SERVER || '';
  return raw.trim() || null;
}

/**
 * Reject non-HTTPS control servers (loopback excepted for local development).
 * Bearer tokens must never travel in cleartext over a network hop.
 */
export function assertSecureControlUrl(url) {
  const parsed = new URL(url);
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(isLoopback && parsed.protocol === 'http:')) {
    throw new Error('Headscale URL must use HTTPS (HTTP is allowed only for loopback development)');
  }
  return parsed;
}

/** Strip a trailing slash so path joining stays predictable. */
export function normalizeControlUrl(url) {
  const value = String(url || '').trim();
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/**
 * Locate the operator's headscale credential without knowing its key name.
 * Any secret whose provider is `headscale` is treated as the control-server token.
 */
export async function findHeadscaleKeyMeta(brainDir) {
  const catalog = await getSecretsCatalog(brainDir);
  return catalog.keys.find((k) => k.provider === 'headscale') || null;
}

/**
 * Resolve `{ url, token }` for the control server.
 * Throws when no credential is configured — callers that must degrade
 * gracefully should use `describeHeadscaleAvailability()` instead.
 */
export async function resolveHeadscaleConfig(brainDir) {
  const meta = await findHeadscaleKeyMeta(brainDir);
  if (!meta) {
    throw new Error('Headscale API Key not configured in ApiKeysPage');
  }

  const got = await getSecret(brainDir, meta.key, {
    action: 'use',
    actor: 'headscale-client',
  });
  if (!got.found || !got.value) {
    throw new Error('Headscale API Key token value is empty or not set');
  }

  const url = normalizeControlUrl(meta.headscale_url || headscaleUrlFromEnv() || '');
  if (!url) {
    throw new Error('Headscale control server URL is not set on the headscale API key');
  }

  return { url, token: got.value, keyName: meta.key };
}

/**
 * Non-throwing capability probe used by enrollment and status endpoints:
 * reports whether an automated (pre-auth key) enrollment path is possible.
 */
export async function describeHeadscaleAvailability(brainDir) {
  try {
    const meta = await findHeadscaleKeyMeta(brainDir);
    if (!meta) {
      return { configured: false, reason: 'no-headscale-api-key', url: headscaleUrlFromEnv() };
    }
    const url = normalizeControlUrl(meta.headscale_url || headscaleUrlFromEnv() || '');
    if (!url) {
      return { configured: false, reason: 'no-control-url', url: null, keyName: meta.key };
    }
    if (!meta.set) {
      return { configured: false, reason: 'api-key-value-empty', url, keyName: meta.key };
    }
    return { configured: true, reason: null, url, keyName: meta.key };
  } catch (err) {
    return { configured: false, reason: err.message || 'headscale-probe-failed', url: null };
  }
}

/**
 * Authenticated request against the control server's API.
 * `brainDir` is required so the caller's brain scope selects the credential.
 */
export async function headscaleFetch(path, options = {}, brainDir) {
  const { url, token } = await resolveHeadscaleConfig(brainDir);
  assertSecureControlUrl(url);

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const targetUrl = `${normalizeControlUrl(url)}${cleanPath}`;

  const res = await throttledFetch(
    targetUrl,
    {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    },
    options.timeoutMs || DEFAULT_TIMEOUT_MS,
  );

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    const error = new Error(`Headscale API error (${res.status} ${res.statusText})`);
    error.status = res.status;
    error.detail = errorText.slice(0, 500);
    throw error;
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return { success: true };
}

/**
 * Headscale renamed `/machine` to `/node`; retry the legacy path on 404 so one
 * client works across control-server versions.
 */
export async function headscaleFetchWithLegacyFallback(currentPath, legacyPath, options, brainDir) {
  try {
    return await headscaleFetch(currentPath, options, brainDir);
  } catch (err) {
    if (err.status !== 404 || !legacyPath) throw err;
    return headscaleFetch(legacyPath, options, brainDir);
  }
}

/**
 * Resolve a control-server user to both of its identifying forms.
 *
 * Headscale 0.26 made `/api/v1/preauthkey` take a numeric user **id** where
 * older releases took the user **name**, so callers need both to stay
 * version-agnostic. With no `requested` user, the first user is used.
 */
export async function resolveHeadscaleUser(brainDir, requested) {
  const data = await headscaleFetch('/api/v1/user', {}, brainDir);
  const users = data?.users || [];

  if (requested) {
    const match = users.find(
      (u) =>
        String(u.id) === String(requested) ||
        u.name === requested ||
        (u.email && u.email === requested),
    );
    if (match) return { id: String(match.id), name: match.name };
    // Unknown to us — pass it through and let the control server decide.
    return { id: String(requested), name: String(requested) };
  }

  if (!users.length) return null;
  return { id: String(users[0].id), name: users[0].name };
}

/**
 * Mint a pre-auth key for unattended enrollment.
 *
 * Defaults are deliberately narrow: single-use, non-ephemeral, short-lived —
 * an enrollment key that leaks should expire before it is useful.
 *
 * The user field is tried as id first, then name: Headscale >=0.26 rejects the
 * name with 400, and older releases reject the id the same way, so one client
 * works against both without the operator pinning a version.
 */
export async function createHeadscalePreAuthKey(options = {}, brainDir) {
  const ttlMinutes = Number.isFinite(options.ttlMinutes) ? options.ttlMinutes : 10;
  const expiration =
    options.expiration || new Date(Date.now() + ttlMinutes * 60_000).toISOString();

  const ref = options.userRef || (await resolveHeadscaleUser(brainDir, options.user));
  const attempts = [];
  if (ref?.id) attempts.push(String(ref.id));
  if (ref?.name && String(ref.name) !== String(ref.id)) attempts.push(String(ref.name));
  if (!attempts.length) attempts.push(String(options.user || 'default'));

  let lastError = null;
  for (const user of attempts) {
    try {
      const data = await headscaleFetch(
        '/api/v1/preauthkey',
        {
          method: 'POST',
          body: JSON.stringify({
            user,
            reusable: options.reusable === true,
            ephemeral: options.ephemeral === true,
            expiration,
            aclTags: options.aclTags || [],
          }),
        },
        brainDir,
      );

      const key = data?.preAuthKey?.key || data?.preauthkey?.key || data?.key || null;
      if (!key) throw new Error('Headscale did not return a pre-auth key');
      return { key, expiration, user, raw: data };
    } catch (err) {
      lastError = err;
      // Only the id-vs-name mismatch is worth retrying; anything else is real.
      if (err.status !== 400) throw err;
    }
  }
  throw lastError || new Error('Headscale did not return a pre-auth key');
}

/**
 * Read the control server's ACL policy.
 *
 * Requires the server to run with `policy.mode: database` — in `file` mode the
 * policy lives on the control server's disk and the API cannot manage it.
 *
 * Headscale returns a 500 (not a 404) when database mode is on but the policy
 * table is still empty, so an unset policy is normalised to `policy: null`
 * rather than thrown. That distinction matters: "no policy yet" is the expected
 * first-run state, whereas a real transport or auth failure must still surface.
 */
export async function getHeadscalePolicy(brainDir) {
  try {
    const data = await headscaleFetch('/api/v1/policy', {}, brainDir);
    return {
      policy: data?.policy ?? null,
      updatedAt: data?.updatedAt ?? null,
      configured: Boolean(data?.policy),
      raw: data,
    };
  } catch (err) {
    const detail = String(err.detail || '');
    const emptyPolicyTable =
      err.status === 404 ||
      (err.status === 500 && /policy|not found|no such/i.test(detail));
    if (emptyPolicyTable) {
      return { policy: null, updatedAt: null, configured: false, unset: true, raw: null };
    }
    if (err.status === 400 && /database/i.test(detail)) {
      const modeError = new Error(
        'Headscale is running in file policy mode; set `policy.mode: database` to manage the policy over the API',
      );
      modeError.status = err.status;
      modeError.detail = err.detail;
      modeError.code = 'POLICY_MODE_FILE';
      throw modeError;
    }
    throw err;
  }
}

/**
 * Replace the control server's ACL policy.
 *
 * `policy` may be an object (serialised here) or an already-formatted
 * HuJSON/JSON string. Headscale validates server-side and rejects the write if
 * the policy's own `tests` block fails, so a bad policy never lands.
 */
export async function setHeadscalePolicy(policy, brainDir) {
  if (!policy) throw new Error('A policy is required');
  const serialised = typeof policy === 'string' ? policy : JSON.stringify(policy, null, 2);

  const data = await headscaleFetch(
    '/api/v1/policy',
    { method: 'PUT', body: JSON.stringify({ policy: serialised }) },
    brainDir,
  );
  return { policy: data?.policy ?? serialised, updatedAt: data?.updatedAt ?? null, raw: data };
}

/**
 * Build a policy that lets every mesh member reach every other member, and use
 * Tailscale SSH between them as any non-root user.
 *
 * This is deliberately the simple single-operator shape: one person's own
 * machines, all equally trusted. It is NOT appropriate for a multi-tenant
 * tailnet — headscale membership is the trust boundary, so anything admitted to
 * the mesh inherits this access. Narrow `src`/`dst` before adding a node you do
 * not control.
 *
 * root is excluded via `autogroup:nonroot`: SSH-ing straight to root over the
 * mesh removes the audit trail that makes per-user access worth having.
 */
export function buildMeshSshPolicy({ allowRoot = false } = {}) {
  return {
    acls: [{ action: 'accept', src: ['*'], dst: ['*:*'] }],
    ssh: [
      {
        action: 'accept',
        src: ['autogroup:member'],
        dst: ['autogroup:self'],
        users: allowRoot ? ['autogroup:nonroot', 'root'] : ['autogroup:nonroot'],
      },
    ],
  };
}
