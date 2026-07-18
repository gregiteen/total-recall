import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import ssssRouter from './ssss.mjs';
import { processOperationAsync } from '../../core/operation-validator.mjs';

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, _res, next) => { req.auth = { role: 'admin' }; next(); },
  requireScope: () => (_req, _res, next) => next(),
}));
vi.mock('../../core/operation-validator.mjs', () => ({ processOperationAsync: vi.fn() }));
vi.mock('../../core/vault-cache.mjs', () => ({ invalidate: vi.fn() }));
vi.mock('./_shared.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, resolveVaultFromQuery: vi.fn(() => '/tmp/test-vault') };
});

describe('SSSS Core Contract route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes canonical envelopes through processOperationAsync', async () => {
    vi.mocked(processOperationAsync).mockResolvedValue({ success: true, type: 'patch' });
    const app = express();
    app.use(express.json());
    app.use(ssssRouter);
    const envelope = {
      type: 'patch', workspace_id: 'default', idempotency_key: 'safe-key',
      path: 'system/network-policy.md', actor: { role: 'viewer', spoofed: true }, patches: { status: 'active' },
    };
    const res = await request(app).post('/api/v1/ssss').send(envelope);
    expect(res.status).toBe(200);
    expect(processOperationAsync).toHaveBeenCalledWith({
      ...envelope,
      actor: { role: 'admin' },
    }, '/tmp/test-vault', { agentRole: 'admin' });
  });

  it('returns validation failures without committing', async () => {
    vi.mocked(processOperationAsync).mockResolvedValue({ success: false, validation: { errors: ['bad'] } });
    const app = express();
    app.use(express.json());
    app.use(ssssRouter);
    const res = await request(app).post('/api/v1/ssss').send({ type: 'patch' });
    expect(res.status).toBe(400);
  });
});
