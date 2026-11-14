import express from 'express';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installPlugin } from '../../core/plugin-distribution.mjs';

describe('Plugin Store Client store:<id> resolver (STORE-04)', () => {
  let server;
  let baseUrl;

  beforeEach(async () => {
    const app = express();
    app.get('/api/store/plugins', (_req, res) => {
      res.json({
        ok: true,
        plugins: [{
          id: 'paid-demo',
          name: 'Paid Demo',
          version: '1.0.0',
          monetization: { model: 'one-time', price_cents: 1900, currency: 'USD' }
        }]
      });
    });
    app.get('/api/store/plugins/:id/bundle', (req, res) => {
      if (!req.headers['x-license-key']) {
        return res.status(402).json({ ok: false, error: `Plugin '${req.params.id}' requires a valid signed license key` });
      }
      res.status(500).json({ error: 'unexpected' });
    });
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  it('rejects store:<id> install when Store server returns 402 license required', async () => {
    await expect(
      installPlugin('store:paid-demo', { storeDeps: { storeUrl: baseUrl } })
    ).rejects.toThrow(/requires a valid signed license key/i);
  });

  it('rejects missing plugin ids cleanly', async () => {
    await expect(
      installPlugin('store:nonexistent-plugin', { storeDeps: { storeUrl: baseUrl } })
    ).rejects.toThrow(/not found in Store catalog/i);
  });
});
