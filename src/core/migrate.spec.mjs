import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { runMigration, testMigration } from './migrate.mjs';

describe('migrate.mjs', () => {
  it('exports runMigration', () => {
    expect(runMigration).toBeDefined();
  });
  it('exports testMigration', () => {
    expect(testMigration).toBeDefined();
  });
});
