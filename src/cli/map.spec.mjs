import { describe, it, expect } from 'vitest';
import map from './map.mjs';

describe('map.mjs', () => {
  it('exports default', () => {
    expect(map).toBeDefined();
  });
});
