import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('./_shared.mjs', () => ({
  VAULT_DIR: '/global/memory-vault',
  resolveAllVaultsFromQuery: vi.fn(),
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

const { rulesRouter } = await import('./rules.mjs');
const { resolveAllVaultsFromQuery } = await import('./_shared.mjs');

describe('rules routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAllVaultsFromQuery).mockReturnValue(['/global/memory-vault', '/project/memory-vault']);
    app = express();
    app.use('/', rulesRouter);
  });

  it('GET /api/rules returns combined rules from the brain(s) resolved for the request', async () => {
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

  it('GET /api/rules dedupes when resolved vaults collapse to the same path', async () => {
    // Both entries resolve to the actual global vault dir, so this also verifies
    // scope is 'global' — not just first-in-wins from processing order.
    vi.mocked(resolveAllVaultsFromQuery).mockReturnValueOnce(['/global/memory-vault', '/global/memory-vault']);
    const { getNodes } = await import('../../core/vault-cache.mjs');
    // mockImplementationOnce — a persistent mockImplementation() here would leak
    // into later tests in this file (vi.clearAllMocks() in beforeEach clears
    // calls/results but not implementations set this way).
    vi.mocked(getNodes).mockImplementationOnce((dir) => {
      if (dir === '/global/memory-vault') {
        return [{ slug: 'one', category: 'invariants', title: 'Only', body: 'x', status: 'active', importance: 1 }];
      }
      return [];
    });

    const res = await request(app).get('/api/rules');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.rules[0].scope).toBe('global');
  });

  it('GET /api/rules only queries the selected brain — not every layer — when a single brain is resolved', async () => {
    vi.mocked(resolveAllVaultsFromQuery).mockReturnValueOnce(['/project/memory-vault']);

    const res = await request(app).get('/api/rules?brain=project:foo');
    expect(res.status).toBe(200);
    expect(res.body.rules.every((r) => r.scope === 'project')).toBe(true);
    expect(res.body.count).toBe(2);
  });
});
