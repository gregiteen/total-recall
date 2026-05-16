import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';
import { detectIndexDrift, checkEventLogIntegrity } from './drift-detector.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ssss-drift-'));
}

function writeNode(vaultDir, slug, overrides = {}) {
  const node = {
    type: 'memory', slug, category: 'test', title: `Test ${slug}`,
    status: 'active', confidence: 0.9, importance: 3,
    created: new Date().toISOString(), updated: new Date().toISOString(),
    last_accessed: new Date().toISOString(),
    ...overrides
  };
  const dir = path.join(vaultDir, 'test');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${slug}.md`), matter.stringify('Body', node));
}

function writeIndex(derivedDir, entries) {
  if (!fs.existsSync(derivedDir)) fs.mkdirSync(derivedDir, { recursive: true });
  fs.writeFileSync(
    path.join(derivedDir, 'graph-index.jsonl'),
    entries.map(e => JSON.stringify(e)).join('\n')
  );
}

describe('Drift Detector', () => {
  let vaultDir, derivedDir;

  beforeEach(() => {
    vaultDir = tmpDir();
    derivedDir = tmpDir();
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
    fs.rmSync(derivedDir, { recursive: true, force: true });
  });

  it('detects total drift if index is missing', () => {
    const result = detectIndexDrift(vaultDir, derivedDir);
    expect(result.drifted).toBe(true);
  });

  it('detects 0 drift when fully synchronized', () => {
    writeNode(vaultDir, 'node-1', { title: 'T1', category: 'C1', status: 'active', confidence: 0.9 });
    writeIndex(derivedDir, [{ slug: 'node-1', title: 'T1', category: 'C1', status: 'active', confidence: 0.9 }]);
    
    const result = detectIndexDrift(vaultDir, derivedDir);
    expect(result.drifted).toBe(false);
  });

  it('detects missing nodes in index', () => {
    writeNode(vaultDir, 'node-1');
    writeNode(vaultDir, 'node-2');
    writeIndex(derivedDir, [{ slug: 'node-1', title: 'Test node-1', category: 'test', status: 'active', confidence: 0.9 }]);
    
    const result = detectIndexDrift(vaultDir, derivedDir);
    expect(result.drifted).toBe(true);
    expect(result.missing_in_index).toContain('node-2');
  });

  it('detects ghost nodes in index', () => {
    writeNode(vaultDir, 'node-1');
    writeIndex(derivedDir, [
      { slug: 'node-1', title: 'Test node-1', category: 'test', status: 'active', confidence: 0.9 },
      { slug: 'node-ghost', title: 'Ghost', category: 'test', status: 'active', confidence: 0.9 }
    ]);
    
    const result = detectIndexDrift(vaultDir, derivedDir);
    expect(result.drifted).toBe(true);
    expect(result.missing_in_vault).toContain('node-ghost');
  });

  it('detects stale properties in index', () => {
    writeNode(vaultDir, 'node-1', { confidence: 0.95 }); // Updated in vault
    writeIndex(derivedDir, [{ slug: 'node-1', title: 'Test node-1', category: 'test', status: 'active', confidence: 0.9 }]); // Stale in index
    
    const result = detectIndexDrift(vaultDir, derivedDir);
    expect(result.drifted).toBe(true);
    expect(result.stale_in_index).toContain('node-1');
  });
});

describe('Event Log Integrity', () => {
  let logDir;

  beforeEach(() => { logDir = tmpDir(); });
  afterEach(() => { fs.rmSync(logDir, { recursive: true, force: true }); });

  it('passes valid append-only log', () => {
    const fp = path.join(logDir, 'events.jsonl');
    fs.writeFileSync(fp, [
      JSON.stringify({ ts: '2026-05-16T10:00:00Z', type: 'a' }),
      JSON.stringify({ ts: '2026-05-16T10:01:00Z', type: 'b' }),
      JSON.stringify({ ts: '2026-05-16T10:02:00Z', type: 'c' })
    ].join('\n'));

    const result = checkEventLogIntegrity(fp);
    expect(result.ok).toBe(true);
    expect(result.events_checked).toBe(3);
  });

  it('detects temporal violation', () => {
    const fp = path.join(logDir, 'events.jsonl');
    fs.writeFileSync(fp, [
      JSON.stringify({ ts: '2026-05-16T10:02:00Z', type: 'a' }),
      JSON.stringify({ ts: '2026-05-16T10:01:00Z', type: 'b' }), // Before previous
    ].join('\n'));

    const result = checkEventLogIntegrity(fp);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Temporal violation');
  });

  it('detects malformed json', () => {
    const fp = path.join(logDir, 'events.jsonl');
    fs.writeFileSync(fp, 'not-json');
    
    const result = checkEventLogIntegrity(fp);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Parse failure');
  });
});
