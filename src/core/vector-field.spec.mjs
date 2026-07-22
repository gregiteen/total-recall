import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { compileField, sampleField, loadField, recomputeVelocities, fieldStats } from './vector-field.mjs';

describe('vector-field.mjs', () => {
  it('exports compileField', () => {
    expect(compileField).toBeDefined();
  });
  it('exports sampleField', () => {
    expect(sampleField).toBeDefined();
  });
  it('exports loadField', () => {
    expect(loadField).toBeDefined();
  });
  it('exports recomputeVelocities', () => {
    expect(recomputeVelocities).toBeDefined();
  });
  it('exports fieldStats', () => {
    expect(fieldStats).toBeDefined();
  });
});
