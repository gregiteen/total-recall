import { describe, it, expect } from 'vitest';
import ingest from './ingest.mjs';

describe('ingest.mjs', () => {
  it('exports default', () => {
    expect(ingest).toBeDefined();
  });
});
