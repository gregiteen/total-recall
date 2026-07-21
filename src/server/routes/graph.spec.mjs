import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const {
  TEST_DIR,
  VAULT_DIR,
  PREF_DIR,
  BRAIN_DIR,
  DERIVED_DIR,
  SKILLS_DIR,
  INSTRUCTIONS,
  ROOT,
} = await vi.hoisted(async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const os = await import('node:os');
  const tDir = fs.mkdtempSync(path.join(os.tmpdir(), 'total-recall-graph-'));
  const sDir = path.join(tDir, 'skills');
  return {
    TEST_DIR: tDir,
    VAULT_DIR: path.join(tDir, 'vault'),
    PREF_DIR: path.join(tDir, 'preferences'),
    BRAIN_DIR: path.join(tDir, 'brain'),
    DERIVED_DIR: path.join(tDir, 'derived'),
    SKILLS_DIR: sDir,
    INSTRUCTIONS: path.join(tDir, 'INSTRUCTIONS.md'),
    ROOT: tDir,
  };
});

[VAULT_DIR, PREF_DIR, BRAIN_DIR, DERIVED_DIR, SKILLS_DIR, path.join(SKILLS_DIR, 'total-recall', 'references')].forEach(d => fs.mkdirSync(d, { recursive: true }));

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
    VAULT_DIR,
    BRAIN_DIR,
    DERIVED_DIR,
    SKILLS_DIR,
    INSTRUCTIONS,
    ROOT,
    // Original resolveVaultFromQuery closes over real VAULT_DIR — pin to test vault
    resolveVaultFromQuery: () => VAULT_DIR,
    pathsForVault: () => ({
      brainDir: BRAIN_DIR,
      derivedDir: DERIVED_DIR,
      skillsDir: SKILLS_DIR,
      instructionsFile: INSTRUCTIONS,
      sessionsDir: path.join(BRAIN_DIR, 'sessions'),
      inboxDir: path.join(BRAIN_DIR, 'memory-inbox'),
    }),
  };
});

import { getNodes, invalidate } from '../../core/vault-cache.mjs';
import { resolveConflict } from '../../core/conflict-detector.mjs';
import graphRouter from './graph.mjs';

const app = express();
app.use(express.json());
app.use(graphRouter);

describe('Graph Router', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    getNodes.mockReturnValue([]);
    
    // Clean up files before each test
    [
      path.join(PREF_DIR, 'dashboard-enhanced.md'),
      path.join(DERIVED_DIR, 'graph-index.jsonl'),
      path.join(SKILLS_DIR, 'total-recall', 'references', 'valid-name.md')
    ].forEach(f => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  });
  
  afterAll(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('GET /api/graph', () => {
    it('returns 404 when dashboard-enhanced flag is not set', async () => {
      const res = await request(app).get('/api/graph');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/dashboard-enhanced/);
    });

    it('returns graph nodes and routes when flag is enabled', async () => {
      fs.writeFileSync(path.join(PREF_DIR, 'dashboard-enhanced.md'), '');
      fs.writeFileSync(path.join(DERIVED_DIR, 'graph-index.jsonl'), '{"id":"node-1"}\n');

      const res = await request(app).get('/api/graph');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.nodes)).toBe(true);
      expect(Array.isArray(res.body.routes)).toBe(true);
    });
  });

  describe('GET /api/conflicts', () => {
    it('returns 404 when dashboard-enhanced flag is not set', async () => {
      const res = await request(app).get('/api/conflicts');
      expect(res.status).toBe(404);
    });

    it('returns merged conflicts list', async () => {
      fs.writeFileSync(path.join(PREF_DIR, 'dashboard-enhanced.md'), '');
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
      const res = await request(app).get('/api/ssss/references/valid-name');
      expect(res.status).toBe(404);
    });
  });
});
