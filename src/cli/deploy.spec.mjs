import { describe, it, expect } from 'vitest';
import deploy from './deploy.mjs';

describe('deploy.mjs', () => {
  it('exports default', () => {
    expect(deploy).toBeDefined();
  });
});
