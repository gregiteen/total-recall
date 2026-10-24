// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
vi.mock('../auth.mjs', () => ({ requireAuth: (req, _res, next) => next() }));
const { createInvokeRouter, OPERATIONS } = await import('./invoke.mjs');
const { buildLocalSearchIndex } = await import('../../core/fast-recall.mjs');
const matter = (await import('../../core/frontmatter.mjs')).default;

let dir, keys, execute, audits, app;
const full = ['invoke:full', '*'];
const read = ['invoke:restricted', 'brain:server', 'ssss:read'];
function makeApp(scopes = full, options = {}) {
  keys = [{ id: 'test-key', scopes, issued_by: 'local-operator' }];
  const store = { loadKeys: () => keys, keyHasScope: (k, s) => !k.revoked && (!k.expires_at || Date.parse(k.expires_at) > Date.now()) &&
    (!s || (!k.roleDenied && (k.scopes.includes('*') || k.scopes.includes(s)))) };
  const auth = (req, _res, next) => { req.auth = { type: 'pat', id: 'test-key' }; next(); };
  app = express().use(express.json()).use(createInvokeRouter({ auth, store, execute, audit: event => audits.push(event), cwd: dir, serverBrain: dir, ...options }));
}
const post = (operation, params = {}) => request(app).post('/v1/invoke').send({ operation, params });
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'invoke-route-'));
  audits = [];
  execute = vi.fn(async () => ({ exit_code: 0, stdout: '[]', stderr: '', truncated: false, termination_reason: null }));
  makeApp();
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('invoke authority and discovery', () => {
  it('declares scopes for every executable family', () => {
    for (const def of Object.values(OPERATIONS)) expect(def.family === 'introspection' ? def.scope === null : typeof def.scope === 'string').toBe(true);
  });
  it.each(['constructor', 'toString', '__proto__', 'nope.run'])('refuses unregistered operation %s', async name => {
    expect((await post(name)).status).toBe(404); expect(execute).not.toHaveBeenCalled();
  });
  it('requires an operation and object parameters', async () => {
    expect((await request(app).post('/v1/invoke').send({})).status).toBe(400);
    expect((await post('capabilities', null)).status).toBe(400);
    expect((await post('capabilities', [])).status).toBe(400);
  });
  it('does not migrate wildcard keys or dashboard sessions implicitly', async () => {
    makeApp(['*']); expect((await post('cli.run', { verb: 'status' })).body.error.code).toBe('invoke-grant-required');
    makeApp(full, { auth: (req, _res, next) => { req.auth = { type: 'dashboard_session', scopes: ['*'] }; next(); } });
    expect((await post('capabilities')).status).toBe(403);
  });
  it('enforces family scopes and role ceilings using the owner', async () => {
    makeApp(['invoke:full', 'config:read']);
    expect((await post('cli.run', { verb: 'status' })).body.error.code).toBe('insufficient-scope');
    keys[0].roleDenied = true;
    expect((await post('composable.list')).status).toBe(403);
  });
  it('lists only confined restricted operations in both discovery paths', async () => {
    makeApp(read);
    for (const response of [await request(app).get('/v1/invoke/capabilities'), await post('capabilities')]) {
      expect(Object.values(response.body.result.operations).flat().map(o => o.operation).sort()).toEqual(['capabilities', 'ssss.read']);
      expect(response.body.result.provider_spending).toBe(0);
    }
    keys[0].scopes = ['invoke:restricted', 'ssss:read'];
    expect(Object.values((await post('capabilities')).body.result.operations).flat().map(o => o.operation)).toEqual(['capabilities']);
  });
  it.each(['cli.run', 'ssss.write', 'composable.run', 'composable.list', 'decision.run', 'decision.predict'])('fails closed for restricted %s even with wildcard scope', async operation => {
    makeApp(['invoke:restricted', '*']);
    const res = await post(operation, { verb: 'auth secret get PRIVATE', name: 'brand-lint', content: 'x' });
    expect(res.status).toBe(403); expect(execute).not.toHaveBeenCalled();
  });
  it.each([{ target: '/foreign' }, { scope: 'global' }, { args: ['--global'] }, { query: '--global' }])('denies foreign selectors or flag injection %j', async extra => {
    makeApp(read);
    const res = await post('ssss.read', { query: 'hello', ...extra });
    expect(res.status).toBeGreaterThanOrEqual(400); expect(execute).not.toHaveBeenCalled();
  });
  it('rejects oversized requests before execution', async () => {
    expect((await post('ssss.read', { query: 'x'.repeat(17000) })).status).toBe(413);
    expect(execute).not.toHaveBeenCalled();
  });
  it('fails explicitly when the shared auth registry cannot be read', async () => {
    makeApp(full, { store: { loadKeys: () => { throw new Error('private-path'); } } });
    const response = await post('cli.run', { verb: 'status' });
    expect(response.status).toBe(503); expect(response.body.error.code).toBe('authority-unavailable');
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('full developer dispatch', () => {
  it('preserves explicit trusted CLI execution with direct argv and a controlled environment', async () => {
    const res = await post('cli.run', { verb: 'recall', args: ['two words', '--local'] });
    expect(res.body.ok).toBe(true);
    const invocation = execute.mock.calls[0][0];
    expect(invocation.args).toEqual(['recall', 'two words', '--local']);
    expect(invocation.cwd).toBe(dir);
    expect(invocation.env).not.toHaveProperty('NODE_OPTIONS');
    expect(invocation.env).not.toHaveProperty('OPENROUTER_API_KEY');
  });
  it('uses actual registered commands, not a syntax-only check', async () => {
    expect((await post('cli.run', { verb: 'not-installed' })).status).toBe(404);
    expect((await post('composable.run', { name: 'not-installed' })).status).toBe(404);
    expect((await post('composable.run', { name: 'status' })).status).toBe(404);
    expect(execute).not.toHaveBeenCalled();
  });
  it('lists and executes a registered composed command from the authorized target', async () => {
    fs.mkdirSync(path.join(dir, '.agent/commands'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.agent/commands/rehearsal.mjs'), '// @description Test composed workflow\nexport async function run() {}');
    expect((await post('composable.list')).body.result.commands.some(c => c.name === 'rehearsal')).toBe(true);
    expect((await post('composable.run', { name: 'rehearsal', args: ['one argument'] })).body.ok).toBe(true);
    expect(execute.mock.calls[0][0].args).toEqual(['rehearsal', 'one argument']);
  });
  it('validates argv and full targets before spawning', async () => {
    expect((await post('cli.run', { verb: 'status', args: [1] })).status).toBe(400);
    expect((await post('cli.run', { verb: 'status', target: '../foreign' })).status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
  it('reports nonzero and termination as failed envelopes with bounded output', async () => {
    execute.mockResolvedValue({ exit_code: 7, stdout: 'requested output', stderr: '', truncated: false });
    const res = await post('cli.run', { verb: 'status' });
    expect(res.status).toBe(422); expect(res.body.ok).toBe(false); expect(res.body.result.exit_code).toBe(7);
  });
  it('does not leak owner exception text or payloads through errors/audit', async () => {
    execute.mockRejectedValue(new Error('SECRET-value'));
    const res = await post('cli.run', { verb: 'status', args: ['SECRET-argument'] });
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
    expect(JSON.stringify(audits)).not.toContain('SECRET');
    expect(audits.at(-1)).toMatchObject({ caller: 'test-key', operation: 'cli.run', target: dir, outcome: 'operation-failed' });
  });
  it('fails closed before execution when validated audit persistence is unavailable', async () => {
    makeApp(full, { audit: () => { throw new Error('private-store-details'); } });
    const response = await post('cli.run', { verb: 'status' });
    expect(response.status).toBe(503); expect(response.body.error.code).toBe('audit-unavailable');
    expect(execute).not.toHaveBeenCalled(); expect(JSON.stringify(response.body)).not.toContain('private-store-details');
  });
  it('persists authorization and outcome through real validated SSSS events', async () => {
    makeApp(full, { audit: undefined });
    const response = await post('cli.run', { verb: 'status', args: ['PRIVATE-argument'] });
    expect(response.body.ok).toBe(true);
    const { listVfsEvents } = await import('../../core/ssss-operation-service.mjs');
    const events = JSON.stringify(await listVfsEvents({ vaultRoot: path.join(dir, 'memory-vault'), workspaceId: 'invoke' }));
    expect(events).toContain('test-key'); expect(events).toContain('authorized'); expect(events).toContain('success');
    expect(events).not.toContain('PRIVATE-argument');
  });
});

describe('lifecycle and real restricted read adapter', () => {
  it('rejects revoked, expired and absent keys', async () => {
    keys[0].revoked = true; expect((await post('capabilities')).status).toBe(403);
    keys[0].revoked = false; keys[0].expires_at = '2000-01-01'; expect((await post('capabilities')).status).toBe(403);
    keys = []; expect((await post('capabilities')).status).toBe(403);
  });
  it('rechecks issuer revocation, missing issuers, cycles and scope ceilings', async () => {
    keys[0].issued_by = 'parent';
    expect((await post('capabilities')).status).toBe(403);
    keys.push({ id: 'parent', scopes: ['invoke:full', '*'], issued_by: 'local-operator', revoked: true });
    expect((await post('capabilities')).status).toBe(403);
    keys[1].revoked = false; expect((await post('capabilities')).status).toBe(200);
    keys[1].scopes = ['config:read']; expect((await post('composable.list')).status).toBe(403);
    keys[1].issued_by = 'test-key'; expect((await post('capabilities')).status).toBe(403);
  });
  it('cannot turn a restricted or legacy wildcard issuer into full host authority', async () => {
    keys[0].issued_by = 'restricted-parent';
    keys.push({ id: 'restricted-parent', scopes: ['invoke:restricted', '*'], issued_by: 'local-operator' });
    expect((await post('cli.run', { verb: 'status' })).status).toBe(403);
    keys[1].scopes = ['*'];
    expect((await post('cli.run', { verb: 'status' })).status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });
  it('cancels a running child when authority ends, retaining the slot until it exits', async () => {
    let invocation, release;
    execute.mockImplementation(options => { invocation = options; return new Promise(resolve => { release = resolve; }); });
    const running = post('cli.run', { verb: 'status' }).then(r => r);
    await vi.waitFor(() => expect(invocation).toBeTruthy());
    expect((await post('cli.run', { verb: 'status' })).status).toBe(429);
    keys[0].revoked = true;
    await vi.waitFor(() => expect(invocation.signal.aborted).toBe(true));
    release({ exit_code: null, signal: 'SIGKILL', stdout: '', stderr: '', termination_reason: 'authority-ended' });
    expect((await running).body.error.code).toBe('authority-ended');
    keys[0].revoked = false;
    expect((await post('capabilities')).status).toBe(200);
  });
  it('reads only the fixed server brain in a real credential-free child', async () => {
    fs.mkdirSync(path.join(dir, 'memory-vault/facts'), { recursive: true });
    const node = { type: 'memory', slug: 'rehearsal', title: 'rehearsal', category: 'facts', status: 'active', body: 'independent local retrieval proof' };
    const file = path.join(dir, 'memory-vault/facts/rehearsal.md');
    fs.writeFileSync(file, matter.stringify(node.body, node));
    buildLocalSearchIndex([{ ...node, _filePath: file }], { vaultDir: path.join(dir, 'memory-vault'), derivedDir: path.join(dir, 'memory-derived') });
    const { executeInvokeChild } = await import('../invoke-execution.mjs');
    makeApp(read, { execute: executeInvokeChild });
    const res = await post('ssss.read', { query: 'retrieval proof' });
    expect(res.body.ok).toBe(true); expect(res.body.result.nodes[0].slug).toBe('rehearsal');
    expect(res.body.result.nodes[0].snippet).toContain('retrieval proof');
    expect(fs.existsSync(path.join(dir, 'logs'))).toBe(false);
  });
});
