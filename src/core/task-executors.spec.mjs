import { describe, it, expect } from 'vitest';
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
