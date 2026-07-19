import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(() => ({ unref: vi.fn() })),
}));

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => next(),
  requireScope: () => (req, res, next) => next(),
}));

vi.mock('../../core/config.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    brainDir: '/tmp/tr-update-test-brain',
    agentDir: '/tmp/tr-update-test-agent',
  };
});

vi.mock('../../core/package-auto-update.mjs', () => ({
  PACKAGE_NAME: 'total-recall-brain',
  fetchLatestNpmVersion: vi.fn(() => '3.18.0'),
  fetchLatestNpmVersionAsync: vi.fn(async () => '3.18.0'),
  inspectProjectPackage: vi.fn(() => ({
    declared: '^3.16.1',
    installed: '3.16.1',
    isSourceTree: false,
    packageName: 'app',
  })),
  listUpdateRoots: vi.fn(() => [
    { root: '/tmp/app', name: 'app', source: 'project-registry' },
  ]),
  runPackageAutoUpdate: vi.fn(async () => ({
    skipped: false,
    latest: '3.18.0',
    updated: 1,
    results: [{ name: 'app', status: 'updated', installed: '3.18.0', latest: '3.18.0' }],
  })),
  needsUpdate: vi.fn((a, b) => a !== b),
  isPackageAutoUpdateEnabled: vi.fn(() => true),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    spawn: spawnMock,
    default: {
      ...actual,
      spawn: spawnMock,
    },
  };
});

import updateRouter from './update.mjs';
import * as pkgUpd from '../../core/package-auto-update.mjs';

describe('update router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/update/check reports latest and per-project status', async () => {
    const app = express();
    app.use(updateRouter);
    const res = await request(app).get('/api/update/check');
    expect(res.status).toBe(200);
    expect(res.body.latest).toBe('3.18.0');
    expect(res.body.latestVersion).toBe('3.18.0');
    expect(res.body.updateAvailable).toBe(true);
    expect(res.body.package).toBe('total-recall-brain');
    expect(res.body.projects).toHaveLength(1);
    expect(res.body.auto_update_enabled).toBe(true);
    expect(pkgUpd.fetchLatestNpmVersionAsync).toHaveBeenCalled();
  });

  it('POST /api/update/run runs package auto-update', async () => {
    const app = express();
    app.use(express.json());
    app.use(updateRouter);
    const res = await request(app).post('/api/update/run').send({ force: true });
    expect(res.status).toBe(200);
    expect(res.body.summary.latest).toBe('3.18.0');
    expect(pkgUpd.runPackageAutoUpdate).toHaveBeenCalled();
  });
});
