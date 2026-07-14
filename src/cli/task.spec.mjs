import { describe, it, expect } from 'vitest';
import taskCli from './task.mjs';

describe('task.mjs', () => {
  it('exports default', () => {
    expect(taskCli).toBeDefined();
  });
});
