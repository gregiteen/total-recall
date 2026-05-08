/**
 * hardening.test.mjs — Tests for Total Recall hardening features
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';

import { heal, createNode } from '../core/wiki.mjs';
import { detectDuplicate } from '../core/steering.mjs';
import { inferEdges } from '../core/graph.mjs';

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-hardening-test-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('heal', () => {
  it('heals missing frontmatter fields and invalid types', () => {
    // Create a node directly to bypass createNode's perfect frontmatter
    const fp = path.join(tmpDir, 'heal-test.md');
    fs.writeFileSync(fp, '---\ntype: invalid_type\n---\n# Test\n');

    const healRes = heal(tmpDir);
    assert.ok(healRes.healed >= 1, 'Should heal at least one node');

    const updated = fs.readFileSync(fp, 'utf-8');
    assert.ok(updated.includes('type: concept'), 'Should have corrected the invalid type to concept');
    assert.ok(updated.includes('provenance:'), 'Should have added provenance');
  });
});

describe('detectDuplicate', () => {
  it('detects a duplicate directive based on Jaccard threshold', () => {
    createNode(tmpDir, {
      slug: 'dup-base',
      type: 'concept',
      directive: 'The quick brown fox jumps over the lazy dog',
      sentiment: 'neutral',
      intensity: 5,
      provenance: ['test']
    });

    // Body includes markdown boilerplate, so intersection ratio will be lower
    const isDup = detectDuplicate(tmpDir, 'The quick brown fox jumps over the lazy dog', { threshold: 0.3 });
    assert.ok(isDup !== null, 'Should detect similarity and return the duplicate node');
    assert.equal(isDup.slug, 'dup-base');

    const notDup = detectDuplicate(tmpDir, 'artificial intelligence is very cool', { threshold: 0.3 });
    assert.equal(notDup, null, 'Should not detect unrelated strings as duplicates');
  });
});

describe('inferEdges', () => {
  let db;

  before(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE graph_nodes (
        slug TEXT PRIMARY KEY,
        meaning TEXT,
        action_type TEXT
      );
    `);
  });

  after(() => {
    db.close();
  });

  it('infers related-to edges between nodes with high Jaccard similarity', async () => {
    db.exec(`
      INSERT INTO graph_nodes (slug, meaning, action_type) VALUES 
      ('node-1', 'The agent must always use skills for everything.', 'inject'),
      ('node-2', 'The agent should use skills for all tasks.', 'inject'),
      ('node-3', 'Unrelated node about styling css.', 'inject')
    `);

    const edges = await inferEdges(db, {});
    assert.ok(edges.length > 0, 'Should infer at least one edge');
    const hasEdge = edges.find(e => 
      (e.source === 'node-1' && e.target === 'node-2') || 
      (e.source === 'node-2' && e.target === 'node-1')
    );
    assert.ok(hasEdge, 'Should infer edge between node-1 and node-2');
    assert.equal(hasEdge.type, 'related-to');
  });

  it('infers conflicts-with edges when action_types differ', async () => {
    db.exec(`
      INSERT INTO graph_nodes (slug, meaning, action_type) VALUES 
      ('node-4', 'The agent must always use skills for everything.', 'suppress')
    `);

    const edges = await inferEdges(db, {});
    const conflictEdge = edges.find(e => 
      (e.source === 'node-1' && e.target === 'node-4') || 
      (e.source === 'node-4' && e.target === 'node-1')
    );
    assert.ok(conflictEdge, 'Should infer edge between node-1 and node-4');
    assert.equal(conflictEdge.type, 'conflicts-with');
  });
});
