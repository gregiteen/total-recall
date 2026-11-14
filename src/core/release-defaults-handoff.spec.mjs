import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handOffDefaultsToRelease, installedReleases, parseDefaultsReport, RUNNING_VERSION } from './release-defaults-handoff.mjs';
import { PACKAGE_ROOT } from './plugin-loader.mjs';

const temporary = [];
afterEach(() => { for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const scratch = () => { const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-handoff-'))); temporary.push(dir); return dir; };

/** A release directory as npm or a source checkout leaves it: package.json and the CLI entry. */
function release(dir, version, extra = {}) {
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'total-recall-brain', version, ...extra }));
  fs.writeFileSync(path.join(dir, 'bin', 'total-recall.mjs'), '');
  return dir;
}
const report = (failed = 0, results = [{ root: '/brain', status: failed ? 'failed' : 'ready', ...(failed ? { error: 'Required bundled auth plugin is missing' } : {}) }]) =>
  JSON.stringify({ failed, results }, null, 2);

describe('handing the default refresh to a newer installed release', () => {
  it('reads the running release once, at import', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('total-recall-brain');
    expect(RUNNING_VERSION).toBe(pkg.version);
  });

  it('does nothing when no installed release is newer than the running code', async () => {
    const root = scratch();
    release(path.join(root, 'total-recall-brain'), '3.47.1');
    const run = vi.fn();
    expect(await handOffDefaultsToRelease({ global: { root }, sources: { results: [] }, running: '3.47.1', run }))
      .toEqual({ status: 'current', running: '3.47.1', installed: '3.47.1' });
    expect(await handOffDefaultsToRelease({ global: { failed: 1, results: [] }, sources: { results: [] }, running: '3.47.1', run }))
      .toEqual({ status: 'current', running: '3.47.1' });
    expect(run).not.toHaveBeenCalled();
  });

  it('runs the newest installed release\'s own update --defaults, from the given directory', async () => {
    const root = scratch();
    const globalDir = release(path.join(root, 'total-recall-brain'), '3.47.2');
    const source = release(path.join(scratch(), 'checkout'), '3.47.3');
    const ignored = release(path.join(scratch(), 'other'), '3.99.0');
    const run = vi.fn().mockResolvedValue({ code: 0, output: report(), stderr: '' });
    const result = await handOffDefaultsToRelease({
      global: { root },
      sources: { results: [
        { root: source, package: 'total-recall-brain', status: 'updated' },
        { root: ignored, package: 'total-recall-brain', status: 'serving' },
        { root: ignored, package: '@gregiteen/ssss-cli', status: 'updated' },
      ] },
      running: '3.47.1', cwd: '/work', execPath: '/bin/node', run,
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('/bin/node', [path.join(source, 'bin', 'total-recall.mjs'), 'update', '--defaults', '--json'],
      expect.objectContaining({ cwd: '/work', timeoutMs: 600000 }));
    expect(result).toEqual({ status: 'refreshed', version: '3.47.3', from: '3.47.1', results: [{ root: '/brain', status: 'ready' }] });
    expect(installedReleases({ global: { root } }).map(row => row.dir)).toEqual([globalDir]);
  });

  it('finds a global install that links to a source checkout under another name', () => {
    const root = scratch();
    const checkout = release(path.join(scratch(), 'total-recall'), '3.47.2');
    fs.mkdirSync(path.join(checkout, '.git'));
    fs.symlinkSync(checkout, path.join(root, 'total-recall'), 'dir');
    expect(installedReleases({ global: { root } })).toEqual([{ dir: checkout, version: '3.47.2' }]);
  });

  it('reads the report after other output the release printed', async () => {
    const root = scratch();
    release(path.join(root, 'total-recall-brain'), '3.47.2');
    const output = `{"timestamp":"2026-11-14T00:00:00Z","level":"info","message":"vault cache"}\n${report()}`;
    expect(parseDefaultsReport(output)).toEqual(JSON.parse(report()));
    const result = await handOffDefaultsToRelease({ global: { root }, running: '3.47.1', run: async () => ({ code: 0, output }) });
    expect(result.status).toBe('refreshed');
  });

  it('reports a brain the release could not provision', async () => {
    const root = scratch();
    release(path.join(root, 'total-recall-brain'), '3.47.2');
    const result = await handOffDefaultsToRelease({ global: { root }, running: '3.47.1', run: async () => ({ code: 1, output: report(1) }) });
    expect(result).toMatchObject({ status: 'failed', version: '3.47.2', from: '3.47.1', error: '/brain: Required bundled auth plugin is missing' });
    expect(result.results).toHaveLength(1);
  });

  it.each([
    ['a timeout', { code: null, output: '', reason: 'timeout' }, 'update --defaults stopped: timeout'],
    ['output that is not a report', { code: 0, output: 'not json', stderr: 'boom' }, 'printed no report'],
    ['an exit without failures listed', { code: 2, output: report(0, []) }, 'update --defaults exited 2'],
  ])('fails on %s', async (_name, outcome, message) => {
    const root = scratch();
    release(path.join(root, 'total-recall-brain'), '3.47.2');
    const result = await handOffDefaultsToRelease({ global: { root }, running: '3.47.1', run: async () => outcome });
    expect(result.status).toBe('failed');
    expect(result.error).toContain(message);
  });

  it('reports a release that could not be started instead of throwing', async () => {
    const root = scratch();
    release(path.join(root, 'total-recall-brain'), '3.47.2');
    const result = await handOffDefaultsToRelease({ global: { root }, running: '3.47.1', run: async () => { throw new Error('ENOENT'); } });
    expect(result).toMatchObject({ status: 'failed', error: 'update --defaults could not run: ENOENT' });
  });
});
