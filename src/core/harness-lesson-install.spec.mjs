import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
vi.mock('./plugin-runtime.mjs', () => ({ loadPluginModule: vi.fn() }));
import { loadPluginModule } from './plugin-runtime.mjs';
import { installHarnessHooks, removeHarnessHooks } from './harness-hooks.mjs';
let home, settings, adapters;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-lessons-'));
  settings = path.join(home, 'hooks.json'); fs.writeFileSync(settings, '{}');
  adapters = { installAll: vi.fn(async () => ({ ok: true, rows: [{ harness: 'codex', settings, status: 'installed' }] })),
    list: () => [{ id: 'codex', install: () => ({ settings }) }], removeAll: vi.fn(async () => ({ ok: true, rows: [{ harness: 'codex', status: 'removed' }] })) };
  loadPluginModule.mockResolvedValue(adapters);
});
afterEach(() => { vi.clearAllMocks(); fs.rmSync(home, { recursive: true, force: true }); });
it('installs and removes lesson hooks through the existing all-harness installer', async () => {
  const result = await installHarnessHooks({ home, projectRoot: home, log() {} });
  expect(result.ok).toBe(true);
  expect(adapters.installAll).toHaveBeenCalledWith({ dryRun: false, home });
  expect(fs.readFileSync(settings, 'utf8')).toContain('lessons session-end');
  expect((await removeHarnessHooks({ projectRoot: home, log() {} })).ok).toBe(true);
  expect(fs.readFileSync(settings, 'utf8')).not.toContain('lessons tick');
});
it('reports a lesson-hook failure and keeps the other owner result visible', async () => {
  fs.writeFileSync(settings, '{broken');
  const log = vi.fn();
  const result = await installHarnessHooks({ projectRoot: home, log });
  expect(result.ok).toBe(false); expect(result.rows[0].lessons.status).toBe('failed');
  expect(log.mock.calls.flat().join('\n')).toContain('codex lessons:');
});
