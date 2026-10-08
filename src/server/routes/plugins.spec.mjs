import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

const scopes = vi.hoisted(() => []);

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => next(),
  requireScope: (...s) => {
    scopes.push(s);
    return (req, res, next) => { req.requiredScopes = s; next(); };
  },
}));

const plugin = {
  id: 'git-sentinel',
  dir: '/test/plugins/git-sentinel',
  valid: true,
  errors: [],
  manifest: {
    id: 'git-sentinel',
    name: 'Git Sentinel',
    version: '1.1.0',
    description: 'Repo state',
    cli: { command: 'git-sentinel', handler: './cli.mjs' },
    capabilities: ['git-monitoring', 'alerts'],
    _conformance: { ssss_version: 'v2', ssss_conformant: true, white_label_verified: true },
    _testResults: { test_count: 42, test_pass_count: 42, tested: true },
  }
};

// Find git-sentinel with conformance data, no-cli without, and phone for review tests
const getPluginByIdMock = vi.fn((id) => {
  if (id === 'git-sentinel') return plugin;
  if (id === 'no-cli') return { ...plugin, id: 'no-cli', manifest: { name: 'No CLI' } };
  if (id === 'unverified-plugin') return {
    ...plugin,
    id: 'unverified-plugin',
    manifest: { id: 'unverified-plugin', name: 'Unverified', version: '0.5.0', description: 'No tests yet' }
  };
  return null;
});

vi.mock('../../core/plugin-loader.mjs', () => ({
  getPluginById: vi.fn((id) => getPluginByIdMock(id)),
}));

// Create a shared hoisted context to exchange the vault path between mock and tests
const testCtx = vi.hoisted(() => {
  const path = require('path');
  const os = require('os');
  const vaultPath = path.join(os.tmpdir(), `plugin-review-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  return { vaultPath };
});

const store = vi.hoisted(() => ({
  listInstalledPlugins: vi.fn(() => [{ id: 'git-sentinel', name: 'Git Sentinel', sha256: 'a'.repeat(64), shared: false }]),
  listAvailableBundled: vi.fn(() => [{ id: 'system-monitor', name: 'System Monitor', installed: false }]),
  describePlugin: vi.fn((p) => ({ id: p.id, name: p.manifest.name })),
  installPlugin: vi.fn(async (source) => {
    if (source === 'bad') throw new Error('No bundled plugin, peer source, git URL or directory matches');
    return { plugin: { id: 'system-monitor', name: 'System Monitor', version: '1.1.0' }, source: { kind: 'bundled', ref: source }, sha256: 'b'.repeat(64) };
  }),
  uninstallPlugin: vi.fn(async (id) => ({ id, dir: '/x', scope: 'project' })),
  setPluginShared: vi.fn(async (id, shared) => ({ id, shared })),
}));
vi.mock('../../core/plugin-distribution.mjs', () => store);

vi.mock('../../core/plugin-peers.mjs', () => ({
  listPeerPlugins: vi.fn(async () => ({
    mesh: { available: true, configured: true },
    peers: [{ hostname: 'mac-mini', status: 'ok', plugins: [{ id: 'git-sentinel', sha256: 'a'.repeat(64) }, { id: 'other', sha256: 'c'.repeat(64) }] }]
  })),
}));

const runner = vi.hoisted(() => ({
  runPluginCommand: vi.fn(async () => ({ ok: true, exitCode: 0, output: 'hello', timedOut: false, truncated: false, durationMs: 5 })),
}));
vi.mock('../../core/plugin-runner.mjs', () => runner);

// Mock writeNodeValidatedAsync
vi.mock('../../core/validated-write.mjs', () => ({
  writeNodeValidatedAsync: vi.fn(async (node) => ({
    success: true,
    path: `${node.slug}.md`,
    commit: { sha256: 'a'.repeat(64) },
  })),
}));

// Mock _shared.mjs — point VAULT_DIR at a temp dir for review file testing
// Use testCtx which is set up by vi.hoisted before this factory runs
vi.mock('./_shared.mjs', () => {
  const vaultPath = testCtx.vaultPath;
  const path = require('path');
  return {
    VAULT_DIR: vaultPath,
    AGENT_DIR: path.join(require('os').homedir(), '.agent'),
    BRAIN_DIR: path.join(require('os').homedir(), '.agent', 'skills', 'total-recall'),
    ROOT: process.cwd(),
    MODEL_CATALOG_DIR: path.resolve(process.cwd(), 'models', 'catalog', 'total-recall'),
    resolveVaultFromQuery: () => vaultPath,
    resolveAllVaultsFromQuery: () => [vaultPath],
    pathsForVault: () => ({}),
    notFound: (res, msg) => res.status(404).json({ error: msg || 'Not found' }),
    badRequest: (res, msg) => res.status(400).json({ error: msg }),
    serverError: (res, err) => res.status(500).json({ error: 'Internal server error' }),
    sanitizeNode: (node) => {
      if (!node || typeof node !== 'object') return node;
      const { body, _filePath, _filepath, _layer, ...rest } = node;
      return { ...rest, content: body };
    },
  };
});

import pluginsRouter from './plugins.mjs';

const FORBIDDEN = /installCount|install_count|download|verified/i;

describe('plugins router', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create test reviews directory with sample reviews
    const reviewsDir = path.join(testCtx.vaultPath, 'reviews');
    fs.mkdirSync(reviewsDir, { recursive: true });
    fs.writeFileSync(
      path.join(reviewsDir, 'review-phone-macmini-1.md'),
      [
        '---',
        'type: plugin_review',
        'title: Review for phone',
        'description: Peer audit review and usability assessment for phone',
        'timestamp: 2026-09-28T20:30:00Z',
        'plugin_id: phone',
        'rating: 5',
        'reviewer_node: macmini',
        'verified_conformance: true',
        'portability: structural',
        'tags: [plugin, review, phone, telecom]',
        '---',
        'Extracted WebRTC dialer works reliably across the local mesh network.',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(reviewsDir, 'review-phone-macmini-2.md'),
      [
        '---',
        'type: plugin_review',
        'title: Review for phone',
        'description: Review by another peer',
        'timestamp: 2026-09-29T10:00:00Z',
        'plugin_id: phone',
        'rating: 3',
        'reviewer_node: server01',
        'verified_conformance: false',
        'portability: structural',
        'tags: [plugin, review, phone]',
        '---',
        'Decent dialer but needs better audio routing options.',
      ].join('\n'),
    );
    // A review for a different plugin
    fs.writeFileSync(
      path.join(reviewsDir, 'review-signing-macmini-1.md'),
      [
        '---',
        'type: plugin_review',
        'title: Review for signing',
        'description: Signing plugin review',
        'timestamp: 2026-09-28T22:00:00Z',
        'plugin_id: signing',
        'rating: 4',
        'reviewer_node: macmini',
        'verified_conformance: true',
        'portability: structural',
        'tags: [plugin, review, signing]',
        '---',
        'Documenso integration works well with standard signature workflows.',
      ].join('\n'),
    );
    app = express();
    app.use(express.json());
    app.use(pluginsRouter);
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      fs.rmSync(testCtx.vaultPath, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('GET /api/plugins lists installed plugins (reviews are explicit endpoints now)', async () => {
    const res = await request(app).get('/api/plugins');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    // The rating/review fields no longer forbidden — they have explicit endpoints
  });

  it('ignores caller-supplied roots', async () => {
    await request(app).get('/api/plugins?root=/etc');
    expect(store.listInstalledPlugins).toHaveBeenCalledWith(process.cwd());
  });

  it('GET /api/plugins/available lists bundled plugins', async () => {
    const res = await request(app).get('/api/plugins/available');
    expect(res.body.plugins[0].id).toBe('system-monitor');
  });

  it('GET /api/plugins/peers marks what is already installed and whether it is the same content', async () => {
    const res = await request(app).get('/api/plugins/peers');
    const [peer] = res.body.peers;
    expect(peer.plugins[0]).toMatchObject({ id: 'git-sentinel', installed: true, same_as_installed: true });
    expect(peer.plugins[1]).toMatchObject({ id: 'other', installed: false, same_as_installed: false });
  });

  it('there is no catalog or rating endpoint', async () => {
    expect((await request(app).get('/api/plugins/catalog')).status).toBe(404);
    expect((await request(app).post('/api/plugins/git-sentinel/rate').send({ rating: 5 })).status).toBe(404);
  });

  it('POST /api/plugins/install requires a source and reports store errors', async () => {
    expect((await request(app).post('/api/plugins/install').send({})).status).toBe(400);
    const bad = await request(app).post('/api/plugins/install').send({ source: 'bad' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('No bundled plugin');
    const ok = await request(app).post('/api/plugins/install').send({ source: 'system-monitor', global: true });
    expect(ok.status).toBe(200);
    expect(store.installPlugin).toHaveBeenCalledWith('system-monitor', { projectRoot: process.cwd(), link: false, global: true });
  });

  it('POST /api/plugins/:id/share requires a boolean', async () => {
    expect((await request(app).post('/api/plugins/git-sentinel/share').send({ shared: 'yes' })).status).toBe(400);
    const res = await request(app).post('/api/plugins/git-sentinel/share').send({ shared: true });
    expect(res.status).toBe(200);
    expect(store.setPluginShared).toHaveBeenCalledWith('git-sentinel', true, { projectRoot: process.cwd() });
  });

  it('DELETE /api/plugins/:id removes via the store', async () => {
    const res = await request(app).delete('/api/plugins/git-sentinel?global=true');
    expect(res.status).toBe(200);
    expect(store.uninstallPlugin).toHaveBeenCalledWith('git-sentinel', { projectRoot: process.cwd(), global: true });
  });

  it('GET /api/plugins/:id returns 404 for an unknown plugin', async () => {
    expect((await request(app).get('/api/plugins/nonexistent')).status).toBe(404);
    expect((await request(app).get('/api/plugins/git-sentinel')).body.plugin.manifest.name).toBe('Git Sentinel');
  });

  it('POST /api/plugins/:id/run executes out of process and needs config:write', async () => {
    const res = await request(app).post('/api/plugins/git-sentinel/run').send({ subcommand: 'audit', args: ['--json'] });
    expect(res.status).toBe(200);
    expect(res.body.output).toBe('hello');
    expect(runner.runPluginCommand).toHaveBeenCalledWith(plugin, expect.objectContaining({ subcommand: 'audit', args: ['--json'], cwd: process.cwd(), secretsBrainDir: expect.any(String) }));
    expect(scopes).toContainEqual(['config:write']);
  });

  it('POST /api/plugins/:id/run validates input and handler presence', async () => {
    expect((await request(app).post('/api/plugins/git-sentinel/run').send({ args: [1] })).status).toBe(400);
    const noCli = await request(app).post('/api/plugins/no-cli/run').send({});
    expect(noCli.status).toBe(400);
    expect(noCli.body.error).toContain('does not declare a CLI handler');
  });

  // ── Review Endpoints ──────────────────────────────────────────────────────

  it('GET /api/plugins/:id/reviews returns reviews for the plugin', async () => {
    const res = await request(app).get('/api/plugins/phone/reviews');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pluginId).toBe('phone');
    expect(res.body.count).toBe(2);
    expect(res.body.averageRating).toBeCloseTo(4, 1);
    expect(res.body.reviews).toHaveLength(2);
    // Verify review shape
    const review = res.body.reviews[0];
    expect(review).toHaveProperty('plugin_id', 'phone');
    expect(review).toHaveProperty('rating');
    expect(review).toHaveProperty('content');
    expect(review).toHaveProperty('_file');
    // The review content comes from the markdown body, not a separate field
    expect(review.content.length).toBeGreaterThan(10);
  });

  it('GET /api/plugins/:id/reviews returns empty list for a plugin with no reviews', async () => {
    const res = await request(app).get('/api/plugins/git-sentinel/reviews');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.reviews).toEqual([]);
    expect(res.body.averageRating).toBeNull();
  });

  it('GET /api/plugins/:id/reviews supports min_rating filter', async () => {
    const res = await request(app).get('/api/plugins/phone/reviews?min_rating=4');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.reviews[0].rating).toBe(5);
  });

  it('POST /api/plugins/:id/reviews validates rating field', async () => {
    // Missing rating
    let res = await request(app).post('/api/plugins/git-sentinel/reviews').send({ text: 'A valid review text here with enough characters.' });
    expect(res.status).toBe(400);

    // Rating out of range
    res = await request(app).post('/api/plugins/git-sentinel/reviews').send({ rating: 6, text: 'A valid review text here with enough characters.' });
    expect(res.status).toBe(400);

    // Rating not an integer
    res = await request(app).post('/api/plugins/git-sentinel/reviews').send({ rating: 3.5, text: 'A valid review text here with enough characters.' });
    expect(res.status).toBe(400);
  });

  it('POST /api/plugins/:id/reviews validates text field', async () => {
    // Missing text
    let res = await request(app).post('/api/plugins/git-sentinel/reviews').send({ rating: 4 });
    expect(res.status).toBe(400);

    // Text too short
    res = await request(app).post('/api/plugins/git-sentinel/reviews').send({ rating: 4, text: 'Short' });
    expect(res.status).toBe(400);
  });

  it('POST /api/plugins/:id/reviews creates a valid review', async () => {
    const res = await request(app).post('/api/plugins/git-sentinel/reviews').send({
      rating: 5,
      text: 'Excellent plugin for repository monitoring. All 42 unit tests pass consistently.',
      reviewer_node: 'test-node',
      verified_conformance: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.pluginId).toBe('git-sentinel');
    expect(res.body.review).toHaveProperty('rating', 5);
    expect(res.body.review).toHaveProperty('reviewer_node', 'test-node');
    expect(res.body.review).toHaveProperty('verified_conformance', true);
    expect(res.body.review).toHaveProperty('type', 'plugin_review');
  });

  // ── Conformance Endpoint ──────────────────────────────────────────────────

  it('GET /api/plugins/:id/conformance returns conformance data for known plugin', async () => {
    const res = await request(app).get('/api/plugins/git-sentinel/conformance');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pluginId).toBe('git-sentinel');
    expect(res.body.ssss_version).toBe('v2');
    expect(res.body.ssss_conformant).toBe(true);
    expect(res.body.white_label_verified).toBe(true);
    expect(res.body.tested).toBe(true);
    expect(res.body.test_count).toBe(42);
    expect(res.body.test_pass_count).toBe(42);
    expect(res.body.test_pass_rate).toBe(100);
    expect(res.body.capabilities).toEqual(['git-monitoring', 'alerts']);
    expect(res.body.portability).toBe('structural');
  });

  it('GET /api/plugins/:id/conformance returns default values for unverified plugin', async () => {
    const res = await request(app).get('/api/plugins/unverified-plugin/conformance');
    expect(res.status).toBe(200);
    expect(res.body.pluginId).toBe('unverified-plugin');
    expect(res.body.ssss_version).toBe('v2');
    expect(res.body.ssss_conformant).toBe(true);  // default true
    expect(res.body.white_label_verified).toBe(false);
    expect(res.body.tested).toBe(false); // default from no manifest data
    expect(res.body.test_count).toBe(0);
    expect(res.body.test_pass_rate).toBeNull();
  });

  it('GET /api/plugins/:id/conformance returns 404 for unknown plugin', async () => {
    const res = await request(app).get('/api/plugins/nonexistent/conformance');
    expect(res.status).toBe(404);
  });
});
