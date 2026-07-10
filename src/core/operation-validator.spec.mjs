import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';
import { processOperation, processOperationAsync, acquireLease, releaseLease } from './operation-validator.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-opval-'));
}

function memoryContent(slug = 'test-node') {
  return matter.stringify('Body text.', {
    type: 'memory',
    slug,
    category: 'patterns',
    title: 'Test',
    description: 'Test memory node',
    timestamp: '2026-07-10T00:00:00Z',
    status: 'active',
    confidence: 0.9,
    importance: 3,
    created: '2026-07-10T00:00:00Z',
    updated: '2026-07-10T00:00:00Z',
    last_accessed: '2026-07-10T00:00:00Z',
    source: { type: 'test', session_id: 's1', evidence_count: 1 },
    supersedes: [],
    superseded_by: null,
    contradicts: [],
    tags: [],
    related: [],
    routes_to_skills: [],
    sentiment_polarity: 'descriptive',
    sentiment_target: 'x',
    modality: 'should',
    subject: 'a',
    predicate: 'b',
    object: 'c',
    decay: { half_life_days: 30, access_count: 1 },
    schema_version: 2,
  });
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

describe('Operation Validator (package kernel)', () => {
  let vaultRoot;

  beforeEach(() => { vaultRoot = tmpDir(); });
  afterEach(() => { fs.rmSync(vaultRoot, { recursive: true, force: true }); });

  it('rejects sync processOperation', () => {
    expect(() => processOperation({}, vaultRoot)).toThrow(/processOperationAsync/);
  });

  it('validates and commits a valid memory node operation', async () => {
    const result = await processOperationAsync(makeOpEnvelope(memoryContent()), vaultRoot, { agentRole: 'admin' });
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.committed_at).toBeTruthy();
    expect(result.validation.valid).toBe(true);
    expect(fs.existsSync(path.join(vaultRoot, 'patterns', 'test.md'))).toBe(true);
  });

  it('rejects invalid content (missing required fields)', async () => {
    const content = '---\ntype: memory\nslug: x\ncategory: facts\ntitle: X\ndescription: d\ntimestamp: 2026-07-10T00:00:00Z\nstatus: active\nschema_version: 2\n---\n';
    const result = await processOperationAsync(makeOpEnvelope(content), vaultRoot, { agentRole: 'admin' });
    expect(result.success).toBe(false);
    expect(result.validation.errors.length).toBeGreaterThan(0);
  });

  it('rejects unknown envelope type', async () => {
    const result = await processOperationAsync({ type: 'bogus', workspace_id: 'ws', idempotency_key: 'k-unknown-type-1', path: 'x.md' }, vaultRoot, { agentRole: 'admin' });
    expect(result.success).toBe(false);
    expect(result.validation.errors.join(' ')).toMatch(/Invalid command type|Unknown/i);
  });

  it('returns idempotent replay on duplicate key', async () => {
    const content = memoryContent('replay-node');
    const env = makeOpEnvelope(content, 'patterns/replay.md', { idempotency_key: 'stable-replay-key-1' });
    const r1 = await processOperationAsync(env, vaultRoot, { agentRole: 'admin' });
    expect(r1.success, JSON.stringify(r1)).toBe(true);
    const r2 = await processOperationAsync(env, vaultRoot, { agentRole: 'admin' });
    expect(r2.success).toBe(true);
    expect(r2.replay).toBe(true);
  });

  it('supports dry_run without committing', async () => {
    const env = makeOpEnvelope(memoryContent('dry'), 'patterns/dry.md', { dry_run: true });
    const result = await processOperationAsync(env, vaultRoot, { agentRole: 'admin' });
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(result.committed_at).toBeNull();
    expect(fs.existsSync(path.join(vaultRoot, 'patterns', 'dry.md'))).toBe(false);
  });

  it('blocks protocol paths for non-admin roles', async () => {
    const env = makeOpEnvelope(memoryContent('proto'), 'references/ssss-spec.md');
    const result = await processOperationAsync(env, vaultRoot, { agentRole: 'optimizer' });
    expect(result.success).toBe(false);
    expect(result.validation.errors.join(' ')).toMatch(/Protocol path/i);
  });

  it('acquireLease and releaseLease work', () => {
    const leaseStore = path.join(vaultRoot, 'leases');
    const acquired = acquireLease('ws', 'patterns/a.md', leaseStore, 30_000);
    expect(acquired.lease_id).toBeTruthy();
    const released = releaseLease('ws', 'patterns/a.md', acquired.lease_id, leaseStore);
    expect(released.released).toBe(true);
  });
});
