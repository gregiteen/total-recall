/**
 * SSSS Conformance Test Suite
 *
 * Validates that the fixtures/ directory contains properly formed valid
 * and invalid SSSS documents. Both Total Recall and UltraChat should
 * import and run this test to prove SSSS compatibility.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import {
  SSSS_SCHEMAS,
  OperationEnvelopeSchema,
} from '../src/core/schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname);

function loadMdFixture(relativePath) {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, relativePath), 'utf8');
  return matter(raw).data;
}

function loadJsonFixture(relativePath) {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, relativePath), 'utf8');
  return JSON.parse(raw);
}

describe('SSSS Conformance: Valid Fixtures', () => {
  it('memory-node.md passes MemoryNodeSchema', () => {
    const data = loadMdFixture('valid/memory-node.md');
    const result = SSSS_SCHEMAS.memory.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('conflict-record.md passes ConflictRecordSchema', () => {
    const data = loadMdFixture('valid/conflict-record.md');
    const result = SSSS_SCHEMAS.conflict.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('task.md passes TaskSchema', () => {
    const data = loadMdFixture('valid/task.md');
    const result = SSSS_SCHEMAS.task.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('proposal.md passes ProposalSchema', () => {
    const data = loadMdFixture('valid/proposal.md');
    const result = SSSS_SCHEMAS.proposal.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('schema-proposal.md passes SchemaProposalSchema', () => {
    const data = loadMdFixture('valid/schema-proposal.md');
    const result = SSSS_SCHEMAS['schema-proposal'].safeParse(data);
    expect(result.success).toBe(true);
  });

  it('migration.md passes MigrationSchema', () => {
    const data = loadMdFixture('valid/migration.md');
    const result = SSSS_SCHEMAS.migration.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('release.md passes ReleaseSchema', () => {
    const data = loadMdFixture('valid/release.md');
    const result = SSSS_SCHEMAS.release.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('operation-envelope.json passes OperationEnvelopeSchema', () => {
    const data = loadJsonFixture('valid/operation-envelope.json');
    const result = OperationEnvelopeSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

describe('SSSS Conformance: Invalid Fixtures', () => {
  it('memory-missing-fields.md fails MemoryNodeSchema', () => {
    const data = loadMdFixture('invalid/memory-missing-fields.md');
    const result = SSSS_SCHEMAS.memory.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('memory-bad-schema-version.md fails MemoryNodeSchema', () => {
    const data = loadMdFixture('invalid/memory-bad-schema-version.md');
    const result = SSSS_SCHEMAS.memory.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('conflict-missing-id.md fails ConflictRecordSchema', () => {
    const data = loadMdFixture('invalid/conflict-missing-id.md');
    const result = SSSS_SCHEMAS.conflict.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('proposal-bad-category.md fails ProposalSchema', () => {
    const data = loadMdFixture('invalid/proposal-bad-category.md');
    const result = SSSS_SCHEMAS.proposal.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('operation-missing-key.json fails OperationEnvelopeSchema', () => {
    const data = loadJsonFixture('invalid/operation-missing-key.json');
    const result = OperationEnvelopeSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
