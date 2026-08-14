import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./secrets-store.mjs', () => ({
  getSecretsCatalog: vi.fn(),
  getSecret: vi.fn(),
}));

vi.mock('./throttled-fetch.mjs', () => ({
  throttledFetch: vi.fn(),
}));

const { getHeadscalePolicy, setHeadscalePolicy, buildMeshSshPolicy } = await import(
  './headscale-client.mjs'
);
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

function errorResponse(status, text) {
  return {
    ok: false,
    status,
    statusText: 'Error',
    headers: { get: () => null },
    text: async () => text,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TR_HEADSCALE_URL;
  delete process.env.TR_LOGIN_SERVER;
  vi.mocked(secretsStore.getSecretsCatalog).mockResolvedValue({
    keys: [
      { key: 'HEADSCALE_API_KEY', provider: 'headscale', headscale_url: CONTROL_URL, set: true },
    ],
  });
  vi.mocked(secretsStore.getSecret).mockResolvedValue({ found: true, value: 'hs-token' });
});

describe('getHeadscalePolicy', () => {
  it('returns the configured policy', async () => {
    vi.mocked(throttledFetch).mockResolvedValue(
      jsonResponse({ policy: '{"acls":[]}', updatedAt: '2026-08-14T00:00:00Z' }),
    );

    const result = await getHeadscalePolicy(BRAIN);

    expect(result.configured).toBe(true);
    expect(result.policy).toBe('{"acls":[]}');
    expect(throttledFetch).toHaveBeenCalledWith(
      `${CONTROL_URL}/api/v1/policy`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer hs-token' }) }),
      expect.any(Number),
    );
  });

  // Headscale answers 500, not 404, when database mode is on but no policy has
  // been written yet. That is the expected first-run state, so it must not be
  // reported as a failure or the caller can never bootstrap a policy.
  it('normalises an empty policy table to unset instead of throwing', async () => {
    vi.mocked(throttledFetch).mockResolvedValue(
      errorResponse(500, 'failed to get policy: policy not found'),
    );

    const result = await getHeadscalePolicy(BRAIN);

    expect(result.configured).toBe(false);
    expect(result.unset).toBe(true);
    expect(result.policy).toBeNull();
  });

  it('surfaces a genuine server failure rather than masking it as unset', async () => {
    vi.mocked(throttledFetch).mockResolvedValue(errorResponse(503, 'upstream unavailable'));

    await expect(getHeadscalePolicy(BRAIN)).rejects.toThrow(/503/);
  });

  it('explains file policy mode instead of surfacing a bare 400', async () => {
    vi.mocked(throttledFetch).mockResolvedValue(
      errorResponse(400, 'policy is read from file, database mode required'),
    );

    await expect(getHeadscalePolicy(BRAIN)).rejects.toMatchObject({
      code: 'POLICY_MODE_FILE',
    });
  });
});

describe('setHeadscalePolicy', () => {
  it('serialises an object policy and PUTs it', async () => {
    vi.mocked(throttledFetch).mockResolvedValue(jsonResponse({ policy: '{}' }));

    await setHeadscalePolicy({ acls: [] }, BRAIN);

    const [url, options] = vi.mocked(throttledFetch).mock.calls[0];
    expect(url).toBe(`${CONTROL_URL}/api/v1/policy`);
    expect(options.method).toBe('PUT');
    // The wire format wraps the policy as a string in a `policy` field.
    expect(JSON.parse(options.body).policy).toContain('"acls"');
  });

  it('passes a pre-formatted string through unchanged', async () => {
    vi.mocked(throttledFetch).mockResolvedValue(jsonResponse({ policy: 'raw' }));

    await setHeadscalePolicy('{"acls":[]} // hujson comment', BRAIN);

    const body = JSON.parse(vi.mocked(throttledFetch).mock.calls[0][1].body);
    expect(body.policy).toBe('{"acls":[]} // hujson comment');
  });

  it('refuses an empty policy', async () => {
    await expect(setHeadscalePolicy('', BRAIN)).rejects.toThrow(/required/i);
    expect(throttledFetch).not.toHaveBeenCalled();
  });
});

describe('buildMeshSshPolicy', () => {
  it('excludes root by default', () => {
    const policy = buildMeshSshPolicy();
    expect(policy.ssh[0].users).toEqual(['autogroup:nonroot']);
    expect(policy.ssh[0].action).toBe('accept');
  });

  it('permits root only when explicitly asked', () => {
    expect(buildMeshSshPolicy({ allowRoot: true }).ssh[0].users).toContain('root');
  });

  it('produces a policy headscale can parse as JSON', () => {
    expect(() => JSON.parse(JSON.stringify(buildMeshSshPolicy()))).not.toThrow();
  });
});
