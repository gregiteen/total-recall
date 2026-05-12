import { describe, it, expect } from 'vitest';
import { checkLayer1, checkLayer2 } from './steering.mjs';

describe('Steering Collisions', () => {
  it('Layer 1 detects polarity flip on exact SPO', () => {
    const candidate = {
      subject: 'agent', predicate: 'use', object: 'bash',
      sentiment_polarity: 'directive_must_not', modality: 'must_not'
    };
    const existing = {
      subject: 'agent', predicate: 'use', object: 'bash',
      sentiment_polarity: 'directive_must', modality: 'must'
    };
    
    const res = checkLayer1(candidate, existing);
    expect(res.collision).toBe(true);
  });

  it('Layer 1 allows identical SPO with same polarity', () => {
    const candidate = {
      subject: 'agent', predicate: 'use', object: 'bash',
      sentiment_polarity: 'directive_must', modality: 'must'
    };
    const existing = {
      subject: 'agent', predicate: 'use', object: 'bash',
      sentiment_polarity: 'directive_must', modality: 'must'
    };
    
    const res = checkLayer1(candidate, existing);
    expect(res.collision).toBe(false);
  });
  
  it('Layer 2 detects high Jaccard similarity with polarity flip', () => {
    const candidate = {
      body: 'The agent must absolutely run the bash script securely.',
      sentiment_polarity: 'directive_must_not',
    };
    const existing = {
      body: 'The agent must absolutely run the bash script securely.',
      sentiment_polarity: 'directive_must',
    };
    const res = checkLayer2(candidate, existing);
    expect(res.collision).toBe(true);
    expect(res.similarity).toBeGreaterThanOrEqual(0.75);
  });
  
  it('Layer 2 ignores low Jaccard similarity even with polarity flip', () => {
    const candidate = {
      body: 'Apples are very red and juicy.',
      sentiment_polarity: 'descriptive',
    };
    const existing = {
      body: 'The agent must absolutely run the bash script securely.',
      sentiment_polarity: 'directive_must',
    };
    const res = checkLayer2(candidate, existing);
    expect(res.collision).toBe(false);
  });
});
