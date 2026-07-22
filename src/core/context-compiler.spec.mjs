import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { compileContext, previewContext } from './context-compiler.mjs';

describe('context-compiler.mjs', () => {
  it('exports compileContext', () => {
    expect(compileContext).toBeDefined();
  });
  it('exports previewContext', () => {
    expect(previewContext).toBeDefined();
  });
});
