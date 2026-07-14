import { describe, it, expect } from 'vitest';
import { validateDraftNode, runConclusionWriter } from './conclusion-writer.mjs';

describe('conclusion-writer.mjs', () => {
  it('exports validateDraftNode', () => {
    expect(validateDraftNode).toBeDefined();
  });
  it('exports runConclusionWriter', () => {
    expect(runConclusionWriter).toBeDefined();
  });
});
