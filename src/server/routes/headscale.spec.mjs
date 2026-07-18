import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import headscaleRouter from './headscale.mjs';
import * as secretsStore from '../../core/secrets-store.mjs';

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => next(),
  requireScope: () => (req, res, next) => next(),
}));

vi.mock('../../core/secrets-store.mjs', () => ({
  getSecretsCatalog: vi.fn(),
  getSecret: vi.fn(),
}));

vi.mock('../../core/throttled-fetch.mjs', () => ({
  throttledFetch: vi.fn((...args) => global.fetch(...args.slice(0, 2))),
}));

const app = express();
app.use(express.json());
app.use(headscaleRouter);

describe('Headscale API proxy routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (h) => h.toLowerCase() === 'content-type' ? 'application/json' : null,
      },
      json: async () => ({ success: true, mocked: true }),
    });
  });

  it('GET /node lists nodes from Headscale', async () => {
    vi.mocked(secretsStore.getSecretsCatalog).mockResolvedValue({
      keys: [
        { provider: 'headscale', key: 'HEADSCALE_KEY', headscale_url: 'https://test-hs.example' }
      ]
    });

    vi.mocked(secretsStore.getSecret).mockResolvedValue({
      found: true,
      key: 'HEADSCALE_KEY',
      value: 'mock-token'
    });

    const res = await request(app).get('/api/headscale/node');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, mocked: true });
    expect(global.fetch).toHaveBeenCalledWith('https://test-hs.example/api/v1/node', {
      headers: {
        'Authorization': 'Bearer mock-token',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  });

  it('DELETE /node/:id deletes node', async () => {
    vi.mocked(secretsStore.getSecretsCatalog).mockResolvedValue({
      keys: [
        { provider: 'headscale', key: 'HEADSCALE_KEY', headscale_url: 'https://test-hs.example' }
      ]
    });

    vi.mocked(secretsStore.getSecret).mockResolvedValue({
      found: true,
      key: 'HEADSCALE_KEY',
      value: 'mock-token'
    });

    const res = await request(app).delete('/api/headscale/node/123');

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith('https://test-hs.example/api/v1/node/123', {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer mock-token',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  });

  it('GET /preauthkey lists preauth keys', async () => {
    vi.mocked(secretsStore.getSecretsCatalog).mockResolvedValue({
      keys: [
        { provider: 'headscale', key: 'HEADSCALE_KEY', headscale_url: 'https://test-hs.example' }
      ]
    });

    vi.mocked(secretsStore.getSecret).mockResolvedValue({
      found: true,
      key: 'HEADSCALE_KEY',
      value: 'mock-token'
    });

    const res = await request(app).get('/api/headscale/preauthkey?user=testuser');

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith('https://test-hs.example/api/v1/preauthkey?user=testuser', {
      headers: {
        'Authorization': 'Bearer mock-token',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  });

  it('POST /preauthkey creates key', async () => {
    vi.mocked(secretsStore.getSecretsCatalog).mockResolvedValue({
      keys: [
        { provider: 'headscale', key: 'HEADSCALE_KEY', headscale_url: 'https://test-hs.example' }
      ]
    });

    vi.mocked(secretsStore.getSecret).mockResolvedValue({
      found: true,
      key: 'HEADSCALE_KEY',
      value: 'mock-token'
    });

    const res = await request(app)
      .post('/api/headscale/preauthkey')
      .send({ user: 'testuser', reusable: true });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith('https://test-hs.example/api/v1/preauthkey', {
      method: 'POST',
      body: JSON.stringify({ user: 'testuser', reusable: true }),
      headers: {
        'Authorization': 'Bearer mock-token',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  });
});
