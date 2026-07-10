/**
 * SSSS conformance bridge — total-recall ⇄ package kernel.
 *
 * All fixtures run through processOperationAsync → SSSS 0.9 package kernel.
 * Comparison is STRUCTURAL (success / valid / dry_run / type), not prose-exact.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { processOperationAsync } from './operation-validator.mjs';
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

  // Structural fixtures that host policy does not specialize.
  const STRUCTURAL = fixtures.filter((f) =>
    [
      'fixture-001', 'fixture-002', 'fixture-003', 'fixture-007',
      'fixture-024',
    ].includes(f.id),
  );

  it.each(STRUCTURAL.map((f) => [f.id, f.name, f]))('%s — %s', (_id, _name, f) => {
    const got = results.get(f.id);
    const exp = f.expected_response;
    if (exp.success !== undefined) expect(got.success, 'success').toBe(exp.success);
    if (exp.dry_run !== undefined) expect(got.dry_run, 'dry_run').toBe(exp.dry_run);
    if (exp.validation?.valid !== undefined) expect(got.valid, 'validation.valid').toBe(exp.validation.valid);
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
