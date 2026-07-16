import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import webhooksRouter from './webhooks.mjs';
import * as ssss from './ssss.mjs';
import * as vaultCache from '../../core/vault-cache.mjs';

vi.mock('./ssss.mjs', () => ({
  ssssOperationHandler: vi.fn(),
}));

vi.mock('../../core/vault-cache.mjs', () => ({
  getNodes: vi.fn(),
}));

vi.mock('../../core/webhook-handlers.mjs', () => ({
  handleWebhook: vi.fn(),
}));

const app = express();
app.use('/api/webhooks', webhooksRouter);

describe('Webhooks API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vaultCache.getNodes).mockResolvedValue([]);
    vi.mocked(ssss.ssssOperationHandler).mockImplementation(async (req, res) => res.json({ success: true }));
    process.env.GITHUB_WEBHOOK_SECRET = 'gh_secret';
    process.env.STRIPE_WEBHOOK_SECRET = 'stripe_secret';
    process.env.NPM_WEBHOOK_SECRET = 'npm_secret';
  });

  it('validates github signature', async () => {
    const payload = JSON.stringify({ action: 'push' });
    const hmac = crypto.createHmac('sha256', 'gh_secret');
    hmac.update(payload);
    const sig = `sha256=${hmac.digest('hex')}`;
    
    const res = await request(app)
      .post('/api/webhooks/github')
      .set('x-hub-signature-256', sig)
      .set('x-github-event', 'push')
      .set('Content-Type', 'application/json')
      .send(payload);
      
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.event).toBe('github.push');
    expect(ssss.ssssOperationHandler).toHaveBeenCalled();
  });

  it('rejects invalid github signature', async () => {
    const payload = JSON.stringify({ action: 'push' });
    const res = await request(app)
      .post('/api/webhooks/github')
      .set('x-hub-signature-256', 'sha256=invalid')
      .set('x-github-event', 'push')
      .set('Content-Type', 'application/json')
      .send(payload);
      
    expect(res.status).toBe(401);
  });
});
