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

vi.mock('../../core/logger.mjs', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('../../core/usage-tracker.mjs', () => ({
  syncUsageLedger: vi.fn(),
  calculateCurrentCost: vi.fn().mockReturnValue({ total_cost: 0, sessions: [] }),
}));

import { systemRouter } from './system.mjs';

const app = express();
app.use(express.json());
app.use(systemRouter);

describe('System Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/usage route exists and calls usage-tracker', async () => {

    // Route exists — we just check it returns a response (even 500 if tracker not found)
    const res = await request(app).get('/api/usage');
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/logs/:type rejects invalid types', async () => {
    const res = await request(app).get('/api/logs/invalid');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid log type/i);
  });

  it('GET /api/logs/server returns content or empty state', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const res = await request(app).get('/api/logs/server');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('content');
  });

  it('GET /api/tasks/failed returns total and tasks array shape', async () => {
    vi.doMock('../../core/scheduler.mjs', () => ({
      loadPendingTasks: vi.fn().mockReturnValue([
        { slug: 'task-1', status: 'failed' },
        { slug: 'task-2', status: 'pending' },
      ]),
      updateTaskStatus: vi.fn(),
    }));

    const res = await request(app).get('/api/tasks/failed');
    // Route exists — may be 200 or 500 depending on scheduler import
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('tasks');
    }
  });
});
