import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runSync } from './remote-vault-sync.mjs';
import https from 'https';
import child_process from 'child_process';
import { PassThrough } from 'stream';

vi.mock('child_process');
vi.mock('https');
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
    https.get.mockImplementation((url, opts, cb) => {
      const req = { on: vi.fn() };
      setTimeout(() => req.on.mock.calls.find((c) => c[0] === 'error')?.[1](new Error('ECONNREFUSED')), 10);
      return req;
    });

    await runSync();

    expect(fs.existsSync(statusFile)).toBe(true);
    const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    expect(status.ok).toBe(false);
    expect(status.error).toMatch(/ECONNREFUSED/);
  });

  it('fails gracefully if bundle is invalid', async () => {
    https.get.mockImplementation((url, opts, cb) => {
      const res = new PassThrough();
      res.statusCode = 200;
      const req = { on: vi.fn() };
      setTimeout(() => {
        cb(res);
        res.end('bad json');
      }, 10);
      return req;
    });

    child_process.spawnSync.mockReturnValue({
      status: 1,
      stderr: 'validation error',
    });

    await runSync();

    const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    expect(status.ok).toBe(false);
    expect(status.error).toMatch(/validation error/);
  });

  it('succeeds on happy path', async () => {
    https.get.mockImplementation((url, opts, cb) => {
      const res = new PassThrough();
      res.statusCode = 200;
      const req = { on: vi.fn() };
      setTimeout(() => {
        cb(res);
        res.end(JSON.stringify({ primitive_inventory: { proposals: 2 }, files: [] }));
      }, 10);
      return req;
    });

    child_process.spawnSync.mockReturnValue({ status: 0 });
    child_process.spawn.mockReturnValue({
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
