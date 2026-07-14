import { describe, it, expect } from 'vitest';
import { detectFriction } from './friction.mjs';

describe('friction.mjs', () => {
  it('exports detectFriction', () => {
    expect(detectFriction).toBeDefined();
  });
});
