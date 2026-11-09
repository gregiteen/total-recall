import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse } from 'yaml';
import { installLessonHooks } from './lesson-hooks.mjs';
let home;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-hooks-')); });
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));
it.each(['claude', 'codex', 'dsh', 'agy', 'cursor'])('installs, repeats and removes %s lesson hooks without changing other hooks', harness => {
  const settings = path.join(home, 'hooks.json');
  const original = { custom: 'preserve', hooks: { Stop: [{ hooks: [{ command: 'mine' }] }] } };
  fs.writeFileSync(settings, JSON.stringify(original));
  const row = { harness, settings, status: 'installed' };
  installLessonHooks(row, { dryRun: true }); expect(JSON.parse(fs.readFileSync(settings, 'utf8'))).toEqual(original);
  installLessonHooks(row); const once = fs.readFileSync(settings, 'utf8');
  installLessonHooks(row); expect(fs.readFileSync(settings, 'utf8')).toBe(once);
  expect(once).toContain('lessons tick'); expect(once).toContain('lessons session-end'); expect(once).toContain('mine');
  installLessonHooks(row, { remove: true });
  const removed = fs.readFileSync(settings, 'utf8'); expect(removed).not.toContain('lessons tick'); expect(removed).toContain('mine');
});
it('adds Hermes observers and preserves YAML comments and other settings', () => {
  const settings = path.join(home, 'config.yaml');
  fs.writeFileSync(settings, '# Keep this\nmodel: {}\nhooks:\n  post_llm_call:\n    - command: mine\n');
  const row = { harness: 'hermes', settings, status: 'installed' };
  installLessonHooks(row); installLessonHooks(row);
  const text = fs.readFileSync(settings, 'utf8');
  expect(text).toContain('# Keep this');
  expect(parse(text).hooks.post_llm_call).toHaveLength(2);
  expect(parse(text).hooks.on_session_finalize[0].command).toContain('lessons session-end');
});
it('installs a Pi turn-end and shutdown extension through the selected owner path', () => {
  const row = { harness: 'pi', settings: path.join(home, 'total-recall-preflight.ts'), status: 'installed' };
  const installed = installLessonHooks(row);
  expect(fs.readFileSync(installed.settings, 'utf8')).toContain("pi.on('agent_end'");
  expect(fs.readFileSync(installed.settings, 'utf8')).toContain("pi.on('session_shutdown'");
  installLessonHooks(row, { remove: true }); expect(fs.existsSync(installed.settings)).toBe(false);
});
it('uses ingest for absent or unsupported native hook owners', () => {
  expect(installLessonHooks({ harness: 'none', status: 'not-present' }).status).toBe('session-ingest');
});
