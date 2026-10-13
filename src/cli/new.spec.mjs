import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseNewArgs, createProject, resolveMeshTarget } from './new.mjs';

let cwd;
beforeEach(() => { cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'new-spec-')); });
afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }));

describe('parseNewArgs', () => {
  it('parses name, repeated and comma --with, client', () => {
    expect(parseNewArgs(['app', '--with', 'a,b', '--with=c,a', '--client', 'cursor'])).toEqual({ name: 'app', bricks: ['a', 'b', 'c'], client: 'cursor', meshOn: null, noMesh: false });
  });
  it('parses --no-mesh and rejects combining it with --mesh-on', () => {
    expect(parseNewArgs(['app', '--no-mesh']).noMesh).toBe(true);
    expect(() => parseNewArgs(['app', '--no-mesh', '--mesh-on', 'x'])).toThrow(/cannot be combined/);
  });
  it('rejects missing/invalid names and unknown options', () => {
    expect(() => parseNewArgs([])).toThrow(/Missing project name/);
    expect(() => parseNewArgs(['Bad Name'])).toThrow(/Invalid/);
    expect(() => parseNewArgs(['app', '--x'])).toThrow(/Unknown option/);
  });
});

describe('createProject', () => {
  it('runs scaffolder, init and connect in order, then vendors bricks with requires', async () => {
    const calls = [];
    const vendored = [];
    const run = (cmd, args, at) => {
      calls.push([path.basename(cmd), args.filter((a) => !a.endsWith('.mjs') || a.includes('ssss')), at]);
      if (args.includes('new')) fs.mkdirSync(path.join(cwd, 'app'));
    };
    const vendor = async (source, dest, opts) => {
      vendored.push([source, opts.projectRoot, opts.resolveRequires]);
      return { id: source, resolved: source === 'top' ? ['base'] : [] };
    };
    const r = await createProject(['app', '--with', 'top'], { cwd, run, vendor, listProviders: () => [] });
    expect(calls.map((c) => c[1].join(' '))).toEqual([
      '--yes @gregiteen/ssss-cli new ' + path.join(cwd, 'app') + ' --with-total-recall',
      'init --project',
      'connect claude-code'
    ]);
    expect(calls[1][2]).toBe(path.join(cwd, 'app'));
    expect(vendored).toEqual([['top', path.join(cwd, 'app'), true]]);
    expect(r.bricks).toEqual(['top', 'base']);
  });

  it('stops before vendoring when a step fails', async () => {
    const run = () => { throw new Error('boom'); };
    const vendor = async () => { throw new Error('should not run'); };
    await expect(createProject(['app', '--with', 'x'], { cwd, run, vendor, listProviders: () => [] })).rejects.toThrow('boom');
  });

  it('refuses a non-empty target', async () => {
    fs.mkdirSync(path.join(cwd, 'app'));
    fs.writeFileSync(path.join(cwd, 'app', 'f'), 'x');
    await expect(createProject(['app'], { cwd, run: () => {}, vendor: async () => ({}), listProviders: () => [] })).rejects.toThrow(/not empty/);
  });
});

describe('mesh requirements', () => {
  const one = [{ name: 'do-1', type: 'any', region: 'nyc3', status: 'registered', ssh: { host: '203.0.113.10', user: 'root', port: 22 }, domain: 'hs.example.com' }];
  const two = [...one, { ...one[0], name: 'hz-1' }];

  it('returns null when the deploy plugin is absent or no provider is registered', () => {
    const absent = () => { const e = new Error('x'); e.code = 'NO_DEPLOY_PLUGIN'; throw e; };
    expect(resolveMeshTarget(absent)).toBeNull();
    expect(resolveMeshTarget(() => [])).toBeNull();
  });
  it('ignores deployments without SSH access or a domain', () => {
    expect(resolveMeshTarget(() => [{ name: 'a', type: 'x', region: 'y', status: 'registered' }])).toBeNull();
    expect(resolveMeshTarget(() => [{ ...one[0], domain: undefined }])).toBeNull();
    expect(resolveMeshTarget(() => [{ name: 'a' }, ...one]).name).toBe('do-1');
  });
  it('treats a failing provider list as an error, not as empty', () => {
    expect(() => resolveMeshTarget(() => { throw new Error('Unverified deployment state'); })).toThrow(/Could not read deployment providers: Unverified/);
  });
  it('uses the single provider, requires a choice among several, and rejects unknown names', () => {
    expect(resolveMeshTarget(() => one).name).toBe('do-1');
    expect(() => resolveMeshTarget(() => two)).toThrow(/--mesh-on/);
    expect(resolveMeshTarget(() => two, 'hz-1').name).toBe('hz-1');
    expect(() => resolveMeshTarget(() => two, 'nope')).toThrow(/No deployment provider named 'nope'/);
  });

  it('adds no mesh brick and calls nothing when requirements are unmet', async () => {
    const vendored = [];
    const vendor = async (s) => { vendored.push(s); return { id: s, resolved: [] }; };
    const provision = async () => { throw new Error('should not run'); };
    const run = (c, a) => { if (a.includes('new')) fs.mkdirSync(path.join(cwd, 'app')); };
    const r = await createProject(['app'], { cwd, run, vendor, provision, listProviders: () => [] });
    expect(vendored).toEqual([]);
    expect(r.bricks).toEqual([]);
    expect(r.mesh).toBeNull();
  });
  it('skips the deployment lookup, the mesh brick and provisioning with --no-mesh even when a deployment qualifies', async () => {
    const vendored = [];
    const run = (c, a) => { if (a.includes('new')) fs.mkdirSync(path.join(cwd, 'app')); };
    const listProviders = () => { throw new Error('must not be consulted'); };
    const r = await createProject(['app', '--no-mesh'], { cwd, run, vendor: async (s) => { vendored.push(s); return { id: s, resolved: [] }; }, listProviders, provision: async () => { throw new Error('must not run'); } });
    expect(vendored).toEqual([]);
    expect(r.mesh).toBeNull();
  });
  it('fails before scaffolding when the provider list errors', async () => {
    const calls = [];
    await expect(createProject(['app'], { cwd, run: () => calls.push(1), vendor: async () => ({}), listProviders: () => { throw new Error('bad state'); } })).rejects.toThrow(/Could not read/);
    expect(calls).toEqual([]);
  });
  it('vendors the mesh brick and provisions the chosen deployment when requirements are met', async () => {
    const vendored = [];
    const provisioned = [];
    const vendor = async (s) => { vendored.push(s); return { id: s, resolved: [] }; };
    const run = (c, a) => { if (a.includes('new')) fs.mkdirSync(path.join(cwd, 'app')); };
    const r = await createProject(['app'], { cwd, run, vendor, listProviders: () => one, provision: async (t, dir) => provisioned.push([t.name, dir]) });
    expect(vendored).toEqual(['mesh']);
    expect(provisioned).toEqual([['do-1', path.join(cwd, 'app')]]);
    expect(r.bricks).toEqual(['mesh']);
    expect(r.mesh).toBe('do-1');
  });
  it('surfaces a provisioning failure instead of reporting success', async () => {
    const run = (c, a) => { if (a.includes('new')) fs.mkdirSync(path.join(cwd, 'app')); };
    await expect(createProject(['app'], { cwd, run, vendor: async (s) => ({ id: s, resolved: [] }), listProviders: () => one, provision: async () => { throw new Error('ssh refused'); } })).rejects.toThrow(/ssh refused/);
  });
});
