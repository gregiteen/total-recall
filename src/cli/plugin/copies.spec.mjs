// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { manageProjectPluginCopies } from './copies.mjs';

let root;
let copies;
const { recompile } = vi.hoisted(() => ({ recompile: vi.fn(async () => ({ ok: true })) }));

vi.mock('../../core/required-plugins.mjs', () => ({
  auditProjectPluginCopies: () => ({ copies, count: copies.length }),
}));
vi.mock('../../core/plugin-store.mjs', () => ({
  recompileAfterPluginMutation: recompile,
  replacementArchiveDir: (dir) => path.join(path.dirname(dir), 'memory-derived', 'plugin-replacements'),
}));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-project-copies-'));
  const plugins = path.join(root, '.agent', 'skills', 'total-recall', 'plugins');
  copies = [
    { id: 'auth', edited: true, stale: true },
    { id: 'mesh', edited: false, stale: false },
    { id: 'meta-harness', edited: true, stale: false },
  ].map(copy => ({ ...copy, dir: path.join(plugins, copy.id), sharedDir: '/shared' }));
  for (const copy of copies) {
    fs.mkdirSync(copy.dir, { recursive: true });
    fs.writeFileSync(path.join(copy.dir, 'plugin-source'), copy.id);
  }
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  recompile.mockClear();
  vi.restoreAllMocks();
});

it('only deletes verified matches during ordinary cleanup', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  await manageProjectPluginCopies([root, '--apply', '--json']);
  const report = JSON.parse(log.mock.calls[0][0]);
  expect(report.removal.removed).toEqual(['mesh']);
  expect(report.archivable).toEqual(['auth']);
  expect(fs.existsSync(copies[0].dir)).toBe(true);
  expect(fs.existsSync(copies[2].dir)).toBe(true);
  expect(recompile).toHaveBeenCalledWith(root);
});

it('moves differing stale sources into the replacement archive on request', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  await manageProjectPluginCopies([root, '--archive-stale', '--apply', '--json']);
  const report = JSON.parse(log.mock.calls[0][0]);
  expect(report.archival.failed).toEqual([]);
  expect(report.archival.archived[0].id).toBe('auth');
  expect(fs.readFileSync(path.join(report.archival.archived[0].archive, 'plugin-source'), 'utf8')).toBe('auth');
  expect(fs.existsSync(copies[0].dir)).toBe(false);
  expect(fs.existsSync(copies[2].dir)).toBe(true);
  expect(recompile).toHaveBeenCalledTimes(1);
});
