/**
 * The served dashboard stayed on a 2026-11-09 build while the drawer UI landed
 * in source: the server built only when index.html was missing. These cases
 * pin the replacement: rebuild when sources are newer, keep serving the old
 * bundle until the new one is complete, never install dependencies.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildToolsPresent, checkDistFreshness, dashboardTargets, rebuildDashboard, refreshDashboard, watchDashboardBundle } from './dashboard-bundle.mjs';

let root;
const OLD = new Date('2026-11-09T12:00:00Z');
const NEW = new Date('2026-11-12T12:00:00Z');

function writeAt(rel, mtime, body = 'x') {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  fs.utimesSync(file, mtime, mtime);
  return file;
}

/** A build double that writes what vite would, into the requested outDir. */
const buildsInto = (body = 'new') => vi.fn(async ({ outDir }) => {
  fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), body);
  return { code: 0, output: 'built', timedOut: false };
});

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-bundle-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('dashboardTargets', () => {
  it('counts public assets and TypeScript configs as sources', async () => {
    writeAt('frontend/dist/index.html', OLD);
    writeAt('frontend/src/main.tsx', OLD);
    writeAt('frontend/tsconfig.app.json', OLD);
    writeAt('frontend/public/sw.js', NEW);
    const result = await checkDistFreshness(dashboardTargets(root));
    expect(result).toMatchObject({ ok: false, reason: 'stale-bundle' });
    expect(result.source.path).toContain(path.join('public', 'sw.js'));
    expect(dashboardTargets(root).sourcePaths).toContain(path.join(root, 'frontend', 'tsconfig.app.json'));
  });

  // npm tarballs give every file one mtime: an installed package never rebuilds.
  it('treats equal mtimes as current', async () => {
    writeAt('frontend/dist/index.html', OLD);
    writeAt('frontend/src/main.tsx', OLD);
    expect((await checkDistFreshness(dashboardTargets(root))).ok).toBe(true);
  });
});

describe('rebuildDashboard', () => {
  it('swaps a completed build in and leaves no staging directories', async () => {
    writeAt('frontend/dist/index.html', OLD, 'old');
    const run = buildsInto('new');
    const result = await rebuildDashboard({ root, run });
    expect(result).toMatchObject({ ok: true, status: 'built' });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ frontendDir: path.join(root, 'frontend'), outDir: path.join(root, 'frontend', 'dist.next') }));
    expect(fs.readFileSync(path.join(root, 'frontend', 'dist', 'index.html'), 'utf8')).toBe('new');
    for (const leftover of ['dist.next', 'dist.prev', '.dist-build.lock']) expect(fs.existsSync(path.join(root, 'frontend', leftover))).toBe(false);
  });

  it('keeps serving the old bundle when the build fails', async () => {
    writeAt('frontend/dist/index.html', OLD, 'old');
    const run = vi.fn(async ({ outDir }) => {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'partial.js'), 'half');
      return { code: 2, output: 'error TS2322: Type mismatch', timedOut: false };
    });
    const result = await rebuildDashboard({ root, run });
    expect(result).toMatchObject({ ok: false, status: 'failed', reason: 'build exited 2', output: 'error TS2322: Type mismatch' });
    expect(fs.readFileSync(path.join(root, 'frontend', 'dist', 'index.html'), 'utf8')).toBe('old');
    expect(fs.existsSync(path.join(root, 'frontend', 'dist.next'))).toBe(false);
  });

  it('refuses a build that produced no index.html', async () => {
    writeAt('frontend/dist/index.html', OLD, 'old');
    const run = vi.fn(async ({ outDir }) => { fs.mkdirSync(outDir, { recursive: true }); return { code: 0, output: '', timedOut: false }; });
    expect(await rebuildDashboard({ root, run })).toMatchObject({ ok: false, reason: 'build finished without index.html' });
    expect(fs.readFileSync(path.join(root, 'frontend', 'dist', 'index.html'), 'utf8')).toBe('old');
  });

  it('leaves a build held by a live process alone and reclaims a dead one', async () => {
    writeAt('frontend/dist/index.html', OLD, 'old');
    const lock = path.join(root, 'frontend', '.dist-build.lock');
    fs.writeFileSync(lock, `${process.ppid}\n`);
    const run = buildsInto();
    expect(await rebuildDashboard({ root, run })).toMatchObject({ ok: false, status: 'building-elsewhere' });
    expect(run).not.toHaveBeenCalled();

    // A pid far above any real one: the process that held it is gone.
    fs.writeFileSync(lock, '99999999\n');
    expect(await rebuildDashboard({ root, run })).toMatchObject({ ok: true });
    expect(fs.existsSync(lock)).toBe(false);
  });
});

describe('refreshDashboard', () => {
  const tools = () => true;

  it('rebuilds a stale bundle once the sources are quiet', async () => {
    writeAt('frontend/dist/index.html', OLD);
    writeAt('frontend/src/App.tsx', NEW);
    const rebuild = vi.fn(async () => ({ ok: true, status: 'built', durationMs: 1200 }));
    const state = await refreshDashboard({ root, rebuild, toolsPresent: tools, now: () => NEW.getTime() + 120_000 });
    expect(state).toEqual({ status: 'current', rebuilt: true, durationMs: 1200, was: 'stale' });
    expect(rebuild).toHaveBeenCalledWith({ root });
  });

  it('waits while the sources are still changing', async () => {
    writeAt('frontend/dist/index.html', OLD);
    writeAt('frontend/src/App.tsx', NEW);
    const rebuild = vi.fn();
    const state = await refreshDashboard({ root, rebuild, toolsPresent: tools, now: () => NEW.getTime() + 10_000 });
    expect(state).toMatchObject({ status: 'stale', reason: 'sources are still changing', retryInMs: 51_000 });
    expect(rebuild).not.toHaveBeenCalled();
  });

  it('builds a missing bundle', async () => {
    writeAt('frontend/src/App.tsx', OLD);
    const rebuild = vi.fn(async () => ({ ok: true, status: 'built', durationMs: 5 }));
    expect(await refreshDashboard({ root, rebuild, toolsPresent: tools, now: () => NEW.getTime() })).toMatchObject({ status: 'current', rebuilt: true, was: 'missing' });
  });

  it('reports, and does not install, when the build tools are missing', async () => {
    writeAt('frontend/dist/index.html', OLD);
    writeAt('frontend/src/App.tsx', NEW);
    const rebuild = vi.fn();
    const state = await refreshDashboard({ root, rebuild, toolsPresent: () => false, now: () => NEW.getTime() + 120_000 });
    expect(state.status).toBe('stale');
    expect(state.reason).toContain('npm ci');
    expect(rebuild).not.toHaveBeenCalled();
  });

  it('reports a failed build with its reason', async () => {
    writeAt('frontend/dist/index.html', OLD);
    writeAt('frontend/src/App.tsx', NEW);
    const build = { ok: false, status: 'failed', reason: 'build exited 2', output: 'TS2322' };
    const state = await refreshDashboard({ root, rebuild: async () => build, toolsPresent: tools, now: () => NEW.getTime() + 120_000 });
    expect(state).toEqual({ status: 'stale', reason: 'build exited 2', build });
  });

  it('does nothing for a current bundle', async () => {
    writeAt('frontend/src/App.tsx', OLD);
    writeAt('frontend/dist/index.html', NEW);
    const rebuild = vi.fn();
    expect((await refreshDashboard({ root, rebuild, toolsPresent: tools })).status).toBe('current');
    expect(rebuild).not.toHaveBeenCalled();
  });
});

describe('buildToolsPresent', () => {
  it('needs the frontend package, vite and the TypeScript compiler', () => {
    writeAt('frontend/package.json', OLD, '{}');
    expect(buildToolsPresent(root)).toBe(false);
    writeAt('node_modules/vite/bin/vite.js', OLD);
    expect(buildToolsPresent(root)).toBe(false);
    writeAt('node_modules/typescript/bin/tsc', OLD);
    expect(buildToolsPresent(root)).toBe(true);
  });
});

describe('watchDashboardBundle', () => {
  it('reports state changes once and every rebuild', async () => {
    const states = [{ status: 'stale', reason: 'sources are still changing' }, { status: 'stale', reason: 'sources are still changing' }, { status: 'current', rebuilt: true, durationMs: 1 }];
    const refresh = vi.fn(async () => states.shift());
    const report = vi.fn();
    const watch = watchDashboardBundle({ root, refresh, report, intervalMs: 3_600_000 });
    try {
      await watch.check();
      await watch.check();
      await watch.check();
      expect(report.mock.calls.map(([state]) => state.status)).toEqual(['stale', 'current']);
      expect(watch.state()).toMatchObject({ status: 'current', rebuilt: true });
    } finally { watch.stop(); }
  });

  it('turns a thrown check into a reported error', async () => {
    const report = vi.fn();
    const watch = watchDashboardBundle({ root, refresh: async () => { throw new Error('EACCES'); }, report, intervalMs: 3_600_000 });
    try {
      await watch.check();
      expect(watch.state()).toMatchObject({ status: 'error', reason: 'EACCES' });
      expect(report).toHaveBeenCalledTimes(1);
    } finally { watch.stop(); }
  });
});
