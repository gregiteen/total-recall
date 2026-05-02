/**
 * ranking.test.mjs — Tests for signal scoring algorithm
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeSignalScore, rankNodes } from '../core/ranking.mjs';

describe('computeSignalScore', () => {
  it('returns positive score for basic node', () => {
    const score = computeSignalScore({
      type: 'pattern',
      sentiment_intensity: 7,
      access_count: 0,
      last_verified: new Date().toISOString().split('T')[0],
    });
    assert.ok(score > 0, `Expected positive score, got ${score}`);
  });

  it('higher intensity → higher score', () => {
    const base = { type: 'pattern', access_count: 0, last_verified: new Date().toISOString().split('T')[0] };
    const low = computeSignalScore({ ...base, sentiment_intensity: 3 });
    const high = computeSignalScore({ ...base, sentiment_intensity: 9 });
    assert.ok(high > low, `Expected ${high} > ${low}`);
  });

  it('more access → higher score', () => {
    const base = { type: 'pattern', sentiment_intensity: 5, last_verified: new Date().toISOString().split('T')[0] };
    const noAccess = computeSignalScore({ ...base, access_count: 0 });
    const manyAccess = computeSignalScore({ ...base, access_count: 10 });
    assert.ok(manyAccess > noAccess, `Expected ${manyAccess} > ${noAccess}`);
  });

  it('older → lower score (decay)', () => {
    const base = { type: 'pattern', sentiment_intensity: 5, access_count: 0 };
    const fresh = computeSignalScore({ ...base, last_verified: new Date().toISOString().split('T')[0] });
    const old = computeSignalScore({ ...base, last_verified: '2020-01-01' });
    assert.ok(fresh > old, `Expected ${fresh} > ${old}`);
  });

  it('decay never reaches zero (floor)', () => {
    const score = computeSignalScore({
      type: 'pattern',
      sentiment_intensity: 5,
      access_count: 0,
      last_verified: '1990-01-01',
    });
    assert.ok(score > 0, `Expected positive score even for very old nodes, got ${score}`);
  });

  it('uses type-specific half-lives', () => {
    const oneMonthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const base = { sentiment_intensity: 5, access_count: 0, last_verified: oneMonthAgo };

    // preference half-life = 90d → barely decayed
    const prefScore = computeSignalScore({ ...base, type: 'preference' });
    // project half-life = 14d → heavily decayed
    const projScore = computeSignalScore({ ...base, type: 'project' });

    assert.ok(prefScore > projScore, `Preference (${prefScore}) should decay slower than project (${projScore})`);
  });

  it('defaults missing fields gracefully', () => {
    const score = computeSignalScore({});
    assert.ok(score > 0, `Should handle empty node, got ${score}`);
  });
});

describe('rankNodes', () => {
  it('sorts nodes by score descending', () => {
    const today = new Date().toISOString().split('T')[0];
    const nodes = [
      { type: 'pattern', sentiment_intensity: 3, access_count: 0, last_verified: today },
      { type: 'pattern', sentiment_intensity: 9, access_count: 5, last_verified: today },
      { type: 'pattern', sentiment_intensity: 5, access_count: 0, last_verified: today },
    ];
    const ranked = rankNodes(nodes);
    assert.equal(ranked.length, 3);
    assert.ok(ranked[0].score >= ranked[1].score);
    assert.ok(ranked[1].score >= ranked[2].score);
  });

  it('adds score property to each node', () => {
    const ranked = rankNodes([{ type: 'pattern', sentiment_intensity: 5 }]);
    assert.ok('score' in ranked[0]);
    assert.equal(typeof ranked[0].score, 'number');
  });
});
