import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';

vi.mock('node:child_process', () => {
  const mockedSpawnSync = vi.fn();
  return { spawnSync: mockedSpawnSync, default: { spawnSync: mockedSpawnSync } };
});

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));

vi.mock('./headscale-client.mjs', () => ({
  describeHeadscaleAvailability: vi.fn(),
  createHeadscalePreAuthKey: vi.fn(),
  resolveHeadscaleUser: vi.fn(),
  headscaleUrlFromEnv: vi.fn(() => null),
  normalizeControlUrl: (v) => {
    const s = String(v || '').trim();
    return s.endsWith('/') ? s.slice(0, -1) : s;
  },
}));

const {
  ENROLLMENT_STATES,
  buildUpArgs,
  enrollThisNode,
  ensureEnrolled,
  getEnrollmentStatus,
  isIncompleteSettingsError,
  resetAutoEnrollThrottle,
  resolveLoginServer,
  autoEnrollEnabled,
} = await import('./mesh-enroll.mjs');
const headscaleClient = await import('./headscale-client.mjs');

/** Neutral fixtures — no real control server, hostname, or device name. */
const CONTROL_URL = 'https://control.example.org';

const runningStatus = {
  BackendState: 'Running',
  TailscaleIPs: ['100.64.0.9'],
  Self: { HostName: 'node-self' },
};
const needsLoginStatus = {
  BackendState: 'NeedsLogin',
  AuthURL: `${CONTROL_URL}/register/abc123`,
  TailscaleIPs: null,
  Self: { HostName: 'node-self' },
};
const stoppedStatus = {
  BackendState: 'Stopped',
  TailscaleIPs: ['100.64.0.9'],
  Self: { HostName: 'node-self' },
};

/**
 * Route mocked spawnSync by subcommand so a test can describe client state
 * without caring how many times the module probes it.
 */
function mockClient({ status, prefs, upResult }) {
  vi.mocked(spawnSync).mockImplementation((_bin, args) => {
    if (args[0] === 'status') {
      return status
        ? { status: 0, stdout: JSON.stringify(status), stderr: '' }
        : { status: 1, stdout: '', stderr: 'command not found' };
    }
    if (args[0] === 'debug' && args[1] === 'prefs') {
      return prefs
        ? { status: 0, stdout: JSON.stringify(prefs), stderr: '' }
        : { status: 1, stdout: '', stderr: '' };
    }
    if (args[0] === 'up') {
      return upResult || { status: 0, stdout: '', stderr: '' };
    }
    if (args[0] === 'login') {
      return { status: 1, stdout: '', stderr: `To authenticate, visit:\n\n\t${CONTROL_URL}/register/xyz\n` };
    }
    return { status: 1, stdout: '', stderr: '' };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAutoEnrollThrottle();
  delete process.env.TR_MESH_AUTO_ENROLL;
  vi.mocked(headscaleClient.headscaleUrlFromEnv).mockReturnValue(null);
  vi.mocked(headscaleClient.describeHeadscaleAvailability).mockResolvedValue({
    configured: true,
    reason: null,
    url: CONTROL_URL,
    keyName: 'HEADSCALE_API_KEY',
  });
  vi.mocked(headscaleClient.resolveHeadscaleUser).mockResolvedValue({ id: '1', name: 'default' });
  vi.mocked(headscaleClient.createHeadscalePreAuthKey).mockResolvedValue({
    key: 'preauth-secret-value',
    expiration: new Date(Date.now() + 600_000).toISOString(),
  });
});

describe('enrollment status', () => {
  it('reports enrolled when the backend is running with a mesh IP', async () => {
    mockClient({ status: runningStatus, prefs: { ControlURL: CONTROL_URL } });
    const status = await getEnrollmentStatus({ brainDir: '/tmp/brain' });
    expect(status.state).toBe(ENROLLMENT_STATES.ENROLLED);
    expect(status.enrolled).toBe(true);
    expect(status.ips).toEqual(['100.64.0.9']);
  });

  it('surfaces the pending registration URL when login is needed', async () => {
    mockClient({ status: needsLoginStatus, prefs: { ControlURL: CONTROL_URL, LoggedOut: true } });
    const status = await getEnrollmentStatus({ brainDir: '/tmp/brain' });
    expect(status.state).toBe(ENROLLMENT_STATES.NEEDS_LOGIN);
    expect(status.auth_url).toBe(`${CONTROL_URL}/register/abc123`);
    expect(status.can_auto_enroll).toBe(true);
  });

  it('reports client_unavailable when the tailscale binary is missing', async () => {
    mockClient({ status: null, prefs: null });
    const status = await getEnrollmentStatus({ brainDir: '/tmp/brain' });
    expect(status.state).toBe(ENROLLMENT_STATES.CLIENT_UNAVAILABLE);
    expect(status.client_available).toBe(false);
  });

  it('blocks automatic enrollment when no headscale credential is configured', async () => {
    vi.mocked(headscaleClient.describeHeadscaleAvailability).mockResolvedValue({
      configured: false,
      reason: 'no-headscale-api-key',
      url: null,
    });
    mockClient({ status: needsLoginStatus, prefs: { ControlURL: CONTROL_URL } });
    const status = await getEnrollmentStatus({ brainDir: '/tmp/brain' });
    expect(status.can_auto_enroll).toBe(false);
    expect(status.auto_enroll_blocked_reason).toBe('no-headscale-api-key');
    // Falls back to the URL the local client already targets.
    expect(status.login_server).toBe(CONTROL_URL);
  });
});

describe('resolveLoginServer', () => {
  it('prefers explicit over secret over local client prefs', () => {
    expect(
      resolveLoginServer({
        explicit: 'https://explicit.example.org',
        secretUrl: 'https://secret.example.org',
        prefs: { ControlURL: 'https://prefs.example.org' },
      }),
    ).toBe('https://explicit.example.org');
    expect(
      resolveLoginServer({
        secretUrl: 'https://secret.example.org/',
        prefs: { ControlURL: 'https://prefs.example.org' },
      }),
    ).toBe('https://secret.example.org');
    expect(resolveLoginServer({ prefs: { ControlURL: 'https://prefs.example.org' } })).toBe(
      'https://prefs.example.org',
    );
  });

  it('returns null when nothing is configured — never a hardcoded default', () => {
    expect(resolveLoginServer({})).toBeNull();
  });
});

describe('buildUpArgs', () => {
  it('omits --login-server when the client already targets that control server', () => {
    const args = buildUpArgs({
      loginServer: CONTROL_URL,
      prefs: { ControlURL: CONTROL_URL, RouteAll: true },
      authKeyFile: '/tmp/x/authkey',
    });
    expect(args).not.toContain(`--login-server=${CONTROL_URL}`);
    expect(args).toContain('--auth-key=file:/tmp/x/authkey');
  });

  it('restates existing settings so joining never silently reconfigures the node', () => {
    // The real client refuses any flagged `up` that would flip an unmentioned
    // non-default setting — RouteAll:true is exactly that case.
    const args = buildUpArgs({
      loginServer: CONTROL_URL,
      prefs: { ControlURL: CONTROL_URL, RouteAll: true, CorpDNS: true },
      authKeyFile: '/tmp/x/authkey',
    });
    expect(args).toContain('--accept-routes=true');
    expect(args).toContain('--accept-dns=true');
  });

  it('carries the full preference set it models', () => {
    const args = buildUpArgs({
      loginServer: CONTROL_URL,
      prefs: {
        ControlURL: CONTROL_URL,
        RouteAll: false,
        CorpDNS: false,
        ShieldsUp: true,
        RunSSH: true,
        Hostname: 'custom-name',
        AdvertiseRoutes: ['10.0.0.0/24', '10.0.1.0/24'],
        AdvertiseTags: ['tag:ci'],
        ExitNodeIP: '100.64.0.5',
        ExitNodeAllowLANAccess: true,
      },
      authKeyFile: '/tmp/x/authkey',
    });
    expect(args).toContain('--accept-routes=false');
    expect(args).toContain('--accept-dns=false');
    expect(args).toContain('--shields-up');
    expect(args).toContain('--ssh');
    expect(args).toContain('--hostname=custom-name');
    expect(args).toContain('--advertise-routes=10.0.0.0/24,10.0.1.0/24');
    expect(args).toContain('--advertise-tags=tag:ci');
    expect(args).toContain('--exit-node=100.64.0.5');
    expect(args).toContain('--exit-node-allow-lan-access');
  });

  it('passes --login-server when repointing at a different control server', () => {
    const args = buildUpArgs({
      loginServer: CONTROL_URL,
      prefs: { ControlURL: 'https://other.example.org', RouteAll: true },
      authKeyFile: '/tmp/x/authkey',
    });
    expect(args).toContain(`--login-server=${CONTROL_URL}`);
  });

  it('adds --reset only when explicitly asked', () => {
    const withoutReset = buildUpArgs({ prefs: { ControlURL: CONTROL_URL }, authKeyFile: '/tmp/k' });
    expect(withoutReset).not.toContain('--reset');
    const withReset = buildUpArgs({
      loginServer: CONTROL_URL,
      prefs: { ControlURL: CONTROL_URL },
      authKeyFile: '/tmp/k',
      reset: true,
    });
    expect(withReset).toContain('--reset');
  });

  it('always restates --login-server alongside --reset, even when unchanged', () => {
    // Regression: --reset clears unmentioned settings to defaults, and
    // ControlURL is one of them. Omitting it repoints the node at the public
    // control plane, which then rejects the private pre-auth key.
    const args = buildUpArgs({
      loginServer: CONTROL_URL,
      prefs: { ControlURL: CONTROL_URL, RouteAll: true },
      authKeyFile: '/tmp/k',
      reset: true,
    });
    expect(args).toContain(`--login-server=${CONTROL_URL}`);
    expect(args).toContain('--reset');
  });

  it('passes no flags at all when merely resuming a configured node', () => {
    const args = buildUpArgs({ prefs: { ControlURL: CONTROL_URL, RouteAll: true } });
    expect(args).toEqual(['up']);
  });

  it('never places the auth key itself in argv', () => {
    const args = buildUpArgs({ loginServer: CONTROL_URL, prefs: {}, authKeyFile: '/tmp/x/authkey' });
    expect(args.join(' ')).not.toContain('preauth-secret-value');
    expect(args.join(' ')).toContain('--auth-key=file:');
  });
});

describe('isIncompleteSettingsError', () => {
  it('recognizes the real client wording', () => {
    expect(
      isIncompleteSettingsError(
        "changing settings via 'tailscale up' requires mentioning all\nnon-default flags. To proceed, either re-run your command with --reset or",
      ),
    ).toBe(true);
  });

  it('does not match unrelated failures', () => {
    expect(isIncompleteSettingsError('failed to connect to control server')).toBe(false);
    expect(isIncompleteSettingsError('')).toBe(false);
  });
});

describe('enrollThisNode', () => {
  it('mints a pre-auth key and brings the node up unattended', async () => {
    let upCalls = 0;
    vi.mocked(spawnSync).mockImplementation((_bin, args) => {
      if (args[0] === 'status') {
        // Not enrolled before `up`, enrolled after.
        return {
          status: 0,
          stdout: JSON.stringify(upCalls === 0 ? needsLoginStatus : runningStatus),
          stderr: '',
        };
      }
      if (args[0] === 'debug') return { status: 0, stdout: JSON.stringify({ ControlURL: CONTROL_URL }), stderr: '' };
      if (args[0] === 'up') {
        upCalls++;
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    const result = await enrollThisNode({ brainDir: '/tmp/brain' });
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.method).toBe('preauth-key');
    // The resolved ref carries both id and name so the client can satisfy
    // either Headscale API generation.
    expect(headscaleClient.createHeadscalePreAuthKey).toHaveBeenCalledWith(
      expect.objectContaining({ userRef: { id: '1', name: 'default' } }),
      '/tmp/brain',
    );
  });

  it('retries with --reset when the client rejects an unmodeled non-default setting', async () => {
    // Reproduces the real failure: `up` refuses unless every non-default
    // setting is restated. The first attempt is rejected, the retry adds
    // --reset and succeeds.
    const upInvocations = [];
    vi.mocked(spawnSync).mockImplementation((_bin, args) => {
      if (args[0] === 'status') {
        return {
          status: 0,
          stdout: JSON.stringify(upInvocations.length >= 2 ? runningStatus : needsLoginStatus),
          stderr: '',
        };
      }
      if (args[0] === 'debug') {
        return { status: 0, stdout: JSON.stringify({ ControlURL: CONTROL_URL, RouteAll: true }), stderr: '' };
      }
      if (args[0] === 'up') {
        upInvocations.push(args);
        if (upInvocations.length === 1) {
          return {
            status: 1,
            stdout: '',
            stderr: "changing settings via 'tailscale up' requires mentioning all\nnon-default flags. To proceed, either re-run your command with --reset or",
          };
        }
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    const result = await enrollThisNode({ brainDir: '/tmp/brain' });
    expect(upInvocations).toHaveLength(2);
    expect(upInvocations[0]).not.toContain('--reset');
    expect(upInvocations[1]).toContain('--reset');
    // The reset attempt must pin the control server or it lands on SaaS.
    expect(upInvocations[1]).toContain(`--login-server=${CONTROL_URL}`);
    expect(result.ok).toBe(true);
    expect(result.used_reset).toBe(true);
  });

  it('refuses to reset when no control server is known', async () => {
    // A reset with no --login-server would silently repoint the node at the
    // public control plane; failing is the safer outcome.
    vi.mocked(headscaleClient.describeHeadscaleAvailability).mockResolvedValue({
      configured: true,
      reason: null,
      url: '',
      keyName: 'HEADSCALE_API_KEY',
    });
    const upInvocations = [];
    vi.mocked(spawnSync).mockImplementation((_bin, args) => {
      if (args[0] === 'status') return { status: 0, stdout: JSON.stringify(needsLoginStatus), stderr: '' };
      if (args[0] === 'debug') return { status: 0, stdout: JSON.stringify({ RouteAll: true }), stderr: '' };
      if (args[0] === 'up') {
        upInvocations.push(args);
        return {
          status: 1,
          stdout: '',
          stderr: "requires mentioning all\nnon-default flags. To proceed, either re-run your command with --reset or",
        };
      }
      if (args[0] === 'login') return { status: 1, stdout: '', stderr: '' };
      return { status: 1, stdout: '', stderr: '' };
    });

    await enrollThisNode({ brainDir: '/tmp/brain' });
    expect(upInvocations.every((a) => !a.includes('--reset'))).toBe(true);
  });

  it('does not retry when `up` fails for an unrelated reason', async () => {
    const upInvocations = [];
    vi.mocked(spawnSync).mockImplementation((_bin, args) => {
      if (args[0] === 'status') return { status: 0, stdout: JSON.stringify(needsLoginStatus), stderr: '' };
      if (args[0] === 'debug') return { status: 0, stdout: JSON.stringify({ ControlURL: CONTROL_URL }), stderr: '' };
      if (args[0] === 'up') {
        upInvocations.push(args);
        return { status: 1, stdout: '', stderr: 'control server unreachable' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    const result = await enrollThisNode({ brainDir: '/tmp/brain' });
    expect(upInvocations).toHaveLength(1);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/control server unreachable/);
  });

  it('is a no-op when the node is already enrolled', async () => {
    mockClient({ status: runningStatus, prefs: { ControlURL: CONTROL_URL } });
    const result = await enrollThisNode({ brainDir: '/tmp/brain' });
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('already-enrolled');
    expect(headscaleClient.createHeadscalePreAuthKey).not.toHaveBeenCalled();
  });

  it('resumes a stopped-but-authenticated node without minting a key', async () => {
    let upCalls = 0;
    vi.mocked(spawnSync).mockImplementation((_bin, args) => {
      if (args[0] === 'status') {
        return {
          status: 0,
          stdout: JSON.stringify(upCalls === 0 ? stoppedStatus : runningStatus),
          stderr: '',
        };
      }
      if (args[0] === 'debug') return { status: 0, stdout: JSON.stringify({ ControlURL: CONTROL_URL }), stderr: '' };
      if (args[0] === 'up') {
        upCalls++;
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    const result = await enrollThisNode({ brainDir: '/tmp/brain' });
    expect(result.method).toBe('resume');
    expect(headscaleClient.createHeadscalePreAuthKey).not.toHaveBeenCalled();
  });

  it('falls back to the interactive URL when no credential is configured', async () => {
    vi.mocked(headscaleClient.describeHeadscaleAvailability).mockResolvedValue({
      configured: false,
      reason: 'no-headscale-api-key',
      url: null,
    });
    mockClient({ status: needsLoginStatus, prefs: { ControlURL: CONTROL_URL } });

    const result = await enrollThisNode({ brainDir: '/tmp/brain' });
    expect(result.ok).toBe(false);
    expect(result.method).toBe('interactive');
    expect(result.auth_url).toBe(`${CONTROL_URL}/register/abc123`);
    expect(result.hint).toMatch(/Headscale API key/i);
  });

  it('falls back to interactive when the control server rejects the key request', async () => {
    vi.mocked(headscaleClient.createHeadscalePreAuthKey).mockRejectedValue(
      new Error('Headscale API error (401 Unauthorized)'),
    );
    mockClient({ status: needsLoginStatus, prefs: { ControlURL: CONTROL_URL } });

    const result = await enrollThisNode({ brainDir: '/tmp/brain' });
    expect(result.method).toBe('interactive');
    expect(result.auth_url).toBe(`${CONTROL_URL}/register/abc123`);
  });

  it('reports a clear reason when no tailscale client exists', async () => {
    mockClient({ status: null, prefs: null });
    const result = await enrollThisNode({ brainDir: '/tmp/brain' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('tailscale-client-unavailable');
    expect(result.hint).toMatch(/TR_TAILSCALE_BIN/);
  });
});

describe('ensureEnrolled (daemon path)', () => {
  it('skips silently when the node is already enrolled', async () => {
    mockClient({ status: runningStatus, prefs: { ControlURL: CONTROL_URL } });
    const result = await ensureEnrolled({ brainDir: '/tmp/brain' });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('already-enrolled');
  });

  it('throttles repeated attempts so a failing control server is not hammered', async () => {
    mockClient({ status: needsLoginStatus, prefs: { ControlURL: CONTROL_URL }, upResult: { status: 1, stdout: '', stderr: 'refused' } });

    const first = await ensureEnrolled({ brainDir: '/tmp/brain', now: 1_000_000 });
    expect(first.skipped).not.toBe(true);

    const second = await ensureEnrolled({ brainDir: '/tmp/brain', now: 1_000_000 + 60_000 });
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('throttled');

    // Past the retry window it tries again.
    const third = await ensureEnrolled({ brainDir: '/tmp/brain', now: 1_000_000 + 11 * 60_000 });
    expect(third.skipped).not.toBe(true);
  });

  it('honors the TR_MESH_AUTO_ENROLL kill switch', async () => {
    process.env.TR_MESH_AUTO_ENROLL = '0';
    expect(autoEnrollEnabled()).toBe(false);
    const result = await ensureEnrolled({ brainDir: '/tmp/brain' });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('auto-enroll-disabled');
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('does not attempt an unattended enroll when no automatic path exists', async () => {
    vi.mocked(headscaleClient.describeHeadscaleAvailability).mockResolvedValue({
      configured: false,
      reason: 'no-headscale-api-key',
      url: null,
    });
    mockClient({ status: needsLoginStatus, prefs: { ControlURL: CONTROL_URL } });

    const result = await ensureEnrolled({ brainDir: '/tmp/brain' });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no-headscale-api-key');
    expect(result.auth_url).toBe(`${CONTROL_URL}/register/abc123`);
  });

  it('never throws when enrollment blows up', async () => {
    vi.mocked(headscaleClient.describeHeadscaleAvailability).mockRejectedValue(new Error('boom'));
    mockClient({ status: needsLoginStatus, prefs: {} });
    const result = await ensureEnrolled({ brainDir: '/tmp/brain' });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('error');
  });
});
