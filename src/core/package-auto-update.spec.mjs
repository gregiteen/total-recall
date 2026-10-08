import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { spawnSyncMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    spawnSync: spawnSyncMock,
    default: {
      ...actual,
      spawnSync: spawnSyncMock,
    },
  };
});

import {
  needsUpdate,
  inspectProjectPackage,
  listUpdateRoots,
  isPackageAutoUpdateEnabled,
  PACKAGE_NAME,
  runPackageAutoUpdate,
  clearLatestNpmVersionCache,
} from './package-auto-update.mjs';

describe('package-auto-update', () => {
  let tmp;

  beforeEach(() => {
    vi.clearAllMocks();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pkg-upd-'));
    vi.spyOn(os, 'homedir').mockReturnValue(tmp);
    spawnSyncMock.mockReset();
    clearLatestNpmVersionCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
    delete process.env.TR_AUTO_UPDATE_PACKAGE;
    delete process.env.TR_SYNC_REPOS;
  });

  it('needsUpdate compares semver-ish versions', () => {
    expect(needsUpdate(null, '3.18.0')).toBe(true);
    expect(needsUpdate('3.16.1', '3.18.0')).toBe(true);
    expect(needsUpdate('3.18.0', '3.18.0')).toBe(false);
    expect(needsUpdate('3.19.0', '3.18.0')).toBe(false);
    expect(needsUpdate('3.19.0-preview.2', '3.18.0')).toBe(false);
    expect(needsUpdate('3.18.0-preview.2', '3.18.0')).toBe(true);
    expect(needsUpdate('3.18.0+local.2', '3.18.0')).toBe(false);
  });

  it('detects source monorepo and declared deps', () => {
    const root = path.join(tmp, 'src-tree');
    fs.mkdirSync(path.join(root, 'src', 'server'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'server', 'index.mjs'), 'export {}\n');
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: PACKAGE_NAME, version: '3.18.0', dependencies: {} }),
    );
    const info = inspectProjectPackage(root);
    expect(info.isSourceTree).toBe(true);

    const consumer = path.join(tmp, 'app');
    fs.mkdirSync(consumer, { recursive: true });
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      JSON.stringify({ name: 'app', dependencies: { [PACKAGE_NAME]: '^3.16.1' } }),
    );
    fs.mkdirSync(path.join(consumer, 'node_modules', PACKAGE_NAME), { recursive: true });
    fs.writeFileSync(
      path.join(consumer, 'node_modules', PACKAGE_NAME, 'package.json'),
      JSON.stringify({ name: PACKAGE_NAME, version: '3.16.1' }),
    );
    const c = inspectProjectPackage(consumer);
    expect(c.declared).toBe('^3.16.1');
    expect(c.installed).toBe('3.16.1');
    expect(c.isSourceTree).toBe(false);
  });

  it('listUpdateRoots uses TR_SYNC_REPOS only (no hardcoding)', () => {
    const a = path.join(tmp, 'repo-a');
    fs.mkdirSync(a, { recursive: true });
    process.env.TR_SYNC_REPOS = a;
    const roots = listUpdateRoots({});
    expect(roots.some((r) => r.root === a && r.source === 'TR_SYNC_REPOS')).toBe(true);
  });

  it('isPackageAutoUpdateEnabled defaults on and respects opt-out', () => {
    delete process.env.TR_AUTO_UPDATE_PACKAGE;
    expect(isPackageAutoUpdateEnabled()).toBe(true);
    process.env.TR_AUTO_UPDATE_PACKAGE = '0';
    expect(isPackageAutoUpdateEnabled()).toBe(false);
  });

  it('runPackageAutoUpdate dry-run updates consumer when behind', async () => {
    const consumer = path.join(tmp, 'app');
    fs.mkdirSync(path.join(consumer, 'node_modules', PACKAGE_NAME), { recursive: true });
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      JSON.stringify({ name: 'app', dependencies: { [PACKAGE_NAME]: '^3.16.1' } }),
    );
    fs.writeFileSync(
      path.join(consumer, 'node_modules', PACKAGE_NAME, 'package.json'),
      JSON.stringify({ name: PACKAGE_NAME, version: '3.16.1' }),
    );

    spawnSyncMock.mockImplementation((cmd, args) => {
      if (cmd === 'npm' && args?.[0] === 'view') {
        return { status: 0, stdout: '3.18.0\n', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    });

    const brainDir = path.join(tmp, 'brain');
    fs.mkdirSync(brainDir, { recursive: true });

    const summary = await runPackageAutoUpdate({
      brainDir,
      roots: [consumer],
      dryRun: true,
      skipThrottle: true,
      force: true,
    });

    expect(summary.skipped).toBe(false);
    expect(summary.latest).toBe('3.18.0');
    const row = summary.results.find((r) => r.root === consumer);
    expect(row.status).toBe('would_update');
  });

  it('preserves a preview consumer even when forced to apply', async () => {
    const consumer = path.join(tmp, 'preview-app');
    fs.mkdirSync(path.join(consumer, 'node_modules', PACKAGE_NAME), { recursive: true });
    fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ dependencies: { [PACKAGE_NAME]: '^3.19.0' } }));
    fs.writeFileSync(path.join(consumer, 'node_modules', PACKAGE_NAME, 'package.json'), JSON.stringify({ version: '3.19.0-preview.2' }));
    spawnSyncMock.mockReturnValue({ status: 0, stdout: '3.18.0\n' });
    const summary = await runPackageAutoUpdate({ brainDir: path.join(tmp, 'brain'), roots: [consumer], force: true, skipThrottle: true });
    expect(summary.results.find(row => row.root === consumer).status).toBe('preview_features');
    expect(summary.preview_features).toBe(1);
    expect(spawnSyncMock.mock.calls.some(([, args]) => args?.[0] === 'install')).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(consumer, 'node_modules', PACKAGE_NAME, 'package.json'))).version).toBe('3.19.0-preview.2');
  });
});
