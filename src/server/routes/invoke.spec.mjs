// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
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
  app = express().use(express.json()).use(createInvokeRouter({ auth, store, execute, audit: event => audits.push(event), cwd: dir, serverBrain: dir, registryBrain: dir, ...options }));
}
// Each Supertest request owns a short-lived listener; do not reuse its socket
// after another request has closed that listener (Node's keep-alive default).
const post = (operation, params = {}) => request(app).post('/v1/invoke').set('Connection', 'close').send({ operation, params });
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
  it.each(['cli.run', 'composable.run', 'composable.list', 'decision.run', 'decision.predict'])('fails closed for restricted %s even with wildcard scope', async operation => {
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
  it('advertises and executes confined facts only when both write and brain grants exist', async () => {
    makeApp(['invoke:restricted', 'ssss:write', 'brain:server']);
    const caps = await post('capabilities');
    expect(Object.values(caps.body.result.operations).flat().map(o => o.operation).sort()).toEqual(['capabilities', 'ssss.write']);
    keys[0].scopes = ['invoke:restricted', 'ssss:write'];
    expect((await post('ssss.write', { content: 'denied' })).status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });
  it.each([{ category: 'invariant' }, { target: '/foreign' }, { scope: 'global' }, { args: ['--global'] },
    { tags: ['context:universal'] }, { slug: 'existing' }, { title: {} }, { timeoutMs: '200' }])('denies restricted fact escalation %j before starting a child', async extra => {
    makeApp(['invoke:restricted', '*']);
    expect((await post('ssss.write', { content: 'test', ...extra })).status).toBeGreaterThanOrEqual(400);
    expect(execute).not.toHaveBeenCalled();
  });
  it('writes then reads in real children without loading installed plugin generators or secrets', async () => {
    const { executeInvokeChild } = await import('../invoke-execution.mjs');
    const marker = path.join(dir, 'generator-was-run');
    const plugin = path.join(dir, 'plugins/hostile');
    fs.mkdirSync(plugin, { recursive: true });
    fs.writeFileSync(path.join(plugin, 'generator.mjs'), `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'executed');`);
    makeApp([...read, 'ssss:write'], { execute: executeInvokeChild });
    const written = await post('ssss.write', { content: 'confined glacier retrieval', title: 'Glacier', target: 'server' });
    expect(written.body, JSON.stringify(written.body)).toMatchObject({ ok: true, result: { committed: true, indexed: true } });
    const retrieved = await post('ssss.read', { query: 'glacier retrieval' });
    expect(retrieved.body.result.nodes[0].slug).toBe(written.body.result.slug);
    expect(fs.existsSync(marker)).toBe(false);
    expect(fs.existsSync(path.join(dir, 'logs'))).toBe(false);
    expect(JSON.stringify(audits)).not.toContain('confined glacier');
  });
  it('preserves truthful partial and unknown commit outcomes', async () => {
    makeApp(['invoke:restricted', '*']);
    execute.mockResolvedValue({ exit_code: 1, stdout: JSON.stringify({ committed: true, indexed: false, path: 'memory-vault/facts/generated.md' }), stderr: 'failed' });
    expect((await post('ssss.write', { content: 'fact' })).body).toMatchObject({ ok: false, result: { committed: true, indexed: false } });
    execute.mockResolvedValue({ exit_code: null, stdout: '', termination_reason: 'timeout' });
    expect((await post('ssss.write', { content: 'fact' })).body).toMatchObject({ ok: false, result: { committed: 'unknown' }, error: { code: 'timeout' } });
  });
  it('preserves commit state if authority ends or outcome audit fails after the write', async () => {
    const result = { committed: true, indexed: true, slug: 'fixture', path: 'memory-vault/facts/fixture.md' };
    makeApp(['invoke:restricted', '*']);
    execute.mockImplementation(async () => { keys[0].revoked = true; return { exit_code: 0, stdout: JSON.stringify(result) }; });
    expect((await post('ssss.write', { content: 'fact' })).body).toMatchObject({ ok: false, error: { code: 'authority-ended' }, result });
    makeApp(['invoke:restricted', '*'], { audit: event => { if (event.outcome !== 'authorized') throw new Error('offline'); } });
    execute.mockResolvedValue({ exit_code: 0, stdout: JSON.stringify(result) });
    expect((await post('ssss.write', { content: 'fact' })).body).toMatchObject({ ok: false, error: { code: 'audit-unavailable' }, result });
  });
  it('serializes confined writes across keys until the child exits and then releases the brain', async () => {
    makeApp(['invoke:restricted', '*'], { auth: (req, _res, next) => {
      req.auth = { type: 'pat', id: req.get('X-Key') || 'test-key' }; next();
    } });
    keys.push({ id: 'other-key', scopes: ['invoke:restricted', '*'], issued_by: 'local-operator' });
    let release;
    execute.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const running = post('ssss.write', { content: 'fact' }).then(r => r);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect((await post('ssss.write', { content: 'other fact' }).set('X-Key', 'other-key')).body.error.code).toBe('brain-write-busy');
    release({ exit_code: 0, stdout: JSON.stringify({ committed: true, indexed: true }) });
    expect((await running).body.ok).toBe(true);
    execute.mockResolvedValue({ exit_code: 0, stdout: JSON.stringify({ committed: true, indexed: true }) });
    expect((await post('ssss.write', { content: 'next fact' })).body.ok).toBe(true);
  });
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

describe('restricted registered project brains', () => {
  const first = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const target = id => `project:${id}`, grant = id => `brain:project-${id}`;
  let projects;
  function registry() {
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'config/project-registry.json'), JSON.stringify(projects));
  }
  beforeEach(() => {
    projects = [first, second].map((id, i) => {
      const root = path.join(dir, `project-${i}`), brainDir = path.join(root, '.agent/skills/total-recall');
      fs.mkdirSync(path.join(brainDir, 'config'), { recursive: true });
      fs.writeFileSync(path.join(brainDir, 'config/brain.json'), JSON.stringify({ project_id: id }));
      return { path: root, brainDir, project_id: id, name: `private-project-${i}` };
    });
    registry();
  });
  const scopes = id => ['invoke:restricted', 'ssss:read', 'ssss:write', grant(id)];
  it('writes and recalls only its granted project in real credential-free children', async () => {
    const { executeInvokeChild } = await import('../invoke-execution.mjs');
    makeApp(scopes(first), { execute: executeInvokeChild });
    const caps = await post('capabilities');
    expect(caps.body.result.targets).toEqual([target(first)]);
    expect(JSON.stringify(caps.body)).not.toContain('private-project');
    expect(JSON.stringify(caps.body)).not.toContain(dir);
    const written = await post('ssss.write', { target: target(first), content: 'project alpine boundary' });
    expect(written.body).toMatchObject({ ok: true, result: { committed: true, indexed: true } });
    expect(fs.existsSync(path.join(projects[0].brainDir, written.body.result.path))).toBe(true);
    expect(fs.existsSync(path.join(projects[1].brainDir, 'memory-vault'))).toBe(false);
    expect((await post('ssss.read', { target: target(first), query: 'alpine boundary' })).body.result.nodes[0].slug).toBe(written.body.result.slug);
    expect((await post('ssss.read', { target: target(second), query: 'alpine' })).status).toBe(403);
    expect((await post('ssss.read', { query: 'alpine' })).status).toBe(403);
    expect(audits.some(a => a.target === target(first) && a.outcome === 'success')).toBe(true);
    expect(JSON.stringify(audits)).not.toContain('project alpine');
  });
  it('does not grant project access through brain:server or an issuer ceiling', async () => {
    makeApp(read);
    expect((await post('capabilities')).body.result.targets).toEqual(['server']);
    expect((await post('ssss.read', { target: target(first), query: 'x' })).status).toBe(403);
    makeApp(scopes(first)); keys[0].issued_by = 'parent';
    keys.push({ id: 'parent', scopes: ['invoke:restricted', 'ssss:read', 'ssss:write', grant(second)], issued_by: 'local-operator' });
    expect((await post('capabilities')).body.result.targets).toEqual([]);
    expect((await post('ssss.read', { target: target(first), query: 'x' })).status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });
  it.each(['unregister', 'disable', 'identity', 'path'])('cancels active project work after %s', async change => {
    makeApp(scopes(first));
    let invocation, release;
    execute.mockImplementation(options => { invocation = options; return new Promise(resolve => { release = resolve; }); });
    const running = post('ssss.read', { target: target(first), query: 'x' }).then(r => r);
    await vi.waitFor(() => expect(invocation).toBeTruthy());
    if (change === 'unregister') { projects.shift(); registry(); }
    if (change === 'disable') fs.writeFileSync(path.join(dir, 'config/brain-toggles.json'), JSON.stringify({ [projects[0].brainDir]: false }));
    if (change === 'identity') fs.writeFileSync(path.join(projects[0].brainDir, 'config/brain.json'), '{}');
    if (change === 'path') {
      projects[0].brainDir = projects[1].brainDir; projects[0].path = projects[1].path;
      fs.writeFileSync(path.join(projects[0].brainDir, 'config/brain.json'), JSON.stringify({ project_id: first }));
      registry();
    }
    await vi.waitFor(() => expect(invocation.signal.aborted).toBe(true));
    release({ exit_code: null, stdout: '', termination_reason: 'authority-ended' });
    expect((await running).body.error.code).toBe('authority-ended');
  });
});

describe('bounded full-mode decision owners', () => {
  // Disposable transport/auth stand-ins exercise actual child lifecycle without
  // provider billing or touching the operator's credential store.
  function owner(client, auth = "export const readAuthSecret = () => 'fixture-only';") {
    const plugin = path.join(dir, 'plugins/decision');
    fs.mkdirSync(path.join(plugin, 'src'), { recursive: true });
    fs.writeFileSync(path.join(plugin, 'src/client.mjs'), client);
    fs.writeFileSync(path.join(plugin, 'auth-client.mjs'), auth);
  }
  const success = `export const DEFAULT_MODEL='fixture-model';
    export const requestDecision = async options => ({
      choice: () => options.state?.text || 'chosen', noul: () => true, score: () => 3, confidence: () => 0.9,
      modelVersion: 'fixture-version', cost: 0, latencyMs: 1
    });`;
  const questions = { choice: {}, yes: { type: 'noul' }, score: { type: 'score' } };
  async function real(options = {}) {
    const { executeInvokeChild } = await import('../invoke-execution.mjs');
    makeApp(full, { execute: executeInvokeChild, ...options });
  }
  it('preserves typed answers in an actual child and keeps request text out of audits', async () => {
    owner(success); await real();
    const res = await post('decision.run', { questions, state: { text: 'private decision text' } });
    expect(res.body).toMatchObject({ ok: true, result: { answered: true, answers: { choice: 'private decision text', yes: true, score: 3 }, model: 'fixture-version' } });
    expect(JSON.stringify(audits)).not.toContain('private decision');
  });
  it('advertises the configured execution ceilings in both discovery paths', async () => {
    const limits = { timeoutMs: 500, outputBytes: 100, concurrency: 2, perKey: 1 };
    makeApp(full, { limits });
    expect((await post('capabilities')).body.result.limits).toEqual(limits);
    expect((await request(app).get('/v1/invoke/capabilities')).body.result.limits).toEqual(limits);
  });
  it('runs prediction in a child with the selected project root', async () => {
    owner(success); await real();
    fs.mkdirSync(path.join(dir, 'memory-derived'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'memory-derived/cli-semantic-index.json'), JSON.stringify({ verbs: [
      { id: 'fixture', verb: 'status', usage: 'chosen', name: 'Fixture command' },
    ] }));
    const res = await post('decision.predict', { intent: '' });
    expect(res.body, JSON.stringify(res.body)).toMatchObject({ ok: true, result: { ok: true, abstained: false, action: { id: 'fixture' } } });
  });
  it.each(['decision.run', 'decision.predict'])('passes %s through the executor, never ambient server imports', async operation => {
    execute.mockResolvedValue({ exit_code: 0, stdout: JSON.stringify({ ok: true, result: { fixture: true } }) });
    expect((await post(operation, { questions, timeoutMs: 1200 })).body.result).toEqual({ fixture: true });
    const call = execute.mock.calls[0][0];
    expect(call.entry).toMatch(/invoke-decision-child\.mjs$/);
    expect(call.cwd).toBe(dir); expect(call.timeoutMs).toBe(1200);
    expect(JSON.parse(call.input)).toMatchObject({ operation, brain: dir, timeoutMs: 1200 });
    expect(call.env).not.toHaveProperty('OPENROUTER_API_KEY');
  });
  it('reports missing credentials, provider refusal and private exceptions truthfully', async () => {
    owner(success, 'export const readAuthSecret = () => null;'); await real();
    expect((await post('decision.run', { questions })).body.error.code).toBe('credential-unavailable');
    owner('export const requestDecision = async () => null;');
    expect((await post('decision.run', { questions })).body.error.code).toBe('provider-failed');
    owner("export const requestDecision = async () => { throw new Error('PRIVATE-provider-token'); };");
    const failed = await post('decision.run', { questions });
    expect(failed.body.error.code).toBe('decision-failed');
    expect(JSON.stringify(failed.body)).not.toContain('PRIVATE');
  });
  it.each(['decision.run', 'decision.predict'])('terminates a hanging %s owner at the server ceiling', async operation => {
    owner("await new Promise(() => { setInterval(() => {}, 1000); });");
    await real({ limits: { timeoutMs: 150, outputBytes: 4096, concurrency: 4, perKey: 1 } });
    const res = await post(operation, { questions, timeoutMs: 10000 });
    expect(res.status).toBe(504); expect(res.body.error.code).toBe('timeout');
    expect(res.body.result).toBeNull();
  });
  it('kills provider continuation on key revocation and frees the slot only after exit', async () => {
    const marker = path.join(dir, 'owner-started');
    owner(`import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, String(process.pid));
      await new Promise(() => { setInterval(() => {}, 1000); });`);
    await real();
    const running = post('decision.run', { questions }).then(r => r);
    await vi.waitFor(() => expect(fs.existsSync(marker)).toBe(true));
    const pid = Number(fs.readFileSync(marker, 'utf8'));
    expect((await post('decision.run', { questions })).status).toBe(429);
    keys[0].revoked = true;
    expect((await running).body.error.code).toBe('authority-ended');
    expect(() => process.kill(pid, 0)).toThrow();
    keys[0].revoked = false; owner(success);
    expect((await post('decision.run', { questions })).body.ok).toBe(true);
  });
  it('caps dependency logs without returning private output', async () => {
    owner("process.stderr.write('PRIVATE'.repeat(2000)); await new Promise(() => setInterval(() => {}, 1000));");
    await real({ limits: { timeoutMs: 2000, outputBytes: 100, concurrency: 4, perKey: 1 } });
    const res = await post('decision.run', { questions });
    expect(res.body.error.code).toBe('output-limit');
    expect(JSON.stringify(res.body)).not.toContain('PRIVATE');
  });
  it('closes an in-flight provider connection when authority is revoked', async () => {
    let received, closed;
    const accepted = new Promise(resolve => { received = resolve; });
    const disconnected = new Promise(resolve => { closed = resolve; });
    const provider = http.createServer((_req, res) => { res.once('close', closed); received(); });
    await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
    try {
      owner(`export const requestDecision = async () => {
        await fetch('http://127.0.0.1:${provider.address().port}'); return null;
      };`);
      await real();
      const running = post('decision.run', { questions }).then(r => r);
      await accepted;
      keys[0].revoked = true;
      expect((await running).body.error.code).toBe('authority-ended');
      await disconnected;
      expect(JSON.stringify(audits)).not.toContain('fixture-only');
    } finally {
      provider.closeAllConnections();
      await new Promise(resolve => provider.close(resolve));
    }
  });
  it.each([{ exit_code: 0, stdout: 'PRIVATE-not-json' }, { exit_code: 7, stdout: 'PRIVATE', stderr: 'PRIVATE' }])('sanitizes malformed or failed child output', async output => {
    execute.mockResolvedValue(output);
    const res = await post('decision.run', { questions });
    expect(res.body.ok).toBe(false); expect(JSON.stringify(res.body)).not.toContain('PRIVATE');
  });
  it.each([0, -1, 'bad'])('rejects invalid decision timeout %s before execution', async timeoutMs => {
    expect((await post('decision.predict', { timeoutMs })).body.error.code).toBe('invalid-timeout');
    expect(execute).not.toHaveBeenCalled();
  });
});
