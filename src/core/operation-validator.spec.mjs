import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';
import { processOperation, acquireLease, releaseLease } from './operation-validator.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-opval-'));
}

function writeMemoryNode(vaultRoot, slug, overrides = {}) {
  const dir = path.join(vaultRoot, 'patterns');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const node = {
    type: 'memory', slug, category: 'patterns', title: `Test ${slug}`,
    status: 'active', confidence: 0.9, importance: 3,
    created: new Date().toISOString(), updated: new Date().toISOString(),
    last_accessed: new Date().toISOString(),
    source: { type: 'test', session_id: 'test-1', evidence_count: 1 },
    supersedes: [], superseded_by: null, contradicts: [],
    tags: ['test'], related: [], routes_to_skills: [],
    sentiment_polarity: 'descriptive', sentiment_target: 'system',
    modality: 'should', subject: 'agent', predicate: 'do_thing', object: 'target',
    decay: { half_life_days: 30, access_count: 1 }, schema_version: 2,
    ...overrides,
  };
  const raw = matter.stringify('Test body.', node);
  fs.writeFileSync(path.join(dir, `${slug}.md`), raw);
  return raw;
}

function makeOpEnvelope(content, pathStr = 'patterns/test.md', overrides = {}) {
  return {
    type: 'operation',
    idempotency_key: `test-key-${Date.now()}-${Math.random()}`,
    path: pathStr,
    workspace_id: 'test-ws',
    actor: { role: 'admin' },
    content,
    ...overrides,
  };
}

describe('Operation Validator', () => {
  let vaultRoot;

  beforeEach(() => { vaultRoot = tmpDir(); });
  afterEach(() => { fs.rmSync(vaultRoot, { recursive: true, force: true }); });

  it('validates and commits a valid memory node operation', () => {
    const content = matter.stringify('Body text.', {
      type: 'memory', slug: 'test-node', category: 'patterns', title: 'Test',
      status: 'active', confidence: 0.9, importance: 3,
      created: new Date().toISOString(), updated: new Date().toISOString(),
      last_accessed: new Date().toISOString(),
      source: { type: 'test', session_id: 's1', evidence_count: 1 },
      supersedes: [], superseded_by: null, contradicts: [],
      tags: [], related: [], routes_to_skills: [],
      sentiment_polarity: 'descriptive', sentiment_target: 'x',
      modality: 'should', subject: 'a', predicate: 'b', object: 'c',
      decay: { half_life_days: 30, access_count: 1 }, schema_version: 2,
    });
    const result = processOperation(makeOpEnvelope(content), vaultRoot);
    expect(result.success).toBe(true);
    expect(result.committed_at).toBeTruthy();
    expect(result.validation.valid).toBe(true);
    expect(fs.existsSync(path.join(vaultRoot, 'patterns', 'test.md'))).toBe(true);
  });

  it('rejects invalid envelope (missing idempotency_key)', () => {
    const result = processOperation({ type: 'operation', path: 'x.md', workspace_id: 'ws', content: '---\ntype: memory\n---' }, vaultRoot);
    expect(result.success).toBe(false);
    expect(result.validation.errors.length).toBeGreaterThan(0);
  });

  it('rejects unknown envelope type', () => {
    const result = processOperation({ type: 'bogus' }, vaultRoot);
    expect(result.success).toBe(false);
    expect(result.validation.errors[0]).toContain('Unknown envelope type');
  });

  it('rejects invalid content (missing required fields)', () => {
    const content = '---\ntype: memory\nslug: x\n---\n';
    const result = processOperation(makeOpEnvelope(content), vaultRoot);
    expect(result.success).toBe(false);
    expect(result.repair).toBeDefined();
    expect(result.repair.field_errors.length).toBeGreaterThan(0);
  });

  it('returns idempotent replay on duplicate key', () => {
    const content = matter.stringify('', {
      type: 'task', priority: 1, category: 'memory-maintenance', status: 'pending',
    });
    const key = `idem-${Date.now()}`;
    const env = makeOpEnvelope(content, 'tasks/t.md', { idempotency_key: key });
    const r1 = processOperation(env, vaultRoot);
    expect(r1.success).toBe(true);
    const r2 = processOperation(env, vaultRoot);
    expect(r2.replay).toBeDefined();
    expect(r2.operation_id).toBe(r1.operation_id);
  });

  it('blocks optimizer from protocol paths', () => {
    const content = '---\ntype: memory\n---\n';
    const env = makeOpEnvelope(content, 'references/ssss-spec.md');
    const result = processOperation(env, vaultRoot, { agentRole: 'optimizer' });
    expect(result.success).toBe(false);
    expect(result.validation.errors[0]).toContain('admin role');
  });

  it('allows admin to write protocol paths', () => {
    const content = matter.stringify('Spec content.', {
      type: 'rule', name: 'spec', description: 'test',
    });
    const env = makeOpEnvelope(content, 'references/ssss-spec.md');
    const result = processOperation(env, vaultRoot, { agentRole: 'admin' });
    expect(result.success).toBe(true);
  });

  it('supports dry_run without committing', () => {
    const content = matter.stringify('', {
      type: 'task', priority: 1, category: 'memory-maintenance', status: 'pending',
    });
    const env = makeOpEnvelope(content, 'tasks/dry.md', { dry_run: true });
    const result = processOperation(env, vaultRoot);
    expect(result.success).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(result.committed_at).toBeNull();
    expect(fs.existsSync(path.join(vaultRoot, 'tasks', 'dry.md'))).toBe(false);
  });

  it('warns when optimizer writes Tier 1 node', () => {
    const content = matter.stringify('', {
      type: 'memory', slug: 'abs', category: 'invariants', title: 'Absolute',
      status: 'active', confidence: 1, importance: 5,
      created: new Date().toISOString(), updated: new Date().toISOString(),
      last_accessed: new Date().toISOString(),
      source: { type: 'test', session_id: 's1', evidence_count: 1 },
      supersedes: [], superseded_by: null, contradicts: [],
      tags: [], related: [], routes_to_skills: [],
      sentiment_polarity: 'directive_must', sentiment_target: 'x',
      modality: 'must', subject: 'a', predicate: 'b', object: 'c',
      decay: { half_life_days: 365, access_count: 1 }, schema_version: 2,
      priority: 'absolute', immutable: true,
    });
    const result = processOperation(makeOpEnvelope(content, 'inv/abs.md'), vaultRoot, { agentRole: 'optimizer' });
    expect(result.success).toBe(true);
    expect(result.validation.warnings.length).toBeGreaterThan(0);
  });

  it('validates event content is valid JSON', () => {
    const env = {
      type: 'event', idempotency_key: `ev-${Date.now()}`,
      path: 'events/test', workspace_id: 'ws', content: 'not-json',
    };
    const result = processOperation(env, vaultRoot);
    expect(result.success).toBe(false);
    expect(result.validation.errors[0]).toContain('valid JSON');
  });

  it('writes audit log on successful commit', () => {
    const content = matter.stringify('', {
      type: 'task', priority: 1, category: 'exploration', status: 'pending',
    });
    processOperation(makeOpEnvelope(content, 'tasks/aud.md'), vaultRoot);
    const auditPath = path.join(vaultRoot, '.events', 'audit.jsonl');
    expect(fs.existsSync(auditPath)).toBe(true);
    const lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    const entry = JSON.parse(lines[0]);
    expect(entry.event_type).toBe('audit');
  });

  it('warms the idempotency cache from past audit logs', () => {
    const auditDir = path.join(vaultRoot, '.events');
    fs.mkdirSync(auditDir, { recursive: true });
    const operationId = 'test-warmed-op-id';
    const committedAt = new Date().toISOString();
    const workspaceId = 'test-ws';
    const idempotencyKey = 'test-warmed-key';
    const filePath = 'patterns/warmed.md';

    const auditEntry = {
      event_id: 'audit-event-1',
      event_type: 'audit',
      correlation_id: operationId,
      ts: committedAt,
      subject: filePath,
      payload: {
        envelope_type: 'operation',
        idempotency_key: idempotencyKey,
        workspace_id: workspaceId,
        agent_role: 'admin',
        resolved_type: 'memory'
      }
    };
    fs.writeFileSync(path.join(auditDir, 'audit.jsonl'), JSON.stringify(auditEntry) + '\n');

    const env = makeOpEnvelope('', filePath, {
      idempotency_key: idempotencyKey,
      workspace_id: workspaceId
    });
    const result = processOperation(env, vaultRoot);
    expect(result.success).toBe(true);
    expect(result.replay).toBeDefined();
    expect(result.operation_id).toBe(operationId);
  });

  it('automatically updates updated and last_accessed timestamps for memory nodes', () => {
    const oldTime = '2020-01-01T00:00:00.000Z';
    const content = matter.stringify('Body text.', {
      type: 'memory', slug: 'test-ts-node', category: 'patterns', title: 'Test',
      status: 'active', confidence: 0.9, importance: 3,
      created: oldTime, updated: oldTime,
      last_accessed: oldTime,
      source: { type: 'test', session_id: 's1', evidence_count: 1 },
      supersedes: [], superseded_by: null, contradicts: [],
      tags: [], related: [], routes_to_skills: [],
      sentiment_polarity: 'descriptive', sentiment_target: 'x',
      modality: 'should', subject: 'a', predicate: 'b', object: 'c',
      decay: { half_life_days: 30, access_count: 1 }, schema_version: 2,
    });
    const result = processOperation(makeOpEnvelope(content, 'patterns/ts.md'), vaultRoot);
    expect(result.success).toBe(true);

    const written = fs.readFileSync(path.join(vaultRoot, 'patterns', 'ts.md'), 'utf8');
    const parsed = matter(written);
    expect(parsed.data.created).toBe(oldTime);
    expect(parsed.data.updated).not.toBe(oldTime);
    expect(parsed.data.last_accessed).not.toBe(oldTime);
    expect(parsed.data.updated).toBe(result.committed_at);
    expect(parsed.data.last_accessed).toBe(result.committed_at);
  });
});

describe('Lease Management', () => {
  let leaseStore;

  beforeEach(() => { leaseStore = tmpDir(); });
  afterEach(() => { fs.rmSync(leaseStore, { recursive: true, force: true }); });

  it('acquires and releases a lease', () => {
    const result = acquireLease('ws1', 'test/file.md', leaseStore);
    expect(result.lease_id).toBeDefined();
    expect(result.expires_at).toBeDefined();

    const release = releaseLease('ws1', 'test/file.md', result.lease_id, leaseStore);
    expect(release.released).toBe(true);
  });

  it('rejects double-acquire on active lease', () => {
    acquireLease('ws1', 'test/file.md', leaseStore);
    const r2 = acquireLease('ws1', 'test/file.md', leaseStore);
    expect(r2.error).toBeDefined();
  });

  it('allows acquire after lease expiry', async () => {
    acquireLease('ws1', 'test/file.md', leaseStore, 1); // 1ms TTL
    await new Promise(r => setTimeout(r, 10));
    const r2 = acquireLease('ws1', 'test/file.md', leaseStore);
    expect(r2.lease_id).toBeDefined();
  });
});
