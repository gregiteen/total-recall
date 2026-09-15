import { describe, it, expect } from 'vitest';
import runAgent from './agent.mjs';

describe('agent.mjs', () => {
  it('exports default function', () => {
    expect(runAgent).toBeDefined();
    expect(typeof runAgent).toBe('function');
  });
});
