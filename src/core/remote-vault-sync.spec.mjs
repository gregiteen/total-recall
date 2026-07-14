import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runSync } from './remote-vault-sync.mjs';
import { get } from 'node:https';
import { spawn, spawnSync } from 'node:child_process';
import { PassThrough } from 'stream';

vi.mock('node:child_process', () => {
  const spawnSyncMock = vi.fn();
  const spawnMock = vi.fn();
  return { default: { spawnSync: spawnSyncMock, spawn: spawnMock }, spawnSync: spawnSyncMock, spawn: spawnMock };
});

vi.mock('node:https', () => {
  const getMock = vi.fn();
  return { default: { get: getMock }, get: getMock };
});

vi.mock('./config.mjs', () => ({
  brainDir: '/tmp/test-brain',
  remoteVaultSync: {
    enabled: true,
    baseUrl: 'https://test.example',
    tokenRef: 'TEST_TOKEN',
    intervalMinutes: 30,
    vaultDir: '/tmp/test-vault',
    assetsDir: '/tmp/test-assets',
    registryDir: '/tmp/test-registry',
    keepAssets: 7,
  },
}));

describe('Remote vault sync', () => {
  const tenantDir = path.dirname('/tmp/test-vault');
  const statusFile = path.join(tenantDir, 'sync-status.json');

  beforeEach(() => {
    process.env.TEST_TOKEN = 'secret';
    if (!fs.existsSync(tenantDir)) fs.mkdirSync(tenantDir, { recursive: true });
    if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fails gracefully if remote is unreachable', async () => {
    get.mockImplementation((url, opts, cb) => {
      const req = { on: vi.fn() };
      req.on.mock.calls = [];
      setTimeout(() => req.on.mock.calls.find((c) => c[0] === 'error')?.[1](new Error('ECONNREFUSED')), 5);
      return req;
    });

    await runSync();

    expect(fs.existsSync(statusFile)).toBe(true);
    const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    expect(status.ok).toBe(false);
    expect(status.error).toMatch(/ECONNREFUSED/);
  });

  it('fails gracefully if bundle is invalid', async () => {
    get.mockImplementation((url, opts, cb) => {
      const res = new PassThrough();
      res.statusCode = 200;
      const req = { on: vi.fn() };
      setTimeout(() => {
        cb(res);
        res.end('bad json');
      }, 10);
      return req;
    });

    spawnSync.mockReturnValue({
      status: 1,
      stderr: 'validation error',
    });

    await runSync();

    const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    expect(status.ok).toBe(false);
    expect(status.error).toMatch(/validation error/);
  });

  it('succeeds on happy path', async () => {
    get.mockImplementation((url, opts, cb) => {
      const res = new PassThrough();
      res.statusCode = 200;
      const req = { on: vi.fn() };
      setTimeout(() => {
        cb(res);
        res.end(JSON.stringify({ primitive_inventory: { proposals: 2 }, files: [] }));
      }, 10);
      return req;
    });

    spawnSync.mockReturnValue({ status: 0 });
    spawn.mockReturnValue({
      stdout: new PassThrough(),
      stderr: { on: vi.fn() },
      on: (evt, fn) => {
        if (evt === 'close') fn(0);
      },
    });

    await runSync();

    const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    expect(status.ok).toBe(true);
    expect(status.nodeCounts.proposals).toBe(2);
  });
});
