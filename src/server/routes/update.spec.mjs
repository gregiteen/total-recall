import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// A child_process.spawn double that behaves like the real thing: handlers are
// registered via .on() and 'close' fires asynchronously. The old double
// returned only { unref }, which silently passed while the route was
// fire-and-forget and would throw the moment the route waited for an exit.
const { spawnMock, versionOnDiskMock, requestSelfRestartMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(() => {
    const handlers = {};
    setTimeout(() => handlers.close?.(0), 0);
    return {
      unref: vi.fn(),
      on: (event, cb) => {
        handlers[event] = cb;
      },
    };
  }),
  versionOnDiskMock: vi.fn(() => '3.16.1'),
  requestSelfRestartMock: vi.fn(() => ({
    scheduled: true,
    supervisor: { supervised: true, kind: 'launchd', label: 'com.totalrecall.brain', reason: 'owns pid' },
    delayMs: 750,
  })),
}));

vi.mock('../../core/server-restart.mjs', () => ({
  packageVersionOnDisk: versionOnDiskMock,
  requestSelfRestart: requestSelfRestartMock,
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
    failed: 0,
    up_to_date: 0,
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
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/finished|updated|current/i);
    expect(res.body.summary.latest).toBe('3.18.0');
    expect(pkgUpd.runPackageAutoUpdate).toHaveBeenCalled();
  });

  it('POST /api/update/run waits for the host install instead of firing and forgetting', async () => {
    const app = express();
    app.use(express.json());
    app.use(updateRouter);
    const res = await request(app).post('/api/update/run').send({ force: true });
    expect(spawnMock).toHaveBeenCalled();
    // A detached+unref'd spawn answered before npm had written anything; the
    // response now carries the install's real exit.
    expect(res.body.host_install).toEqual({ ok: true, code: 0 });
  });

  it('POST /api/update/run restarts when the update replaced this server code', async () => {
    versionOnDiskMock.mockReturnValueOnce('3.16.1').mockReturnValueOnce('3.18.0');
    const app = express();
    app.use(express.json());
    app.use(updateRouter);
    const res = await request(app).post('/api/update/run').send({ force: true });
    expect(res.status).toBe(200);
    expect(requestSelfRestartMock).toHaveBeenCalled();
    expect(res.body.restart).toMatchObject({ required: true, scheduled: true });
    expect(res.body.message).toMatch(/Restarting into v3\.18\.0/);
  });

  it('POST /api/update/run does not restart when this server already runs the installed code', async () => {
    versionOnDiskMock.mockReturnValue('3.18.0');
    const app = express();
    app.use(express.json());
    app.use(updateRouter);
    const res = await request(app).post('/api/update/run').send({ force: true });
    expect(requestSelfRestartMock).not.toHaveBeenCalled();
    expect(res.body.restart).toMatchObject({ required: false, scheduled: false });
    versionOnDiskMock.mockReturnValue('3.16.1');
  });

  it('POST /api/update/run honours restart:false and says the server is stale', async () => {
    versionOnDiskMock.mockReturnValueOnce('3.16.1').mockReturnValueOnce('3.18.0');
    const app = express();
    app.use(express.json());
    app.use(updateRouter);
    const res = await request(app).post('/api/update/run').send({ force: true, restart: false });
    expect(requestSelfRestartMock).not.toHaveBeenCalled();
    expect(res.body.restart).toMatchObject({ required: true, scheduled: false });
    expect(res.body.message).toMatch(/still running v3\.16\.1/);
  });

  it('POST /api/update/run reports an unsupervised host instead of exiting', async () => {
    versionOnDiskMock.mockReturnValueOnce('3.16.1').mockReturnValueOnce('3.18.0');
    requestSelfRestartMock.mockReturnValueOnce({
      scheduled: false,
      supervisor: { supervised: false, kind: null, label: null, reason: 'no launchd job reports this pid' },
      reason: 'refusing to exit: no supervisor would restart this process',
    });
    const app = express();
    app.use(express.json());
    app.use(updateRouter);
    const res = await request(app).post('/api/update/run').send({ force: true });
    expect(res.status).toBe(200);
    expect(res.body.restart).toMatchObject({ required: true, scheduled: false });
    expect(res.body.restart.reason).toMatch(/refusing to exit/);
  });

  it('POST /api/update/run does not restart on a dry run', async () => {
    versionOnDiskMock.mockReturnValueOnce('3.16.1').mockReturnValueOnce('3.18.0');
    const app = express();
    app.use(express.json());
    app.use(updateRouter);
    const res = await request(app).post('/api/update/run').send({ force: true, dryRun: true });
    expect(requestSelfRestartMock).not.toHaveBeenCalled();
    expect(res.body.restart.scheduled).toBe(false);
  });
});
