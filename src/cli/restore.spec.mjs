import { describe, it, expect } from 'vitest';
import restore from './restore.mjs';

describe('restore.mjs', () => {
  it('exports default', () => {
    expect(restore).toBeDefined();
  });
});
