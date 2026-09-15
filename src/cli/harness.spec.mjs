import { describe, it, expect } from 'vitest';
import runHarness from './harness.mjs';

describe('harness.mjs', () => {
  it('exports default function', () => {
    expect(runHarness).toBeDefined();
    expect(typeof runHarness).toBe('function');
  });
});
