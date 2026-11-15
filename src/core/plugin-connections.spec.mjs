import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installPlugin } from './plugin-store.mjs';
import { getPlugin as discoverPlugin } from './plugin-loader.mjs';
import { setPluginActive } from './plugin-activation.mjs';
import { writeFixturePlugin } from './testing/plugin-fixture.mjs';
import { readPluginConnection, CONNECTION_STALE_MS } from './plugin-connections.mjs';

const NOW = Date.parse('2026-11-15T12:00:00.000Z');
const iso = ago => new Date(NOW - ago).toISOString();

describe('owner connection reports', () => {
  let root, previous;
  const target = () => ({ brainDir: path.join(root, '.agent/skills/total-recall'), projectRoot: root });
  const install = async (id, runtime) => {
    const source = path.join(root, `source-${id}`); fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'cli.mjs'), 'export async function run(){}');
    writeFixturePlugin(source, { id, name: id, version: '1.0.0', description: 'Connection fixture',
      cli: { command: id, handler: 'cli.mjs', subcommands: [{ name: 'tick', effect: 'read', output: 'text', args: [] }] }, runtime }, { fs, path });
    await installPlugin(source, { projectRoot: root });
    return discoverPlugin(id, root);
  };
  const owner = report => ({ calls: [], load: async function load(id, name, options) {
    owner.calls.push({ id, name, options });
    return { readConnection: input => { owner.input = input; return typeof report === 'function' ? report() : report; } };
  } });
  const read = (plugin, report, extra = {}) => { const fake = owner(report); owner.calls = []; return readPluginConnection(plugin, target(), { now: NOW, load: fake.load, ...extra }); };

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-connections-'));
    previous = process.env._TR_TEST_AGENT_DIR;
    process.env._TR_TEST_AGENT_DIR = path.join(root, 'global');
    const config = path.join(root, '.agent/skills/total-recall/config'); fs.mkdirSync(config, { recursive: true });
    fs.writeFileSync(path.join(config, 'clients.json'), '["codex"]');
  });
  afterEach(() => { if (previous === undefined) delete process.env._TR_TEST_AGENT_DIR; else process.env._TR_TEST_AGENT_DIR = previous; fs.rmSync(root, { recursive: true, force: true }); });

  it('reports a fresh owner receipt with its method and time, passing the owner only the selected brain', async () => {
    const plugin = await install('conn-demo', { modules: { connections: 'cli.mjs' } });
    const result = await read(plugin, { status: 'connected', method: 'api-key', checkedAt: iso(60_000) });
    expect(result).toEqual({ pluginId: 'conn-demo', reported: true, status: 'connected', method: 'api-key', checkedAt: iso(60_000), freshness: 'fresh' });
    expect(owner.input).toEqual({ brainDir: target().brainDir, projectRoot: root });
    expect(owner.calls[0]).toMatchObject({ id: 'conn-demo', name: 'connections', options: { activeRequired: true, projectRoot: root } });
  });

  it('keeps an owner unknown with its known method and no time', async () => {
    const plugin = await install('conn-demo', { modules: { connections: 'cli.mjs' } });
    expect(await read(plugin, { status: 'unknown', method: 'api-key' })).toEqual({ pluginId: 'conn-demo', reported: true, status: 'unknown', method: 'api-key', checkedAt: null, freshness: 'none' });
  });

  it('turns old evidence stale instead of repeating its status as current', async () => {
    const plugin = await install('conn-demo', { modules: { connections: 'cli.mjs' } });
    const result = await read(plugin, { status: 'connected', method: 'api-key', checkedAt: iso(CONNECTION_STALE_MS + 1000) });
    expect(result).toMatchObject({ status: 'stale', lastStatus: 'connected', freshness: 'stale' });
  });

  it('shows a curated failure message for a coded failure', async () => {
    const plugin = await install('conn-demo', { modules: { connections: 'cli.mjs' } });
    const result = await read(plugin, { status: 'failed', method: 'api-key', checkedAt: iso(1000), failure: 'credential-rejected' });
    expect(result.failure).toEqual({ code: 'credential-rejected', message: 'The provider rejected the credential.' });
  });

  it.each([
    ['a future time', { status: 'connected', method: 'api-key', checkedAt: iso(-3_600_000) }],
    ['a non-finite time', { status: 'connected', method: 'api-key', checkedAt: 'not-a-date' }],
    ['a missing time', { status: 'connected', method: 'api-key' }],
    ['a non-ISO time', { status: 'connected', method: 'api-key', checkedAt: 'Nov 15 2026' }],
    ['an unknown status', { status: 'healthy', method: 'api-key', checkedAt: iso(1000) }],
    ['an unknown method', { status: 'connected', method: 'password', checkedAt: iso(1000) }],
    ['an uncurated failure', { status: 'failed', method: 'api-key', checkedAt: iso(1000), failure: 'raw provider said sk-CANARY' }],
    ['a failure without a code', { status: 'failed', method: 'api-key', checkedAt: iso(1000) }],
    ['a failure on a connected report', { status: 'connected', method: 'api-key', checkedAt: iso(1000), failure: 'timeout' }],
    ['a time on an unknown report', { status: 'unknown', method: 'api-key', checkedAt: iso(1000) }],
    ['an extra raw field', { status: 'connected', method: 'api-key', checkedAt: iso(1000), endpoint: 'https://CANARY.example', message: 'CANARY' }],
    ['an array', [{ status: 'connected' }]],
    ['a string', 'connected'],
    ['nothing', undefined],
  ])('rejects %s without echoing it', async (_name, report) => {
    const plugin = await install('conn-demo', { modules: { connections: 'cli.mjs' } });
    const result = await read(plugin, report);
    expect(result).toEqual({ pluginId: 'conn-demo', reported: false, reason: 'invalid-report', message: expect.any(String) });
    expect(JSON.stringify(result)).not.toContain('CANARY');
  });

  it('never reports a plugin without a declared connections module as connected', async () => {
    const plugin = await install('conn-plain', { modules: { other: 'cli.mjs' } });
    const result = await read(plugin, { status: 'connected', method: 'api-key', checkedAt: iso(1000) });
    expect(result).toMatchObject({ reported: false, reason: 'no-report' });
    expect(owner.calls).toEqual([]);
  });

  it('does not load an inactive plugin module', async () => {
    const plugin = await install('conn-demo', { modules: { connections: 'cli.mjs' } });
    await setPluginActive('conn-demo', false, { projectRoot: root });
    const result = await read(plugin, { status: 'connected', method: 'api-key', checkedAt: iso(1000) });
    expect(result).toMatchObject({ reported: false, reason: 'inactive' });
    expect(owner.calls).toEqual([]);
  });

  it('reports a missing module, a throwing owner and a hung owner as unavailable without their messages', async () => {
    const plugin = await install('conn-demo', { modules: { connections: 'cli.mjs' } });
    const missing = await readPluginConnection(plugin, target(), { now: NOW, load: async () => { throw new Error('/secret/path CANARY'); } });
    const throwing = await read(plugin, () => { throw new Error('token CANARY'); });
    const hung = await read(plugin, () => new Promise(() => {}), { timeoutMs: 20 });
    const notFunction = await readPluginConnection(plugin, target(), { now: NOW, load: async () => ({}) });
    for (const result of [missing, throwing, hung]) {
      expect(result).toMatchObject({ reported: false, reason: 'owner-unavailable' });
      expect(JSON.stringify(result)).not.toContain('CANARY');
    }
    expect(notFunction).toMatchObject({ reported: false, reason: 'no-report' });
  });

  it('is unavailable for an invalid or absent plugin', async () => {
    expect(await readPluginConnection(undefined, target(), { now: NOW })).toMatchObject({ reported: false, reason: 'plugin-unavailable' });
    expect(await readPluginConnection({ id: 'bad', valid: false }, target(), { now: NOW })).toMatchObject({ reported: false, reason: 'plugin-unavailable' });
  });
});
