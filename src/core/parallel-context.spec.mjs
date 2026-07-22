import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { streamParallelContext, checkFlashHealth } from './parallel-context.mjs';

describe('parallel-context.mjs', () => {
  it('exports streamParallelContext', () => {
    expect(streamParallelContext).toBeDefined();
  });
  it('exports checkFlashHealth', () => {
    expect(checkFlashHealth).toBeDefined();
  });
});
