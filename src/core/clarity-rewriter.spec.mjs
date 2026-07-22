import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
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
