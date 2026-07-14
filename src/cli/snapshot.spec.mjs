import { describe, it, expect } from 'vitest';
import snapshotCli from './snapshot.mjs';

describe('snapshot.mjs', () => {
  it('exports default', () => {
    expect(snapshotCli).toBeDefined();
  });
});
