import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { rulesRouter } from './rules.mjs';

vi.mock('../../cli/agent-dir.mjs', () => ({
  getBothBrains: vi.fn().mockReturnValue({
    global: { brainRoot: '/global' },
    project: { brainRoot: '/project' }
  })
}));

vi.mock('../../core/vault-cache.mjs', () => ({
  getNodes: vi.fn().mockImplementation((dir) => {
    if (dir === '/global/memory-vault') {
      return [{ category: 'invariants', content: 'global rule' }];
    }
    if (dir === '/project/memory-vault') {
      return [{ category: 'preferences', content: 'project rule' }];
    }
    return [];
  })
}));

describe('rules routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use('/', rulesRouter);
  });

  it('GET /api/rules returns combined rules', async () => {
    const res = await request(app).get('/api/rules');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      rules: [
        { category: 'invariants', content: 'global rule', scope: 'global' },
        { category: 'preferences', content: 'project rule', scope: 'project' }
      ]
    });
  });
});
