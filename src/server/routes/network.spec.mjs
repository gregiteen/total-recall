import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { networkRouter } from './network.mjs';

// Mock the auth middleware to always pass
vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => next()
}));

// Mock throttled-fetch methods
vi.mock('../../core/throttled-fetch.mjs', () => ({
  getGateStats: vi.fn(() => ({ total: 10, blocked: 2 })),
  getAuditLog: vi.fn(() => [
    { domain: 'evil.com', status: 403, timestamp: new Date().toISOString() },
    { domain: 'good.com', status: 200, timestamp: new Date().toISOString() }
  ])
}));

// Mock vault cache
vi.mock('../../core/vault-cache.mjs', () => ({
  getNodes: vi.fn(() => Promise.resolve([
    {
      frontmatter: {
        id: 'network-policy',
        blocked_domains: ['bad.com']
      }
    }
  ]))
}));

// Mock ssss routing
const mockSsssOperationHandler = vi.fn((req, res) => {
  res.json({ success: true, patched: req.body.patch });
  return Promise.resolve();
});

vi.mock('./ssss.mjs', () => ({
  ssssOperationHandler: mockSsssOperationHandler
}));

describe('Network API Routes', () => {
  let app;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(networkRouter);
    vi.clearAllMocks();
  });

  it('GET /api/network/stats returns stats and audit count', async () => {
    const res = await request(app).get('/api/network/stats');
    expect(res.status).toBe(200);
    expect(res.body.stats.total).toBe(10);
    expect(res.body.audit_count).toBe(2);
  });

  it('GET /api/network/policy returns policy frontmatter', async () => {
    const res = await request(app).get('/api/network/policy');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('network-policy');
    expect(res.body.blocked_domains).toContain('bad.com');
  });

  it('PUT /api/network/policy routes through SSSS patch', async () => {
    const res = await request(app)
      .put('/api/network/policy')
      .send({ max_retries: 5 });
      
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSsssOperationHandler).toHaveBeenCalled();
  });

  it('POST /api/network/block adds a domain and routes through SSSS patch', async () => {
    const res = await request(app)
      .post('/api/network/block')
      .send({ domain: 'malware.com' });
      
    expect(res.status).toBe(200);
    expect(mockSsssOperationHandler).toHaveBeenCalled();
    const mockCall = mockSsssOperationHandler.mock.calls[0][0];
    expect(mockCall.body.patch.blocked_domains).toContain('bad.com');
    expect(mockCall.body.patch.blocked_domains).toContain('malware.com');
  });

  it('POST /api/network/block ignores already blocked domain', async () => {
    const res = await request(app)
      .post('/api/network/block')
      .send({ domain: 'bad.com' }); // Already blocked in mock
      
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('already_blocked');
    expect(mockSsssOperationHandler).not.toHaveBeenCalled();
  });

  it('DELETE /api/network/block/:domain removes domain via SSSS patch', async () => {
    const res = await request(app).delete('/api/network/block/bad.com');
    expect(res.status).toBe(200);
    expect(mockSsssOperationHandler).toHaveBeenCalled();
    const mockCall = mockSsssOperationHandler.mock.calls[0][0];
    expect(mockCall.body.patch.blocked_domains).not.toContain('bad.com');
  });

  it('GET /api/network/audit filters by domain and status', async () => {
    const res = await request(app).get('/api/network/audit?domain=evil.com&status=error');
    expect(res.status).toBe(200);
    expect(res.body.audit).toHaveLength(1);
    expect(res.body.audit[0].domain).toBe('evil.com');
  });
});
