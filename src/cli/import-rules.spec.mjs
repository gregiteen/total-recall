import { describe, it, expect } from 'vitest';
import { run } from './import-rules.mjs';

describe('import-rules.mjs', () => {
  it('exports run', () => {
    expect(run).toBeDefined();
  });
});
