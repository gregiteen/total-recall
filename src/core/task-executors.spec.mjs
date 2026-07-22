import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { resolveExecutor, dispatchTask, listExecutorIds } from './task-executors.mjs';

describe('task-executors.mjs', () => {
  it('exports resolveExecutor', () => {
    expect(resolveExecutor).toBeDefined();
  });
  it('exports dispatchTask', () => {
    expect(dispatchTask).toBeDefined();
  });
  it('exports listExecutorIds', () => {
    expect(listExecutorIds).toBeDefined();
  });
});
