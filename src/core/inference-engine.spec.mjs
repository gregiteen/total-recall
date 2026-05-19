import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tr-infer-'));
}

function makeNode(vaultDir, slug, overrides = {}) {
  const category = overrides.category || 'patterns';
  const dir = path.join(vaultDir, category);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const data = {
    type: 'memory',
    slug,
    category,
    title: `Title for ${slug}`,
    status: 'active',
    confidence: 0.85,
    importance: 3,
    tags: ['test'],
    modality: 'must',
    subject: 'agent',
    predicate: 'do',
    object: 'thing',
    schema_version: 2,
    decay: { half_life_days: 180, access_count: 1 },
    source: { type: 'test', session_id: 's1', evidence_count: 1 },
    sentiment_polarity: 'directive_must',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    last_accessed: new Date().toISOString(),
    supersedes: [],
    superseded_by: null,
    contradicts: [],
    related: [],
    routes_to_skills: [],
    ...overrides,
  };

  const filepath = path.join(dir, `${slug}.md`);
  fs.writeFileSync(filepath, matter.stringify(`Body for ${slug}.`, data));
  return filepath;
}

// ─── Inference Engine ────────────────────────────────────────────────────────────

describe('inference-engine module loads', () => {
  it('exports expected functions', async () => {
    const mod = await import('./inference-engine.mjs');
    expect(typeof mod.runInferenceTask).toBe('function');
    expect(typeof mod.runSynthesisTask).toBe('function');
  });
});

describe('runInferenceTask — skips with too few nodes', () => {
  let vaultDir, inboxDir;
  beforeEach(() => {
    vaultDir = tmpDir();
    inboxDir = tmpDir();
  });
  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
    fs.rmSync(inboxDir, { recursive: true, force: true });
  });

  it('returns skipped when slugs do not exist in vault', async () => {
    const { runInferenceTask } = await import('./inference-engine.mjs');
    const result = await runInferenceTask(
      ['nonexistent-slug-a', 'nonexistent-slug-b'],
      { vaultDir, inboxDir, runtimeConfig: { runtime: 'ollama', model: 'test', endpoint: 'http://localhost:11434' } },
    );
    expect(result.skipped).toBe('too-few-nodes');
    expect(result.conclusions).toEqual([]);
  });

  it('returns skipped when only one node exists', async () => {
    const { runInferenceTask } = await import('./inference-engine.mjs');
    makeNode(vaultDir, 'solo-node');
    const result = await runInferenceTask(
      ['solo-node'],
      { vaultDir, inboxDir, runtimeConfig: { runtime: 'ollama', model: 'test', endpoint: 'http://localhost:11434' } },
    );
    expect(result.skipped).toBe('too-few-nodes');
  });
});

// ─── Clarity Rewriter ────────────────────────────────────────────────────────────

describe('clarity-rewriter module loads', () => {
  it('exports expected functions', async () => {
    const mod = await import('./clarity-rewriter.mjs');
    expect(typeof mod.runClarityReview).toBe('function');
    expect(typeof mod.runStalenessCheck).toBe('function');
    expect(typeof mod.runFactSeeker).toBe('function');
  });
});

describe('runClarityReview — node not found', () => {
  let vaultDir, inboxDir;
  beforeEach(() => {
    vaultDir = tmpDir();
    inboxDir = tmpDir();
  });
  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
    fs.rmSync(inboxDir, { recursive: true, force: true });
  });

  it('returns error when node does not exist', async () => {
    const { runClarityReview } = await import('./clarity-rewriter.mjs');
    const result = await runClarityReview('nonexistent', {
      vaultDir,
      inboxDir,
      runtimeConfig: { runtime: 'ollama', model: 'test', endpoint: 'http://localhost:11434' },
    });
    expect(result.rewrote).toBe(false);
    expect(result.error).toBe('Node not found');
  });
});

describe('runStalenessCheck — node not found', () => {
  let vaultDir, queueDir;
  beforeEach(() => {
    vaultDir = tmpDir();
    queueDir = tmpDir();
  });
  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
    fs.rmSync(queueDir, { recursive: true, force: true });
  });

  it('returns STILL_VALID with error when node does not exist', async () => {
    const { runStalenessCheck } = await import('./clarity-rewriter.mjs');
    const result = await runStalenessCheck('nonexistent', {
      vaultDir,
      queueDir,
      runtimeConfig: { runtime: 'ollama', model: 'test', endpoint: 'http://localhost:11434' },
    });
    expect(result.verdict).toBe('STILL_VALID');
    expect(result.error).toBe('Node not found');
  });
});

describe('runFactSeeker — empty vault', () => {
  let vaultDir, queueDir;
  beforeEach(() => {
    vaultDir = tmpDir();
    queueDir = tmpDir();
  });
  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
    fs.rmSync(queueDir, { recursive: true, force: true });
  });

  it('returns skipped for empty vault', async () => {
    const { runFactSeeker } = await import('./clarity-rewriter.mjs');
    const result = await runFactSeeker({
      vaultDir,
      queueDir,
      runtimeConfig: { runtime: 'ollama', model: 'test', endpoint: 'http://localhost:11434' },
    });
    expect(result.skipped).toBe('empty-vault');
    expect(result.gaps).toEqual([]);
  });
});
