import { describe, it, expect } from 'vitest';
import secretCli from './secret.mjs';

describe('secret.mjs', () => {
  it('exports default', () => {
    expect(secretCli).toBeDefined();
  });
});
