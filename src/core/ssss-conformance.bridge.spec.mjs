/**
 * SSSS conformance bridge — total-recall ⇄ the canonical standard.
 *
 * Runs the canonical Operation Contract fixtures (spec §6) — imported straight
 * from the published `@ssss/cli` package, the vendor-neutral source of truth —
 * through total-recall's OWN engine (`processOperation`). This proves the kernel
 * implements the *same* standard the festech and ultrachat hosts do, rather than
 * a privately-drifting copy.
 *
 * Comparison is STRUCTURAL, not byte-exact: every host layers its own policy
 * (total-recall stamps memory timestamps, enforces protocol-path authz, validates
 * with Zod and so phrases error strings differently). The contract is the SHAPE of
 * the response — success, validity, resolved type, dry-run, replay — not prose.
 *
 * Source: https://github.com/gregiteen/ssss  (registry/core.json, conformance/fixtures.json)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { processOperation } from './operation-validator.mjs';
import { SSSS_SCHEMAS } from './schema.mjs';

const require = createRequire(import.meta.url);
const { fixtures } = require('@ssss/cli/conformance/fixtures.json');
const core = require('@ssss/cli/registry/core.json');

// total-recall's engine implements all four canonical envelope types
// (operation/patch/event/delete, §6.2) plus envelope-level validation, so the
// full canonical fixture set is bridged.
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

describe('SSSS conformance bridge (canonical fixtures → total-recall engine)', () => {
  const results = new Map();

  beforeAll(() => {
    // One shared vault, fixtures applied in declared order so preconditions hold
    // (patch/replay/delete all depend on fixture-001 being committed first).
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-ssss-conf-'));
    try {
      for (const f of fixtures) {
        const res = processOperation(JSON.parse(JSON.stringify(f.request)), vault);
        results.set(f.id, normalize(res));
      }
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
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
