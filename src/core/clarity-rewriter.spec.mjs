import { describe, it, expect } from 'vitest';
import { runClarityReview, runStalenessCheck, runFactSeeker, runCutoffAudit, writeCorrection } from './clarity-rewriter.mjs';

describe('clarity-rewriter.mjs', () => {
  it('exports runClarityReview', () => {
    expect(runClarityReview).toBeDefined();
  });
  it('exports runStalenessCheck', () => {
    expect(runStalenessCheck).toBeDefined();
  });
  it('exports runFactSeeker', () => {
    expect(runFactSeeker).toBeDefined();
  });
  it('exports runCutoffAudit', () => {
    expect(runCutoffAudit).toBeDefined();
  });
  it('exports writeCorrection', () => {
    expect(writeCorrection).toBeDefined();
  });
});
