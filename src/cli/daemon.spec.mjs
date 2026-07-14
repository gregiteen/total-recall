import { describe, it, expect } from 'vitest';
import daemon from './daemon.mjs';

describe('daemon.mjs', () => {
  it('exports default', () => {
    expect(daemon).toBeDefined();
  });
});
