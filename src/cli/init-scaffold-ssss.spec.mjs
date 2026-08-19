// @vitest-environment node
/**
 * Regression gate: everything `init` seeds must satisfy the SSSS document
 * contract of the @ssss/cli package that is actually installed.
 *
 * All four seed nodes previously failed §4.2 (no `description`, no `timestamp`),
 * so every brain `init` created started 0/4 conformant — and nothing caught it,
 * because the seeds are static files that never pass through
 * writeNodeValidated() and MemoryNodeSchema did not declare `timestamp`.
 *
 * This asserts against the package's own validator and registry rather than a
 * hand-rolled field list, per the SSSS skill's "establish ground truth first" —
 * a local copy of the rules would drift from the spec exactly the way the seeds did.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAFFOLD_VAULT = path.join(
  ROOT, 'scaffold', '.agent', 'skills', 'total-recall', 'memory-vault',
);

function scaffoldNodes() {
  if (!fs.existsSync(SCAFFOLD_VAULT)) return [];
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.md')) out.push(p);
    }
  })(SCAFFOLD_VAULT);
  return out.sort();
}

describe('init scaffold — SSSS conformance', () => {
  let validator;

  beforeAll(async () => {
    const { loadRegistries, composeRegistryLayers } = await import('@ssss/cli/registry');
    const { createValidator } = await import('@ssss/cli/validator');
    const base = loadRegistries();
    validator = createValidator({
      registrySet: composeRegistryLayers({ core: base.core, installed: [], repository: [] }),
    });
  });

  it('ships at least one seed node', () => {
    expect(scaffoldNodes().length).toBeGreaterThan(0);
  });

  it('every seeded vault node validates against the installed SSSS registry', () => {
    const failures = [];
    for (const file of scaffoldNodes()) {
      const result = validator.validateDocument(fs.readFileSync(file, 'utf8'));
      if (!(result.valid ?? result.ok)) {
        failures.push(
          `${path.relative(SCAFFOLD_VAULT, file)}: ${(result.errors || [])
            .map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
            .join('; ')}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it('every seeded node carries all four §4.2 universal fields', () => {
    // Stated explicitly as well as via the validator: if a future spec bump ever
    // relaxes the registry, these four are the contract Total Recall depends on
    // for recall, compaction, and bundle export.
    const missing = [];
    for (const file of scaffoldNodes()) {
      const fm = fs.readFileSync(file, 'utf8').split(/^---$/m)[1] || '';
      for (const field of ['type', 'title', 'description', 'timestamp']) {
        if (!new RegExp(`^${field}:`, 'm').test(fm)) {
          missing.push(`${path.relative(SCAFFOLD_VAULT, file)} → ${field}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
