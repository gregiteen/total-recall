import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { spawn } from 'node:child_process';
import updateRouter from './update.mjs';

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => next(),
}));

vi.mock('node:child_process', () => {
  const spawnMock = vi.fn();
  return { default: { spawn: spawnMock }, spawn: spawnMock };
});

describe('update router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports /api/update/check endpoint', async () => {
    spawn.mockReturnValue({
      stdout: {
        on: (event, cb) => {
          if (event === 'data') cb('1.0.0');
        }
      },
      on: (event, cb) => {
        if (event === 'close') cb(0);
      },
      unref: vi.fn()
    });

    const app = express();
    app.use(updateRouter);
    const res = await request(app).get('/api/update/check');
    expect(res.status).toBe(200);
    expect(res.body.latest).toBe('1.0.0');
  });
});
