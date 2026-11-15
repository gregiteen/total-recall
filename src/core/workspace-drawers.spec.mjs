import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { readDrawerConfig, readDrawerHistory, restoreDrawerConfig, validateDrawerConfig, writeDrawerConfig, MAX_DRAWER_HISTORY, MAX_DRAWER_HISTORY_BYTES } from './workspace-drawers.mjs';
import { executePluginState, PluginStateStore } from './plugin-state-store.mjs';
import { isBrainState } from './brain-state.mjs';

it('preserves both drawer layouts and rejects a stale write', async () => {
  const brain = await fs.mkdtemp(path.join(os.tmpdir(), 'tr-drawers-'));
  try {
    const initial = readDrawerConfig(brain, 'bottom');
    const config = validateDrawerConfig({
      html: '<h2>My workspace</h2>',
      chunks: ['phone:call-workbench'],
      shortcuts: [{ label: 'Vault', href: '/memory' }],
    });
    const written = await writeDrawerConfig(brain, 'bottom', config, initial.version);
    await expect(writeDrawerConfig(brain, 'bottom', {}, initial.version)).rejects.toThrow('Plugin state version conflict');
    expect(readDrawerConfig(brain, 'bottom')).toEqual(written);
    expect(readDrawerConfig(brain, 'right')).toEqual(initial);
  } finally {
    await fs.rm(brain, { recursive: true, force: true });
  }
});

it('rejects relative addresses that normalize to a different origin when followed', () => {
  expect(() => validateDrawerConfig({
    shortcuts: [{ label: 'Outside', href: '/account/..//example.org' }],
  })).toThrow('Use a dashboard path or an HTTPS address');
});

it('restores an exact prior layout, archives the replaced layout, and rejects concurrent stale restores', async () => {
  const brain = await fs.mkdtemp(path.join(os.tmpdir(), 'tr-drawer-restore-'));
  try {
    const first = await writeDrawerConfig(brain, 'right', { html: '<h2>First</h2>' }, null);
    const second = await writeDrawerConfig(brain, 'right', { html: '<h2>Second</h2>' }, first.version);
    const other = await writeDrawerConfig(brain, 'bottom', { shortcuts: [{ label: 'Help', href: '/help' }] }, null);
    expect(readDrawerHistory(brain, 'right')).toMatchObject({ version: second.version, history: [{ version: first.version, config: first.config }] });
    const restored = await restoreDrawerConfig(brain, 'right', first.version, second.version);
    expect(restored.config).toEqual(first.config);
    expect(readDrawerHistory(brain, 'right').history[0]).toMatchObject({ version: second.version, config: second.config });
    await expect(restoreDrawerConfig(brain, 'right', first.version, second.version)).rejects.toThrow('version conflict');
    expect(readDrawerConfig(brain, 'right')).toEqual(restored);
    expect(readDrawerConfig(brain, 'bottom')).toEqual(other);
    const freshBrain = path.join(brain, 'other');
    expect(readDrawerHistory(freshBrain, 'right')).toEqual({ history: [], version: null });
    await expect(restoreDrawerConfig(freshBrain, 'right', first.version, null)).rejects.toThrow('unavailable');
    const races = await Promise.allSettled([
      restoreDrawerConfig(brain, 'right', second.version, restored.version),
      writeDrawerConfig(brain, 'right', { html: 'Concurrent' }, restored.version),
    ]);
    expect(races.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(races.find(result => result.status === 'rejected').reason.message).toContain('version conflict');
  } finally { await fs.rm(brain, { recursive: true, force: true }); }
});

it('reads flat canonical legacy layouts without writing and migrates atomically on save', async () => {
  const brain = await fs.mkdtemp(path.join(os.tmpdir(), 'tr-drawer-legacy-'));
  try {
    const file = path.join(brain, 'config/workspace-drawer-right.json');
    const legacy = validateDrawerConfig({ html: 'Legacy' });
    const prior = await executePluginState({ file, plugin: 'workspace-ui', action: 'write', value: legacy, expectedVersion: null });
    const store = new PluginStateStore(file, 'workspace-ui');
    const bytes = await fs.readFile(store.documentPath, 'utf8');
    expect(readDrawerConfig(brain, 'right')).toEqual({ config: legacy, version: prior.version });
    expect(readDrawerHistory(brain, 'right').history).toEqual([]);
    expect(await fs.readFile(store.documentPath, 'utf8')).toBe(bytes);
    await writeDrawerConfig(brain, 'right', { html: 'New' }, prior.version);
    expect(store.read(null)).toMatchObject({ schemaVersion: 1, history: [{ version: prior.version, config: legacy }] });
    expect(isBrainState(path.relative(brain, store.documentPath))).toBe(true);
    expect(await fs.stat(path.join(brain, 'config/workspace-drawer-right.json')).catch(error => error.code)).toBe('ENOENT');
  } finally { await fs.rm(brain, { recursive: true, force: true }); }
});

it('bounds history by both count and total serialized bytes, dropping oldest revisions', async () => {
  const brain = await fs.mkdtemp(path.join(os.tmpdir(), 'tr-drawer-bounds-'));
  try {
    let current = { version: null };
    for (let index = 0; index < MAX_DRAWER_HISTORY + 3; index++) current = await writeDrawerConfig(brain, 'bottom', { html: String(index) }, current.version);
    expect(readDrawerHistory(brain, 'bottom').history).toHaveLength(MAX_DRAWER_HISTORY);
    const evicted = readDrawerHistory(brain, 'bottom').history.at(-1).version;
    for (let index = 0; index < 6; index++) current = await writeDrawerConfig(brain, 'bottom', { html: 'x'.repeat(65536) }, current.version);
    const history = readDrawerHistory(brain, 'bottom').history;
    expect(Buffer.byteLength(JSON.stringify(history))).toBeLessThanOrEqual(MAX_DRAWER_HISTORY_BYTES);
    expect(history.length).toBeLessThan(MAX_DRAWER_HISTORY);
    await expect(restoreDrawerConfig(brain, 'bottom', evicted, current.version)).rejects.toThrow('unavailable');
  } finally { await fs.rm(brain, { recursive: true, force: true }); }
});

it('fails closed on corrupt canonical history and strictly rejects malformed layouts and versions', async () => {
  const brain = await fs.mkdtemp(path.join(os.tmpdir(), 'tr-drawer-invalid-'));
  try {
    for (const config of [null, [], { extra: true }, { html: 'é'.repeat(32769) }, { panels: [{ plugin: 'ok', element: 'home', extra: true }] }, { shortcuts: [{ label: 'x', href: 'javascript:alert(1)' }] }]) {
      await expect(writeDrawerConfig(brain, 'right', config, null)).rejects.toThrow();
    }
    for (const version of [undefined, '', 1, '0', {}, 'A'.repeat(64)]) await expect(writeDrawerConfig(brain, 'right', {}, version)).rejects.toThrow('Reload');
    expect(readDrawerConfig(brain, 'right').version).toBe(null);
    const store = new PluginStateStore(path.join(brain, 'config/workspace-drawer-right.json'), 'workspace-ui');
    const bad = { schemaVersion: 1, config: validateDrawerConfig({ html: 'private-marker' }), history: [{ version: 'bad', config: {} }] };
    await executePluginState({ file: store.file, plugin: 'workspace-ui', action: 'write', value: bad, expectedVersion: null });
    expect(() => readDrawerConfig(brain, 'right')).toThrow('Invalid saved drawer history');
    await expect(writeDrawerConfig(brain, 'right', {}, store.read(null) && store.version)).rejects.toThrow('Invalid saved drawer history');
    await fs.writeFile(store.documentPath, 'broken private-marker');
    expect(() => readDrawerHistory(brain, 'right')).toThrow();
  } finally { await fs.rm(brain, { recursive: true, force: true }); }
});
