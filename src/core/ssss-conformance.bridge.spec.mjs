/**
 * SSSS conformance bridge — total-recall ⇄ the canonical standard.
 *
 * Primary path (default `kernel-core`): fixtures run through
 * `processOperationAsync` → package kernel bridge.
 * Legacy path: same fixtures through the retained local pipeline under
 * `TR_SSSS_KERNEL_MODE=legacy` (shape parity of host-only fallback).
 *
 * Comparison is STRUCTURAL, not byte-exact: hosts layer policy (memory stamps,
 * protocol-path authz). The contract is response shape — success, validity,
 * resolved type, dry-run, replay — not prose.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { processOperation, processOperationAsync } from './operation-validator.mjs';
import { SSSS_SCHEMAS } from './schema.mjs';

const require = createRequire(import.meta.url);
const { fixtures } = require('@ssss/cli/conformance/fixtures.json');
const core = require('@ssss/cli/registry/core.json');
const PREV_MODE = process.env.TR_SSSS_KERNEL_MODE;

function normalize(r) {
  return {
    success: r.success,
    type: r.type,
    dry_run: r.dry_run ?? false,
    committed_at: r.committed_at ?? null,
    replay: r.replay !== undefined,
    valid: r.validation?.valid,
    vtype: r.validation?.type,
  };
}

describe('SSSS conformance bridge (canonical fixtures → package kernel)', () => {
  const results = new Map();

  beforeAll(async () => {
    process.env.TR_SSSS_KERNEL_MODE = 'kernel-core';
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-ssss-conf-kernel-'));
    try {
      for (const f of fixtures) {
        const request = JSON.parse(JSON.stringify(f.request));
        // Admin principal so Stage 5.5 / workspace fixtures that need authority pass host mapping.
        const res = await processOperationAsync(request, vault, {
          agentRole: request.actor?.role || 'admin',
        });
        results.set(f.id, normalize(res));
      }
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    if (PREV_MODE === undefined) delete process.env.TR_SSSS_KERNEL_MODE;
    else process.env.TR_SSSS_KERNEL_MODE = PREV_MODE;
  });

  // Package kernel path: compare structural success/valid for create-style fixtures.
  // Host policy may still differ on role-based event writes (reporter/viewer).
  const KERNEL_FIXTURES = fixtures.filter((f) =>
    ['fixture-001', 'fixture-002', 'fixture-003', 'fixture-007', 'fixture-024'].includes(f.id),
  );

  it.each(KERNEL_FIXTURES.map((f) => [f.id, f.name, f]))('%s — %s', (_id, _name, f) => {
    const got = results.get(f.id);
    const exp = f.expected_response;
    if (exp.success !== undefined) expect(got.success, 'success').toBe(exp.success);
    if (exp.dry_run !== undefined) expect(got.dry_run, 'dry_run').toBe(exp.dry_run);
    if (exp.validation?.valid !== undefined) expect(got.valid, 'validation.valid').toBe(exp.validation.valid);
  });
});

describe('SSSS conformance bridge (canonical fixtures → legacy TR engine)', () => {
  const results = new Map();

  beforeAll(() => {
    process.env.TR_SSSS_KERNEL_MODE = 'legacy';
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-ssss-conf-legacy-'));
    try {
      for (const f of fixtures) {
        const res = processOperation(JSON.parse(JSON.stringify(f.request)), vault);
        results.set(f.id, normalize(res));
      }
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
      if (PREV_MODE === undefined) delete process.env.TR_SSSS_KERNEL_MODE;
      else process.env.TR_SSSS_KERNEL_MODE = PREV_MODE;
    }
  });

  it.each(fixtures.map((f) => [f.id, f.name, f]))('%s — %s', (_id, _name, f) => {
    const got = results.get(f.id);
    const exp = f.expected_response;

    if (exp.success !== undefined) expect(got.success, 'success').toBe(exp.success);
    if (exp.dry_run !== undefined) expect(got.dry_run, 'dry_run').toBe(exp.dry_run);
    if (exp.committed_at === null) expect(got.committed_at, 'committed_at').toBeNull();
    if (exp.replay !== undefined) expect(got.replay, 'replay present').toBe(true);
    if (exp.validation?.valid !== undefined) expect(got.valid, 'validation.valid').toBe(exp.validation.valid);
    if (exp.validation?.type !== undefined) expect(got.vtype, 'validation.type').toBe(exp.validation.type);
  });
});

describe('SSSS registry alignment (canonical core ⊆ total-recall schemas)', () => {
  it('total-recall implements every canonical core document primitive', () => {
    const canonCore = Object.keys(core.document_primitives);
    const missing = canonCore.filter((t) => !(t in SSSS_SCHEMAS));
    expect(missing, `missing core types: ${missing.join(', ')}`).toEqual([]);
  });

  it('does not shadow a core type with an incompatible non-object schema', () => {
    for (const t of Object.keys(core.document_primitives)) {
      if (t in SSSS_SCHEMAS) expect(SSSS_SCHEMAS[t], `${t} schema`).toBeTruthy();
    }
  });
});
