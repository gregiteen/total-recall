/**
 * fts5.test.mjs — Tests for FTS5 search index
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { openDatabase, ensureSchema, reindex, search, getStats } from '../core/fts5.mjs';

let tmpDir;
let dbPath;
let db;
let paths;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-fts5-test-'));
  dbPath = path.join(tmpDir, 'test.db');

  // Create wiki test data
  const wikiDir = path.join(tmpDir, 'memory-wiki', 'patterns');
  fs.mkdirSync(wikiDir, { recursive: true });
  fs.writeFileSync(path.join(wikiDir, 'test-pattern.md'), `---
type: pattern
confidence: high
sentiment: positive
sentiment_intensity: 7
---

# Test Pattern

> [!TIP]
> SQLite FTS5 provides fast full-text search.
`);

  // Create episode test data
  const epDir = path.join(tmpDir, 'memory', 'episodes', '2026', '05', '01');
  fs.mkdirSync(epDir, { recursive: true });
  fs.writeFileSync(path.join(epDir, 'session-test1234.md'), `---
type: episode
session_id: "test1234"
date: 2026-05-01
---

# Session test1234

## Objective
Testing the full-text search engine.
`);

  // Create daily logs dir (even if empty)
  const logsDir = path.join(tmpDir, 'memory', 'daily-logs');
  fs.mkdirSync(logsDir, { recursive: true });

  paths = {
    root: tmpDir,
    wikiDir: path.join(tmpDir, 'memory-wiki'),
    episodesDir: path.join(tmpDir, 'memory', 'episodes'),
    dailyLogsDir: logsDir,
    dbPath,
  };

  // Open and populate database
  db = openDatabase(dbPath);
  ensureSchema(db);
  reindex(db, paths);
});

after(() => {
  if (db) db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('openDatabase', () => {
  it('opens and returns a database instance', () => {
    assert.ok(db, 'Database should be opened');
  });
});

describe('ensureSchema', () => {
  it('creates the FTS5 table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map(t => t.name);
    assert.ok(tableNames.includes('memory_fts'), 'Should have memory_fts table');
  });
});

describe('reindex', () => {
  it('indexes wiki and episode files', () => {
    const stats = getStats(db, paths);
    assert.ok(stats.ftsCount >= 2, `Expected >= 2 indexed rows, got ${stats.ftsCount}`);
  });
});

describe('search', () => {
  it('finds wiki nodes', () => {
    const { results } = search(db, 'SQLite FTS5');
    assert.ok(results.length >= 1, 'Should find SQLite result');
  });

  it('finds episode content', () => {
    const { results } = search(db, 'full-text search engine');
    assert.ok(results.length >= 1, 'Should find episode result');
  });

  it('filters by source', () => {
    const { results } = search(db, 'test', { source: 'wiki' });
    for (const r of results) {
      assert.equal(r.source, 'wiki');
    }
  });

  it('respects limit parameter', () => {
    const { results } = search(db, 'test', { limit: 1 });
    assert.ok(results.length <= 1);
  });

  it('returns empty for no matches', () => {
    const { results } = search(db, 'xyznonexistentquery123');
    assert.equal(results.length, 0);
  });

  it('handles special characters safely', () => {
    assert.doesNotThrow(() => {
      search(db, 'test (with) "quotes" AND OR');
    });
  });
});

describe('getStats', () => {
  it('returns index statistics', () => {
    const stats = getStats(db, paths);
    assert.ok('ftsCount' in stats);
    assert.ok('wikiNodes' in stats);
    assert.ok(stats.ftsCount >= 2);
  });
});
