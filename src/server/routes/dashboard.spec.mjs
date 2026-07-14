import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import dashboardRouter from './dashboard.mjs';

vi.mock('../../core/vault-cache.mjs', () => ({
  getNodes: vi.fn(() => [])
}));
vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => next(),
  requireScope: () => (req, res, next) => next(),
}));

describe('dashboard router', () => {
  it('exports a router with dashboard/instructions endpoint', async () => {
    const app = express();
    app.use(dashboardRouter);
    const res = await request(app).get('/api/dashboard/instructions');
    expect(res.status).toBe(200);
    expect(res.body.surfaces).toBeDefined();
  });
});
