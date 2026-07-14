import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';

// Mock dependencies
vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'test' }; next(); },
  requireScope: () => (req, res, next) => next(),
}));

vi.mock('./_shared.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    BRAIN_DIR: '/tmp/mock-brain',
    serverError: (res, err) => res.status(500).json({ error: err.message }),
  };
});

import { extensionRouter } from './extension.mjs';

const app = express();
app.use(express.json());
app.use(extensionRouter);

describe('Extension Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/extension/status returns expected shape', async () => {
    // Extension dir won't exist in test env — that's fine, we check shape
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const res = await request(app).get('/api/extension/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('available');
    expect(res.body).toHaveProperty('connected');
    expect(res.body).toHaveProperty('version');
    expect(typeof res.body.available).toBe('boolean');
    expect(typeof res.body.connected).toBe('boolean');
  });

  it('GET /api/extension/status returns available=false when extension dir is missing', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const res = await request(app).get('/api/extension/status');
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.connected).toBe(false);
  });

  it('GET /api/extension/download returns 404 when extension dir is missing', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const res = await request(app).get('/api/extension/download');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});
