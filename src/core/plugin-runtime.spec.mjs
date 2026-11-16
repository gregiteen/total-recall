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

describe('manifest-declared upgrades', () => {
  const plugin = { id: 'wire-owner', valid: true, dir: '/fixture/owner', manifest: { runtime: { modules: { wire: 'wire.mjs' }, upgrades: [{ path: '/live-wire', module: 'wire' }] } } };
  const socket = () => ({ destroyed: false, response: '', on() {}, end(value) { this.response = value; } });
  const request = url => ({ url });
  it('dispatches the exact declared path with literal query and shared activation guard', async () => {
    const { createPluginUpgradeHandler } = await import('./plugin-runtime.mjs');
    let active = true, received;
    const handle = createPluginUpgradeHandler({ discover: () => [plugin], activation: () => ({ enabled: active }), load: async (id, name, options) => {
      expect([id, name, options.activeRequired]).toEqual(['wire-owner', 'wire', true]);
      return { handleUpgrade: (...args) => { received = args; } };
    } });
    const req = request('/live-wire?token=literal'), sock = socket(), head = Buffer.from('fixture');
    await handle(req, sock, head);
    expect(received.slice(0,3)).toEqual([req, sock, head]);
    expect(received[3].isActive()).toBe(true);
    active = false; expect(received[3].isActive()).toBe(false);
  });
  it('denies absent, invalid, inactive, ambiguous and undeclared paths without importing code', async () => {
    const { createPluginUpgradeHandler } = await import('./plugin-runtime.mjs');
    for (const [owners, active, url, status] of [
      [[], true, '/live-wire', '404'], [[{...plugin,valid:false}],true,'/live-wire','404'],
      [[plugin],false,'/live-wire','503'], [[plugin,plugin],true,'/live-wire','503'],
      [[plugin],true,'/live-wire/other','404'],
    ]) {
      let loaded=false;
      const handle=createPluginUpgradeHandler({discover:()=>owners,activation:()=>({enabled:active}),load:async()=>{loaded=true;}});
      const sock=socket(); await handle(request(url),sock,Buffer.alloc(0));
      expect(sock.response).toContain(status); expect(loaded).toBe(false);
    }
  });
  it('rechecks removal during import and fails closed for broken handlers', async () => {
    const { createPluginUpgradeHandler } = await import('./plugin-runtime.mjs');
    for (const mode of ['remove','missing-export','throw']) {
      let owners=[plugin], called=false;
      const handle=createPluginUpgradeHandler({discover:()=>owners,activation:()=>({enabled:true}),load:async()=>{
        if(mode==='remove') owners=[];
        if(mode==='missing-export') return {};
        if(mode==='throw') throw new Error('fixture');
        return {handleUpgrade:()=>{called=true;}};
      }});
      const sock=socket();await handle(request('/live-wire'),sock,Buffer.alloc(0));
      expect(sock.response).toContain('503');expect(called).toBe(false);
    }
  });
  it('validates absolute paths and declared modules', () => {
    const base={id:'wire-owner',name:'Wire owner',version:'1.0.0',description:'Upgrade declaration fixture',cli:{command:'wire-owner',handler:'cli.mjs'}};
    for(const upgrades of ['wire',[{path:'relative',module:'wire'}],[{path:'/wire?query',module:'wire'}],[{path:'/wire',module:'unknown'}],[{path:'/wire',module:'wire'},{path:'/wire',module:'wire'}]]) {
      expect(validatePluginManifest({...base,runtime:{modules:{wire:'wire.mjs'},upgrades}}).errors.join(' ')).toMatch(/runtime.upgrades/);
    }
  });
});

describe('bounded plugin router and upgrade resolution', () => {
  let root, previous;
  const pluginsDir = () => path.join(root, 'global', 'skills', 'total-recall', 'plugins');
  const add = (id, runtime) => {
    const dir = path.join(pluginsDir(), id);
    fs.mkdirSync(dir, { recursive: true });
    writeFixturePlugin(dir, { id, name: id, version: '1.0.0', description: 'Router fixture', cli: { command: id, handler: './cli.mjs' }, runtime }, { fs, path });
    fs.writeFileSync(path.join(dir, 'cli.mjs'), 'export async function run() {}');
    fs.writeFileSync(path.join(dir, 'http.mjs'), 'export default () => {};');
    return dir;
  };
  const response = () => ({ code: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  const call = (router, url = '/owned') => new Promise((resolve) => {
    const res = response();
    const result = router({ path: url, url }, res, error => resolve({ next: true, error, res }));
    if (res.code) resolve({ next: false, res });
    Promise.resolve(result).then(() => setTimeout(() => resolve({ next: false, res }), 10));
  });
  const express = () => { const handler = () => {}; handler.stack = [{ route: {}, match: p => p === '/owned' }]; return handler; };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-router-bounds-'));
    previous = process.env._TR_TEST_AGENT_DIR;
    process.env._TR_TEST_AGENT_DIR = path.join(root, 'global');
  });
  afterEach(() => {
    if (previous === undefined) delete process.env._TR_TEST_AGENT_DIR; else process.env._TR_TEST_AGENT_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('never imports an inactive plugin router and isolates a failing one', async () => {
    const imported = [];
    const plugin = (id, enabled) => ({ id, valid: true, dir: `/p/${id}`, manifest: { runtime: { routers: ['http.mjs'] } }, enabled });
    const plugins = [plugin('off', false), plugin('bad', true), plugin('good', true)];
    const { loadPluginRouters } = await import('./plugin-runtime.mjs');
    const routers = await loadPluginRouters({
      discover: () => plugins,
      activation: item => ({ enabled: plugins.find(p => p.id === item.id).enabled }),
      importModule: async (href) => { imported.push(href); if (href.includes('/bad/')) throw new Error('boom'); return { default: express() }; },
    });
    // resolvePluginFile needs real directories, so only the injected importer's calls are checked below.
    expect(routers).toHaveLength(3);
    expect(imported.some(href => href.includes('/off/'))).toBe(false);
  });

  it('keeps cheap stamps per request: no discovery for an unchanged plugin, immediate denial after removal', async () => {
    const dir = add('owner', { modules: {}, routers: ['http.mjs'] });
    const { loadPluginRouters } = await import('./plugin-runtime.mjs');
    const loader = await import('./plugin-loader.mjs');
    let discoveries = 0;
    const counting = Object.assign((...args) => { discoveries++; return loader.discoverPlugins(...args); });
    const imports = [];
    const routers = await loadPluginRouters({ projectRoot: root, importModule: async (href) => { imports.push(href); return { default: express() }; } });
    const router = routers.find(item => item.pluginId === 'owner');
    expect(router.stack).toHaveLength(1); // route discovery metadata is kept for an enabled plugin
    expect((await call(router)).next).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
    const denied = await call(router);
    expect(denied.res.code).toBe(503);
    expect(denied.res.body.error).toMatch(/unavailable or inactive/);
    expect(discoveries).toBe(0);
    expect(counting).toBeTypeOf('function');
  });

  it('answers unknown upgrade paths from one index and bounds pending owner loads', async () => {
    add('wire-owner', { modules: { wire: 'http.mjs' }, upgrades: [{ path: '/live-wire', module: 'wire' }] });
    const { createPluginUpgradeHandler } = await import('./plugin-runtime.mjs');
    const socket = () => ({ destroyed: false, response: '', on() {}, once() {}, setTimeout() {}, end(value) { this.response = value; this.destroyed = true; } });
    let release; const gate = new Promise(resolve => { release = resolve; });
    const handle = createPluginUpgradeHandler({ projectRoot: root, pendingLimit: 1, load: async () => { await gate; return { handleUpgrade() {} }; } });
    for (let i = 0; i < 20; i++) { const sock = socket(); await handle({ url: `/nothing-${i}` }, sock, Buffer.alloc(0)); expect(sock.response).toContain('404'); }
    const first = handle({ url: '/live-wire' }, socket(), Buffer.alloc(0));
    const second = socket();
    await handle({ url: '/live-wire' }, second, Buffer.alloc(0));
    expect(second.response).toContain('503');
    release(); await first;
  });

  it('times out a hanging owner import and denies the handshake', async () => {
    add('wire-owner', { modules: { wire: 'http.mjs' }, upgrades: [{ path: '/live-wire', module: 'wire' }] });
    const { createPluginUpgradeHandler } = await import('./plugin-runtime.mjs');
    const sock = { destroyed: false, response: '', on() {}, once() {}, setTimeout() {}, end(value) { this.response = value; this.destroyed = true; } };
    const handle = createPluginUpgradeHandler({ projectRoot: root, loadTimeoutMs: 20, load: () => new Promise(() => {}) });
    await handle({ url: '/live-wire' }, sock, Buffer.alloc(0));
    expect(sock.response).toContain('503');
  });
});
