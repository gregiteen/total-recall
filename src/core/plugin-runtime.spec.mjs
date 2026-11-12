import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startPluginDaemonServices } from './plugin-runtime.mjs';
import { validatePluginManifest } from './plugin-loader.mjs';
import { writeFixturePlugin } from './testing/plugin-fixture.mjs';

// Vitest cannot import modules from temporary directories outside the repository,
// so the loader is injected; the daemon's real import is proven on the live daemon.
const load = async (id) => (id === 'broken'
  ? { nothing: 1 }
  : {
    start: async () => {
      globalThis.__started = (globalThis.__started || 0) + 1;
      return () => { globalThis.__stopped = (globalThis.__stopped || 0) + 1; };
    },
  });

describe('plugin daemon services', () => {
  let root, previous;
  // Daemon services come from the shared folder, where every plugin is installed.
  const pluginsDir = () => path.join(root, 'global', 'skills', 'total-recall', 'plugins');
  const addPlugin = (id, runtime) => {
    const dir = path.join(pluginsDir(), id);
    fs.mkdirSync(dir, { recursive: true });
    writeFixturePlugin(dir, { id, name: id, version: '1.0.0', description: 'Daemon service fixture', cli: { command: id, handler: './cli.mjs' }, runtime }, { fs, path });
    fs.writeFileSync(path.join(dir, 'cli.mjs'), 'export async function run() {}');
    fs.writeFileSync(path.join(dir, 'service.mjs'), 'export {};');
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-daemon-services-'));
    previous = process.env._TR_TEST_AGENT_DIR;
    process.env._TR_TEST_AGENT_DIR = path.join(root, 'global');
    globalThis.__started = 0; globalThis.__stopped = 0;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env._TR_TEST_AGENT_DIR; else process.env._TR_TEST_AGENT_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('starts every declared service and stops each one', async () => {
    addPlugin('svc-a', { modules: { service: 'service.mjs' }, daemon: ['service'] });
    addPlugin('plain', { modules: { service: 'service.mjs' } });
    const services = await startPluginDaemonServices({ projectRoot: root, load });
    // Bundled scaffold plugins (automations) also declare services; check only the fixtures.
    const mine = (labels) => labels.filter((l) => /^(svc-|plain|broken)/.test(l));
    expect(mine(services.started)).toEqual(['svc-a:service']);
    expect(mine(services.failed)).toEqual([]);
    expect(services.started.some((l) => l.startsWith('plain:'))).toBe(false);
    const started = globalThis.__started;
    services.stop();
    expect(globalThis.__stopped).toBe(started);
  });

  it('keeps going when one service fails to start', async () => {
    addPlugin('broken', { modules: { service: 'service.mjs' }, daemon: ['service'] });
    addPlugin('svc-b', { modules: { service: 'service.mjs' }, daemon: ['service'] });
    const services = await startPluginDaemonServices({ projectRoot: root, load });
    expect(services.failed).toEqual(['broken:service']);
    expect(services.started).toContain('svc-b:service');
    expect(services.started).not.toContain('broken:service');
  });

  it('rejects a daemon entry that names no declared module', () => {
    const base = { id: 'x', name: 'x', version: '1.0.0', description: 'x', cli: { command: 'x', handler: './cli.mjs' } };
    expect(validatePluginManifest({ ...base, runtime: { modules: {}, daemon: ['missing'] } }).errors.join(' ')).toMatch(/undeclared module missing/);
    expect(validatePluginManifest({ ...base, runtime: { modules: { s: 's.mjs' }, daemon: 's' } }).errors.join(' ')).toMatch(/runtime.daemon must be an array/);
  });
});
