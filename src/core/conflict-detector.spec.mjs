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
  autoResolveConflict,
  applyAutoResolution,
  detectAndResolve,
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
  it('detects polarity flip conflict between similar nodes', async () => {
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

  it('does not flag nodes with same polarity', async () => {
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

  it('does not flag low-similarity nodes even with polarity flip', async () => {
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

  it('skips non-memory types', async () => {
    const candidate = { type: 'task', slug: 'task-1' };
    const conflicts = detectSemanticConflicts(candidate, [makeNode('n1')]);
    expect(conflicts.length).toBe(0);
  });

  it('skips inactive existing nodes', async () => {
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

  it('detects no conflict when hash matches', async () => {
    const content = '---\ntype: task\n---\nBody.\n';
    const fp = path.join(vaultRoot, 'test.md');
    fs.writeFileSync(fp, content);
    const hash = computeFileHash(vaultRoot, 'test.md');
    const result = detectPatchConflict(vaultRoot, 'test.md', hash);
    expect(result.conflicted).toBe(false);
  });

  it('detects conflict when file was modified', async () => {
    const fp = path.join(vaultRoot, 'test.md');
    fs.writeFileSync(fp, 'original');
    const hash = computeFileHash(vaultRoot, 'test.md');
    fs.writeFileSync(fp, 'modified');
    const result = detectPatchConflict(vaultRoot, 'test.md', hash);
    expect(result.conflicted).toBe(true);
    expect(result.error).toContain('modified since patch');
  });

  it('returns no conflict for non-existent file', async () => {
    const result = detectPatchConflict(vaultRoot, 'missing.md', 'abc');
    expect(result.conflicted).toBe(false);
  });

  it('detects path traversal', async () => {
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

  it('finds conflicts in a vault scan', async () => {
    const conflicts = scanVaultForConflicts(vaultRoot, { conflictThreshold: 0.70 });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].polarity_flip).toBe(true);
  });
});

describe('Conflict Persistence', () => {
  let inboxDir;

  beforeEach(() => { inboxDir = tmpDir(); });
  afterEach(() => { fs.rmSync(inboxDir, { recursive: true, force: true }); });

  it('writes conflict records to inbox', async () => {
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

  it('resolves a conflict', async () => {
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

// ─── Auto-Resolution Tests ──────────────────────────────────────────────────

describe('Auto-Resolution Engine', () => {
  function makeConflict(newOverrides = {}, existingOverrides = {}) {
    const newNode = makeNode('new-node', {
      created: '2026-05-17T10:00:00Z',
      updated: '2026-05-17T10:00:00Z',
      source: { type: 'dream-cycle', session_id: 's2', evidence_count: 1 },
      ...newOverrides,
    });
    const existingNode = makeNode('existing-node', {
      created: '2026-05-15T10:00:00Z',
      updated: '2026-05-15T10:00:00Z',
      source: { type: 'dream-cycle', session_id: 's1', evidence_count: 1 },
      sentiment_polarity: 'directive_must_not',
      modality: 'must_not',
      ...existingOverrides,
    });
    return {
      type: 'conflict',
      conflict_id: 'conflict-test-001',
      status: 'pending',
      new_slug: newNode.slug,
      existing_slug: existingNode.slug,
      similarity: 0.85,
      polarity_flip: true,
      detected_at: new Date().toISOString(),
      reason: 'test conflict',
      resolution: null,
      resolved_at: null,
      _new_node: newNode,
      _existing_node: existingNode,
    };
  }

  it('Tier 0: new user-created node (from CLI, API, or chat) always wins and auto-supersedes', async () => {
    // 1. Candidate is remember-cli, existing is machine
    const conflict1 = makeConflict(
      { source: { type: 'remember-cli', session_id: 's2', evidence_count: 1 } },
      { source: { type: 'dream-cycle', session_id: 's1', evidence_count: 1 } }
    );
    const result1 = autoResolveConflict(conflict1);
    expect(result1.resolved).toBe(true);
    expect(result1.action).toBe('supersede');
    expect(result1.winner).toBe('new-node');
    expect(result1.reason).toContain('User-created candidate node');

    // 2. Candidate is api-client, existing is user-created chat
    const conflict2 = makeConflict(
      { source: { type: 'api-client', session_id: 's2', evidence_count: 1 } },
      { source: { type: 'chat', session_id: 's1', evidence_count: 1 } }
    );
    const result2 = autoResolveConflict(conflict2);
    expect(result2.resolved).toBe(true);
    expect(result2.action).toBe('supersede');
    expect(result2.winner).toBe('new-node');

    // 3. Candidate is chat, existing is protected invariant user-created node
    const conflict3 = makeConflict(
      { source: { type: 'chat', session_id: 's2', evidence_count: 1 } },
      { source: { type: 'chat', session_id: 's1', evidence_count: 1 }, priority: 'absolute', immutable: true }
    );
    const result3 = autoResolveConflict(conflict3);
    expect(result3.resolved).toBe(true);
    expect(result3.action).toBe('supersede');
    expect(result3.winner).toBe('new-node');
  });

  it('Tier 1: quarantines when both nodes are protected invariants', async () => {
    const conflict = makeConflict(
      { priority: 'absolute', immutable: true },
      { priority: 'absolute', immutable: true },
    );
    const result = autoResolveConflict(conflict);
    expect(result.resolved).toBe(false);
    expect(result.action).toBe('quarantine');
    expect(result.reason).toContain('protected invariants');
  });

  it('Tier 2: existing protected invariant wins over non-protected new node', async () => {
    const conflict = makeConflict(
      { /* not protected */ },
      { priority: 'absolute', immutable: true },
    );
    const result = autoResolveConflict(conflict);
    expect(result.resolved).toBe(true);
    expect(result.action).toBe('keep');
    expect(result.winner).toBe('existing-node');
  });

  it('Tier 2: new protected invariant supersedes non-protected existing node', async () => {
    const conflict = makeConflict(
      { priority: 'absolute', immutable: true },
      { /* not protected */ },
    );
    const result = autoResolveConflict(conflict);
    expect(result.resolved).toBe(true);
    expect(result.action).toBe('supersede');
    expect(result.winner).toBe('new-node');
  });

  it('Tier 3: user-created node supersedes machine-generated node', async () => {
    const conflict = makeConflict(
      { source: { type: 'chat', session_id: 's2', evidence_count: 1 } },
      { source: { type: 'dream-cycle', session_id: 's1', evidence_count: 1 } },
    );
    const result = autoResolveConflict(conflict);
    expect(result.resolved).toBe(true);
    expect(result.action).toBe('supersede');
    expect(result.reason).toContain('User-created');
  });

  it('Tier 3: machine-generated node rejected in favor of user-created node', async () => {
    const conflict = makeConflict(
      { source: { type: 'optimizer', session_id: 's2', evidence_count: 1 } },
      { source: { type: 'user', session_id: 's1', evidence_count: 1 } },
    );
    const result = autoResolveConflict(conflict);
    expect(result.resolved).toBe(true);
    expect(result.action).toBe('keep');
    expect(result.reason).toContain('Machine-generated');
  });

  it('Tier 4: newer node wins when both have same source authority', async () => {
    const conflict = makeConflict(
      { source: { type: 'dream-cycle', session_id: 's2', evidence_count: 1 }, updated: '2026-05-17T12:00:00Z' },
      { source: { type: 'dream-cycle', session_id: 's1', evidence_count: 1 }, updated: '2026-05-15T12:00:00Z' },
    );
    const result = autoResolveConflict(conflict);
    expect(result.resolved).toBe(true);
    expect(result.action).toBe('supersede');
    expect(result.reason).toContain('recency');
  });

  it('Tier 4: existing node wins when it is more recent', async () => {
    const conflict = makeConflict(
      { source: { type: 'dream-cycle', session_id: 's2', evidence_count: 1 }, updated: '2026-05-10T12:00:00Z' },
      { source: { type: 'dream-cycle', session_id: 's1', evidence_count: 1 }, updated: '2026-05-17T12:00:00Z' },
    );
    const result = autoResolveConflict(conflict);
    expect(result.resolved).toBe(true);
    expect(result.action).toBe('keep');
    expect(result.reason).toContain('more recent');
  });

  it('Tier 5: quarantines when provenance and timestamps are identical', async () => {
    const ts = '2026-05-16T12:00:00Z';
    const conflict = makeConflict(
      { source: { type: 'test', session_id: 's', evidence_count: 1 }, created: ts, updated: ts },
      { source: { type: 'test', session_id: 's', evidence_count: 1 }, created: ts, updated: ts },
    );
    const result = autoResolveConflict(conflict);
    expect(result.resolved).toBe(false);
    expect(result.action).toBe('quarantine');
  });

  it('returns quarantine when provenance metadata is missing', async () => {
    const conflict = { conflict_id: 'x', status: 'pending' };
    const result = autoResolveConflict(conflict);
    expect(result.resolved).toBe(false);
    expect(result.reason).toContain('Missing');
  });
});

describe('applyAutoResolution', () => {
  let vaultRoot;

  beforeEach(() => {
    vaultRoot = tmpDir();
    const dir = path.join(vaultRoot, 'patterns');
    fs.mkdirSync(dir, { recursive: true });
  });
  afterEach(() => { fs.rmSync(vaultRoot, { recursive: true, force: true }); });

  it('marks the loser as superseded and updates the winner', async () => {
    const newNode = makeNode('html-email', {
      source: { type: 'chat', session_id: 's2', evidence_count: 1 },
      updated: '2026-05-17T10:00:00Z',
    });
    const existingNode = makeNode('plaintext-email', {
      source: { type: 'dream-cycle', session_id: 's1', evidence_count: 1 },
      sentiment_polarity: 'directive_must_not',
      modality: 'must_not',
      updated: '2026-05-15T10:00:00Z',
    });

    // Write both to the vault first
    fs.writeFileSync(
      path.join(vaultRoot, 'patterns', 'html-email.md'),
      matter.stringify('', newNode),
    );
    fs.writeFileSync(
      path.join(vaultRoot, 'patterns', 'plaintext-email.md'),
      matter.stringify('', existingNode),
    );

    const conflict = {
      conflict_id: 'test-apply', status: 'pending',
      new_slug: 'html-email', existing_slug: 'plaintext-email',
      _new_node: newNode, _existing_node: existingNode,
      reason: 'test', similarity: 0.85, polarity_flip: true,
    };
    const resolution = {
      resolved: true, action: 'supersede',
      winner: 'html-email', loser: 'plaintext-email',
      reason: 'User supersedes machine.',
    };

    const updated = await applyAutoResolution(conflict, resolution, vaultRoot);

    expect(updated.status).toBe('auto-resolved');
    expect(updated.resolution).toContain('html-email');

    // Verify the loser file was updated on disk
    const loserRaw = fs.readFileSync(
      path.join(vaultRoot, 'patterns', 'plaintext-email.md'), 'utf8',
    );
    const loserData = matter(loserRaw).data;
    expect(loserData.status).toBe('superseded');
    expect(loserData.superseded_by).toBe('html-email');

    // Verify the winner file was updated
    const winnerRaw = fs.readFileSync(
      path.join(vaultRoot, 'patterns', 'html-email.md'), 'utf8',
    );
    const winnerData = matter(winnerRaw).data;
    expect(winnerData.supersedes).toContain('plaintext-email');
  });
});

describe('detectAndResolve', () => {
  it('auto-resolves user vs machine conflict without quarantine', async () => {
    const candidate = makeNode('use-html-email', {
      title: 'Use HTML email format',
      sentiment_polarity: 'directive_must',
      modality: 'must',
      tags: ['email', 'format', 'html'],
      source: { type: 'chat', session_id: 's2', evidence_count: 1 },
      updated: '2026-05-17T10:00:00Z',
    });
    const existing = [
      makeNode('use-plaintext-email', {
        title: 'Use plaintext email format',
        sentiment_polarity: 'directive_must_not',
        modality: 'must_not',
        tags: ['email', 'format', 'plaintext'],
        source: { type: 'dream-cycle', session_id: 's1', evidence_count: 1 },
        updated: '2026-05-15T10:00:00Z',
      }),
    ];

    const { autoResolved, quarantined } = await detectAndResolve(
      candidate, existing, { thresholds: { conflictThreshold: 0.70 } },
    );
    expect(autoResolved.length).toBe(1);
    expect(quarantined.length).toBe(0);
    expect(autoResolved[0].status).toBe('auto-resolved');
  });

  it('quarantines conflicts between two absolute invariants', async () => {
    const candidate = makeNode('use-html-email', {
      title: 'Use HTML email format',
      sentiment_polarity: 'directive_must',
      modality: 'must',
      tags: ['email', 'format', 'html'],
      priority: 'absolute', immutable: true,
    });
    const existing = [
      makeNode('use-plaintext-email', {
        title: 'Use plaintext email format',
        sentiment_polarity: 'directive_must_not',
        modality: 'must_not',
        tags: ['email', 'format', 'plaintext'],
        priority: 'absolute', immutable: true,
      }),
    ];

    const { autoResolved, quarantined } = await detectAndResolve(
      candidate, existing, { thresholds: { conflictThreshold: 0.70 } },
    );
    expect(autoResolved.length).toBe(0);
    expect(quarantined.length).toBe(1);
    expect(quarantined[0].status).toBe('pending');
  });
});
