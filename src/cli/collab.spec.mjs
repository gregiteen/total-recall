import { describe, it, expect } from 'vitest';
import collab from './collab.mjs';

describe('collab.mjs', () => {
  it('exports default', () => {
    expect(collab).toBeDefined();
  });
});
