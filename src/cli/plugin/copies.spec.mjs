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
  recordPath: (id) => `system/plugins/${id}.md`,
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

it('unlinks shadow links without touching their target checkout', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const checkout = path.join(root, 'tr-plugin-x');
  fs.mkdirSync(checkout);
  fs.writeFileSync(path.join(checkout, 'plugin.json'), '{}');
  const link = path.join(root, '.agent', 'skills', 'total-recall', 'plugins', 'x');
  fs.symlinkSync(checkout, link);
  copies.push({ id: 'x', dir: link, sharedDir: '/shared', edited: null, stale: false, linked: true, shadow: true, target: checkout });
  await manageProjectPluginCopies([root, '--apply', '--json']);
  const report = JSON.parse(log.mock.calls[0][0]);
  expect(report.shadows).toEqual(['x']);
  expect(report.removal.removed).toContain('x');
  expect(fs.lstatSync(link, { throwIfNoEntry: false })).toBeUndefined();
  expect(fs.readFileSync(path.join(checkout, 'plugin.json'), 'utf8')).toBe('{}');
});

function writeRecord(id, source) {
  const dir = path.join(root, '.agent', 'skills', 'total-recall', 'memory-vault', 'system', 'plugins');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  fs.writeFileSync(file, `---\ntype: plugin_record\ntitle: ${id}\ndescription: Fixture record\ntimestamp: "2026-11-09T00:00:00.000Z"\nplugin_id: ${id}\nsource:\n  kind: ${source}\n---\n\n# ${id}\n`);
  return file;
}

it('deletes a repository-only plugin only on request, then drops its install record', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const checkout = path.join(root, 'app-code');
  fs.mkdirSync(checkout);
  fs.writeFileSync(path.join(checkout, 'plugin.json'), '{}');
  const link = path.join(root, '.agent', 'skills', 'total-recall', 'plugins', 'app-only');
  fs.symlinkSync(checkout, link);
  copies.push({ id: 'app-only', dir: link, sharedDir: null, edited: null, stale: false, linked: true, shadow: false, repoOnly: true, target: checkout });
  const record = writeRecord('app-only', 'link');

  await manageProjectPluginCopies([root, '--apply', '--json']);
  expect(JSON.parse(log.mock.calls[0][0]).removal.removed).not.toContain('app-only');
  expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  expect(fs.existsSync(record)).toBe(true);

  log.mockClear();
  await manageProjectPluginCopies([root, '--apply', '--drop-repo-only', '--json']);
  const report = JSON.parse(log.mock.calls[0][0]);
  expect(report.removal.removed).toContain('app-only');
  expect(report.records.removed).toEqual(['app-only']);
  expect(fs.lstatSync(link, { throwIfNoEntry: false })).toBeUndefined();
  expect(fs.existsSync(record)).toBe(false);
  // The link's target is the application's own code and is left alone.
  expect(fs.readFileSync(path.join(checkout, 'plugin.json'), 'utf8')).toBe('{}');
});

it('keeps on/off records for shared plugins and records of plugins the shared folder installs', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-copies-shared-'));
  const previous = process.env._TR_TEST_AGENT_DIR;
  process.env._TR_TEST_AGENT_DIR = shared;
  try {
    fs.mkdirSync(path.join(shared, 'skills', 'total-recall', 'plugins', 'installed-shared'), { recursive: true });
    const overlay = writeRecord('switched-off', 'shared');
    const sharedInstall = writeRecord('installed-shared', 'bundled');
    await manageProjectPluginCopies([root, '--json']);
    expect(JSON.parse(log.mock.calls[0][0]).orphanRecords).toEqual([]);
    expect(fs.existsSync(overlay)).toBe(true);
    expect(fs.existsSync(sharedInstall)).toBe(true);
  } finally {
    if (previous === undefined) delete process.env._TR_TEST_AGENT_DIR; else process.env._TR_TEST_AGENT_DIR = previous;
    fs.rmSync(shared, { recursive: true, force: true });
  }
});
