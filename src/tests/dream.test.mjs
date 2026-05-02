/**
 * dream.test.mjs — Tests for dream daemon (NREM, REM, decay, pruning)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runConfidenceDecay, nremConsolidate, remCrossReference, pruneStaleNodes, regenerateMemoryMd, dream } from '../core/dream.mjs';

let tmpDir;
let wikiDir;
let logsDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-dream-test-'));
  wikiDir = path.join(tmpDir, 'memory-wiki', 'patterns');
  logsDir = path.join(tmpDir, 'memory');
  fs.mkdirSync(wikiDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  // Create test wiki nodes
  fs.writeFileSync(path.join(wikiDir, 'fresh-pattern.md'), `---
type: pattern
confidence: high
sentiment: positive
sentiment_intensity: 7
last_verified: ${new Date().toISOString().split('T')[0]}
access_count: 5
related: []
---

# Fresh Pattern

> [!TIP]
> This is a fresh, frequently accessed pattern.
`);

  fs.writeFileSync(path.join(wikiDir, 'stale-decision.md'), `---
type: decision
confidence: high
sentiment: neutral
sentiment_intensity: 5
last_verified: 2025-01-01
access_count: 1
related: []
---

# Stale Decision

> [!NOTE]
> This decision was made long ago and should decay.
`);

  fs.writeFileSync(path.join(wikiDir, 'prune-candidate.md'), `---
type: pattern
confidence: low
sentiment: neutral
sentiment_intensity: 3
last_verified: 2024-01-01
access_count: 0
related: []
---

# Prune Candidate

> [!TIP]
> Zero access, low confidence, very old. Should be pruned.
`);

  // Create a test daily log
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  fs.writeFileSync(path.join(logsDir, `${yesterday}.md`), `# Daily Log ${yesterday}

- **[pattern]** Always use FTS5 for search
- **[critical-failure]** Never run tsc directly
- **[user-preference]** Dark mode is preferred
- **[general]** Had a productive session
`);
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runConfidenceDecay', () => {
  it('decays stale nodes', () => {
    const parentWiki = path.join(tmpDir, 'memory-wiki');
    const result = runConfidenceDecay(parentWiki, { dryRun: true });
    assert.ok(result.decayed >= 1, `Expected at least 1 decayed, got ${result.decayed}`);

    const staleDetail = result.details.find(d => d.slug === 'stale-decision');
    assert.ok(staleDetail, 'Should flag stale-decision');
    assert.equal(staleDetail.from, 'high');
  });

  it('preserves fresh nodes', () => {
    const parentWiki = path.join(tmpDir, 'memory-wiki');
    const result = runConfidenceDecay(parentWiki, { dryRun: true });
    const freshDetail = result.details.find(d => d.slug === 'fresh-pattern');
    assert.equal(freshDetail, undefined, 'Fresh node should NOT be decayed');
  });
});

describe('nremConsolidate', () => {
  it('extracts entries from daily logs', () => {
    const parentWiki = path.join(tmpDir, 'memory-wiki');
    const result = nremConsolidate({ dailyLogsDir: logsDir, wikiDir: parentWiki });
    assert.ok(result.consolidated >= 0, 'Should return consolidated count');
    assert.ok(result.totalLogs >= 1, `Expected >= 1 log, got ${result.totalLogs}`);
  });
});

describe('remCrossReference', () => {
  it('detects orphaned nodes', () => {
    const parentWiki = path.join(tmpDir, 'memory-wiki');
    const result = remCrossReference({ wikiDir: parentWiki });
    assert.ok(result.orphanedNodes.length > 0, 'Should find orphaned nodes (no related links)');
  });

  it('detects stale nodes', () => {
    const parentWiki = path.join(tmpDir, 'memory-wiki');
    const result = remCrossReference({ wikiDir: parentWiki });
    assert.ok(result.staleNodes.length >= 1, 'Should find stale node');
  });
});

describe('pruneStaleNodes', () => {
  it('identifies prunable nodes (dry run)', () => {
    const parentWiki = path.join(tmpDir, 'memory-wiki');
    const result = pruneStaleNodes({ wikiDir: parentWiki, root: tmpDir, dryRun: true });
    assert.ok(result.pruned >= 1, `Expected >= 1 prunable, got ${result.pruned}`);

    const candidate = result.details.find(d => d.slug === 'prune-candidate');
    assert.ok(candidate, 'Should identify prune-candidate');
  });
});

describe('regenerateMemoryMd', () => {
  it('generates MEMORY.md from wiki', () => {
    const parentWiki = path.join(tmpDir, 'memory-wiki');
    const memPath = path.join(tmpDir, 'MEMORY.md');
    const result = regenerateMemoryMd({ wikiDir: parentWiki, memoryMd: memPath, dryRun: true });

    assert.ok(result.nodeCount >= 3, `Expected >= 3 nodes, got ${result.nodeCount}`);
    assert.ok(result.categoryBreakdown.pattern >= 2);
  });
});

describe('dream (full cycle)', () => {
  it('runs complete dream cycle (dry run)', () => {
    const parentWiki = path.join(tmpDir, 'memory-wiki');
    const result = dream({
      wikiDir: parentWiki,
      dailyLogsDir: logsDir,
      memoryMd: path.join(tmpDir, 'MEMORY.md'),
      root: tmpDir,
      dreamsFile: path.join(tmpDir, 'DREAMS.md'),
      dryRun: true,
    });

    assert.ok(result.timestamp);
    assert.ok(result.confidenceDecay);
    assert.ok(result.nrem);
    assert.ok(result.rem);
    assert.ok(result.prune);
    assert.ok(result.memory);
    assert.ok(result.summary.includes('Dream'));
  });
});
