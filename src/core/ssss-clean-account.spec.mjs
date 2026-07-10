/**
 * Phase 8A clean-account verification for SSSS 0.9 package kernel.
 *
 * Proves a fresh vault can initialize, commit memory/workflow through the
 * package kernel, replay idempotently, and keep private structural defaults.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { processViaPackageKernel } from './ssss-kernel-bridge.mjs';
import { processOperationAsync } from './operation-validator.mjs';
import { writeNodeValidatedAsync } from './validated-write.mjs';

const PREV_MODE = process.env.TR_SSSS_KERNEL_MODE;

function tmpVault() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tr-clean-account-'));
}

function memoryContent(slug) {
  return [
    '---',
    'type: memory',
    `slug: ${slug}`,
    'category: facts',
    'title: Clean account fact',
    'description: Seed memory for clean-account verification.',
    'timestamp: 2026-07-10T00:00:00Z',
    'status: active',
    'schema_version: 2',
    'confidence: 0.9',
    'importance: 4',
    'modality: should',
    'subject: agent',
    'predicate: remember',
    'object: clean-account',
    'sentiment_polarity: descriptive',
    'sentiment_target: verification',
    '---',
    '',
    'Clean account seed body.',
    '',
  ].join('\n');
}

function workflowContent() {
  return [
    '---',
    'type: workflow',
    'title: Clean Account Workflow',
    'description: Seed workflow for clean-account verification.',
    'timestamp: 2026-07-10T00:00:00Z',
    'name: Clean Account Workflow',
    'isActive: true',
    'priority: 50',
    '---',
    '',
    '1. Boot.',
    '2. Verify.',
    '',
  ].join('\n');
}

describe('SSSS 0.9 clean-account verification (kernel-core)', () => {
  beforeAll(() => {
    process.env.TR_SSSS_KERNEL_MODE = 'kernel-core';
  });
  afterAll(() => {
    if (PREV_MODE === undefined) delete process.env.TR_SSSS_KERNEL_MODE;
    else process.env.TR_SSSS_KERNEL_MODE = PREV_MODE;
  });

  let vault;
  beforeEach(() => {
    vault = tmpVault();
    // Minimal role surface for principal mapping if needed later.
    fs.mkdirSync(path.join(vault, 'roles', 'admin'), { recursive: true });
    fs.writeFileSync(
      path.join(vault, 'roles', 'admin', 'ROLE.md'),
      ['---', 'type: security_role', 'title: Admin', 'description: Admin role', 'timestamp: 2026-07-10T00:00:00Z', 'name: admin', 'permissions:', '  - "*:*"', '---', '', 'Admin.', ''].join('\n'),
    );
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it('initializes empty vault and commits memory + workflow via package kernel', async () => {
    const memEnv = {
      type: 'operation',
      workspace_id: 'clean-ws',
      idempotency_key: 'clean-memory-1',
      path: 'facts/clean-account-fact.md',
      content: memoryContent('clean-account-fact'),
      actor: { role: 'admin' },
    };
    const created = await processViaPackageKernel(memEnv, vault, { agentRole: 'admin' });
    expect(created.success, JSON.stringify(created)).toBe(true);
    expect(fs.existsSync(path.join(vault, 'facts/clean-account-fact.md'))).toBe(true);

    const wf = await processViaPackageKernel({
      type: 'operation',
      workspace_id: 'clean-ws',
      idempotency_key: 'clean-workflow-1',
      path: 'workflows/clean/WORKFLOW.md',
      content: workflowContent(),
      actor: { role: 'admin' },
    }, vault, { agentRole: 'admin' });
    expect(wf.success, JSON.stringify(wf)).toBe(true);
    expect(fs.existsSync(path.join(vault, 'workflows/clean/WORKFLOW.md'))).toBe(true);
  });

  it('replays the same idempotency key without double-writing', async () => {
    const envelope = {
      type: 'operation',
      workspace_id: 'clean-ws',
      idempotency_key: 'clean-replay-1',
      path: 'facts/replay-fact.md',
      content: memoryContent('replay-fact'),
      actor: { role: 'admin' },
    };
    const first = await processViaPackageKernel(envelope, vault, { agentRole: 'admin' });
    expect(first.success).toBe(true);
    const before = fs.readFileSync(path.join(vault, 'facts/replay-fact.md'), 'utf8');

    const second = await processViaPackageKernel(envelope, vault, { agentRole: 'admin' });
    expect(second.success).toBe(true);
    expect(second.replay === true || second.success === true).toBe(true);
    const after = fs.readFileSync(path.join(vault, 'facts/replay-fact.md'), 'utf8');
    expect(after).toBe(before);
  });

  it('conflicts when the same idempotency key is reused with different content', async () => {
    const key = 'clean-conflict-1';
    const first = await processViaPackageKernel({
      type: 'operation',
      workspace_id: 'clean-ws',
      idempotency_key: key,
      path: 'facts/conflict-fact.md',
      content: memoryContent('conflict-fact'),
      actor: { role: 'admin' },
    }, vault, { agentRole: 'admin' });
    expect(first.success).toBe(true);

    const second = await processViaPackageKernel({
      type: 'operation',
      workspace_id: 'clean-ws',
      idempotency_key: key,
      path: 'facts/conflict-fact.md',
      content: memoryContent('conflict-fact').replace('Clean account seed body.', 'Changed body'),
      actor: { role: 'admin' },
    }, vault, { agentRole: 'admin' });
    expect(second.success).toBe(false);
  });

  it('processOperationAsync under kernel-core routes memory commits', async () => {
    const result = await processOperationAsync({
      type: 'operation',
      workspace_id: 'clean-ws',
      idempotency_key: 'async-route-1',
      path: 'facts/async-route.md',
      content: memoryContent('async-route'),
      actor: { role: 'admin' },
    }, vault, { agentRole: 'admin' });
    expect(result.success, JSON.stringify(result)).toBe(true);
  });

  it('writeNodeValidatedAsync commits a memory node under kernel-core', async () => {
    const node = {
      type: 'memory',
      slug: 'validated-async',
      category: 'facts',
      title: 'Validated async node',
      description: 'Written via validated-write async path.',
      timestamp: '2026-07-10T00:00:00Z',
      status: 'active',
      schema_version: 2,
      confidence: 0.8,
      importance: 3,
      modality: 'should',
      subject: 'agent',
      predicate: 'store',
      object: 'node',
      sentiment_polarity: 'descriptive',
      sentiment_target: 'verification',
      body: 'Body via writeNodeValidatedAsync.',
    };
    const result = await writeNodeValidatedAsync(node, vault, {
      agentRole: 'admin',
      workspaceId: 'clean-ws',
      idempotencyKey: 'validated-async-1',
    });
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(fs.existsSync(path.join(vault, 'facts/validated-async.md'))).toBe(true);
  });

  it('denies unscoped principals (privacy/scope fail-closed)', async () => {
    const result = await processViaPackageKernel({
      type: 'operation',
      workspace_id: 'clean-ws',
      idempotency_key: 'scope-deny-1',
      path: 'facts/denied.md',
      content: memoryContent('denied'),
    }, vault, {
      principal: {
        id: 'outsider',
        kind: 'agent',
        workspaceIds: [],
        capabilities: ['*:*'],
        authentication: { provider: 'test', assurance: 'verified' },
      },
    });
    expect(result.success).toBe(false);
    expect(result.validation.errors.join(' ')).toMatch(/not scoped|Access denied/i);
  });
});
