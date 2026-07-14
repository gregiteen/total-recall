import { describe, it, expect } from 'vitest';
import { runOkfIngest } from './ingest-okf.mjs';

describe('ingest-okf.mjs', () => {
  it('exports runOkfIngest', () => {
    expect(runOkfIngest).toBeDefined();
  });
});
