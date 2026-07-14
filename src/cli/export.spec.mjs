import { describe, it, expect } from 'vitest';
import exportCommand from './export.mjs';

describe('export.mjs', () => {
  it('exports default', () => {
    expect(exportCommand).toBeDefined();
  });
});
