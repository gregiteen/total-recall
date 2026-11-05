import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { checkDuplicateRule, assertNoDuplicateRule, tokenize, jaccard } from './duplicate-guard.mjs';

describe('duplicate-guard (Hermes Fail-Closed Memory Gatekeeper)', () => {
  let tmpDir;
  let vaultDir;
  let derivedDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-dup-guard-'));
    vaultDir = path.join(tmpDir, 'memory-vault');
    derivedDir = path.join(tmpDir, 'memory-derived');

    fs.mkdirSync(path.join(vaultDir, 'invariants'), { recursive: true });
    fs.mkdirSync(derivedDir, { recursive: true });

    // Seed existing invariant
    const existingInvariant = [
      '---',
      'type: memory',
      'slug: invariants-530a41b1',
      'category: invariants',
      'title: Model APIs Documentation Search',
      'status: active',
      'priority: absolute',
      'immutable: true',
      'created: 2026-05-01T00:00:00.000Z',
      'updated: 2026-05-01T00:00:00.000Z',
      'schema_version: 2',
      '---',
      'Search current official documentation before using APIs, especially model APIs. Never hardcode model names.',
    ].join('\n');

    fs.writeFileSync(
      path.join(vaultDir, 'invariants', 'invariants-530a41b1.md'),
      existingInvariant,
      'utf8'
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('correctly tokenizes text into lowercase word tokens', () => {
    const tokens = tokenize('Search current official documentation before using APIs!');
    expect(tokens.has('search')).toBe(true);
    expect(tokens.has('doc')).toBe(true);
    expect(tokens.has('api')).toBe(true);
    expect(tokens.has('!')).toBe(false);
  });

  it('computes accurate Jaccard similarity', () => {
    const setA = new Set(['model', 'search', 'docs']);
    const setB = new Set(['model', 'search', 'docs', 'pricing']);
    const sim = jaccard(setA, setB);
    expect(sim).toBe(0.75);
  });

  it('detects exact duplicate rule and flags collision', () => {
    const candidate = {
      category: 'invariants',
      slug: 'invariants-test-exact',
      title: 'Model APIs Documentation Search',
      body: 'Search current official documentation before using APIs, especially model APIs. Never hardcode model names.',
    };

    const res = checkDuplicateRule(candidate, { vaultDir, derivedDir, projectRoot: tmpDir });
    expect(res.isDuplicate).toBe(true);
    expect(res.matchedNode.slug).toBe('invariants-530a41b1');
    expect(res.similarity).toBe(1.0);
  });

  it('detects high-similarity paraphrased duplicate rule', () => {
    const candidate = {
      category: 'invariants',
      slug: 'invariants-test-paraphrase',
      title: 'Search documentation for model APIs',
      body: 'Search current official documentation before using model APIs. Never hardcode model names.',
    };

    const res = checkDuplicateRule(candidate, { vaultDir, derivedDir, projectRoot: tmpDir });
    expect(res.isDuplicate).toBe(true);
    expect(res.matchedNode.slug).toBe('invariants-530a41b1');
    expect(res.similarity).toBeGreaterThanOrEqual(0.7);
  });

  it('allows unique, non-overlapping rules', () => {
    const candidate = {
      category: 'invariants',
      slug: 'invariants-git-push',
      title: 'Never push without user request',
      body: 'Never push git commits unless Greg explicitly gives the instruction to push.',
    };

    const res = checkDuplicateRule(candidate, { vaultDir, derivedDir, projectRoot: tmpDir });
    expect(res.isDuplicate).toBe(false);
  });

  it('searches only the vaults it is given, never one found through HOME', () => {
    const home = path.join(tmpDir, 'home');
    const homeVault = path.join(home, '.agent', 'skills', 'total-recall', 'memory-vault');
    fs.mkdirSync(path.join(homeVault, 'invariants'), { recursive: true });
    const body = 'Rotate the staging signing keys every ninety days without exception.';
    fs.writeFileSync(path.join(homeVault, 'invariants', 'home-rule.md'), `---\nslug: home-rule\ncategory: invariants\nstatus: active\n---\n\n${body}\n`);
    const candidate = { slug: 'new-rule', category: 'invariants', body };
    const originalHome = process.env.HOME;
    process.env.HOME = home;
    try {
      expect(checkDuplicateRule(candidate, { vaultDir, projectRoot: tmpDir }).isDuplicate).toBe(false);
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it('assertNoDuplicateRule throws ERR_DUPLICATE_RULE and writes to incidents.jsonl on collision', () => {
    const candidate = {
      category: 'invariants',
      slug: 'invariants-test-fail-closed',
      title: 'Model APIs Documentation Search',
      body: 'Search current official documentation before using APIs, especially model APIs. Never hardcode model names.',
    };

    expect(() => {
      assertNoDuplicateRule(candidate, { vaultDir, derivedDir, projectRoot: tmpDir });
    }).toThrowError(/Rule already exists: \[invariants-530a41b1\]/);

    const logPath = path.join(derivedDir, 'incidents.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);

    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(1);

    const incident = JSON.parse(lines[0]);
    expect(incident.event).toBe('rule_write_rejected');
    expect(incident.existing.slug).toBe('invariants-530a41b1');
    expect(incident.attempted.body).toContain('Search current official documentation');
  });

  it('ignores non-rule categories (facts, lore, concepts)', () => {
    const candidateFact = {
      category: 'facts',
      slug: 'facts-model-apis',
      title: 'Model APIs Documentation Search',
      body: 'Search current official documentation before using APIs, especially model APIs. Never hardcode model names.',
    };

    const res = checkDuplicateRule(candidateFact, { vaultDir, derivedDir, projectRoot: tmpDir });
    expect(res.isDuplicate).toBe(false);
  });
});
