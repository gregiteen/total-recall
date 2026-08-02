import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import fs from 'fs';
import path from 'path';
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

describe('Phase 4 proposal wiring', () => {
  const src = () => fs.readFileSync(path.join(process.cwd(), 'src/core/dream.mjs'), 'utf8');

  it('keeps the stale-knowledge ticket generator disabled', () => {
    // Staleness is handled by refreshStaleKnowledge() feeding the research
    // queue. The old generator wrote one .md per stale node per cycle — 16,401
    // unread tickets at its peak. Nothing should turn it back on.
    expect(src()).toMatch(/const ENABLE_STALE_KNOWLEDGE_REFRESH = false;/);
    expect(src()).toMatch(/ENABLE_STALE_KNOWLEDGE_REFRESH\s*\?\s*await generateStaleKnowledgeRefreshProposals/);
  });

  it('consumes accepted proposals instead of only writing them', () => {
    // The defining bug of this feature was that nothing ever read a proposal.
    // If this call disappears, the phase silently reverts to write-only.
    expect(src()).toMatch(/await applyAcceptedProposals\(vaultDir/);
  });

  it('hands staleness to the research queue', () => {
    expect(src()).toMatch(/await refreshStaleKnowledge\(vaultDir\)/);
  });

  it('gives the gate live vault state so it can verify, not just read its own prose', () => {
    expect(src()).toMatch(/evaluateProposalGate\(p, null, vaultDir\)/);
  });
});
