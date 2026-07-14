import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';

// ─── Auth mock: requireAuth enforces auth, requireScope is permissive ─────────

let authEnabled = true;

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => {
    if (!authEnabled) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: 'test' };
    next();
  },
  requireScope: () => (req, res, next) => next(),
  loadSecurityConfig: () => ({ api: { pats: [] }, rate_limits: {} }),
}));

vi.mock('./_shared.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    BRAIN_DIR: '/mock/brain',
    CONFIG_DIR: '/mock/brain/config',
    AGENT_DIR: '/mock/agent',
    serverError: (res, err) => res.status(500).json({ error: err.message }),
    badRequest: (res, msg) => res.status(400).json({ error: msg }),
  };
});

vi.mock('../../core/runtime.mjs', () => ({
  loadRuntimeConfig: vi.fn().mockReturnValue({ model: 'test-model' }),
}));

import { configRouter } from './config.mjs';

const app = express();
app.use(express.json());
app.use(configRouter);

describe('Config Router', () => {
  beforeEach(() => {
    authEnabled = true;
    vi.clearAllMocks();
  });

  it('GET /api/config requires auth', async () => {
    authEnabled = false;
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(401);
  });

  it('GET /api/config returns security and runtime shape when authenticated', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('security');
    expect(res.body).toHaveProperty('runtime');
  });

  it('GET /api/config-json returns all config sections', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const res = await request(app).get('/api/config-json');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('security');
    expect(res.body).toHaveProperty('budget');
    expect(res.body).toHaveProperty('brain');
    expect(res.body).toHaveProperty('secrets');
  });

  it('GET /api/config/:name rejects path traversal attempts', async () => {
    const res = await request(app).get('/api/config/..%2F..%2Fetc%2Fpasswd');
    // Either 400 (bad name caught) or 404 (route not matched) — either is safe
    expect([400, 404]).toContain(res.status);
  });

  it('GET /api/config/DESIGN.md returns default content when missing', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const res = await request(app).get('/api/config/DESIGN.md');
    expect(res.status).toBe(200);
    expect(res.body.content).toMatch(/Design System/);
  });
});
