import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { rulesRouter } from './rules.mjs';

vi.mock('../../cli/agent-dir.mjs', () => ({
  getBothBrains: vi.fn().mockReturnValue({
    global: { brainDir: '/global' },
    project: { brainDir: '/project' },
  }),
}));

vi.mock('../../core/vault-cache.mjs', () => ({
  getNodes: vi.fn().mockImplementation((dir) => {
    if (dir === '/global/memory-vault') {
      return [
        {
          slug: 'g-inv',
          category: 'invariants',
          title: 'Global rule',
          body: 'global rule body',
          status: 'active',
          importance: 4,
        },
      ];
    }
    if (dir === '/project/memory-vault') {
      return [
        {
          slug: 'p-pref',
          category: 'preferences',
          title: 'Project rule',
          content: 'project rule body',
          status: 'active',
          importance: 2,
        },
        {
          slug: 'p-corr',
          category: 'corrections',
          title: 'Old correction category',
          body: 'correction body',
          status: 'active',
          importance: 3,
        },
      ];
    }
    return [];
  }),
}));

vi.mock('../../core/logger.mjs', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe('rules routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use('/', rulesRouter);
  });

  it('GET /api/rules returns combined rules from brainDir layers', async () => {
    const res = await request(app).get('/api/rules');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(res.body.rules).toEqual([
      {
        slug: 'g-inv',
        category: 'invariants',
        title: 'Global rule',
        body: 'global rule body',
        status: 'active',
        importance: 4,
        scope: 'global',
      },
      {
        slug: 'p-pref',
        category: 'preferences',
        title: 'Project rule',
        body: 'project rule body',
        status: 'active',
        importance: 2,
        scope: 'project',
      },
      {
        slug: 'p-corr',
        category: 'anti-patterns',
        title: 'Old correction category',
        body: 'correction body',
        status: 'active',
        importance: 3,
        scope: 'project',
      },
    ]);
  });

  it('GET /api/rules dedupes when project brainDir aliases global', async () => {
    const { getBothBrains } = await import('../../cli/agent-dir.mjs');
    vi.mocked(getBothBrains).mockReturnValueOnce({
      global: { brainDir: '/same' },
      project: { brainDir: '/same' },
    });
    const { getNodes } = await import('../../core/vault-cache.mjs');
    vi.mocked(getNodes).mockImplementation((dir) => {
      if (dir === '/same/memory-vault') {
        return [{ slug: 'one', category: 'invariants', title: 'Only', body: 'x', status: 'active', importance: 1 }];
      }
      return [];
    });

    const res = await request(app).get('/api/rules');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.rules[0].scope).toBe('global');
  });
});
