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
  compareVerdicts,
  shadowCompare,
  isLowRiskEnvelope,
} from './ssss-kernel-bridge.mjs';
import {
  listHostOnlyTypes,
  listMissingCoreSchemas,
  listCoreTypes,
} from './ssss-host-extension.mjs';
import { processOperation } from './operation-validator.mjs';

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

  it('composes package core + festech + total-recall host extension', () => {
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
});

describe('SSSS 0.9 shadow comparison on core fixtures', () => {
  it('compares local legacy verdicts with package kernel dry-runs for create fixtures', async () => {
    const vault = tmpVault();
    try {
      // Apply only pure create-style fixtures that do not depend on prior state.
      const createFixtures = fixtures.filter((f) =>
        f.id === 'fixture-001' || f.id === 'fixture-002' || f.id === 'fixture-003' || f.id === 'fixture-024',
      );
      for (const f of createFixtures) {
        const request = JSON.parse(JSON.stringify(f.request));
        // Legacy path still uses processOperation (default legacy mode).
        const local = processOperation(request, vault, { agentRole: request.actor?.role || 'admin' });
        const { comparison } = await shadowCompare(request, vault, local, {
          agentRole: request.actor?.role || 'admin',
        });
        // success/valid should agree for core structural creates; type strings may differ in edge failures.
        if (f.id === 'fixture-001' || f.id === 'fixture-003' || f.id === 'fixture-024') {
          expect(comparison.success_match, `${f.id} success`).toBe(true);
          expect(comparison.valid_match, `${f.id} valid`).toBe(true);
        }
        if (f.id === 'fixture-002') {
          // Both should deny invalid content.
          expect(comparison.local.success).toBe(false);
          expect(comparison.kernel.success).toBe(false);
        }
      }
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  });
});
