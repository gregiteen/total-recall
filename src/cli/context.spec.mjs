import { describe, it, expect } from 'vitest';
import context from './context.mjs';
describe('context CLI', () => {
  it('provides a local action capsule entrypoint', () => expect(typeof context).toBe('function'));
});
