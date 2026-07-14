import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

// Mock dependencies
vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'test' }; next(); },
  requireScope: () => (req, res, next) => next(),
  loadSecurityConfig: () => ({ rate_limits: { api_requests_per_minute: 60 } }),
}));

vi.mock('./_shared.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    serverError: (res, err) => res.status(500).json({ error: err.message }),
  };
});

import { helpRouter } from './help.mjs';

const app = express();
app.use(express.json());
app.use(helpRouter);

describe('Help Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/help returns list of topics when no query param', async () => {
    const res = await request(app).get('/api/help');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('topics');
    expect(Array.isArray(res.body.topics)).toBe(true);
    expect(res.body.topics.length).toBeGreaterThan(0);
    expect(res.body.topics[0]).toHaveProperty('id');
    expect(res.body.topics[0]).toHaveProperty('title');
  });

  it('GET /api/help?topic=cli-reference returns 404 when doc missing', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const res = await request(app).get('/api/help?topic=cli-reference');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('GET /api/help?topic=cli-reference returns content when doc exists', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('# CLI Reference\nUsage: npx total-recall');

    const res = await request(app).get('/api/help?topic=cli-reference');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('topic', 'cli-reference');
    expect(res.body).toHaveProperty('content');
    expect(res.body.content).toContain('CLI Reference');
  });

  it('GET /api/help?topic=unknown returns 404', async () => {
    const res = await request(app).get('/api/help?topic=unknown-topic');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('GET /.well-known/total-recall.json returns manifest shape', async () => {
    const res = await request(app).get('/.well-known/total-recall.json');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'Total Recall');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('api');
    expect(res.body).toHaveProperty('auth');
    expect(res.body).toHaveProperty('capabilities');
  });

  it('GET /api returns API reference with endpoints and scopes', async () => {
    const res = await request(app).get('/api');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'Total Recall REST API');
    expect(res.body).toHaveProperty('endpoints');
    expect(res.body).toHaveProperty('scopes');
    expect(res.body).toHaveProperty('auth');
  });
});
