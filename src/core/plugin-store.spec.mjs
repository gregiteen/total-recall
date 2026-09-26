import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import {
  installPlugin,
  uninstallPlugin,
  setPluginShared,
  listInstalledPlugins,
  listAvailableBundled,
  listSharedPlugins,
  packSharedPlugin,
  packPublicPlugin,
  patchPluginRecord
} from './plugin-store.mjs';
import { projectPluginsDir, globalPluginsDir, listBundledPlugins } from './plugin-loader.mjs';

const FORBIDDEN = /rating|review|install_?count|download|verified|stars?\b/i;

function vaultFile(root, ...rest) {
  return path.join(root, '.agent', 'skills', 'total-recall', 'memory-vault', ...rest);
}

function readEvents(root) {
  const dir = vaultFile(root, '.events');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.jsonl'))
    .flatMap(f => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean))
    .join('\n');
}

describe('plugin-store', () => {
  let tmp;
  let projA;
  let projB;
  let prevAgentDir;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-store-'));
    prevAgentDir = process.env._TR_TEST_AGENT_DIR;
    process.env._TR_TEST_AGENT_DIR = path.join(tmp, 'home-agent');
    projA = path.join(tmp, 'A');
    projB = path.join(tmp, 'B');
    fs.mkdirSync(path.join(projA, '.agent'), { recursive: true });
    fs.mkdirSync(path.join(projB, '.agent'), { recursive: true });
  });

  afterEach(() => {
    if (prevAgentDir === undefined) delete process.env._TR_TEST_AGENT_DIR;
    else process.env._TR_TEST_AGENT_DIR = prevAgentDir;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('every bundled plugin installs on a clean project', async () => {
    const ids = listBundledPlugins().map(p => p.id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const res = await installPlugin(id, { projectRoot: projA });
      expect(res.source.kind).toBe('bundled');
      expect(fs.existsSync(path.join(projectPluginsDir(projA), id, 'plugin.json'))).toBe(true);
    }
    expect(listAvailableBundled(projA).every(p => p.installed)).toBe(true);
  });

  it('writes a plugin_record and an installed event through the Core Contract', async () => {
    const res = await installPlugin('git-sentinel', { projectRoot: projA });
    const record = fs.readFileSync(vaultFile(projA, 'system', 'plugins', 'git-sentinel.md'), 'utf8');
    expect(record).toContain('type: plugin_record');
    expect(record).toContain(`sha256: ${res.sha256}`);
    expect(record).toContain('kind: bundled');
    expect(readEvents(projA)).toContain('plugin.installed');
  });

  it('describes installed plugins with verifiable facts only', async () => {
    await installPlugin('system-monitor', { projectRoot: projA });
    const [p] = listInstalledPlugins(projA);
    expect(p).toMatchObject({ id: 'system-monitor', scope: 'project', shared: false, modified_since_install: false });
    expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(p).filter(k => FORBIDDEN.test(k))).toEqual([]);
  });

  it('flags a plugin whose files changed since install', async () => {
    await installPlugin('git-sentinel', { projectRoot: projA });
    fs.appendFileSync(path.join(projectPluginsDir(projA), 'git-sentinel', 'README.md'), '\nlocal edit\n');
    expect(listInstalledPlugins(projA)[0].modified_since_install).toBe(true);
  });

  it('shares only what the owner marks shared', async () => {
    await installPlugin('git-sentinel', { projectRoot: projA });
    await installPlugin('system-monitor', { projectRoot: projA });
    expect(listSharedPlugins(projA)).toEqual([]);
    expect(packSharedPlugin('git-sentinel', projA)).toBeNull();
    expect(packPublicPlugin('git-sentinel', projA)).toBeNull();

    await setPluginShared('git-sentinel', true, { projectRoot: projA });
    expect(listSharedPlugins(projA).map(p => p.id)).toEqual(['git-sentinel']);
    expect(packPublicPlugin('git-sentinel', projA)?.id).toBe('git-sentinel');
    expect(readEvents(projA)).toContain('plugin.shared');

    await setPluginShared('git-sentinel', false, { projectRoot: projA });
    expect(listSharedPlugins(projA)).toEqual([]);
    expect(packPublicPlugin('git-sentinel', projA)).toBeNull();
  });

  it('does not publish a legacy mesh-only share', async () => {
    await installPlugin('git-sentinel', { projectRoot: projA });
    const plugin = listInstalledPlugins(projA)[0];
    const discovered = (await import('./plugin-loader.mjs')).discoverPlugins(projA)[0];
    await patchPluginRecord(discovered, { shared: true });
    expect(listSharedPlugins(projA).map(p => p.id)).toEqual([plugin.id]);
    expect(packPublicPlugin(plugin.id, projA)).toBeNull();
  });

  it('installs from a mesh peer, verifying the content hash', async () => {
    await installPlugin('git-sentinel', { projectRoot: projA });
    await setPluginShared('git-sentinel', true, { projectRoot: projA });
    const listing = { plugins: listSharedPlugins(projA).map(({ _plugin, ...rest }) => rest) };
    const bundle = packSharedPlugin('git-sentinel', projA);
    const peerDeps = {
      peers: [{ hostname: 'node-a', ip: '100.64.0.5', online: true }],
      authorization: 'Bearer t',
      fetchImpl: async (url) => ({
        ok: true,
        status: 200,
        json: async () => listing,
        text: async () => JSON.stringify(bundle)
      })
    };

    const res = await installPlugin('peer:node-a/git-sentinel', { projectRoot: projB, peerDeps });
    expect(res.source).toEqual({ kind: 'peer', ref: 'peer:node-a/git-sentinel', peer_hostname: 'node-a' });
    expect(res.sha256).toBe(listing.plugins[0].sha256);
    expect(listInstalledPlugins(projB)[0].shared).toBe(false);
  });

  it('installs from a public share link only when its content hash matches', async () => {
    await installPlugin('git-sentinel', { projectRoot: projA });
    await setPluginShared('git-sentinel', true, { projectRoot: projA });
    const bundle = packSharedPlugin('git-sentinel', projA);
    const source = `https://plugins.example.com/api/public/plugins/git-sentinel/bundle#sha256=${bundle.sha256}`;
    const publicDeps = {
      lookup: async () => [{ address: '8.8.8.8' }],
      request: (_url, _options, callback) => {
        const request = new EventEmitter();
        request.end = () => {
          const response = Readable.from([Buffer.from(JSON.stringify(bundle))]);
          response.statusCode = 200;
          callback(response);
        };
        request.destroy = (error) => request.emit('error', error);
        return request;
      }
    };
    const result = await installPlugin(source, { projectRoot: projB, publicDeps });
    expect(result.source.kind).toBe('public');
    expect(result.sha256).toBe(bundle.sha256);
    await uninstallPlugin('git-sentinel', { projectRoot: projB });

    await expect(installPlugin(source.replace(bundle.sha256, '0'.repeat(64)), { projectRoot: projB, publicDeps })).rejects.toThrow(/does not match the advertised/);
    expect(fs.existsSync(path.join(projectPluginsDir(projB), 'git-sentinel'))).toBe(false);
  });

  it('rejects a tampered peer bundle and writes nothing', async () => {
    await installPlugin('git-sentinel', { projectRoot: projA });
    await setPluginShared('git-sentinel', true, { projectRoot: projA });
    const listing = { plugins: listSharedPlugins(projA).map(({ _plugin, ...rest }) => rest) };
    const bundle = packSharedPlugin('git-sentinel', projA);
    bundle.files[0].data_b64 = Buffer.from('tampered').toString('base64');
    const peerDeps = {
      peers: [{ hostname: 'node-a', ip: '100.64.0.5', online: true }],
      authorization: 'Bearer t',
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => listing, text: async () => JSON.stringify(bundle) })
    };

    await expect(installPlugin('peer:node-a/git-sentinel', { projectRoot: projB, peerDeps })).rejects.toThrow(/hash mismatch/);
    expect(fs.existsSync(projectPluginsDir(projB)) ? fs.readdirSync(projectPluginsDir(projB)) : []).toEqual([]);
  });

  it('installs globally and removes cleanly with its record', async () => {
    await installPlugin('git-sentinel', { projectRoot: projA, global: true });
    expect(fs.existsSync(path.join(globalPluginsDir(), 'git-sentinel'))).toBe(true);
    expect(listInstalledPlugins(projB).map(p => [p.id, p.scope])).toEqual([['git-sentinel', 'global']]);

    await uninstallPlugin('git-sentinel', { projectRoot: projB, global: true });
    expect(fs.existsSync(path.join(globalPluginsDir(), 'git-sentinel'))).toBe(false);
    const globalRecord = path.join(path.dirname(globalPluginsDir()), 'memory-vault', 'system', 'plugins', 'git-sentinel.md');
    expect(fs.existsSync(globalRecord)).toBe(false);
  });

  it('links a local directory and refuses duplicates', async () => {
    const src = path.join(tmp, 'my-plugin');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'plugin.json'), JSON.stringify({ id: 'my-plugin', name: 'Mine', version: '0.1.0', description: 'Local plugin' }));
    const res = await installPlugin(src, { projectRoot: projA, link: true });
    expect(res.source.kind).toBe('link');
    expect(fs.lstatSync(path.join(projectPluginsDir(projA), 'my-plugin')).isSymbolicLink()).toBe(true);
    await expect(installPlugin(src, { projectRoot: projA })).rejects.toThrow(/already installed/);
  });

  it('explains an unknown source instead of guessing', async () => {
    await expect(installPlugin('no-such-plugin', { projectRoot: projA })).rejects.toThrow(/No bundled plugin, share link, peer source, git URL or directory/);
  });
});
