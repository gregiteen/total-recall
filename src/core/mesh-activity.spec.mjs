import { describe, it, expect } from 'vitest';
import { getLocalIdleSeconds } from './mesh-activity.mjs';

describe('mesh-activity.mjs', () => {
  it('exports getLocalIdleSeconds function', () => {
    expect(getLocalIdleSeconds).toBeDefined();
    expect(typeof getLocalIdleSeconds).toBe('function');
  });
});
