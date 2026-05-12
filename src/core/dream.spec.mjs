import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { evaluateCandidates } from './dream.mjs';

describe('Dream Cycle Phase 2 (REM)', () => {
  it('promotes nodes with high confidence or score', () => {
    const candidates = [
      { slug: 'node-1', evidence_count: 5, importance: 3, confidence: 0.5 }, // score = 1.0 + 0.3 = 1.3 >= 0.7
      { slug: 'node-2', evidence_count: 1, importance: 1, confidence: 0.9 }  // score = 0.2 + 0.1 = 0.3, but confidence >= 0.8
    ];
    const existing = [];
    const conflictsDir = '/tmp/total-recall-conflicts-test-' + Date.now();
    
    const result = evaluateCandidates(candidates, existing, conflictsDir);
    expect(result.promoted.length).toBe(2);
    expect(result.promoted[0].status).toBe('active');
    expect(result.promoted[0].confidence).toBeGreaterThan(0.5);
  });

  it('quarantines nodes that conflict with existing active nodes', () => {
    const candidates = [
      { 
        slug: 'node-candidate',
        evidence_count: 10,
        subject: 'system', predicate: 'use', object: 'api',
        sentiment_polarity: 'directive_must_not', modality: 'must_not'
      }
    ];
    const existing = [
      {
        slug: 'node-existing',
        status: 'active',
        subject: 'system', predicate: 'use', object: 'api',
        sentiment_polarity: 'directive_must', modality: 'must'
      }
    ];
    const conflictsDir = '/tmp/total-recall-conflicts-test-' + Date.now();
    
    if (fs.existsSync(conflictsDir)) {
      fs.rmSync(conflictsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(conflictsDir, { recursive: true });
    
    const result = evaluateCandidates(candidates, existing, conflictsDir);
    expect(result.promoted.length).toBe(0);
    expect(result.conflicted.length).toBe(1);
    expect(result.conflicted[0].reason).toContain('Layer 1');
    
    // clean up
    fs.rmSync(conflictsDir, { recursive: true, force: true });
  });
});
