import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { validateDraftNode, runConclusionWriter } from './conclusion-writer.mjs';

describe('conclusion-writer.mjs', () => {
  it('exports validateDraftNode', () => {
    expect(validateDraftNode).toBeDefined();
  });
  it('exports runConclusionWriter', () => {
    expect(runConclusionWriter).toBeDefined();
  });
});
