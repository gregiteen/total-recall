import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Hoisted so the mock factories below can reach them.
const state = vi.hoisted(() => ({ configured: false, local: true, changed: 0 }));

vi.mock('../auth.mjs', () => ({
  requireAuth: (_req, _res, next) => next(),
  isLocalRequest: () => state.local,
  loadSecurityConfig: () => (state.configured ? { dashboard: { password_hash: 'x' } } : {}),
  loginHandler: (_req, res) => res.json({ success: true }),
  logoutHandler: (_req, res) => res.json({ success: true }),
  changePasswordHandler: (_req, res) => {
    state.changed += 1;
    return res.json({ success: true });
  },
}));

vi.mock('../../core/logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { authRouter } = await import('./auth.mjs');

const app = () => {
  const a = express();
  a.use(express.json());
  a.use(authRouter);
  return a;
};

describe('POST /auth/setup — claiming an unconfigured brain', () => {
  beforeEach(() => {
    state.configured = false;
    state.local = true;
    state.changed = 0;
  });

  it('lets the machine running the brain set the first password', async () => {
    const res = await request(app()).post('/auth/setup').send({ newPassword: 'correct horse battery' });
    expect(res.status).toBe(200);
    expect(state.changed).toBe(1);
  });

  it('refuses a remote caller, who would otherwise own the brain', async () => {
    // This route cannot require auth -- there is no credential yet -- so who
    // may call it is the only control. It was safe by accident while an
    // unconfigured brain bound loopback only; once such a brain binds its mesh
    // address, the first device on the tailnet to POST here owns it.
    state.local = false;
    const res = await request(app()).post('/auth/setup').send({ newPassword: 'attacker chosen' });
    expect(res.status).toBe(403);
    expect(state.changed).toBe(0);
    // The refusal has to name the way out, or a headless install is bricked.
    expect(res.body.error).toMatch(/reset-password/);
  });

  it('still refuses once a password exists, local or not', async () => {
    state.configured = true;
    for (const local of [true, false]) {
      state.local = local;
      const res = await request(app()).post('/auth/setup').send({ newPassword: 'takeover' });
      expect(res.status).toBe(400);
      expect(state.changed).toBe(0);
    }
  });

  it('checks configured-ness before locality, so an owned brain never leaks its reachability', async () => {
    // A 403 to a remote caller on a configured brain would confirm "not yet
    // claimed" was never true; 400 is the same answer everyone gets.
    state.configured = true;
    state.local = false;
    const res = await request(app()).post('/auth/setup').send({ newPassword: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('GET /auth/status', () => {
  beforeEach(() => { state.configured = false; state.local = true; });

  it('reports whether a password has been set', async () => {
    const unset = await request(app()).get('/auth/status');
    expect(unset.body).toEqual({ configured: false });
    state.configured = true;
    const set = await request(app()).get('/auth/status');
    expect(set.body).toEqual({ configured: true });
  });
});
