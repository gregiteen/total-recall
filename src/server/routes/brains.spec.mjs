import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Mock dependencies
vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'test' }; next(); },
  requireScope: () => (req, res, next) => next(),
}));

vi.mock('../../core/vault-cache.mjs', () => ({
  getNodes: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('../../core/config.mjs', () => ({
  default: { remoteVaultSync: { enabled: false } },
  remoteVaultSync: { enabled: false },
  agentDir: '/mock/agent',
  brainDir: '/mock/brain',
}));

import { getNodes } from '../../core/vault-cache.mjs';
import brainsRouter from './brains.mjs';

const app = express();
app.use(express.json());
app.use(brainsRouter);

describe('Brains Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/brains', () => {
    it('returns list with global brain', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
      getNodes.mockReturnValue([]);

      const res = await request(app).get('/api/brains');
      expect(res.status).toBe(200);
      expect(res.body.brains).toBeDefined();
      expect(Array.isArray(res.body.brains)).toBe(true);
      const globalBrain = res.body.brains.find(b => b.id === 'global');
      expect(globalBrain).toBeDefined();
      expect(globalBrain.layer).toBe('global');
    });

    it('includes project brains from registry', async () => {
      const mockRegistry = [
        { name: 'my-project', brainDir: '/mock/projects/my-project', path: '/mock/projects/my-project', registered_at: '2024-01-01' }
      ];
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('project-registry.json')) return true;
        return false;
      });
      vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('project-registry.json')) return JSON.stringify(mockRegistry);
        throw new Error('not found');
      });
      vi.spyOn(fs, 'readdirSync').mockReturnValue([]);

      const res = await request(app).get('/api/brains');
      expect(res.status).toBe(200);
      const projectBrain = res.body.brains.find(b => b.id === 'project:my-project');
      expect(projectBrain).toBeDefined();
      expect(projectBrain.layer).toBe('project');
    });
  });

  describe('GET /api/brains/:id/nodes', () => {
    it('returns nodes for global brain', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      getNodes.mockReturnValue([{ slug: 'test-node', title: 'Test Node', category: 'memory' }]);

      const res = await request(app).get('/api/brains/global/nodes');
      expect(res.status).toBe(200);
      expect(res.body.brain_id).toBe('global');
      expect(Array.isArray(res.body.nodes)).toBe(true);
    });

    it('returns 404 for unknown project', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('project-registry.json')) return true;
        return false;
      });
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([]));

      const res = await request(app).get('/api/brains/project:unknown/nodes');
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid brain id', async () => {
      const res = await request(app).get('/api/brains/invalid-id/nodes');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid brain ID/);
    });

    it('filters nodes by query param q', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      getNodes.mockReturnValue([
        { slug: 'alpha', title: 'Alpha Doc', category: 'memory', tags: [], body: 'alpha content' },
        { slug: 'beta', title: 'Beta Doc', category: 'memory', tags: [], body: 'beta content' },
      ]);

      const res = await request(app).get('/api/brains/global/nodes?q=alpha');
      expect(res.status).toBe(200);
      expect(res.body.nodes).toHaveLength(1);
      expect(res.body.nodes[0].slug).toBe('alpha');
    });

    it('returns empty array when vault does not exist', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const res = await request(app).get('/api/brains/global/nodes');
      expect(res.status).toBe(200);
      expect(res.body.nodes).toEqual([]);
    });
  });
});
