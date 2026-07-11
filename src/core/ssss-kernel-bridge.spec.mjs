import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  inventorySummary,
  createTotalRecallRegistrySet,
  processViaPackageKernel,
  mapTrPrincipal,
  shadowCompare,
  isLowRiskEnvelope,
  isCoreRouteEnvelope,
  prepareEnvelopeForKernel,
  listUnapprovedCanonicalWriters,
  scanDirectCanonicalWrites,
} from './ssss-kernel-bridge.mjs';
import {
  listHostOnlyTypes,
  listMissingCoreSchemas,
  listCoreTypes,
} from './ssss-host-extension.mjs';
const require = createRequire(import.meta.url);
const { fixtures } = require('@ssss/cli/conformance/fixtures.json');

function tmpVault() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tr-ssss-bridge-'));
}

describe('SSSS 0.9 host inventory', () => {
  it('lists package core types and host-only extension types', () => {
    const summary = inventorySummary();
    expect(summary.core_types).toContain('memory');
    expect(summary.core_types).toContain('primitive');
    expect(summary.host_only_types.length).toBeGreaterThan(0);
    expect(summary.host_only_types).not.toContain('memory');
    expect(listMissingCoreSchemas()).toEqual([]);
    expect(listCoreTypes()).toEqual(summary.core_types);
    expect(listHostOnlyTypes()).toEqual(summary.host_only_types);
  });

  it('composes package core + host extension registries', () => {
    const set = createTotalRecallRegistrySet();
    expect(set.types.has('memory')).toBe(true);
    expect(set.types.has('rule')).toBe(true);
    // Host-only type from TR Zod schemas
    expect(set.types.has('proposal') || set.types.has('account_memory')).toBe(true);
  });
});

describe('SSSS 0.9 principal mapping', () => {
  it('maps admin role to wildcard capabilities', () => {
    const principal = mapTrPrincipal(
      { workspace_id: 'ws-1', actor: { role: 'admin' } },
      { agentRole: 'admin' },
    );
    expect(principal.capabilities).toContain('*:*');
    expect(principal.workspaceIds).toContain('ws-1');
  });

  it('fails closed when no role is present', () => {
    expect(mapTrPrincipal({ workspace_id: 'ws-1' }, {})).toBeNull();
  });
});

describe('SSSS 0.9 package kernel bridge', () => {
  let vault;
  beforeEach(() => { vault = tmpVault(); });
  afterEach(() => { fs.rmSync(vault, { recursive: true, force: true }); });

  it('commits a low-risk rule through the package kernel', async () => {
    const content = [
      '---',
      'type: rule',
      'title: Welcome',
      'description: Welcome rule for bridge test.',
      'timestamp: 2026-07-10T00:00:00Z',
      'name: welcome',
      '---',
      '',
      'Body.',
      '',
    ].join('\n');
    const envelope = {
      type: 'operation',
      workspace_id: 'ws-bridge',
      idempotency_key: 'bridge-rule-1',
      path: 'rules/welcome.md',
      content,
      actor: { role: 'admin' },
    };
    expect(isLowRiskEnvelope(envelope)).toBe(true);
    const result = await processViaPackageKernel(envelope, vault, { agentRole: 'admin' });
    expect(result.success).toBe(true);
    expect(result.validation.valid).toBe(true);
    expect(fs.existsSync(path.join(vault, 'rules/welcome.md'))).toBe(true);
  });

  it('blocks protocol-path writes without admin', async () => {
    const content = [
      '---',
      'type: rule',
      'title: Spec',
      'description: Should be blocked.',
      'timestamp: 2026-07-10T00:00:00Z',
      'name: spec',
      '---',
      '',
      'No.',
      '',
    ].join('\n');
    const result = await processViaPackageKernel({
      type: 'operation',
      workspace_id: 'ws-bridge',
      idempotency_key: 'proto-1',
      path: 'references/ssss-spec.md',
      content,
    }, vault, { agentRole: 'optimizer' });
    expect(result.success).toBe(false);
    expect(result.validation.errors.join(' ')).toMatch(/Protocol path/i);
  });

  it('commits memory through the package kernel with host preflight stamps', async () => {
    const raw = fs.readFileSync(path.resolve('fixtures/valid/memory-node.md'), 'utf8');
    const envelope = {
      type: 'operation',
      workspace_id: 'ws-bridge',
      idempotency_key: 'bridge-memory-1',
      path: 'patterns/fixture-valid-memory.md',
      content: raw,
      actor: { role: 'admin' },
    };
    expect(isCoreRouteEnvelope(envelope)).toBe(true);
    const prepared = prepareEnvelopeForKernel(envelope, { agentRole: 'admin' });
    expect(prepared.errors).toEqual([]);
    expect(prepared.envelope.content).toMatch(/description:/);
    expect(prepared.envelope.content).toMatch(/timestamp:/);

    const result = await processViaPackageKernel(envelope, vault, { agentRole: 'admin' });
    expect(result.success, JSON.stringify(result)).toBe(true);
    const written = fs.readFileSync(path.join(vault, 'patterns/fixture-valid-memory.md'), 'utf8');
    expect(written).toMatch(/updated:/);
    expect(written).toMatch(/last_accessed:/);
  });

  it('commits workflow through the package kernel', async () => {
    const content = [
      '---',
      'type: workflow',
      'title: Daily Digest',
      'description: Summarize unread messages.',
      'timestamp: 2026-07-10T00:00:00Z',
      'name: Daily Digest',
      'isActive: true',
      'priority: 80',
      '---',
      '',
      '1. Gather.',
      '2. Summarize.',
      '',
    ].join('\n');
    const envelope = {
      type: 'operation',
      workspace_id: 'ws-bridge',
      idempotency_key: 'bridge-workflow-1',
      path: 'workflows/daily-digest/WORKFLOW.md',
      content,
      actor: { role: 'admin' },
    };
    expect(isCoreRouteEnvelope(envelope)).toBe(true);
    const result = await processViaPackageKernel(envelope, vault, { agentRole: 'admin' });
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(fs.existsSync(path.join(vault, 'workflows/daily-digest/WORKFLOW.md'))).toBe(true);
  });

  it('rejects incomplete schema_version 2 memory via host overlay', async () => {
    const content = [
      '---',
      'type: memory',
      'slug: incomplete',
      'category: facts',
      'title: Incomplete',
      'description: Missing v2 fields',
      'timestamp: 2026-07-10T00:00:00Z',
      'status: active',
      'schema_version: 2',
      '---',
      '',
      'Body',
      '',
    ].join('\n');
    const result = await processViaPackageKernel({
      type: 'operation',
      workspace_id: 'ws-bridge',
      idempotency_key: 'mem-bad',
      path: 'facts/incomplete.md',
      content,
    }, vault, { agentRole: 'admin' });
    expect(result.success).toBe(false);
    expect(result.validation.errors.join(' ')).toMatch(/V2 Schema Requirement|confidence|modality/i);
  });

  it('warns when optimizer writes absolute-priority memory', async () => {
    const content = [
      '---',
      'type: memory',
      'slug: abs-node',
      'category: invariants',
      'title: Absolute rule',
      'description: Tier 1',
      'timestamp: 2026-07-10T00:00:00Z',
      'status: active',
      'schema_version: 2',
      'confidence: 1',
      'importance: 5',
      'modality: must',
      'subject: agent',
      'predicate: obey',
      'object: absolute-rule',
      'sentiment_polarity: directive_must',
      'sentiment_target: agent',
      'priority: absolute',
      '---',
      '',
      'Must.',
      '',
    ].join('\n');
    const result = await processViaPackageKernel({
      type: 'operation',
      workspace_id: 'ws-bridge',
      idempotency_key: 'opt-abs',
      path: 'invariants/abs-node.md',
      content,
    }, vault, { agentRole: 'optimizer' });
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.validation.warnings.join(' ')).toMatch(/Optimizer writing Tier 1/i);
  });
});

describe('SSSS 0.9 direct-write detection', () => {
  it('lists unapproved canonical writers in src/core', () => {
    const writers = listUnapprovedCanonicalWriters(path.resolve('src/core'));
    expect(Array.isArray(writers)).toBe(true);
    // Contract surfaces must not appear.
    expect(writers.some((w) => w.endsWith('operation-validator.mjs'))).toBe(false);
    expect(writers.some((w) => w.endsWith('validated-write.mjs'))).toBe(false);
  });

  it('scans for direct write patterns with severity tags', () => {
    const findings = scanDirectCanonicalWrites(path.resolve('src/core'));
    expect(Array.isArray(findings)).toBe(true);
    for (const finding of findings.slice(0, 5)) {
      expect(finding).toHaveProperty('file');
      expect(finding).toHaveProperty('severity');
    }
  });
});

describe('SSSS 0.9 package kernel fixture smoke', () => {
  it('commits structural create fixtures through the package kernel', async () => {
    const vault = tmpVault();
    try {
      const createFixtures = fixtures.filter((f) =>
        f.id === 'fixture-001' || f.id === 'fixture-003' || f.id === 'fixture-024',
      );
      for (const f of createFixtures) {
        const request = JSON.parse(JSON.stringify(f.request));
        const result = await processViaPackageKernel(request, vault, {
          agentRole: request.actor?.role || 'admin',
        });
        expect(result.success, `${f.id} ${JSON.stringify(result)}`).toBe(true);
      }
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  });
});
