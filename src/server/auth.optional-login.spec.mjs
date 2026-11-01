import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ requireLogin: undefined, configured: true, local: true, baseCalls: 0 }));

vi.mock('../core/plugin-runtime.mjs', () => ({
  loadPluginModule: async () => ({
    BCRYPT_COST: 4,
    createServerAuth: () => ({
      loadSecurityConfig: () => ({ dashboard: { require_login: state.requireLogin } }),
      dashboardAuthState: () => ({ configured: state.configured }),
      isLocalRequest: () => state.local,
      isLoopbackIp: (v) => ['127.0.0.1', '::1', 'localhost'].includes(v),
      requireAuth: (_req, res) => { state.baseCalls += 1; res.status(401).json({}); },
    }),
  }),
}));
vi.mock('../core/config.mjs', () => ({ brainDir: '/x', nodeEnv: 'test' }));
vi.mock('../core/auth-guard.mjs', () => ({ authGuard: {} }));
vi.mock('./keys.mjs', () => ({ findValidKeyByToken: () => null, keyHasAnyScope: () => false, recordKeyUsage: () => {}, recordKeyOutcome: () => {} }));
vi.mock('../core/logger.mjs', () => ({ logger: {} }));

const { requireAuth, loginRequired } = await import('./auth.mjs');

const run = (headers = { host: 'localhost:3000' }) => {
  const req = { headers };
  const res = { status: vi.fn(() => res), json: vi.fn() };
  const next = vi.fn();
  requireAuth(req, res, next);
  return { req, res, next };
};

describe('optional dashboard login', () => {
  beforeEach(() => Object.assign(state, { requireLogin: false, configured: true, local: true, baseCalls: 0 }));

  it('lets a local browser in when require_login is false', () => {
    const { req, next } = run();
    expect(next).toHaveBeenCalled();
    expect(req.auth.type).toBe('dashboard_session');
  });

  it('defaults to required once a password exists, and to open before one does', () => {
    state.requireLogin = undefined;
    expect(loginRequired()).toBe(true);
    state.configured = false;
    expect(loginRequired()).toBe(false);
  });

  it('still authenticates when require_login is true', () => {
    state.requireLogin = true;
    expect(run().next).not.toHaveBeenCalled();
    expect(state.baseCalls).toBe(1);
  });

  it.each([
    ['a non-local client', { host: 'localhost:3000' }, false],
    ['a public Host header', { host: 'brain.example.com' }, true],
    ['a foreign Origin', { host: 'localhost:3000', origin: 'https://evil.example' }, true],
    ['a Bearer token', { host: 'localhost:3000', authorization: 'Bearer x' }, true],
  ])('does not bypass for %s', (_n, headers, local) => {
    state.local = local;
    expect(run(headers).next).not.toHaveBeenCalled();
    expect(state.baseCalls).toBe(1);
  });
});
