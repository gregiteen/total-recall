import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import pluginsRouter from './plugins.mjs';

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => next(),
  requireScope: () => (req, res, next) => next(),
}));

vi.mock('../../core/plugin-loader.mjs', () => ({
  discoverPlugins: vi.fn().mockReturnValue([
    {
      id: 'scientific-frontiers',
      dir: '/test/plugins/scientific-frontiers',
      manifestPath: '/test/plugins/scientific-frontiers/plugin.json',
      valid: true,
      errors: [],
      manifest: {
        name: 'Scientific Frontiers Engine',
        version: '1.0.0',
        description: 'Decentralized frontier science capability ledger',
        ssss_schemas: {
          categories: [{ name: 'frontier-capabilities' }]
        },
        tasks: [
          { intent: 'Ingest research', schedule: '0 * * * *' }
        ],
        openwiki_hubs: [
          { title: 'Frontier Intelligence Hub', path: 'openwiki/scientific-frontiers.md' }
        ]
      }
    }
  ]),
  getPluginById: vi.fn((id) => {
    if (id === 'scientific-frontiers') {
      return {
        id: 'scientific-frontiers',
        dir: '/test/plugins/scientific-frontiers',
        valid: true,
        errors: [],
        manifest: {
          name: 'Scientific Frontiers Engine',
          version: '1.0.0',
          description: 'Decentralized frontier science capability ledger'
        }
      };
    }
    return null;
  })
}));

describe('plugins router', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(pluginsRouter);
  });

  it('GET /api/plugins returns discovered plugins list', async () => {
    const res = await request(app).get('/api/plugins');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(res.body.plugins[0].id).toBe('scientific-frontiers');
    expect(res.body.plugins[0].valid).toBe(true);
  });

  it('GET /api/plugins/:id returns a specific plugin', async () => {
    const res = await request(app).get('/api/plugins/scientific-frontiers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.plugin.id).toBe('scientific-frontiers');
  });

  it('GET /api/plugins/:id returns 400 for unknown plugin', async () => {
    const res = await request(app).get('/api/plugins/nonexistent');
    expect(res.status).toBe(400);
  });
});
