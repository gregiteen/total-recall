import { describe, it, expect } from 'vitest';
import { runMigration, testMigration } from './migrate.mjs';

describe('migrate.mjs', () => {
  it('exports runMigration', () => {
    expect(runMigration).toBeDefined();
  });
  it('exports testMigration', () => {
    expect(testMigration).toBeDefined();
  });
});
