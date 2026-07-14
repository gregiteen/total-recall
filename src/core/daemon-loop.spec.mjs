import { describe, it, expect } from 'vitest';
import { writeInterrupt } from './daemon-loop.mjs';

describe('daemon-loop.mjs', () => {
  it('exports writeInterrupt', () => {
    expect(writeInterrupt).toBeDefined();
  });
});
