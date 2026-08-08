import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./secrets-store.mjs', () => ({
  getSecretsCatalog: vi.fn(),
  getSecret: vi.fn(),
}));

vi.mock('./throttled-fetch.mjs', () => ({
  throttledFetch: vi.fn(),
}));

const {
  assertSecureControlUrl,
  createHeadscalePreAuthKey,
  describeHeadscaleAvailability,
  normalizeControlUrl,
  resolveHeadscaleConfig,
  resolveHeadscaleUser,
} = await import('./headscale-client.mjs');
const secretsStore = await import('./secrets-store.mjs');
const { throttledFetch } = await import('./throttled-fetch.mjs');

const CONTROL_URL = 'https://control.example.org';
const BRAIN = '/tmp/brain';

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TR_HEADSCALE_URL;
  delete process.env.TR_LOGIN_SERVER;
  vi.mocked(secretsStore.getSecretsCatalog).mockResolvedValue({
    keys: [{ key: 'HEADSCALE_API_KEY', provider: 'headscale', headscale_url: CONTROL_URL, set: true }],
  });
  vi.mocked(secretsStore.getSecret).mockResolvedValue({ found: true, value: 'hs-token' });
});

describe('control URL handling', () => {
  it('strips a trailing slash so path joins stay predictable', () => {
    expect(normalizeControlUrl('https://a.example.org/')).toBe('https://a.example.org');
    expect(normalizeControlUrl('  https://a.example.org  ')).toBe('https://a.example.org');
    expect(normalizeControlUrl(null)).toBe('');
  });

  it('rejects plaintext HTTP so bearer tokens never cross a network in the clear', () => {
    expect(() => assertSecureControlUrl('http://control.example.org')).toThrow(/HTTPS/);
  });

  it('allows HTTP on loopback for local development', () => {
    expect(() => assertSecureControlUrl('http://localhost:8080')).not.toThrow();
    expect(() => assertSecureControlUrl('http://127.0.0.1:8080')).not.toThrow();
  });
});

describe('resolveHeadscaleConfig', () => {
  it('finds the credential by provider, not by key name', async () => {
    vi.mocked(secretsStore.getSecretsCatalog).mockResolvedValue({
      keys: [
        { key: 'UNRELATED', provider: 'stripe', set: true },
        { key: 'MY_CUSTOM_NAME', provider: 'headscale', headscale_url: CONTROL_URL, set: true },
      ],
    });
    const config = await resolveHeadscaleConfig(BRAIN);
    expect(config).toMatchObject({ url: CONTROL_URL, token: 'hs-token', keyName: 'MY_CUSTOM_NAME' });
  });

  it('falls back to the environment when the key carries no URL', async () => {
    process.env.TR_HEADSCALE_URL = 'https://env.example.org';
    vi.mocked(secretsStore.getSecretsCatalog).mockResolvedValue({
      keys: [{ key: 'HEADSCALE_API_KEY', provider: 'headscale', headscale_url: null, set: true }],
    });
    const config = await resolveHeadscaleConfig(BRAIN);
    expect(config.url).toBe('https://env.example.org');
  });

  it('throws a specific error when no credential is configured', async () => {
    vi.mocked(secretsStore.getSecretsCatalog).mockResolvedValue({ keys: [] });
    await expect(resolveHeadscaleConfig(BRAIN)).rejects.toThrow(/not configured/i);
  });

  it('throws when the credential exists but has no value', async () => {
    vi.mocked(secretsStore.getSecret).mockResolvedValue({ found: false, value: null });
    await expect(resolveHeadscaleConfig(BRAIN)).rejects.toThrow(/empty or not set/i);
  });
});

describe('describeHeadscaleAvailability', () => {
  it('reports configured when a key and URL are present', async () => {
    await expect(describeHeadscaleAvailability(BRAIN)).resolves.toMatchObject({
      configured: true,
      url: CONTROL_URL,
    });
  });

  it('never throws — it reports a reason instead', async () => {
    vi.mocked(secretsStore.getSecretsCatalog).mockRejectedValue(new Error('vault locked'));
    await expect(describeHeadscaleAvailability(BRAIN)).resolves.toMatchObject({
      configured: false,
      reason: 'vault locked',
    });
  });

  it('distinguishes a missing URL from a missing key', async () => {
    vi.mocked(secretsStore.getSecretsCatalog).mockResolvedValue({
      keys: [{ key: 'HEADSCALE_API_KEY', provider: 'headscale', headscale_url: null, set: true }],
    });
    await expect(describeHeadscaleAvailability(BRAIN)).resolves.toMatchObject({
      configured: false,
      reason: 'no-control-url',
    });
  });
});

const USER_LIST = { users: [{ id: '1', name: 'tr', email: 'tr@example.org' }] };

function badRequest() {
  return {
    ok: false,
    status: 400,
    statusText: 'Bad Request',
    text: async () => 'invalid user',
    headers: { get: () => null },
  };
}

describe('resolveHeadscaleUser', () => {
  it('returns both id and name so callers can satisfy either API generation', async () => {
    vi.mocked(throttledFetch).mockResolvedValue(jsonResponse(USER_LIST));
    await expect(resolveHeadscaleUser(BRAIN)).resolves.toEqual({ id: '1', name: 'tr' });
  });

  it('matches a requested user by name, id, or email', async () => {
    vi.mocked(throttledFetch).mockResolvedValue(jsonResponse(USER_LIST));
    await expect(resolveHeadscaleUser(BRAIN, 'tr')).resolves.toEqual({ id: '1', name: 'tr' });
    await expect(resolveHeadscaleUser(BRAIN, '1')).resolves.toEqual({ id: '1', name: 'tr' });
    await expect(resolveHeadscaleUser(BRAIN, 'tr@example.org')).resolves.toEqual({ id: '1', name: 'tr' });
  });

  it('passes an unknown user through instead of guessing', async () => {
    vi.mocked(throttledFetch).mockResolvedValue(jsonResponse(USER_LIST));
    await expect(resolveHeadscaleUser(BRAIN, 'ghost')).resolves.toEqual({ id: 'ghost', name: 'ghost' });
  });

  it('returns null when the control server has no users', async () => {
    vi.mocked(throttledFetch).mockResolvedValue(jsonResponse({ users: [] }));
    await expect(resolveHeadscaleUser(BRAIN)).resolves.toBeNull();
  });
});

describe('createHeadscalePreAuthKey', () => {
  it('defaults to a single-use, non-ephemeral, short-lived key', async () => {
    vi.mocked(throttledFetch).mockResolvedValue(jsonResponse({ preAuthKey: { key: 'k-123' } }));
    const result = await createHeadscalePreAuthKey({ userRef: { id: '1', name: 'tr' } }, BRAIN);

    expect(result.key).toBe('k-123');
    const [, options] = vi.mocked(throttledFetch).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.reusable).toBe(false);
    expect(body.ephemeral).toBe(false);
    expect(new Date(body.expiration).getTime()).toBeLessThanOrEqual(Date.now() + 10 * 60_000 + 1000);
  });

  it('sends the numeric user id first (Headscale >= 0.26)', async () => {
    vi.mocked(throttledFetch).mockResolvedValue(jsonResponse({ preAuthKey: { key: 'k-1' } }));
    const result = await createHeadscalePreAuthKey({ userRef: { id: '1', name: 'tr' } }, BRAIN);

    expect(result.user).toBe('1');
    expect(JSON.parse(vi.mocked(throttledFetch).mock.calls[0][1].body).user).toBe('1');
    expect(throttledFetch).toHaveBeenCalledTimes(1);
  });

  it('retries with the user name when the server rejects the id (Headscale < 0.26)', async () => {
    vi.mocked(throttledFetch)
      .mockResolvedValueOnce(badRequest())
      .mockResolvedValueOnce(jsonResponse({ preAuthKey: { key: 'k-legacy' } }));

    const result = await createHeadscalePreAuthKey({ userRef: { id: '1', name: 'tr' } }, BRAIN);
    expect(result.key).toBe('k-legacy');
    expect(result.user).toBe('tr');
    expect(JSON.parse(vi.mocked(throttledFetch).mock.calls[1][1].body).user).toBe('tr');
  });

  it('resolves the user itself when only a name is supplied', async () => {
    vi.mocked(throttledFetch)
      .mockResolvedValueOnce(jsonResponse(USER_LIST))
      .mockResolvedValueOnce(jsonResponse({ preAuthKey: { key: 'k-2' } }));

    await expect(createHeadscalePreAuthKey({ user: 'tr' }, BRAIN)).resolves.toMatchObject({ key: 'k-2' });
    // First call resolves the user, second mints with the numeric id.
    expect(JSON.parse(vi.mocked(throttledFetch).mock.calls[1][1].body).user).toBe('1');
  });

  it('accepts the alternate response shapes headscale versions return', async () => {
    vi.mocked(throttledFetch).mockResolvedValue(jsonResponse({ preauthkey: { key: 'legacy-key' } }));
    await expect(
      createHeadscalePreAuthKey({ userRef: { id: '1', name: 'tr' } }, BRAIN),
    ).resolves.toMatchObject({ key: 'legacy-key' });
  });

  it('throws when the control server returns no key', async () => {
    vi.mocked(throttledFetch).mockResolvedValue(jsonResponse({ unexpected: true }));
    await expect(
      createHeadscalePreAuthKey({ userRef: { id: '1', name: 'tr' } }, BRAIN),
    ).rejects.toThrow(/did not return a pre-auth key/i);
  });

  it('does not retry non-400 failures — a bad token is not a version mismatch', async () => {
    vi.mocked(throttledFetch).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'bad token',
      headers: { get: () => null },
    });
    await expect(
      createHeadscalePreAuthKey({ userRef: { id: '1', name: 'tr' } }, BRAIN),
    ).rejects.toMatchObject({ status: 401 });
    expect(throttledFetch).toHaveBeenCalledTimes(1);
  });
});
