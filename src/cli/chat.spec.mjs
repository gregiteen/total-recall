import { describe, it, expect } from 'vitest';
import runChat from './chat.mjs';

describe('chat.mjs', () => {
  it('exports default', () => {
    expect(runChat).toBeDefined();
  });
});
