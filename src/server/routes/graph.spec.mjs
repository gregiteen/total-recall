import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

// Mock dependencies
vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'test' }; next(); },
  requireScope: () => (req, res, next) => next(),
}));

vi.mock('../../core/vault-cache.mjs', () => ({
  getNodes: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('../../core/conflict-detector.mjs', () => ({
  detectSemanticConflicts: vi.fn(() => []),
  resolveConflict: vi.fn(),
}));

vi.mock('./_shared.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    VAULT_DIR: '/mock/vault',
    BRAIN_DIR: '/mock/brain',
    DERIVED_DIR: '/mock/derived',
    SKILLS_DIR: '/mock/skills',
    INSTRUCTIONS: '/mock/INSTRUCTIONS.md',
    ROOT: '/mock/root',
  };
});

import { getNodes, invalidate } from '../../core/vault-cache.mjs';
import { resolveConflict } from '../../core/conflict-detector.mjs';
import graphRouter from './graph.mjs';

const app = express();
app.use(express.json());
app.use(graphRouter);

describe('Graph Router', () => {
  let actualFs;

  beforeEach(async () => {
    actualFs = await vi.importActual('node:fs');
    vi.clearAllMocks();
    getNodes.mockReturnValue([]);
  });

  describe('GET /api/graph', () => {
    it('returns 404 when dashboard-enhanced flag is not set', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const res = await request(app).get('/api/graph');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/dashboard-enhanced/);
    });

    it('returns graph nodes and routes when flag is enabled', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('dashboard-enhanced.md')) return true;
        if (typeof p === 'string' && p.includes('graph-index.jsonl')) return true;
        return false;
      });
      vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('graph-index.jsonl')) return '{"id":"node-1"}\n';
        return actualFs.readFileSync(p);
      });

      const res = await request(app).get('/api/graph');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.nodes)).toBe(true);
      expect(Array.isArray(res.body.routes)).toBe(true);
    });
  });

  describe('GET /api/conflicts', () => {
    it('returns 404 when dashboard-enhanced flag is not set', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const res = await request(app).get('/api/conflicts');
      expect(res.status).toBe(404);
    });

    it('returns merged conflicts list', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('dashboard-enhanced.md')) return true;
        return false;
      });
      getNodes.mockReturnValue([]);

      const res = await request(app).get('/api/conflicts');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.conflicts)).toBe(true);
    });
  });

  describe('POST /api/conflicts/resolve', () => {
    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/conflicts/resolve')
        .send({ conflict_id: 'abc' }); // missing action and winner_slug

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Required fields/);
    });

    it('returns 400 for invalid action', async () => {
      const res = await request(app)
        .post('/api/conflicts/resolve')
        .send({ conflict_id: 'abc', action: 'invalid', winner_slug: 'x' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/keep.*supersede/);
    });

    it('resolves conflict successfully', async () => {
      resolveConflict.mockReturnValue({ resolved: true });

      const res = await request(app)
        .post('/api/conflicts/resolve')
        .send({ conflict_id: 'conflict-1', action: 'keep', winner_slug: 'my-node' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(invalidate).toHaveBeenCalled();
    });
  });

  describe('GET /api/ssss', () => {
    it('returns SSSS resource index', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const res = await request(app).get('/api/ssss');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('ssss');
      expect(res.body.schema_version).toBe(2);
      expect(res.body.resources).toBeDefined();
    });
  });

  describe('GET /api/ssss/references/:name', () => {
    it('returns 400 for invalid reference name', async () => {
      const res = await request(app).get('/api/ssss/references/../etc/passwd');
      // path traversal attempt — name will be sanitized and fail regex
      expect([400, 404]).toContain(res.status);
    });

    it('returns 404 for non-existent reference', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const res = await request(app).get('/api/ssss/references/valid-name');
      expect(res.status).toBe(404);
    });
  });
});
