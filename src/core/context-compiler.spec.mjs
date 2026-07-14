import { describe, it, expect } from 'vitest';
import { compileContext, previewContext } from './context-compiler.mjs';

describe('context-compiler.mjs', () => {
  it('exports compileContext', () => {
    expect(compileContext).toBeDefined();
  });
  it('exports previewContext', () => {
    expect(previewContext).toBeDefined();
  });
});
