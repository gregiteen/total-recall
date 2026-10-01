// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
vi.mock('../auth.mjs', () => ({ requireAuth: (_req, _res, next) => next(), requireScope: () => (_req, _res, next) => next() }));
vi.mock('../../core/config.mjs', async importOriginal => ({ ...await importOriginal(), brainDir: '/fixture/global' }));
vi.mock('../../core/logger.mjs', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../core/vault-cache.mjs', () => ({ getNodes: () => [
  { slug: 'r', category: 'invariants', status: 'active', body: 'Keep records.' },
  { slug: 'manual', category: 'facts', status: 'active', body: 'deployment reference' },
] }));
vi.mock('../../core/surface.mjs', () => ({ mergeGlobalRuleNodes: nodes => nodes, legacyRuleContributions: () => [] }));
vi.mock('../../core/command-surface.mjs', () => ({ surfaceInputsHash: () => 'fixture' }));
vi.mock('./_shared.mjs', () => ({
  resolveVaultFromQuery: () => '/fixture/project/.agent/skills/total-recall/memory-vault',
  pathsForVault: () => ({ derivedDir: '/fixture/derived', skillsDir: '/fixture/project/.agent/skills' }),
  badRequest: (res, message) => res.status(400).json({ error: message }),
  serverError: (res, error) => res.status(500).json({ error: error.message }),
}));
import router from './context.mjs';
const app = express();
app.use(express.json());
app.use(router);
describe('context response contract (auth exercised by separate auth suites)', () => {
  it('returns rules only and accounts for the complete serialized payload', async () => {
    const res = await request(app).post('/api/context').send({ query: 'deployment', actions: ['read'] });
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.context).not.toContain('manual');
    expect(res.body.stats.required_ids).toBeUndefined();
    expect(res.body.stats.total_tokens).toBe(Math.ceil((res.text.length + 1) / 4));
  });
  it('adds knowledge and debug inventories only when explicitly requested', async () => {
    const res = await request(app).post('/api/context').send({ query: 'deployment', include_knowledge: true, debug: true });
    expect(res.body.context).toContain('manual');
    expect(res.body.stats.required_ids).toEqual(['project:r']);
    expect(res.body.stats.budget_used).toBe(res.body.stats.total_tokens);
  });
  it('preserves required instructions and reports complete-payload overflow', async () => {
    const res = await request(app).post('/api/context').send({ budget: { total: 1 } });
    expect(res.body.ready).toBe(false);
    expect(res.body.context).toContain('Keep records.');
    expect(res.body.stats.overflow_tokens).toBeGreaterThan(0);
  });
  it.each([{ debug: 'true' }, { include_knowledge: 'true' }, { actions: 'read' }])('rejects malformed flags %j', async body => {
    expect((await request(app).post('/api/context').send(body)).status).toBe(400);
  });
});
