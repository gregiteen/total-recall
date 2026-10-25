// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPluginModule } from '../../core/plugin-runtime.mjs';
import { buildLocalSearchIndex } from '../../core/fast-recall.mjs';
import matter from '../../core/frontmatter.mjs';
import { createInvokeRouter } from './invoke.mjs';
import { ensureProjectId } from '../../core/project-id.mjs';

/**
 * Independent-agent acceptance: actual auth-owner keys, actual loopback HTTP,
 * actual CLI/read children. Tokens stay in this client's memory; no real
 * operator credentials, external providers or serving release are involved.
 */
describe('independent agent invoke round trip', () => {
  let dir, server, origin, store, serverBrain, projectId, projectBrain;
  const audits = [];
  const restrictedScopes = ['invoke:restricted', 'ssss:read', 'brain:server'];

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'invoke-independent-agent-'));
    serverBrain = path.join(dir, '.agent/skills/total-recall');
    const { createKeyStore } = await loadPluginModule('auth', 'access-keys');
    const { createServerAuth } = await loadPluginModule('auth', 'server-auth');
    store = createKeyStore({ brainDir: serverBrain });
    const auth = createServerAuth({
      brainDir: serverBrain, nodeEnv: 'test',
      watchdog: { isIpBlocked: () => false, recordAuthFailure: () => {} },
      findValidKeyByToken: store.findValidKeyByToken,
      keyHasAnyScope: store.keyHasAnyScope,
      recordKeyUsage: store.recordKeyUsage,
      recordKeyOutcome: store.recordKeyOutcome,
      logger: { error: () => {} },
    });

    const vaultDir = path.join(serverBrain, 'memory-vault');
    fs.mkdirSync(path.join(vaultDir, 'facts'), { recursive: true });
    const node = { type: 'memory', slug: 'agent-roundtrip', title: 'Agent roundtrip proof',
      category: 'facts', status: 'active', body: 'This disposable authorized brain contains the acceptance signal.' };
    const file = path.join(vaultDir, 'facts/agent-roundtrip.md');
    fs.writeFileSync(file, matter.stringify(node.body, node));
    buildLocalSearchIndex([{ ...node, _filePath: file }], {
      vaultDir, derivedDir: path.join(serverBrain, 'memory-derived'),
    });
    const projectRoot = path.join(dir, 'registered-project');
    projectBrain = path.join(projectRoot, '.agent/skills/total-recall');
    projectId = ensureProjectId(projectBrain).project_id;
    fs.mkdirSync(path.join(serverBrain, 'config'), { recursive: true });
    fs.writeFileSync(path.join(serverBrain, 'config/project-registry.json'), JSON.stringify([
      { path: projectRoot, brainDir: projectBrain, project_id: projectId },
    ]));

    const app = express().use(express.json()).use(createInvokeRouter({
      auth: auth.requireAuth, store, cwd: dir, serverBrain, registryBrain: serverBrain,
      audit: event => audits.push(event),
    }));
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      listener.once('error', reject);
    });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  async function invoke(key, operation, params = {}) {
    const response = await fetch(`${origin}/v1/invoke`, {
      method: 'POST', headers: { Authorization: `Bearer ${key.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, params }),
    });
    return { status: response.status, body: await response.json() };
  }

  it('retrieves its granted server brain and discovers only executable capabilities', async () => {
    const ownKey = store.issueKey('independent-agent-read', { scopes: restrictedScopes });
    const response = await invoke(ownKey, 'ssss.read', { query: 'acceptance signal', target: 'server' });
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.result.nodes.map(n => n.slug)).toEqual(['agent-roundtrip']);
    const discovery = await fetch(`${origin}/v1/invoke/capabilities`, { headers: { Authorization: `Bearer ${ownKey.token}` } });
    expect(discovery.status).toBe(200);
    const capabilities = (await discovery.json()).result;
    expect(Object.values(capabilities.operations).flat().map(o => o.operation).sort()).toEqual(['capabilities', 'ssss.read']);
    expect(capabilities.targets).toEqual(['server']);
    expect(capabilities.provider_spending).toBe(0);
    expect(store.listKeyUsage(ownKey.id).some(row => row.action === 'request')).toBe(true);
    expect(audits.some(event => event.caller === ownKey.id && event.operation === 'ssss.read' && event.target === 'server' && event.outcome === 'success')).toBe(true);
    expect(JSON.stringify(audits)).not.toContain(ownKey.token);
  });

  it('executes actual CLI work only with its explicitly granted full developer key', async () => {
    const ownKey = store.issueKey('independent-agent-full', { scopes: ['invoke:full', 'sandbox:run'] });
    const response = await invoke(ownKey, 'cli.run', { verb: 'recall', args: ['--help'] });
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.result.exit_code).toBe(0);
    expect(response.body.result.stdout).toContain('total-recall recall');
    expect(response.body.result.stdout).toContain('Usage:');
  });

  it('creates and recalls a fact with real auth-owned restricted keys while denying read-only mutation', async () => {
    const reader = store.issueKey('fact-reader', { scopes: restrictedScopes });
    expect((await invoke(reader, 'ssss.write', { content: 'denied mutation' })).status).toBe(403);
    const writer = store.issueKey('fact-writer', { scopes: [...restrictedScopes, 'ssss:write'] });
    const created = await invoke(writer, 'ssss.write', { category: 'fact', title: 'Confined fact', content: 'cobalt glacier observation', tags: ['acceptance'] });
    expect(created.body, JSON.stringify(created.body)).toMatchObject({ ok: true, result: { committed: true, indexed: true } });
    const retrieved = await invoke(reader, 'ssss.read', { query: 'cobalt glacier observation' });
    expect(retrieved.body.result.nodes[0].slug).toBe(created.body.result.slug);
    expect((await invoke(writer, 'ssss.write', { category: 'invariant', content: 'escalation' })).status).toBe(400);
    store.revokeKey(writer.id);
    expect((await invoke(writer, 'ssss.write', { content: 'after revocation' })).status).toBe(401);
    expect(JSON.stringify(audits)).not.toContain('cobalt glacier');
  });

  it('denies escalation, foreign targets and unconfined mutations even for a broad restricted key', async () => {
    const ownKey = store.issueKey('independent-agent-restricted-broad', { scopes: ['invoke:restricted', '*'] });
    for (const [operation, params] of [
      ['cli.run', { verb: 'auth key issue', args: ['escalated', '--scopes', '*'] }],
      ['composable.run', { name: 'brand-lint' }],
      ['ssss.write', { category: 'fact', content: 'unauthorized mutation', scope: 'global' }],
      ['decision.run', { questions: { proceed: { type: 'noul' } } }],
      ['ssss.read', { query: 'acceptance', target: '/foreign-brain' }],
    ]) {
      const response = await invoke(ownKey, operation, params);
      expect(response.status).toBe(403);
      expect(response.body.ok).toBe(false);
    }
    const legacy = store.issueKey('independent-agent-legacy', { scopes: ['*'] });
    expect((await invoke(legacy, 'capabilities')).body.error.code).toBe('invoke-grant-required');
  });

  it('enforces real auth-owned project scopes, roles and issuer ceilings through write/read children', async () => {
    const scope = `brain:project-${projectId}`, target = `project:${projectId}`;
    const projectRead = ['invoke:restricted', 'ssss:read', scope];
    const reader = store.issueKey('project-reader', { scopes: projectRead });
    const caps = await invoke(reader, 'capabilities');
    expect(caps.body.result.targets).toEqual([target]);
    expect(JSON.stringify(caps.body)).not.toContain(projectBrain);
    expect((await invoke(reader, 'ssss.read', { query: 'server acceptance', target: 'server' })).status).toBe(403);
    expect((await invoke(reader, 'ssss.write', { target, content: 'read-only denial' })).status).toBe(403);
    const writer = store.issueKey('project-writer', { scopes: [...projectRead, 'ssss:write'] });
    const created = await invoke(writer, 'ssss.write', { target, content: 'registered project quartz boundary' });
    expect(created.body).toMatchObject({ ok: true, result: { committed: true, indexed: true } });
    expect(fs.existsSync(path.join(projectBrain, created.body.result.path))).toBe(true);
    expect(fs.existsSync(path.join(serverBrain, created.body.result.path))).toBe(false);
    const recalled = await invoke(reader, 'ssss.read', { target, query: 'quartz boundary' });
    expect(recalled.body.result.nodes[0].slug).toBe(created.body.result.slug);
    store.setRole('project-reader', projectRead);
    const roleKey = store.issueKey('project-role-key', { scopes: ['invoke:restricted', '*'], role: 'project-reader' });
    expect((await invoke(roleKey, 'capabilities')).body.result.targets).toEqual([target]);
    expect((await invoke(roleKey, 'ssss.write', { target, content: 'role ceiling' })).status).toBe(403);
    const serverIssuer = store.issueKey('server-only-issuer', { scopes: [...restrictedScopes, 'keys:write'] });
    expect(() => store.issueKey('forbidden-project-delegate', { scopes: projectRead, issuer: serverIssuer })).toThrow('beyond the issuer');
    store.revokeKey(writer.id);
    expect((await invoke(writer, 'ssss.write', { target, content: 'after revocation' })).status).toBe(401);
    expect(JSON.stringify(audits)).not.toContain('registered project quartz');
  });

  it('enforces actual auth-owner role ceilings and delegation ceilings', async () => {
    store.setRole('invoke-reader', restrictedScopes);
    const ownKey = store.issueKey('independent-agent-role', { scopes: ['invoke:restricted', '*'], role: 'invoke-reader' });
    expect((await invoke(ownKey, 'ssss.read', { query: 'acceptance' })).status).toBe(200);
    expect((await invoke(ownKey, 'cli.run', { verb: 'status' })).body.error.code).toBe('insufficient-scope');
    const issuer = store.issueKey('independent-agent-issuer', { scopes: [...restrictedScopes, 'keys:write'] });
    expect(() => store.issueKey('forbidden-delegate', { scopes: ['invoke:full'], issuer })).toThrow('beyond the issuer');
    const expiringIssuer = store.issueKey('independent-agent-expiring-issuer', { scopes: [...restrictedScopes, 'keys:write'], expires_at: new Date(Date.now() + 60000).toISOString() });
    expect(() => store.issueKey('forbidden-unbounded-delegate', { scopes: restrictedScopes, issuer: expiringIssuer })).toThrow('outlive its issuer');
  });

  it('rejects revoked and expired keys and revokes an active child when its issuer ends', async () => {
    const ownKey = store.issueKey('independent-agent-revocable', { scopes: restrictedScopes });
    store.revokeKey(ownKey.id);
    expect((await invoke(ownKey, 'ssss.read', { query: 'acceptance' })).status).toBe(401);
    const expired = store.issueKey('independent-agent-expired', { scopes: restrictedScopes, expires_at: '2000-01-01T00:00:00.000Z' });
    expect((await invoke(expired, 'capabilities')).status).toBe(401);
    const issuer = store.issueKey('independent-agent-parent', { scopes: [...restrictedScopes, 'keys:write'] });
    const child = store.issueKey('independent-agent-child', { scopes: restrictedScopes, issuer });
    expect((await invoke(child, 'ssss.read', { query: 'acceptance' })).status).toBe(200);
    store.revokeKey(issuer.id);
    expect((await invoke(child, 'ssss.read', { query: 'acceptance' })).status).toBe(403);
  });
});
