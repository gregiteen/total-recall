import { describe, it, expect } from 'vitest';
import cli, { runRebuild } from './rebuild.mjs';

describe('rebuild.mjs', () => {
  it('exports default', () => {
    expect(cli).toBeDefined();
  });
  it('exports runRebuild', () => {
    expect(runRebuild).toBeDefined();
  });
});
