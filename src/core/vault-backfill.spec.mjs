// @vitest-environment node
/**
 * The backfill rewrites the user's own memory at scale, so the properties that
 * matter are as much about restraint as repair: it must not invent content, it
 * must not silently drop nodes it cannot express, and its report must describe
 * the vault as it is on disk rather than as it would be afterwards.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';
import {
  analyzeVault, backfillVault, normalizeLegacyShapes, walkVaultNodes,
} from './vault-backfill.mjs';

let vaultDir;

function seed(rel, data, body = 'content') {
  const file = path.join(vaultDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, matter.stringify(body, data));
  return file;
}

function validMemory(slug, extra = {}) {
  const now = new Date().toISOString();
  return {
    type: 'memory', slug, category: 'facts', title: slug,
    description: `${slug} description`, timestamp: now,
    status: 'active', schema_version: 2, confidence: 0.5, importance: 3,
    modality: 'descriptive', subject: 'agent', predicate: 'know', object: slug,
    sentiment_polarity: 'descriptive', sentiment_target: slug,
    created: now, updated: now, last_accessed: now,
    source: { type: 'test', session_id: 'test', evidence_count: 1 },
    decay: { half_life_days: 60, access_count: 0 },
    ...extra,
  };
}

beforeEach(() => {
  vaultDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-bf-')), 'memory-vault');
  fs.mkdirSync(vaultDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(path.dirname(vaultDir), { recursive: true, force: true });
});

describe('normalizeLegacyShapes', () => {
  it('carries the repo-sync source string into the object form without losing it', () => {
    const { data, repairs } = normalizeLegacyShapes({
      source: 'repo-sync:portfolio-site:vault/tasks/plan.md',
    });
    expect(data.source).toEqual({
      type: 'repo-sync',
      session_id: 'portfolio-site:vault/tasks/plan.md',
      agent: 'repo-sync',
      evidence_count: 1,
    });
    expect(repairs).toContain('source');
  });

  it('keeps a bare source label rather than discarding it for a default', () => {
    const { data } = normalizeLegacyShapes({ source: 'portfolio_direct' });
    expect(data.source.type).toBe('portfolio_direct');
    expect(data.source.session_id).toBe('portfolio_direct');
  });

  it('preserves the old decay number as the access count', () => {
    const { data } = normalizeLegacyShapes({ decay: 4 });
    expect(data.decay).toEqual({ half_life_days: 365, access_count: 4 });
  });

  it('stringifies Date values that YAML parsed out of unquoted timestamps', () => {
    const when = new Date('2026-01-02T03:04:05.000Z');
    const { data } = normalizeLegacyShapes({ created: when, updated: when });
    expect(data.created).toBe('2026-01-02T03:04:05.000Z');
    expect(data.updated).toBe('2026-01-02T03:04:05.000Z');
  });

  it('leaves already-correct values untouched', () => {
    const source = { type: 'cli', session_id: 's', evidence_count: 1 };
    const { data, repairs } = normalizeLegacyShapes({ source, decay: { half_life_days: 30, access_count: 2 } });
    expect(data.source).toBe(source);
    expect(repairs).toHaveLength(0);
  });
});

describe('walkVaultNodes', () => {
  it('skips OKF bundle artifacts and Dataview dashboards', () => {
    seed('facts/real.md', validMemory('real'));
    seed('index.md', { type: 'bundle' });
    seed('log.md', { type: 'bundle' });
    seed('queries/conflicts.md', { type: 'query', title: 'Conflicts' });

    const found = walkVaultNodes(vaultDir).map((f) => path.basename(f));
    expect(found).toEqual(['real.md']);
  });
});

describe('analyzeVault', () => {
  it('counts validity as it is on disk, not as it would be after repair', async () => {
    seed('facts/ok.md', validMemory('ok'));
    seed('facts/broken.md', validMemory('broken', { source: 'repo-sync:a:b.md', decay: 0 }));

    const report = await analyzeVault(vaultDir);
    expect(report.total).toBe(2);
    expect(report.valid).toBe(1);
    expect(report.invalid).toBe(1);
    expect(report.repairable).toBe(1);
    expect(report.unfixable).toHaveLength(0);
  });

  it('separates nodes it cannot express from ones it can', async () => {
    // A slug outside the safe-name allowlist cannot be written by the contract
    // at all — reporting it as repairable would promise a fix that never lands.
    seed('facts/weird.md', validMemory('has/slash'));
    const report = await analyzeVault(vaultDir);
    expect(report.repairable).toBe(0);
    expect(report.unfixable).toHaveLength(1);
  });

  it('records unreadable files instead of throwing', async () => {
    fs.mkdirSync(path.join(vaultDir, 'facts'), { recursive: true });
    fs.writeFileSync(path.join(vaultDir, 'facts', 'bad.md'), '---\n: : :\nnot: [valid\n---\n');
    const report = await analyzeVault(vaultDir);
    expect(report.unreadable.length + report.invalid).toBeGreaterThan(0);
  });
});

describe('backfillVault', () => {
  it('repairs shape corruption in place and keeps the node where it was', async () => {
    const file = seed('facts/broken.md', validMemory('broken', {
      source: 'repo-sync:portfolio-site:vault/x.md',
      decay: 0,
    }));

    const result = await backfillVault(vaultDir, { snapshot: false });
    expect(result.repaired).toBe(1);
    expect(result.failed).toHaveLength(0);

    const { data } = matter(fs.readFileSync(file, 'utf8'));
    expect(data.source.type).toBe('repo-sync');
    expect(data.source.session_id).toBe('portfolio-site:vault/x.md');
    expect(data.decay.access_count).toBe(0);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('does not touch nodes that are already valid', async () => {
    const file = seed('facts/ok.md', validMemory('ok'));
    const before = fs.readFileSync(file, 'utf8');
    const result = await backfillVault(vaultDir, { snapshot: false });
    expect(result.repaired).toBe(0);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('honours --limit so a run can be rehearsed on a small batch', async () => {
    for (let i = 0; i < 5; i += 1) {
      seed(`facts/n${i}.md`, validMemory(`n${i}`, { source: 'legacy', decay: 0 }));
    }
    const result = await backfillVault(vaultDir, { snapshot: false, limit: 2 });
    expect(result.repaired).toBe(2);

    const after = await analyzeVault(vaultDir);
    expect(after.invalid).toBe(3);
  });

  it('leaves the body intact', async () => {
    const file = seed('facts/b.md', validMemory('b', { source: 'legacy', decay: 0 }), 'the original body');
    await backfillVault(vaultDir, { snapshot: false });
    expect(matter(fs.readFileSync(file, 'utf8')).content).toContain('the original body');
  });
});

describe('snapshot round-trip targets the right vault', () => {
  // createSnapshot always archived the global vault and rollbackVault always
  // restored into it, so a project-vault snapshot would have deleted the global
  // vault and unpacked the wrong nodes over it. The safety net pointed at the
  // wrong data — worse than none, because it reads as protection. The backfill
  // relies on it, so it is exercised here against a real filesystem.
  it('restores the vault the snapshot came from', async () => {
    const { createSnapshot, rollbackVault } = await import('./snapshot.mjs');
    seed('facts/a.md', validMemory('a'), 'original body');

    const snap = createSnapshot('test-project', vaultDir);
    expect(snap.success).toBe(true);

    fs.writeFileSync(path.join(vaultDir, 'facts', 'a.md'), 'clobbered');
    const restored = rollbackVault(snap.snapshot_id);

    expect(restored.success).toBe(true);
    expect(restored.vault_dir).toBe(vaultDir);
    expect(fs.readFileSync(path.join(vaultDir, 'facts', 'a.md'), 'utf8')).toContain('original body');
  });
});
