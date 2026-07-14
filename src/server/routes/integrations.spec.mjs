import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';

// Mock dependencies
vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'test' }; next(); },
  requireScope: () => (req, res, next) => next(),
}));

vi.mock('../keys.mjs', () => ({
  issueKey: vi.fn(() => ({
    token: 'tr_test_token',
    token_prefix: 'tr_test',
    id: 'key-123',
  })),
}));

vi.mock('../../cli/connect.mjs', () => ({
  default: vi.fn(),
}));

vi.mock('./_shared.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    BRAIN_DIR: '/mock/brain',
  };
});

import { issueKey } from '../keys.mjs';
import connect from '../../cli/connect.mjs';
import integrationsRouter from './integrations.mjs';

const app = express();
app.use(express.json());
app.use(integrationsRouter);

describe('Integrations Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/integrations/active', () => {
    it('returns active integrations from wizard config', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('wizard-config.json')) return true;
        return false;
      });
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ configuredIdes: ['claude-code', 'cursor'] })
      );

      const res = await request(app).get('/api/integrations/active');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.active).toContain('claude-code');
      expect(res.body.active).toContain('cursor');
    });

    it('falls back to filesystem detection when no config', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const res = await request(app).get('/api/integrations/active');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.active)).toBe(true);
    });
  });

  describe('POST /api/integrations/connect', () => {
    it('connects a valid client successfully', async () => {
      connect.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/integrations/connect')
        .send({ client: 'cursor' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.key_id).toBe('key-123');
      expect(issueKey).toHaveBeenCalledWith('Cursor Link', { scopes: ['ssss:read', 'memory:read'] });
    });

    it('returns 400 when client is missing', async () => {
      const res = await request(app)
        .post('/api/integrations/connect')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/client is required/);
    });

    it('returns 400 for unknown client', async () => {
      const res = await request(app)
        .post('/api/integrations/connect')
        .send({ client: 'unknown-ide' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Unknown client/);
    });

    it('passes baseUrl to connect args when provided', async () => {
      connect.mockResolvedValue(undefined);

      await request(app)
        .post('/api/integrations/connect')
        .send({ client: 'vscode', baseUrl: 'http://localhost:3000' });

      expect(connect).toHaveBeenCalledWith(
        expect.arrayContaining(['--brain', 'http://localhost:3000'])
      );
    });
  });
});
