/**
 * wiki.test.mjs — Tests for wiki node operations
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createNode, loadNodes, lint } from '../core/wiki.mjs';

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-wiki-test-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('createNode', () => {
  it('creates a wiki node with frontmatter', () => {
    const result = createNode(tmpDir, {
      slug: 'test-pattern',
      type: 'pattern',
      directive: 'Always do the right thing.',
      sentiment: 'positive',
      intensity: 7,
      provenance: ['episode:test-123'],
    });

    assert.ok(result.filePath, 'Should return filePath');
    assert.equal(result.slug, 'test-pattern');
    assert.ok(fs.existsSync(result.filePath), 'File should exist');

    const content = fs.readFileSync(result.filePath, 'utf-8');
    assert.ok(content.includes('type: pattern'));
    assert.ok(content.includes('confidence: high'));
    assert.ok(content.includes('sentiment: positive'));
    assert.ok(content.includes('# Always do the right thing'));
    assert.ok(content.includes('[!TIP]'));
  });

  it('creates anti-pattern with CAUTION alert', () => {
    const result = createNode(tmpDir, {
      slug: 'bad-practice',
      type: 'anti-pattern',
      directive: 'Never do this.',
      sentiment: 'negative',
      intensity: 8,
      provenance: ['episode:test-456'],
    });

    const content = fs.readFileSync(result.filePath, 'utf-8');
    assert.ok(content.includes('[!CAUTION]'));
    assert.ok(result.filePath.includes('anti-patterns'));
  });

  it('creates concept with IMPORTANT alert', () => {
    const result = createNode(tmpDir, {
      slug: 'key-idea',
      type: 'concept',
      directive: 'Remember this.',
      sentiment: 'neutral',
      intensity: 5,
      provenance: ['episode:test-789'],
    });

    const content = fs.readFileSync(result.filePath, 'utf-8');
    assert.ok(content.includes('[!IMPORTANT]'));
  });

  it('creates conclusion with IMPORTANT alert', () => {
    const result = createNode(tmpDir, {
      slug: 'verified-fact',
      type: 'conclusion',
      directive: 'This was confirmed by research.',
      sentiment: 'neutral',
      intensity: 6,
      provenance: ['research:2026-05-01'],
    });

    const content = fs.readFileSync(result.filePath, 'utf-8');
    assert.ok(content.includes('[!IMPORTANT]'));
    assert.ok(result.filePath.includes('conclusions'));
  });

  it('handles related links', () => {
    const result = createNode(tmpDir, {
      slug: 'with-links',
      type: 'pattern',
      directive: 'Linked pattern.',
      sentiment: 'positive',
      intensity: 5,
      provenance: ['episode:test'],
      related: ['test-pattern', 'key-idea'],
    });

    const content = fs.readFileSync(result.filePath, 'utf-8');
    assert.ok(content.includes('[[test-pattern]]'));
    assert.ok(content.includes('[[key-idea]]'));
  });

  it('reports existing files', () => {
    createNode(tmpDir, {
      slug: 'dup-test',
      type: 'pattern',
      directive: 'First write.',
      sentiment: 'positive',
      intensity: 5,
      provenance: ['episode:first'],
    });

    const r2 = createNode(tmpDir, {
      slug: 'dup-test',
      type: 'pattern',
      directive: 'Overwrite.',
      sentiment: 'positive',
      intensity: 5,
      provenance: ['episode:second'],
    });

    assert.equal(r2.exists, true);
  });
});

describe('loadNodes', () => {
  it('loads all nodes from directory', () => {
    const nodes = loadNodes(tmpDir);
    assert.ok(nodes.length > 0, 'Should find nodes');
    for (const node of nodes) {
      assert.ok(node.slug, 'Each node should have a slug');
      assert.ok(node.type, 'Each node should have a type');
    }
  });
});

describe('lint', () => {
  it('validates wiki integrity', () => {
    const result = lint(tmpDir);
    assert.ok('pages' in result, 'Should report pages count');
    assert.ok('issues' in result, 'Should report issues');
    assert.ok('errors' in result.issues);
    assert.ok('warnings' in result.issues);
  });
});
