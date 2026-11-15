// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getPluginById, globalPluginsDir } from './plugin-loader.mjs';
import { patchPluginRecord } from './plugin-store.mjs';
import { executePluginState, PluginStateStore } from './plugin-state-store.mjs';
import { isBrainState } from './brain-state.mjs';
import { readPluginDesign, readPluginDesignChoice, writePluginDesignChoice, MAX_USER_DESIGN_BYTES } from './ui-chunks.mjs';

let fixture, brain, other, owner;
const markdown = color => `---\ncolors:\n  primary: '${color}'\ncomponents:\n  button:\n    color: '{colors.primary}'\n---\n# User DESIGN.md\n<script>throw new Error('never executed')</script>\n`;
beforeEach(() => {
  fixture = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-design-choice-')));
  vi.stubEnv('AGENT_DIR', path.join(fixture, 'agent'));
  brain = path.join(fixture, 'brain');
  other = path.join(fixture, 'other');
  for (const id of ['design-test', 'design-other']) {
    const directory = path.join(globalPluginsDir(), id);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'plugin.json'), JSON.stringify({ id, name: id, version: '1.0.0', description: 'Design test owner',
      ui: { home: 'home', design_tokens: 'DESIGN.md', elements: [{ id: 'home', kind: 'panel', tag: `${id}-home`, module: 'home.js' }] } }));
    fs.writeFileSync(path.join(directory, 'home.js'), 'export {};\n');
    fs.writeFileSync(path.join(directory, 'DESIGN.md'), markdown('#123456'));
  }
  owner = path.join(globalPluginsDir(), 'design-test', 'DESIGN.md');
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(fixture, { recursive: true, force: true }); });
const read = (brainDir = brain, revision) => readPluginDesign('design-test', { brainDir, projectRoot: fixture, revision });
const choose = (content, version = null) => writePluginDesignChoice(brain, 'design-test', content, version, fixture);

it('selects safe user Markdown per brain and plugin, retains live revisions, and removes to the current owner fallback', async () => {
  const before = fs.readFileSync(owner, 'utf8');
  const installed = read();
  expect(installed.css).toContain('--color-primary:#123456;');
  expect(readPluginDesignChoice(brain, 'design-test', fixture)).toEqual({ markdown: null, version: null });
  const first = await choose(markdown('#abcdef'));
  const selected = read();
  expect(fs.readFileSync(owner, 'utf8')).toBe(before);
  expect(selected.css).toContain('--color-primary:#abcdef;');
  expect(selected.css).not.toContain('script');
  expect(selected.components).toEqual(['button']);
  expect(read(brain, selected.revision)).toEqual({ unchanged: true });
  expect(read(other)).toEqual(installed);
  expect(readPluginDesign('design-other', { brainDir: brain, projectRoot: fixture })).toEqual(installed);
  await expect(choose(markdown('#ffffff'))).rejects.toThrow('version conflict');
  expect(read()).toEqual(selected);
  fs.writeFileSync(owner, markdown('#654321'));
  expect(read(brain, selected.revision)).toEqual({ unchanged: true });
  const second = await choose(markdown('#fedcba'), first.version);
  expect(read(brain, selected.revision).css).toContain('#fedcba');
  const removed = await choose(null, second.version);
  expect(removed).toEqual({ markdown: null, version: expect.any(String) });
  expect(read().css).toContain('#654321');
  const fallback = read();
  fs.writeFileSync(owner, markdown('#111111'));
  expect(read(brain, fallback.revision).css).toContain('#111111');
  expect(before).toContain('#123456');
  expect(fs.readFileSync(owner, 'utf8')).toBe(markdown('#111111'));
  expect(isBrainState('config/.ssss/workspace-design/choice.md')).toBe(true);
  await patchPluginRecord(getPluginById('design-test', fixture), { runtime_enabled: false });
  expect(read()).toBe(null);
  expect(readPluginDesignChoice(brain, 'design-test', fixture)).toBe(null);
  await expect(choose(markdown('#fff'), removed.version)).rejects.toThrow('installed and enabled');
});

it('rejects unsafe, malformed, unbounded and path-only choices before writing', async () => {
  for (const value of [undefined, {}, '', owner, 'x'.repeat(MAX_USER_DESIGN_BYTES + 1), markdown('red;display:none'), markdown('url(https://example.org)'), '---\ncolors: [\n---\n', '---\ncolors:\n  bad: "{missing.token}"\n---\n', markdown('red\0')]) {
    await expect(choose(value)).rejects.toThrow();
  }
  for (const version of [undefined, '', 'NULL', 1]) {
    await expect(writePluginDesignChoice(brain, 'design-test', markdown('#fff'), version, fixture)).rejects.toThrow('Reload');
  }
  expect(readPluginDesignChoice(brain, 'design-test', fixture)).toEqual({ markdown: null, version: null });
  expect(fs.existsSync(path.join(brain, 'config'))).toBe(false);
  await expect(writePluginDesignChoice(brain, '../outside', markdown('#fff'), null, fixture)).rejects.toThrow('Invalid plugin');
});

it('does not hide or replace corrupt saved selections and preserves the owner file', async () => {
  const before = fs.readFileSync(owner, 'utf8');
  const store = new PluginStateStore(path.join(brain, 'config/workspace-design-design-test.json'), 'workspace-design');
  const { version } = await executePluginState({ file: store.file, plugin: 'workspace-design', action: 'write', value: { markdown: markdown('#fff'), extra: true }, expectedVersion: null });
  expect(() => read()).toThrow('saved design choice is invalid');
  await expect(choose(null, version)).rejects.toThrow('saved design choice is invalid');
  fs.writeFileSync(store.documentPath, 'corrupt-private-marker');
  expect(() => read()).toThrow();
  expect(fs.readFileSync(owner, 'utf8')).toBe(before);
});
