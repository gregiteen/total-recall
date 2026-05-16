import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'node:crypto';
import matter from 'gray-matter';
import {
  detectSemanticConflicts,
  scanVaultForConflicts,
  detectPatchConflict,
  computeFileHash,
  writeConflicts,
  resolveConflict,
} from './conflict-detector.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-conflict-'));
}

function makeNode(slug, overrides = {}) {
  return {
    type: 'memory', slug, category: 'patterns', title: `Node ${slug}`,
    status: 'active', confidence: 0.9, importance: 3,
    created: new Date().toISOString(), updated: new Date().toISOString(),
    last_accessed: new Date().toISOString(),
    source: { type: 'test', session_id: 's1', evidence_count: 1 },
    supersedes: [], superseded_by: null, contradicts: [],
    tags: ['email', 'format'], related: [], routes_to_skills: [],
    sentiment_polarity: 'directive_must', sentiment_target: 'email-format',
    modality: 'must', subject: 'agent', predicate: 'use_format', object: 'email',
    decay: { half_life_days: 30, access_count: 1 }, schema_version: 2,
    ...overrides,
  };
}

describe('Semantic Conflict Detection', () => {
  it('detects polarity flip conflict between similar nodes', () => {
    const candidate = makeNode('use-html-email', {
      title: 'Use HTML email format',
      sentiment_polarity: 'directive_must',
      modality: 'must',
      tags: ['email', 'format', 'html'],
    });
    const existing = [
      makeNode('use-plaintext-email', {
        title: 'Use plaintext email format',
        sentiment_polarity: 'directive_must_not',
        modality: 'must_not',
        tags: ['email', 'format', 'plaintext'],
      }),
    ];

    const conflicts = detectSemanticConflicts(candidate, existing, { conflictThreshold: 0.70 });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].polarity_flip).toBe(true);
    expect(conflicts[0].new_slug).toBe('use-html-email');
    expect(conflicts[0].existing_slug).toBe('use-plaintext-email');
    expect(conflicts[0].status).toBe('pending');
  });

  it('does not flag nodes with same polarity', () => {
    const candidate = makeNode('prefer-html-email', {
      sentiment_polarity: 'directive_must',
      modality: 'must',
    });
    const existing = [
      makeNode('also-prefer-html', {
        sentiment_polarity: 'directive_must',
        modality: 'must',
      }),
    ];

    const conflicts = detectSemanticConflicts(candidate, existing);
    expect(conflicts.length).toBe(0);
  });

  it('does not flag low-similarity nodes even with polarity flip', () => {
    const candidate = makeNode('use-tabs', {
      title: 'Use tabs for indentation',
      sentiment_polarity: 'directive_must',
      modality: 'must',
      tags: ['formatting', 'tabs'],
      subject: 'editor', predicate: 'indent_with', object: 'tabs',
    });
    const existing = [
      makeNode('use-plaintext-email', {
        title: 'Use plaintext email format',
        sentiment_polarity: 'directive_must_not',
        modality: 'must_not',
        tags: ['email', 'format'],
        subject: 'agent', predicate: 'use_format', object: 'email',
      }),
    ];

    const conflicts = detectSemanticConflicts(candidate, existing);
    expect(conflicts.length).toBe(0);
  });

  it('skips non-memory types', () => {
    const candidate = { type: 'task', slug: 'task-1' };
    const conflicts = detectSemanticConflicts(candidate, [makeNode('n1')]);
    expect(conflicts.length).toBe(0);
  });

  it('skips inactive existing nodes', () => {
    const candidate = makeNode('new-node', {
      sentiment_polarity: 'directive_must_not', modality: 'must_not',
    });
    const existing = [makeNode('old-node', { status: 'deprecated' })];
    const conflicts = detectSemanticConflicts(candidate, existing);
    expect(conflicts.length).toBe(0);
  });
});

describe('Patch Conflict Detection', () => {
  let vaultRoot;

  beforeEach(() => { vaultRoot = tmpDir(); });
  afterEach(() => { fs.rmSync(vaultRoot, { recursive: true, force: true }); });

  it('detects no conflict when hash matches', () => {
    const content = '---\ntype: task\n---\nBody.\n';
    const fp = path.join(vaultRoot, 'test.md');
    fs.writeFileSync(fp, content);
    const hash = computeFileHash(vaultRoot, 'test.md');
    const result = detectPatchConflict(vaultRoot, 'test.md', hash);
    expect(result.conflicted).toBe(false);
  });

  it('detects conflict when file was modified', () => {
    const fp = path.join(vaultRoot, 'test.md');
    fs.writeFileSync(fp, 'original');
    const hash = computeFileHash(vaultRoot, 'test.md');
    fs.writeFileSync(fp, 'modified');
    const result = detectPatchConflict(vaultRoot, 'test.md', hash);
    expect(result.conflicted).toBe(true);
    expect(result.error).toContain('modified since patch');
  });

  it('returns no conflict for non-existent file', () => {
    const result = detectPatchConflict(vaultRoot, 'missing.md', 'abc');
    expect(result.conflicted).toBe(false);
  });

  it('detects path traversal', () => {
    const result = detectPatchConflict(vaultRoot, '../../../etc/passwd', 'x');
    expect(result.conflicted).toBe(true);
    expect(result.error).toContain('traversal');
  });
});

describe('Vault-Wide Scan', () => {
  let vaultRoot;

  beforeEach(() => {
    vaultRoot = tmpDir();
    const dir = path.join(vaultRoot, 'patterns');
    fs.mkdirSync(dir, { recursive: true });

    // Write two conflicting nodes
    const nodeA = makeNode('use-html-email', {
      title: 'Use HTML email', sentiment_polarity: 'directive_must', modality: 'must',
    });
    const nodeB = makeNode('use-plaintext-email', {
      title: 'Use plaintext email', sentiment_polarity: 'directive_must_not', modality: 'must_not',
    });

    fs.writeFileSync(path.join(dir, 'use-html-email.md'), matter.stringify('', nodeA));
    fs.writeFileSync(path.join(dir, 'use-plaintext-email.md'), matter.stringify('', nodeB));
  });

  afterEach(() => { fs.rmSync(vaultRoot, { recursive: true, force: true }); });

  it('finds conflicts in a vault scan', () => {
    const conflicts = scanVaultForConflicts(vaultRoot, { conflictThreshold: 0.70 });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].polarity_flip).toBe(true);
  });
});

describe('Conflict Persistence', () => {
  let inboxDir;

  beforeEach(() => { inboxDir = tmpDir(); });
  afterEach(() => { fs.rmSync(inboxDir, { recursive: true, force: true }); });

  it('writes conflict records to inbox', () => {
    const conflicts = [{
      type: 'conflict', conflict_id: 'conflict-2026-05-16-abc123',
      status: 'pending', new_slug: 'a', existing_slug: 'b',
      similarity: 0.85, polarity_flip: true,
      detected_at: new Date().toISOString(),
      reason: 'test conflict', resolution: null, resolved_at: null,
    }];
    writeConflicts(conflicts, inboxDir);
    const fp = path.join(inboxDir, 'conflicts', 'conflict-2026-05-16-abc123.md');
    expect(fs.existsSync(fp)).toBe(true);
  });

  it('resolves a conflict', () => {
    const conflicts = [{
      type: 'conflict', conflict_id: 'conflict-res-001',
      status: 'pending', new_slug: 'a', existing_slug: 'b',
      similarity: 0.9, polarity_flip: true,
      detected_at: new Date().toISOString(),
      reason: 'test', resolution: null, resolved_at: null,
    }];
    writeConflicts(conflicts, inboxDir);

    const result = resolveConflict('conflict-res-001', inboxDir, 'keep', 'b');
    expect(result.resolved).toBe(true);

    const raw = fs.readFileSync(path.join(inboxDir, 'conflicts', 'conflict-res-001.md'), 'utf8');
    const { data } = matter(raw);
    expect(data.status).toBe('resolved');
    expect(data.resolution).toContain('keep');
  });
});
