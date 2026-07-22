import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { detectFriction } from './friction.mjs';

describe('friction.mjs', () => {
  it('exports detectFriction', () => {
    expect(detectFriction).toBeDefined();
  });
});
