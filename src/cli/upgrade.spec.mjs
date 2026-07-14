import { describe, it, expect } from 'vitest';
import upgrade from './upgrade.mjs';

describe('upgrade.mjs', () => {
  it('exports default', () => {
    expect(upgrade).toBeDefined();
  });
});
