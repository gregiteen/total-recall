import { describe, it, expect } from 'vitest';
import migrateCommand from './migrate.mjs';

describe('migrate.mjs', () => {
  it('exports default', () => {
    expect(migrateCommand).toBeDefined();
  });
});
