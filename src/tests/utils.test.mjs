/**
 * utils.test.mjs — Tests for core utilities
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, slugify, extractTitle } from '../core/utils.mjs';

describe('parseFrontmatter', () => {
  it('parses simple key-value pairs', () => {
    const content = `---
type: pattern
confidence: high
---

# My Node`;
    const { meta, body } = parseFrontmatter(content);
    assert.equal(meta.type, 'pattern');
    assert.equal(meta.confidence, 'high');
    assert.ok(body.includes('# My Node'));
  });

  it('parses array values', () => {
    const content = `---
type: concept
related:
  - "[[foo]]"
  - "[[bar]]"
provenance:
  - "episode:2026-05-01"
---

Body text`;
    const { meta } = parseFrontmatter(content);
    assert.equal(meta.type, 'concept');
    assert.deepEqual(meta.related, ['foo', 'bar']);
    assert.deepEqual(meta.provenance, ['episode:2026-05-01']);
  });

  it('parses empty arrays', () => {
    const content = `---
related: []
---

Body`;
    const { meta } = parseFrontmatter(content);
    assert.deepEqual(meta.related, []);
  });

  it('parses numeric values', () => {
    const content = `---
sentiment_intensity: 8
access_count: 3
---

Body`;
    const { meta } = parseFrontmatter(content);
    assert.equal(meta.sentiment_intensity, 8);
    assert.equal(meta.access_count, 3);
  });

  it('strips quotes from values', () => {
    const content = `---
objective: "Build the thing"
---

Body`;
    const { meta } = parseFrontmatter(content);
    assert.equal(meta.objective, 'Build the thing');
  });

  it('returns raw content when no frontmatter', () => {
    const content = '# Just a heading\nSome text';
    const { meta, body } = parseFrontmatter(content);
    assert.deepEqual(meta, {});
    assert.equal(body, content);
  });

  it('handles missing closing delimiter', () => {
    const content = '---\ntype: broken';
    const { meta, body } = parseFrontmatter(content);
    assert.deepEqual(meta, {});
    assert.equal(body, content);
  });
});

describe('slugify', () => {
  it('converts text to lowercase slug', () => {
    assert.equal(slugify('Hello World'), 'hello-world');
  });

  it('strips special characters', () => {
    assert.equal(slugify('Don\'t Use DALL-E!'), 'don-t-use-dall-e');
  });

  it('strips .md extension', () => {
    assert.equal(slugify('my-file.md'), 'my-file');
  });

  it('trims hyphens', () => {
    assert.equal(slugify('-leading-trailing-'), 'leading-trailing');
  });

  it('truncates to 60 chars', () => {
    const long = 'a'.repeat(100);
    assert.ok(slugify(long).length <= 60);
  });
});

describe('extractTitle', () => {
  it('extracts h1 heading', () => {
    assert.equal(extractTitle('# My Title\nBody'), 'My Title');
  });

  it('uses fallback when no heading', () => {
    assert.equal(extractTitle('No heading here'), 'Untitled');
    assert.equal(extractTitle('No heading', 'Custom'), 'Custom');
  });

  it('extracts first h1 only', () => {
    assert.equal(extractTitle('## Not This\n# This One\n# Not This'), 'This One');
  });
});
