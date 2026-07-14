import { describe, it, expect } from 'vitest';
import relay from './relay.mjs';

describe('relay.mjs', () => {
  it('exports default', () => {
    expect(relay).toBeDefined();
  });
});
